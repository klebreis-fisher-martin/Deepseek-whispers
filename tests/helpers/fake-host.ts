/** 测试用假宿主:记录推送的事件,并维护一个可按游标读取的事件队列。 */
import type { EventEnvelope, PushOptions, WorldHost } from 'cortico/core/types.ts';

export class FakeHost implements WorldHost {
  events: EventEnvelope[] = [];
  pushOpts: Array<PushOptions | undefined> = [];
  queue: EventEnvelope[] = [];
  cursorValue = 0;

  store = {
    get: (cursor: number) => this.queue.find((event) => event.cursor === cursor),
    latestCursor: () => this.cursorValue,
    range: (q: { fromCursor?: number; limit?: number }) => {
      const from = q.fromCursor ?? 0;
      const list = this.queue.filter((event) => event.cursor >= from);
      return q.limit ? list.slice(-q.limit) : list;
    },
    around: () => [],
    grep: () => [],
  } as unknown as WorldHost['store'];

  blob = (): { bytes: Uint8Array; mime: string } | null => null;
  modelFacts = { model: () => 'test', accepts: () => false, contextWindow: () => 128000 };
  log = {
    child() {
      return this;
    },
    info() {},
    warn() {},
    error() {},
    debug() {},
    trace() {},
    emit() {},
  } as unknown as WorldHost['log'];

  async pushEvent(e: Omit<EventEnvelope, 'cursor'>, opts?: PushOptions): Promise<EventEnvelope> {
    const full = { ...e, cursor: this.events.length + 1 } as EventEnvelope;
    this.events.push(full);
    this.pushOpts.push(opts);
    return full;
  }

  pushDeferred(): void {}

  async drainPendingEvents(): Promise<EventEnvelope[]> {
    return [];
  }

  reportUsage(): void {}

  /** 往事件队列里放一条桌宠事件,模拟世界启动后新发生的事件。 */
  emit(type: string, meta: Record<string, unknown> | undefined, text: string, ts?: string): EventEnvelope {
    const cursor = this.cursorValue + 1;
    this.cursorValue = cursor;
    const event = {
      cursor,
      type,
      ts: ts ?? new Date().toISOString(),
      source: 'desktop-pet',
      origin: 'external',
      text,
      ...(meta ? { meta } : {}),
    } as EventEnvelope;
    this.queue.push(event);
    return event;
  }
}