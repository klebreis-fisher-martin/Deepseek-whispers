/** 纯函数:回应模式映射、气泡时长估算、随机区间和时间格式;不碰宿主。 */
import type { FeiyuConfigSection } from './config.ts';

export type WakeMode = 'off' | 'default' | 'active';

/**
 * 回应模式在桌面宠物世界里的存储键是 `worlds.desktop-pet.touch.wakeOn`:
 * none = 安静,poke = 默认,all = 积极,custom = 自定义。
 * 自定义模式沿用「默认」的间隔;要彻底关掉就把回应模式调成安静。
 */
export function wakeModeOf(wakeOn: string | undefined): WakeMode {
  if (wakeOn === 'none') return 'off';
  if (wakeOn === 'all') return 'active';
  return 'default';
}

export function minGapSeconds(
  mode: WakeMode,
  cfg: Pick<FeiyuConfigSection, 'minGapDefaultSeconds' | 'minGapActiveSeconds'>,
): number {
  const raw = mode === 'active' ? cfg.minGapActiveSeconds : cfg.minGapDefaultSeconds;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(1, value) : mode === 'active' ? 5 : 10;
}

/** 与桌宠页面估算一条气泡停留时长的口径一致,另加一点余量。 */
export function durationMs(text: string, bubbleSpeed: number): number {
  const speed = Number.isFinite(bubbleSpeed) ? Math.min(2, Math.max(0.5, bubbleSpeed)) : 1;
  const chars = Array.from(text).length;
  const lead = 0.45;
  const typing = chars / (20 * speed);
  const hold = (1.6 + chars * 0.07) / speed;
  return Math.round((lead + typing + hold) * 1000) + 300;
}

export function beatsDurationMs(beats: readonly { text?: string }[], bubbleSpeed: number): number {
  let total = 0;
  for (const beat of beats) total += durationMs(beat.text ?? '', bubbleSpeed);
  return total + Math.max(0, beats.length - 1) * 350;
}

/** 按时区取小时(0–23)。时区名无效时退回本机时区。 */
export function localHour(at: number, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(at));
    const value = Number(hour);
    return Number.isFinite(value) ? ((value % 24) + 24) % 24 : new Date(at).getHours();
  } catch {
    return new Date(at).getHours();
  }
}

/** 小时是否落在 [start, end) 区间;start > end 表示跨午夜(如 22 → 6)。 */
export function inHourWindow(hour: number, start: number, end: number): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return true;
  const s = ((Math.floor(start) % 24) + 24) % 24;
  const e = ((Math.floor(end) % 24) + 24) % 24;
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/** 带权重的随机;全为 0 时退回等概率。 */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, random: () => number): T | undefined {
  if (!items.length) return undefined;
  const weights = items.map((item) => Math.max(0, Number(weight(item)) || 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  let ticket = Math.max(0, Math.min(1, random())) * total;
  for (let index = 0; index < items.length; index++) {
    const value = weights[index]!;
    if (value <= 0) continue;
    ticket -= value;
    if (ticket <= 0) return items[index];
  }
  return items[items.length - 1];
}

/** 在 [minSeconds, maxSeconds] 里随机取毫秒;两值反了会自动交换。 */
export function jitterMs(
  random: () => number,
  minSeconds: number,
  maxSeconds: number,
): number {
  const low = Math.max(1, Math.min(minSeconds, maxSeconds));
  const high = Math.max(low, maxSeconds);
  return Math.round((low + (high - low) * Math.max(0, Math.min(1, random()))) * 1000);
}

/** 本机时区下的 HH:MM;时区名无效时退回本机时区。 */
export function formatClock(at: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(at));
  } catch {
    const date = new Date(at);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}