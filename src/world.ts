/**
 * 肥鱼语录 World。
 *
 * - 不调用模型,不推会被投递给模型的台词事件;台词只进桌宠气泡和聊天页记录。
 * - 负责「什么时候能说」:回应模式、间隔、概率、你说话后的安静时间。
 * - 负责「让模型知道」:把最近嘀咕写进 envPromptVars,只增加输入前缀,不触发唤醒。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EventEnvelope,
  ToolDef,
  World,
  WorldHost,
  WorldWebUiDecl,
} from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { DesktopPetBridge, type PetBubbleSink } from './bridge.ts';
import { FEIYU_CONFIG_GROUP, type FeiyuConfigSection } from './config.ts';
import {
  GENERAL_TAGS,
  activityTags,
  ambientTags,
  pickLine,
  touchTags,
  type FeiyuLine,
  type TriggerKind,
} from './lines.ts';
import {
  beatsDurationMs,
  durationMs,
  formatClock,
  jitterMs,
  minGapSeconds,
  wakeModeOf,
  type WakeMode,
} from './policy.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

const PET_TOUCH = 'desktop-pet.touch';
const PET_MESSAGE = 'desktop-pet.message';
const PET_SPEECH = 'desktop-pet.speech';
const PET_ANSWER = 'desktop-pet.answer';
const PET_SELF = 'desktop-pet.self';
const PET_FIGURE = 'desktop-pet.figure';
const SPOKE_TYPE = 'feiyu-whispers.spoke';

interface PetConfig {
  wakeOn: string;
  bubbleSpeed: number;
}

interface SelfMeta {
  kind?: string;
  beats?: Array<{ text?: string }>;
  steps?: string[];
  question?: string;
}

interface RecentLine {
  text: string;
  at: number;
}

export interface FeiyuWorldOptions {
  cfg: FeiyuConfigSection;
  timezone: string;
  /** 部署目录;配置在 <botDir>/config.json。 */
  botDir: string;
  /** Core 代码根目录;用于找到应用自带的桌面宠物包。 */
  repoRoot: string;
  bridge?: PetBubbleSink;
  now?: () => number;
  random?: () => number;
  /** 测试里关掉 1 秒轮询,手动调 tickAt。 */
  autoTick?: boolean;
}

export class FeiyuWhispersWorld implements World {
  readonly id = 'feiyu-whispers';

  private host: WorldHost | undefined;
  private timer: NodeJS.Timeout | undefined;
  private bridge: PetBubbleSink;
  private early: Promise<boolean> | null = null;
  private cursor = 0;
  private inFlight = false;
  private lastBubbleEndAt = 0;
  private lastUserInputAt = 0;
  private nextAmbientAt = 0;
  private lastMode: WakeMode = 'off';
  private cachedPet: { at: number; value: PetConfig } | null = null;
  private lastSpoken: string[] = [];
  private recent: RecentLine[] = [];

  constructor(private readonly opts: FeiyuWorldOptions) {
    this.bridge =
      opts.bridge ??
      new DesktopPetBridge({
        repoRoot: opts.repoRoot,
        log: (message) => this.log('warn', message),
      });
    // 装配时所有 World 先 create、后 start。这里尽早套上原型,
    // 才能赶在桌宠页面连上、应用第一次调用 snapshot 之前拿到实例。
    this.early = this.bridge.attach().catch(() => false);
  }

  /** 只报值;提示词正文在 ENV_PROMPT.md 里。 */
  envPromptVars(): Record<string, string> {
    return { 'feiyu.recent': this.recentText() };
  }

  tools(): ToolDef[] {
    return [];
  }

  webUi(): WorldWebUiDecl {
    return {
      config: [FEIYU_CONFIG_GROUP],
      promptDocs: [
        {
          key: 'worlds.feiyu-whispers.envPrompt',
          title: '肥鱼语录 · 环境提示词',
          description: '让 Coo 知道自己刚才嘀咕过什么,但不要复述。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            {
              name: 'feiyu.recent',
              description: '最近放进气泡的语录(本机时间 + 原文);没有时是一句占位。',
            },
          ],
        },
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    const now = this.now();
    this.cursor = host.store.latestCursor();
    this.lastUserInputAt = now;
    this.lastBubbleEndAt = 0;
    this.lastMode = 'off';
    this.nextAmbientAt = now + this.ambientDelayMs();

    const attached = await (this.early ?? this.bridge.attach());
    this.early = null;
    if (!attached) this.log('warn', '没有接上桌宠气泡通道;台词只会留在记录里。');

    if (this.opts.autoTick !== false) {
      this.timer = setInterval(() => this.tickAt(this.now()), 1000);
      this.timer.unref();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.bridge.detach();
    this.host = undefined;
  }

  /** 一次轮询:读事件、判定间隔、到点就嘀咕。@internal 测试直接调。 */
  tickAt(now: number): void {
    if (!this.host) return;
    const pet = this.petConfig(now);
    this.pollEvents(now, pet);
    const mode = wakeModeOf(pet.wakeOn);
    if (mode === 'off') {
      this.lastMode = 'off';
      return;
    }
    if (this.lastMode === 'off') this.nextAmbientAt = now + this.ambientDelayMs();
    this.lastMode = mode;
    if (now < this.nextAmbientAt) return;
    this.nextAmbientAt = now + this.ambientDelayMs();
    this.consider(ambientTags(new Date(now)), 'ambient', now, pet, true);
  }

  private pollEvents(now: number, pet: PetConfig): void {
    const host = this.host;
    if (!host) return;
    let events: EventEnvelope[];
    try {
      events = host.store.range({ fromCursor: this.cursor + 1, limit: 200 });
    } catch (error) {
      this.log('warn', `读事件失败:${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const event of events) {
      if (event.cursor > this.cursor) this.cursor = event.cursor;
      this.observe(event, now, pet);
    }
  }

  private observe(event: EventEnvelope, now: number, pet: PetConfig): void {
    switch (event.type) {
      case PET_TOUCH: {
        const meta = (event.meta ?? {}) as { touch?: { kind?: string } };
        const kind = meta.touch?.kind ?? '';
        const trigger: TriggerKind =
          kind === 'pet' || kind === 'throw' || kind === 'drop' ? kind : 'poke';
        this.consider(touchTags(kind), trigger, now, pet);
        return;
      }
      case PET_MESSAGE:
      case PET_SPEECH:
      case PET_ANSWER:
        this.lastUserInputAt = now;
        return;
      case PET_SELF: {
        const meta = (event.meta ?? {}) as SelfMeta;
        const at = Date.parse(event.ts);
        const stamp = Number.isFinite(at) ? at : now;
        if (meta.kind === 'say') {
          this.lastBubbleEndAt = Math.max(
            this.lastBubbleEndAt,
            stamp + beatsDurationMs(meta.beats ?? [], pet.bubbleSpeed),
          );
        } else if (meta.kind === 'ask') {
          this.lastBubbleEndAt = Math.max(this.lastBubbleEndAt, stamp + 4000);
        } else if (meta.kind === 'activity') {
          this.consider(activityTags(meta.steps ?? []), 'activity', now, pet);
        }
        return;
      }
      case PET_FIGURE:
        this.consider(GENERAL_TAGS, 'figure', now, pet);
        return;
      default:
        return;
    }
  }

  private consider(
    tags: readonly string[],
    kind: TriggerKind,
    now: number,
    pet: PetConfig,
    ambient = false,
  ): void {
    if (this.inFlight) return;
    if (!this.bridge.connected()) return;
    const mode = wakeModeOf(pet.wakeOn);
    if (mode === 'off') return;

    const gap = minGapSeconds(mode, this.opts.cfg) * 1000;
    if (now - this.lastBubbleEndAt < gap) return;

    const busy = this.seconds(this.opts.cfg.userBusySeconds) * 1000;
    if (now - this.lastUserInputAt < busy) return;

    if (!ambient && this.random() >= this.chance(this.opts.cfg.triggerChance)) return;

    this.speak(tags, kind, now, pet);
  }

  private speak(tags: readonly string[], kind: TriggerKind, now: number, pet: PetConfig): void {
    const line = pickLine(tags, this.lastSpoken, () => this.random());
    const script = line.expression ? `【${line.expression}】${line.text}` : line.text;
    const expected = durationMs(line.text, pet.bubbleSpeed) + 200;

    this.inFlight = true;
    this.lastBubbleEndAt = now + expected;
    this.lastSpoken = [...this.lastSpoken, line.text].slice(-3);
    this.recent = [...this.recent, { text: line.text, at: now }].slice(-12);
    this.nextAmbientAt = now + this.ambientDelayMs();

    void this.pushSpoke(line, kind, now);
    void this.bridge
      .say(script)
      .then((ok) => {
        if (ok) return;
        // 没接上或页面关闭:回滚间隔,别把之后的话也一起吞掉。
        this.lastBubbleEndAt = Math.min(this.lastBubbleEndAt, now);
        this.recent = this.recent.filter((item) => item.at !== now);
        this.log('warn', '气泡没有送达(桌宠页面未连接?)。');
      })
      .catch((error: unknown) => {
        this.log('warn', `气泡异常:${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private async pushSpoke(line: FeiyuLine, kind: TriggerKind, at: number): Promise<void> {
    const host = this.host;
    if (!host) return;
    try {
      await host.pushEvent(
        {
          type: SPOKE_TYPE,
          ts: nowIso(this.opts.timezone),
          source: this.id,
          origin: 'internal',
          senderKey: this.id,
          text: line.text,
          meta: { lineId: line.id, tags: line.tags, trigger: kind, at },
        },
        { deliver: false },
      );
    } catch {
      /* 记录失败不影响气泡 */
    }
  }

  private recentText(): string {
    if (this.opts.cfg.awareness === false) return '（没有记录）';
    const lines = Math.round(this.seconds(this.opts.cfg.maxRecentLines, 1));
    const cutoff = this.now() - 15 * 60 * 1000;
    const items = this.recent
      .filter((item) => item.at >= cutoff)
      .slice(-Math.max(1, Math.min(6, lines)));
    if (!items.length) return '（这一会儿还没嘀咕）';
    return items
      .map((item) => `${formatClock(item.at, this.opts.timezone)}「${item.text}」`)
      .join('；');
  }

  private petConfig(now: number): PetConfig {
    if (this.cachedPet && now - this.cachedPet.at < 2000) return this.cachedPet.value;
    let value: PetConfig = { wakeOn: 'poke', bubbleSpeed: 1 };
    try {
      const raw = JSON.parse(readFileSync(join(this.opts.botDir, 'config.json'), 'utf8')) as {
        worlds?: Record<string, unknown>;
      };
      const pet = (raw.worlds?.['desktop-pet'] ?? {}) as {
        enabled?: boolean;
        touch?: { wakeOn?: string };
        window?: { bubbleSpeed?: number };
      };
      const wakeOn =
        pet.enabled === false
          ? 'none'
          : typeof pet.touch?.wakeOn === 'string'
            ? pet.touch.wakeOn
            : 'poke';
      const speed = Number(pet.window?.bubbleSpeed);
      value = {
        wakeOn,
        bubbleSpeed: Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1,
      };
    } catch {
      /* 读不到就用默认:默认模式、常速 */
    }
    this.cachedPet = { at: now, value };
    return value;
  }

  private ambientDelayMs(): number {
    const low = this.seconds(this.opts.cfg.ambientMinSeconds, 15);
    const high = this.seconds(this.opts.cfg.ambientMaxSeconds, 180);
    return jitterMs(() => this.random(), Math.max(15, low), Math.max(15, high));
  }

  private chance(value: unknown): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0.35;
    return Math.min(1, Math.max(0, number));
  }

  private seconds(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : fallback;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  private random(): number {
    return this.opts.random ? this.opts.random() : Math.random();
  }

  private log(level: 'info' | 'warn', message: string): void {
    const log = this.host?.log as unknown as Record<string, (text: string) => void> | undefined;
    try {
      log?.[level]?.(`[feiyu-whispers] ${message}`);
    } catch {
      /* 日志失败不影响插件 */
    }
  }
}