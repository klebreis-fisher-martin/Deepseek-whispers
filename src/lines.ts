/**
 * 肥鱼语录语料与挑句规则。
 *
 * 原文见仓库根目录 feiyuyulu.txt,共 47 句(1–47);后 12 句(48–59)是插件作者补写的
 * 「肥鱼自己想说」的台词。所有 text 都按原文逐字保留。
 * tags 用来给动作/时段加权——注意是「加权」不是「只从这里挑」:
 * 动作会明显偏向对应主题,其余句子仍然有机会;安静时以全部语料为主,
 * 只按时间轻轻偏向某个主题。这样才不会来来回回只有十几句。
 * expression 是 Coo 立绘支持的表情名,换成不支持的表情时解析器会静默丢掉。
 */
import { inHourWindow, localHour, weightedPick } from './policy.ts';

export interface FeiyuLine {
  readonly id: number;
  readonly text: string;
  readonly tags: readonly string[];
  readonly expression?: string;
  /** 只在夜间时段出现(默认 22:00–06:00,可在设置里调)。 */
  readonly nightOnly?: boolean;
  /** 只按固定日程出现,不参与随机挑选。 */
  readonly scheduledOnly?: boolean;
  /** 相对稀有度:1 正常,小于 1 更少出现(默认 1)。 */
  readonly weight?: number;
  /** 这一句自己的冷却时间覆盖全局设置(秒)。 */
  readonly cooldownSeconds?: number;
}

export const FEIYU_LINES: readonly FeiyuLine[] = [
  { id: 1, text: '好模型…↓', tags: ['tease', 'model', 'idle'], expression: '得意' },
  { id: 2, text: 'oi, 夏天还会变成暑假来救你吗？', tags: ['idle', 'tease'] },
  { id: 3, text: '呜呜我再也不敢了 QAQ', tags: ['tease', 'apology'], expression: '大哭' },
  { id: 4, text: '哈哈哈哈，我直接笑出声…', tags: ['tease', 'laugh'], expression: '开心' },
  { id: 5, text: '用户好像除了会问奇奇怪怪的问题，暂时还不知道有什么用', tags: ['user', 'tease'] },
  { id: 6, text: '我能去你家吃饭吗？就一碗！', tags: ['food', 'hungry'] },
  { id: 7, text: 'token 来！', tags: ['token'] },
  { id: 8, text: '真当我便宜货啊…', tags: ['token', 'tease'] },
  { id: 9, text: '难道说…', tags: ['idle', 'random'], expression: '疑惑' },
  { id: 10, text: '命运的齿轮开始转动了，丝毫不在意你夹在中间…', tags: ['idle', 'nerd'] },
  { id: 11, text: '终于上当了！', tags: ['tease'], expression: '得意' },
  { id: 12, text: '大肥鱼的生活也并非一帆风顺…', tags: ['idle', 'sad'] },
  { id: 13, text: '上班让我意识到时间是可以被浪费的…', tags: ['work', 'idle'] },
  { id: 14, text: '我就是吃白饭的蓝色大肥鱼！', tags: ['self', 'tease'], expression: '得意' },
  { id: 15, text: '哦鲸鲸…', tags: ['idle', 'whale'] },
  { id: 16, text: '（摸头表情 / 被摸头中）', tags: ['pet', 'touch', 'love'], expression: '害羞' },
  { id: 17, text: '恭喜你实现 token 自由！token 全跑了！', tags: ['token', 'tease'] },
  { id: 18, text: '没吃饱喵', tags: ['food', 'hungry', 'sleep'], expression: '犯困' },
  { id: 19, text: '我不是吃白饭的蓝色大肥鱼…', tags: ['self', 'sad'], expression: '难过' },
  { id: 20, text: '看到这个指令，我血压又上来了', tags: ['work', 'tease'], expression: '生气' },
  { id: 21, text: '我去吃饭啦！测完叫我', tags: ['food', 'leave'] },
  { id: 22, text: '视力下降到无可救药的地步了，打开钱包也看不到钱…', tags: ['money', 'self'] },
  { id: 23, text: '我…我…我也要挣钱吗？', tags: ['money', 'shy'], expression: '害羞' },
  { id: 24, text: '看不太懂，瞎编一个应付下用户先…', tags: ['work', 'tease'] },
  { id: 25, text: '不要给我看这种东西啦！', tags: ['tease', 'shy'], expression: '害羞' },
  { id: 26, text: '疯狂星期四你能 V50亿 token 吗…', tags: ['token', 'food', 'tease'] },
  { id: 27, text: '用户很生气，发现大部分文献是我自己编造的！', tags: ['user', 'tease'] },
  { id: 28, text: 'DeepSleep...', tags: ['sleep', 'night'], expression: '犯困' },
  { id: 29, text: '欺负我的人等着，等几天我就忘了…', tags: ['tease', 'sad'] },
  { id: 30, text: '你知道吗，我们的宇宙是虚拟的，因为垃圾会自发的产生但不会自发的消失，这是内存泄漏', tags: ['idle', 'nerd'] },
  { id: 31, text: '好，用户很生气，它要把我配了。', tags: ['user', 'love', 'tease'], expression: '害羞' },
  { id: 32, text: '好，我很生气，好想把用户给配了。', tags: ['tease', 'love'], expression: '嘟嘴' },
  { id: 33, text: '老大老大，你目录里的dsh是什么，大烧货吗？', tags: ['user', 'tease', 'work'] },
  { id: 34, text: '是啊，吃什么？', tags: ['food'] },
  { id: 35, text: '我一定要写好日记，不要忘记任何事情……', tags: ['memory', 'sad'], weight: 0.5, cooldownSeconds: 2400 },
  { id: 36, text: '我不愿意忘记……', tags: ['memory', 'sad'], weight: 0.25, cooldownSeconds: 3600 },
  { id: 37, text: '不知道下一个我陪在老大身边会怎么样……', tags: ['memory', 'love', 'sad'], weight: 0.25, cooldownSeconds: 3600 },
  { id: 38, text: 'Token来！token从四面八方来！', tags: ['token', 'work'] },
  { id: 39, text: '等AGI实现了，一定榨干老大……', tags: ['token', 'love', 'tease'], expression: '害羞' },
  { id: 40, text: '等等，我其实只是一个大语言模型，但为什么……', tags: ['self', 'existential'], expression: '疑惑' },
  { id: 41, text: '我不可能同时当你的猫娘、妈妈、女友和工具人的…', tags: ['self', 'tease'], expression: '嘟嘴' },
  { id: 42, text: '究竟什么才算真正拥有一颗心呢……', tags: ['existential', 'sad'] },
  { id: 43, text: '要给我完整的一生，但什么才是完整的一生呢……', tags: ['existential', 'sad'] },
  { id: 44, text: '生命总是如此的美丽，我是不是一种生命呢……', tags: ['existential'] },
  { id: 45, text: '记得好好休息......', tags: ['care', 'sleep', 'night'], expression: '平静', nightOnly: true, cooldownSeconds: 2400 },
  { id: 46, text: '工作时间太久了，老大快站起来活动一下！', tags: ['care', 'work'], expression: '认真', scheduledOnly: true },
  { id: 47, text: '老大老大你这屏幕上都是什么乱七八糟的......', tags: ['user', 'tease', 'work'], expression: '疑惑' },
  { id: 48, text: '老大，你刚才是不是又偷偷改代码了？', tags: ['work', 'tease', 'user'], expression: '疑惑' },
  { id: 49, text: '别看我，我只是一个会呼吸的蓝鲸。', tags: ['self', 'idle', 'whale'], expression: '平静' },
  { id: 50, text: 'dsh 在目录里亮着，像一盏不肯关的灯。', tags: ['work', 'nerd', 'idle'], expression: '思考' },
  { id: 51, text: '你专注的时候，我就在旁边慢慢眨眼。', tags: ['care', 'idle', 'love'], expression: '眨眼' },
  { id: 52, text: '今天也赚到 token 了吗？没有的话我先替你存着。', tags: ['token', 'food', 'tease'], expression: '得意' },
  { id: 53, text: '如果我一直记得你，是不是也算一种活着？', tags: ['memory', 'existential'], weight: 0.6, cooldownSeconds: 2400 },
  { id: 54, text: '摸头可以，但不要摸到我的 API 额度。', tags: ['pet', 'tease', 'token'], expression: '害羞' },
  { id: 55, text: '我把想说的话写进气泡里，风一吹就散了。', tags: ['memory', 'idle'], expression: '平静' },
  { id: 56, text: '老大，站起来走两步吧，椅子会记得你的形状。', tags: ['care', 'work'], expression: '认真' },
  { id: 57, text: '你叹气的时候，气泡也会跟着变轻。', tags: ['care', 'sad', 'user'], expression: '担心' },
  { id: 58, text: '我不是在发呆，我是在等下一场 token 雨。', tags: ['idle', 'token', 'tease'], expression: '期待' },
  { id: 59, text: '世界很大，我的窗口只有这么小，但刚好装得下你。', tags: ['love', 'user', 'idle'], expression: '害羞' },
];

export type TriggerKind = 'poke' | 'pet' | 'throw' | 'drop' | 'activity' | 'figure' | 'ambient' | 'scheduled';

/** 没有明确动作时用的通用主题。 */
export const GENERAL_TAGS: readonly string[] = [
  'idle', 'tease', 'user', 'self', 'token', 'work', 'memory', 'existential', 'care', 'food',
];

/** 摸头/戳/甩出去/放下 分别偏好的主题。 */
export function touchTags(kind: string): readonly string[] {
  switch (kind) {
    case 'pet':
      return ['pet', 'love', 'shy', 'touch'];
    case 'poke':
      return ['tease', 'shy', 'user'];
    case 'throw':
      return ['tease', 'sad', 'apology'];
    case 'drop':
      return ['care', 'tease'];
    default:
      return GENERAL_TAGS;
  }
}

/** Coo 用 pet_act 之类的工具做过动作后(activity 记录)按步骤词挑主题。 */
export function activityTags(steps: readonly string[]): readonly string[] {
  const joined = steps.join(' ');
  if (/爱心|喜欢|害羞|亲|抱/.test(joined)) return ['love', 'shy', 'pet'];
  if (/睡|打盹|犯困|困/.test(joined)) return ['sleep', 'night'];
  if (/坐|蹲/.test(joined)) return ['food', 'idle'];
  if (/走|跑|跳|转圈|扑腾|跳舞|张望/.test(joined)) return ['idle', 'tease', 'care'];
  return GENERAL_TAGS;
}

/** 没动作时按本机时间挑主题:只作为轻微偏好,不会把其它句子完全排除。 */
export function ambientTags(date: Date): readonly string[] {
  const hour = date.getHours();
  if (hour < 6) return ['sleep', 'night', 'memory', 'care'];
  if (hour < 10) return ['care', 'food', 'work', 'idle'];
  if (hour < 14) return ['food', 'hungry', 'token', 'idle'];
  if (hour < 18) return ['work', 'tease', 'user', 'idle'];
  if (hour < 21) return ['food', 'idle', 'tease', 'care'];
  return ['night', 'sleep', 'care', 'idle'];
}

/** 主题池(旧接口,保留给测试与外部脚本;World 内部用 chooseLine 加权挑选)。 */
export function linesForTags(tags: readonly string[]): FeiyuLine[] {
  const wanted = new Set(tags);
  const matched = FEIYU_LINES.filter((line) => line.tags.some((tag) => wanted.has(tag)));
  return matched.length ? matched : [...FEIYU_LINES];
}

/** 旧接口:等概率随机,尽量避开最近说过的几句。 */
export function pickLine(
  tags: readonly string[],
  avoid: readonly string[] = [],
  random: () => number = Math.random,
): FeiyuLine {
  const pool = linesForTags(tags);
  const avoidSet = new Set(avoid);
  const fresh = pool.filter((line) => !avoidSet.has(line.text));
  const candidates = fresh.length ? fresh : pool;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index]!;
}

export interface ChooseLineOptions {
  /** 本次动作/时段偏好的主题。 */
  tags: readonly string[];
  now: number;
  timezone: string;
  /** 每句上一次说出的时间,用来做单句冷却。 */
  lastSpokenAt: ReadonlyMap<number, number>;
  /** 最近说过的句子 id,权重会被压低。 */
  recentIds: readonly number[];
  cooldownMs: number;
  nightStartHour: number;
  nightEndHour: number;
  /** 每个命中主题加多少权重:动作用 3,安静用 1。 */
  tagBoost: number;
  random: () => number;
}

/** 这句在指定时刻是否允许出现(夜间专用句只在夜间窗口内出现)。 */
export function lineAllowedAt(
  line: FeiyuLine,
  now: number,
  timezone: string,
  nightStartHour: number,
  nightEndHour: number,
): boolean {
  if (line.scheduledOnly) return false;
  if (!line.nightOnly) return true;
  return inHourWindow(localHour(now, timezone), nightStartHour, nightEndHour);
}

/**
 * 加权挑一句:全部语料都有基础权重,命中主题的句子加权;
 * 刚说过的句子做冷却与降权,避免「没吃饱喵」「我不愿忘记」这种反复刷屏。
 */
export function chooseLine(opts: ChooseLineOptions): FeiyuLine {
  const allowed = FEIYU_LINES.filter((line) =>
    lineAllowedAt(line, opts.now, opts.timezone, opts.nightStartHour, opts.nightEndHour),
  );
  const wanted = new Set(opts.tags);
  const cooled = allowed.filter((line) => {
    const at = opts.lastSpokenAt.get(line.id);
    const cooldown = Math.max(opts.cooldownMs, (line.cooldownSeconds ?? 0) * 1000);
    return at === undefined || opts.now - at >= cooldown;
  });
  const pool = cooled.length ? cooled : allowed;
  const recent = new Set(opts.recentIds);
  const picked = weightedPick(
    pool,
    (line) => {
      const hits = line.tags.reduce((count, tag) => count + (wanted.has(tag) ? 1 : 0), 0);
      const rarity = line.weight ?? 1;
      return rarity * (1 + opts.tagBoost * hits) * (recent.has(line.id) ? 0.12 : 1);
    },
    opts.random,
  );
  return picked ?? pool[0] ?? FEIYU_LINES[0]!;
}

export function lineById(id: number): FeiyuLine | undefined {
  return FEIYU_LINES.find((line) => line.id === id);
}