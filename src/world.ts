/**
 * 肥鱼语录 World。
 *
 * - 不调用模型,不推会被投递给模型的台词事件;台词只进桌宠气泡和聊天页记录。
 * - 负责「什么时候能说」:回应模式、间隔、概率、你说话后的安静时间。
 * - 负责「挑哪一句」:全部语料加权,动作偏向对应主题;同一句有冷却,
 *   夜间专用句只在夜间出现,工作提醒按固定间隔出现。
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
  chooseLine,
  lineById,
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
  id: number;
  text: string;
  at: number;
}

interface QueuedTouch {
  kind: string;
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
  private nextWorkReminderAt = 0;
  private lastMode: WakeMode = 'off';
  private cachedPet: { at: number; value: PetConfig } | null = null;
  private readonly lastSpokenAt = new Map<number, number>();
  private recentIds: number[] = [];
  private recent: RecentLine[] = [];
  private touchQueue: QueuedTouch[] = [];
  private lastBridgeTouch: QueuedTouch | null = null;

  constructor(private readonly opts: FeiyuWorldOptions) {
    this.bridge =
      opts.bridge ??
      new DesktopPetBridge({
        repoRoot: opts.repoRoot,
        log: (message) => this.log('warn', message),
        onTouch: (kind) => this.notifyTouch(kind),
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
    this.nextWorkReminderAt = this.workIntervalMs() > 0 ? now + this.workIntervalMs() : 0;
    this.lastSpokenAt.clear();
    this.recentIds = [];
    this.recent = [];
    this.touchQueue = [];
    this.lastBridgeTouch = null;

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

  /** 一次轮询:处理即时互动、读事件、工作提醒 / 自然嘀咕。@internal 测试直接调。 */
  tickAt(now: number): void {
    if (!this.host) return;
    const pet = this.petConfig(now);
    this.drainTouches(now, pet);
    this.pollEvents(now, pet);

    const mode = wakeModeOf(pet.wakeOn);
    if (mode === 'off') {
      this.lastMode = 'off';
      // 安静模式不攒工作提醒:恢复回应时重新从头计时。
      const interval = this.workIntervalMs();
      if (interval > 0) this.nextWorkReminderAt = now + interval;
      return;
    }
    if (this.lastMode === 'off') this.nextAmbientAt = now + this.ambientDelayMs();
    this.lastMode = mode;

    this.fireWorkReminderIfDue(now, pet, mode);

    if (now < this.nextAmbientAt) return;
    this.nextAmbientAt = now + this.ambientDelayMs();
    this.consider(ambientTags(new Date(now)), 'ambient', now, pet, { boost: 1, always: true });
  }

  /** 桥接层回调:桌宠页面发生摸头/戳/甩/放下时立即入队。@internal */
  notifyTouch(kind: string): void {
    this.enqueueTouch(kind);
  }

  private drainTouches(now: number, pet: PetConfig): void {
    const queue = this.touchQueue;
    this.touchQueue = [];
    if (!queue.length) return;
    const handled: QueuedTouch[] = [];
    for (const touch of queue) {
      // 同一动作 1.5 秒内的连击只算一次。
      if (handled.some((item) => item.kind === touch.kind && touch.at - item.at < 1500)) continue;
      handled.push(touch);
      this.consider(touchTags(touch.kind), touch.kind as TriggerKind, now, pet, {
        boost: 3,
        chance: this.touchChance(),
      });
    }
  }

  private enqueueTouch(kind: string): void {
    if (kind !== 'poke' && kind !== 'pet' && kind !== 'throw' && kind !== 'drop') return;
    const at = this.now();
    this.touchQueue.push({ kind, at });
    this.lastBridgeTouch = { kind, at };
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
        // 桥接已经即时处理过同一次互动时,不再重复触发。
        if (
          this.lastBridgeTouch &&
          this.lastBridgeTouch.kind === kind &&
          now - this.lastBridgeTouch.at < 5000
        ) {
          return;
        }
        const trigger: TriggerKind =
          kind === 'pet' || kind === 'throw' || kind === 'drop' ? kind : 'poke';
        this.consider(touchTags(kind), trigger, now, pet, { boost: 3, chance: this.touchChance() });
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
          this.consider(activityTags(meta.steps ?? []), 'activity', now, pet, { boost: 3 });
        }
        return;
      }
      case PET_FIGURE:
        this.consider(GENERAL_TAGS, 'figure', now, pet, { boost: 1 });
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
    opts: { boost: number; always?: boolean; chance?: number },
  ): void {
    if (this.inFlight) return;
    if (!this.bridge.connected()) return;
    const mode = wakeModeOf(pet.wakeOn);
    if (mode === 'off') return;

    const gap = minGapSeconds(mode, this.opts.cfg) * 1000;
    if (now - this.lastBubbleEndAt < gap) return;

    const busy = this.seconds(this.opts.cfg.userBusySeconds) * 1000;
    if (now - this.lastUserInputAt < busy) return;

    const probability = opts.chance ?? this.chance(this.opts.cfg.triggerChance);
    if (!opts.always && this.random() >= probability) return;

    const line = chooseLine({
      tags,
      now,
      timezone: this.opts.timezone,
      lastSpokenAt: this.lastSpokenAt,
      recentIds: this.recentIds,
      cooldownMs: this.cooldownMs(),
      nightStartHour: this.hour(this.opts.cfg.nightCareStartHour, 22),
      nightEndHour: this.hour(this.opts.cfg.nightCareEndHour, 6),
      tagBoost: opts.boost,
      random: () => this.random(),
    });
    this.speak(line, kind, now, pet);
  }

  private fireWorkReminderIfDue(now: number, pet: PetConfig, mode: WakeMode): void {
    const interval = this.workIntervalMs();
    if (interval <= 0) return;
    if (this.nextWorkReminderAt <= 0) {
      this.nextWorkReminderAt = now + interval;
      return;
    }
    if (now < this.nextWorkReminderAt) return;

    const wanted = this.line(this.opts.cfg.workReminderLineId, 46);
    if (!wanted) {
      this.nextWorkReminderAt = now + interval;
      return;
    }
    if (!this.canSpeak(now, pet, mode)) {
      // 被间隔或「你正在说话」挡住就保持到期状态,下一次 tick 继续试。
      return;
    }
    this.speak(wanted, 'scheduled', now, pet);
    this.nextWorkReminderAt = now + interval;
  }

  private canSpeak(now: number, pet: PetConfig, mode: WakeMode): boolean {
    if (this.inFlight) return false;
    if (!this.bridge.connected()) return false;
    if (mode === 'off') return false;
    const gap = minGapSeconds(mode, this.opts.cfg) * 1000;
    if (now - this.lastBubbleEndAt < gap) return false;
    const busy = this.seconds(this.opts.cfg.userBusySeconds) * 1000;
    return now - this.lastUserInputAt >= busy;
  }

  private speak(line: FeiyuLine, kind: TriggerKind, now: number, pet: PetConfig): void {
    const script = line.expression ? `【${line.expression}】${line.text}` : line.text;
    const expected = durationMs(line.text, pet.bubbleSpeed) + 200;

    this.inFlight = true;
    this.lastBubbleEndAt = now + expected;
    this.lastSpokenAt.set(line.id, now);
    this.recentIds = [...this.recentIds, line.id].slice(-this.avoidRecentCount());
    this.recent = [...this.recent, { id: line.id, text: line.text, at: now }].slice(-12);
    this.nextAmbientAt = now + this.ambientDelayMs();

    void this.pushSpoke(line, kind, now);
    void this.bridge
      .say(script)
      .then((ok) => {
        if (ok) return;
        // 没接上或页面关闭:回滚间隔,别把之后的话也一起吞掉。
        this.lastBubbleEndAt = Math.min(this.lastBubbleEndAt, now);
        this.lastSpokenAt.delete(line.id);
        this.recentIds = this.recentIds.filter((id) => id !== line.id);
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

  private workIntervalMs(): number {
    const minutes = this.seconds(this.opts.cfg.workReminderMinutes, 0);
    return minutes > 0 ? Math.min(480, minutes) * 60_000 : 0;
  }

  private cooldownMs(): number {
    return this.seconds(this.opts.cfg.lineCooldownSeconds, 1500) * 1000;
  }

  private avoidRecentCount(): number {
    return Math.round(this.seconds(this.opts.cfg.avoidRecentLines, 6));
  }

  private hour(value: unknown, fallback: number): number {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(23, Math.max(0, Math.round(number)));
  }

  private line(value: unknown, fallback: number): FeiyuLine | undefined {
    const id = Number(value);
    return lineById(Number.isFinite(id) ? Math.round(id) : fallback);
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

  /** 直接互动默认 100% 回一句;想保留随机就把它调低。 */
  private touchChance(): number {
    const raw = Number(this.opts.cfg.touchChance);
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
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