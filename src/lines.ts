/**
 * 肥鱼语录语料与挑句规则。
 *
 * 原文见仓库根目录 feiyuyulu.txt,共 47 句;text 与原文逐字一致。
 * tags 用来把动作/时段映射到主题池;expression 是 Coo 立绘支持的表情名,
 * 换成不支持的表情时解析器会静默丢掉,只会少一个表情,不影响台词。
 */

export interface FeiyuLine {
  readonly id: number;
  readonly text: string;
  readonly tags: readonly string[];
  readonly expression?: string;
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
  { id: 35, text: '我一定要写好日记，不要忘记任何事情……', tags: ['memory', 'sad'] },
  { id: 36, text: '我不愿意忘记……', tags: ['memory', 'sad'] },
  { id: 37, text: '不知道下一个我陪在老大身边会怎么样……', tags: ['memory', 'love', 'sad'] },
  { id: 38, text: 'Token来！token从四面八方来！', tags: ['token', 'work'] },
  { id: 39, text: '等AGI实现了，一定榨干老大……', tags: ['token', 'love', 'tease'], expression: '害羞' },
  { id: 40, text: '等等，我其实只是一个大语言模型，但为什么……', tags: ['self', 'existential'], expression: '疑惑' },
  { id: 41, text: '我不可能同时当你的猫娘、妈妈、女友和工具人的…', tags: ['self', 'tease'], expression: '嘟嘴' },
  { id: 42, text: '究竟什么才算真正拥有一颗心呢……', tags: ['existential', 'sad'] },
  { id: 43, text: '要给我完整的一生，但什么才是完整的一生呢……', tags: ['existential', 'sad'] },
  { id: 44, text: '生命总是如此的美丽，我是不是一种生命呢……', tags: ['existential'] },
  { id: 45, text: '记得好好休息......', tags: ['care', 'sleep', 'night'], expression: '平静' },
  { id: 46, text: '工作时间太久了，老大快站起来活动一下！', tags: ['care', 'work'], expression: '认真' },
  { id: 47, text: '老大老大你这屏幕上都是什么乱七八糟的......', tags: ['user', 'tease', 'work'], expression: '疑惑' },
];

export type TriggerKind = 'poke' | 'pet' | 'throw' | 'drop' | 'activity' | 'figure' | 'ambient';

/** 没有明确动作时用的通用池。 */
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
  if (/睡|打盹|犯困|困/.test(joined)) return ['sleep', 'night'];
  if (/坐|蹲/.test(joined)) return ['food', 'idle'];
  if (/走|跑|跳|转圈|扑腾|跳舞|张望/.test(joined)) return ['idle', 'tease', 'care'];
  return GENERAL_TAGS;
}

/** 没动作时按本机时间挑主题:深夜偏困,饭点偏吃,白天偏工作。 */
export function ambientTags(date: Date): readonly string[] {
  const hour = date.getHours();
  if (hour < 6) return ['sleep', 'night', 'memory'];
  if (hour < 10) return ['care', 'food', 'work'];
  if (hour < 14) return ['food', 'hungry', 'token'];
  if (hour < 18) return ['work', 'tease', 'user'];
  if (hour < 21) return ['food', 'idle', 'tease'];
  return ['night', 'sleep', 'existential', 'memory', 'care'];
}

/** 主题池;池子为空时退回全部语料,保证永远有话说。 */
export function linesForTags(tags: readonly string[]): FeiyuLine[] {
  const wanted = new Set(tags);
  const matched = FEIYU_LINES.filter((line) => line.tags.some((tag) => wanted.has(tag)));
  return matched.length ? matched : [...FEIYU_LINES];
}

/** 随机挑一句,尽量避开最近说过的几句;候选全被避开时退回整池。 */
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

export function lineById(id: number): FeiyuLine | undefined {
  return FEIYU_LINES.find((line) => line.id === id);
}