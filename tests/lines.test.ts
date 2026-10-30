import { describe, expect, it } from 'vitest';
import {
  FEIYU_LINES,
  GENERAL_TAGS,
  activityTags,
  ambientTags,
  linesForTags,
  pickLine,
  touchTags,
} from '../src/lines.ts';

describe('肥鱼语录语料', () => {
  it('收录 47 句,id 与文本都不重复', () => {
    expect(FEIYU_LINES).toHaveLength(47);
    expect(new Set(FEIYU_LINES.map((line) => line.id)).size).toBe(47);
    expect(new Set(FEIYU_LINES.map((line) => line.text)).size).toBe(47);
  });

  it('每句都有至少一个主题标签,文本非空', () => {
    for (const line of FEIYU_LINES) {
      expect(line.text.trim().length).toBeGreaterThan(0);
      expect(line.tags.length).toBeGreaterThan(0);
    }
  });

  it('每个入口都能挑到一句', () => {
    const pools = [
      GENERAL_TAGS,
      touchTags('poke'),
      touchTags('pet'),
      touchTags('throw'),
      touchTags('drop'),
      activityTags(['走了走', '张望']),
      activityTags(['坐下']),
      activityTags(['睡觉']),
      ambientTags(new Date(2026, 0, 1, 2, 0)),
      ambientTags(new Date(2026, 0, 1, 12, 0)),
      ambientTags(new Date(2026, 0, 1, 23, 0)),
    ];
    for (const pool of pools) {
      expect(linesForTags(pool).length).toBeGreaterThan(0);
      expect(pickLine(pool, [], () => 0).text.length).toBeGreaterThan(0);
    }
  });

  it('尽量避开最近说过的句子', () => {
    const pool = touchTags('pet');
    const first = pickLine(pool, [], () => 0);
    const second = pickLine(pool, [first.text], () => 0);
    expect(second.text).not.toBe(first.text);
  });

  it('摸头池包含被摸头的台词,睡觉池包含犯困台词', () => {
    expect(linesForTags(touchTags('pet')).some((line) => line.id === 16)).toBe(true);
    expect(linesForTags(['sleep', 'night']).some((line) => line.id === 28)).toBe(true);
  });
});