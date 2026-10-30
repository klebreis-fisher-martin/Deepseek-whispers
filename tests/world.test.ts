import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PetBubbleSink } from '../src/bridge.ts';
import { FEIYU_DEFAULTS, type FeiyuConfigSection } from '../src/config.ts';
import { FEIYU_WHISPERS } from '../src/definition.ts';
import { FEIYU_LINES } from '../src/lines.ts';
import { FeiyuWhispersWorld } from '../src/world.ts';
import { FakeHost } from './helpers/fake-host.ts';

class FakeBridge implements PetBubbleSink {
  attached = false;
  connectedFlag = true;
  said: string[] = [];

  async attach(): Promise<boolean> {
    this.attached = true;
    return true;
  }

  detach(): void {
    this.attached = false;
  }

  connected(): boolean {
    return this.connectedFlag;
  }

  async say(script: string): Promise<boolean> {
    this.said.push(script);
    return true;
  }
}

let scratchDir: string;
let clock: number;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'feiyu-whispers-'));
  clock = 1_000_000_000;
});

afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

function petConfigFile(value: { wakeOn?: string; speed?: number }): void {
  writeFileSync(
    join(scratchDir, 'config.json'),
    JSON.stringify({
      worlds: {
        'desktop-pet': {
          touch: { wakeOn: value.wakeOn ?? 'poke', enabled: true },
          window: { bubbleSpeed: value.speed ?? 1 },
        },
      },
    }),
    'utf8',
  );
}

function makeWorld(bridge: FakeBridge, cfg: Partial<FeiyuConfigSection> = {}): FeiyuWhispersWorld {
  return new FeiyuWhispersWorld({
    cfg: {
      ...FEIYU_DEFAULTS,
      triggerChance: 1,
      userBusySeconds: 0,
      ambientMinSeconds: 600,
      ambientMaxSeconds: 600,
      ...cfg,
    },
    timezone: 'Asia/Shanghai',
    botDir: scratchDir,
    repoRoot: scratchDir,
    bridge,
    now: () => clock,
    random: () => 0,
    autoTick: false,
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('肥鱼语录 World', () => {
  it('干装载不报失败', async () => {
    const { dryMountWorld } = await import('cortico/extensions/dry-mount.ts');
    const report = await dryMountWorld(FEIYU_WHISPERS, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('默认模式下戳一下会冒出一句语料,并让环境提示词记得', async () => {
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge);
    await world.start(host);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 1000;
    world.tickAt(clock);
    await flush();

    expect(bridge.said).toHaveLength(1);
    const bare = bridge.said[0].replace(/^【[^】]+】/, '');
    expect(FEIYU_LINES.some((line) => line.text === bare)).toBe(true);
    expect(world.envPromptVars()['feiyu.recent']).toContain(bare);
    const spoke = host.events.find((event) => event.type === 'feiyu-whispers.spoke');
    expect(spoke?.text).toBe(bare);
    expect(host.pushOpts[host.events.indexOf(spoke!)]).toEqual({ deliver: false });
    await world.stop();
  });

  it('间隔没到就不会再冒第二句,到了才会', async () => {
    petConfigFile({ wakeOn: 'poke' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { minGapDefaultSeconds: 10 });
    await world.start(host);

    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 1000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);

    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '又戳了一下');
    clock += 5000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);

    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '第三次');
    clock += 20_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(2);
    await world.stop();
  });

  it('积极模式用 5 秒间隔', async () => {
    petConfigFile({ wakeOn: 'all' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { minGapDefaultSeconds: 10, minGapActiveSeconds: 5 });
    await world.start(host);

    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 1000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);

    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '又戳了一下');
    clock += 9000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(2);
    await world.stop();
  });

  it('安静模式完全关闭', async () => {
    petConfigFile({ wakeOn: 'none' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge);
    await world.start(host);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 20_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);
    await world.stop();
  });

  it('互动概率为 0 时摸了也不触发', async () => {
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { triggerChance: 0, touchChance: 0 });
    await world.start(host);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 20_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);
    await world.stop();
  });

  it('默认互动必定回一句:摸头、甩出去都各有反馈', async () => {
    petConfigFile({ wakeOn: 'poke' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { triggerChance: 0, touchChance: 1, minGapDefaultSeconds: 10 });
    await world.start(host);

    world.notifyTouch('pet');
    clock += 500;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);

    world.notifyTouch('throw');
    clock += 15_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(2);
    await world.stop();
  });

  it('桌宠页面没连上时不冒台词', async () => {
    const bridge = new FakeBridge();
    bridge.connectedFlag = false;
    const host = new FakeHost();
    const world = makeWorld(bridge);
    await world.start(host);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 20_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);
    await world.stop();
  });

  it('没有动作时到了随机间隔也会自己嘀咕', async () => {
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { ambientMinSeconds: 15, ambientMaxSeconds: 15 });
    await world.start(host);
    clock += 1000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);
    clock += 16_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);
    await world.stop();
  });

  it('你在说话后的安静时间里不抢气泡', async () => {
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, { userBusySeconds: 25 });
    await world.start(host);
    host.emit('desktop-pet.message', undefined, '在吗');
    clock += 1000;
    world.tickAt(clock);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 10_000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);
    await world.stop();
  });

  it('摸头/戳这类页面互动走即时桥接,不用等事件被投递', async () => {
    petConfigFile({ wakeOn: 'poke' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge);
    await world.start(host);

    world.notifyTouch('pet');
    clock += 500;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);
    await world.stop();
  });

  it('工作提醒按固定间隔出现,不受动作概率影响', async () => {
    petConfigFile({ wakeOn: 'poke' });
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge, {
      ambientMinSeconds: 60_000,
      ambientMaxSeconds: 60_000,
      workReminderMinutes: 40,
    });
    await world.start(host);

    clock += 39 * 60 * 1000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(0);

    clock += 61 * 1000;
    world.tickAt(clock);
    await flush();
    expect(bridge.said).toHaveLength(1);
    expect(bridge.said[0]).toContain(FEIYU_LINES.find((line) => line.id === 46)!.text);
    await world.stop();
  });

  it('超过 15 分钟后不再把旧台词写进提示词', async () => {
    const bridge = new FakeBridge();
    const host = new FakeHost();
    const world = makeWorld(bridge);
    await world.start(host);
    host.emit('desktop-pet.touch', { touch: { kind: 'poke' } }, '戳了一下');
    clock += 1000;
    world.tickAt(clock);
    await flush();
    expect(world.envPromptVars()['feiyu.recent']).not.toBe('（这一会儿还没嘀咕）');

    clock += 16 * 60 * 1000;
    expect(world.envPromptVars()['feiyu.recent']).toBe('（这一会儿还没嘀咕）');
    await world.stop();
  });
});