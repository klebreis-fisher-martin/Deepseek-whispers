import { describe, expect, it } from 'vitest';
import {
  FEIYU_LINES,
  GENERAL_TAGS,
  activityTags,
  ambientTags,
  chooseLine,
  lineAllowedAt,
  lineById,
  linesForTags,
  pickLine,
  touchTags,
} from '../src/lines.ts';

const SHANGHAI = 'Asia/Shanghai';
const NOON = Date.parse('2026-01-01T04:00:00Z'); // 12:00 +08:00
const NIGHT = Date.parse('2026-01-01T15:00:00Z'); // 23:00 +08:00

describe('肥鱼语录语料', () => {
  it('收录 89 句(id 1–47 原文 + 48–59 补写 + 60–89 互动/拖拽/OS),id 与文本都不重复', () => {
    expect(FEIYU_LINES).toHaveLength(89);
    expect(new Set(FEIYU_LINES.map((line) => line.id)).size).toBe(89);
    expect(new Set(FEIYU_LINES.map((line) => line.text)).size).toBe(89);
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

  it('摸头池包含被摸头的台词与回嘴,睡觉池包含犯困台词', () => {
    const petPool = linesForTags(touchTags('pet'));
    expect(petPool.some((line) => line.id === 16)).toBe(true);
    expect(petPool.some((line) => line.id === 54)).toBe(true);
    expect(linesForTags(['sleep', 'night']).some((line) => line.id === 28)).toBe(true);
  });

  it('甩出去/放下走拖拽反应池,戳一下走回嘴池', () => {
    const throwPool = linesForTags(touchTags('throw'));
    expect(throwPool.some((line) => line.id === 78)).toBe(true);
    const dropPool = linesForTags(touchTags('drop'));
    expect(dropPool.some((line) => line.id === 80)).toBe(true);
    const pokePool = linesForTags(touchTags('poke'));
    expect(pokePool.some((line) => line.id === 72)).toBe(true);
  });

  it('夜间专用句(45)只在夜间窗口内允许出现', () => {
    const care = lineById(45)!;
    expect(lineAllowedAt(care, NOON, SHANGHAI, 22, 6)).toBe(false);
    expect(lineAllowedAt(care, NIGHT, SHANGHAI, 22, 6)).toBe(true);
    expect(lineAllowedAt(lineById(18)!, NOON, SHANGHAI, 22, 6)).toBe(true);
  });

  it('固定日程句(46)不参与随机挑选', () => {
    expect(lineAllowedAt(lineById(46)!, NIGHT, SHANGHAI, 22, 6)).toBe(false);
  });

  it('冷却中的句子会被排除,只剩没冷却的', () => {
    const lastSpokenAt = new Map<number, number>(
      FEIYU_LINES.filter((line) => line.id !== 31).map((line) => [line.id, NOON]),
    );
    const picked = chooseLine({
      tags: GENERAL_TAGS,
      now: NOON + 1000,
      timezone: SHANGHAI,
      lastSpokenAt,
      recentIds: [],
      cooldownMs: 60_000,
      nightStartHour: 22,
      nightEndHour: 6,
      tagBoost: 1,
      random: () => 0,
    });
    expect(picked.id).toBe(31);
  });
});