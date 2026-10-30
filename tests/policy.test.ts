import { describe, expect, it } from 'vitest';
import {
  beatsDurationMs,
  durationMs,
  formatClock,
  jitterMs,
  minGapSeconds,
  wakeModeOf,
} from '../src/policy.ts';

describe('回应模式映射', () => {
  it('none/poke/all/custom 分别映射到关闭/默认/积极/默认', () => {
    expect(wakeModeOf('none')).toBe('off');
    expect(wakeModeOf('poke')).toBe('default');
    expect(wakeModeOf('all')).toBe('active');
    expect(wakeModeOf('custom')).toBe('default');
    expect(wakeModeOf(undefined)).toBe('default');
  });

  it('默认 ≥ 10 秒,积极 ≥ 5 秒', () => {
    const cfg = { minGapDefaultSeconds: 10, minGapActiveSeconds: 5 };
    expect(minGapSeconds('default', cfg)).toBe(10);
    expect(minGapSeconds('active', cfg)).toBe(5);
  });

  it('非法配置值有下限兜底', () => {
    expect(minGapSeconds('default', { minGapDefaultSeconds: 0, minGapActiveSeconds: 0 })).toBe(1);
  });
});

describe('气泡时长与随机', () => {
  it('越长的台词估算越久,语速越快越短', () => {
    expect(durationMs('这是一句比较长的台词,用来估算停留时间', 1)).toBeGreaterThan(
      durationMs('短', 1),
    );
    expect(durationMs('同样长度的一句话', 2)).toBeLessThan(durationMs('同样长度的一句话', 0.5));
  });

  it('多段台词按段累加', () => {
    expect(beatsDurationMs([{ text: '第一段' }, { text: '第二段' }], 1)).toBeGreaterThan(
      durationMs('第一段第二段', 1),
    );
  });

  it('随机区间落在两端之内', () => {
    expect(jitterMs(() => 0, 75, 180)).toBe(75_000);
    expect(jitterMs(() => 1, 75, 180)).toBe(180_000);
    expect(jitterMs(() => 0.5, 10, 20)).toBe(15_000);
  });

  it('按指定时区显示 HH:MM', () => {
    expect(formatClock(Date.parse('2026-01-01T12:00:00Z'), 'Asia/Shanghai')).toBe('20:00');
    expect(formatClock(Date.parse('2026-01-01T12:00:00Z'), 'Not/AZone')).toMatch(/^\d{2}:\d{2}$/);
  });
});