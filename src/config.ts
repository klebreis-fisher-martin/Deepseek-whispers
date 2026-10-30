import type { ConfigGroup } from 'cortico/core/types.ts';

/** config.json 的 worlds.feiyu-whispers 段。数值键全部热改,下一次气泡判定就生效。 */
export interface FeiyuConfigSection {
  enabled: boolean;
  /** 回应模式「默认」下,两个气泡之间至少隔多少秒。 */
  minGapDefaultSeconds: number;
  /** 回应模式「积极」下,两个气泡之间至少隔多少秒。 */
  minGapActiveSeconds: number;
  /** 有动作/互动时,满足间隔后仍只有这个概率真的开口。 */
  triggerChance: number;
  /** 没有动作时,多久之后自己嘀咕一句(随机区间的下限)。 */
  ambientMinSeconds: number;
  /** 没有动作时,多久之后自己嘀咕一句(随机区间的上限)。 */
  ambientMaxSeconds: number;
  /** 你刚发过消息后,至少安静这么多秒,避免和 Coo 的回复抢气泡。 */
  userBusySeconds: number;
  /** 同一句说完后,至少隔多少秒才会再次出现。 */
  lineCooldownSeconds: number;
  /** 最近说过的几句会额外降权,记忆的句数。 */
  avoidRecentLines: number;
  /** 「工作时间太久了…」固定日程,每多少分钟一次;0 = 关闭。 */
  workReminderMinutes: number;
  /** 固定日程那一条的语料 id(默认 46)。 */
  workReminderLineId: number;
  /** 「记得好好休息…」这类夜间专用句子从几点开始允许出现。 */
  nightCareStartHour: number;
  /** 夜间专用句子到几点结束(不含)。 */
  nightCareEndHour: number;
  /** 是否把最近嘀咕过的台词写进环境提示词,让模型「知道」自己说过什么。 */
  awareness: boolean;
  /** 环境提示词里最多列几句最近的嘀咕。 */
  maxRecentLines: number;
}

export const FEIYU_DEFAULTS: FeiyuConfigSection = {
  enabled: true,
  minGapDefaultSeconds: 10,
  minGapActiveSeconds: 5,
  triggerChance: 0.35,
  ambientMinSeconds: 75,
  ambientMaxSeconds: 180,
  userBusySeconds: 25,
  lineCooldownSeconds: 1500,
  avoidRecentLines: 6,
  workReminderMinutes: 40,
  workReminderLineId: 46,
  nightCareStartHour: 22,
  nightCareEndHour: 6,
  awareness: true,
  maxRecentLines: 2,
};

/** WebUI 的配置组;键名必须是完整的点路径,才会落到 config.json 里。 */
export const FEIYU_CONFIG_GROUP: ConfigGroup = {
  id: 'world:feiyu-whispers',
  owner: 'world:feiyu-whispers',
  schema: {
    type: 'object',
    title: '肥鱼语录',
    properties: {
      'worlds.feiyu-whispers.minGapDefaultSeconds': {
        type: 'number',
        title: '默认模式气泡间隔(秒)',
        description: '回应模式为「默认」时,上一个气泡结束后至少等这么久才可能有下一句。',
        minimum: 1,
        maximum: 600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.minGapActiveSeconds': {
        type: 'number',
        title: '积极模式气泡间隔(秒)',
        description: '回应模式为「积极」时使用;比默认更短。',
        minimum: 1,
        maximum: 600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.triggerChance': {
        type: 'number',
        title: '动作触发概率',
        description: '有互动或动作且间隔已够时,真的冒出一句的概率;0 到 1。',
        minimum: 0,
        maximum: 1,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.ambientMinSeconds': {
        type: 'number',
        title: '安静时最短间隔(秒)',
        description: '没有动作时,自己嘀咕一句的最短等待时间。',
        minimum: 15,
        maximum: 3600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.ambientMaxSeconds': {
        type: 'number',
        title: '安静时最长间隔(秒)',
        description: '没有动作时,自己嘀咕一句的最长等待时间;会在这个区间里随机。',
        minimum: 15,
        maximum: 3600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.userBusySeconds': {
        type: 'number',
        title: '你说话后的安静时间(秒)',
        description: '你刚打字/说话/回答过,就先让 Coo 自己聊,这段时间内不加旁白。',
        minimum: 0,
        maximum: 600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.lineCooldownSeconds': {
        type: 'number',
        title: '同一句的冷却时间(秒)',
        description: '同一句说完后至少隔这么久才可能再次出现,防止反复刷同一句。',
        minimum: 0,
        maximum: 21600,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.avoidRecentLines': {
        type: 'number',
        title: '最近几句额外降权',
        description: '最近说过的句子会被明显压低权重;这里填记住几句。',
        minimum: 0,
        maximum: 20,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.workReminderMinutes': {
        type: 'number',
        title: '工作提醒间隔(分钟)',
        description: '「工作时间太久了…」这一句固定每隔多少分钟出现一次;0 = 关闭。',
        minimum: 0,
        maximum: 480,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.workReminderLineId': {
        type: 'number',
        title: '工作提醒用第几句',
        description: '默认 46(工作时间太久了)。改成别的 id 可以换成别的固定提醒。',
        minimum: 1,
        maximum: 59,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.nightCareStartHour': {
        type: 'number',
        title: '夜间台词开始时间(点)',
        description: '「记得好好休息…」这类夜间专用句子从几点开始允许出现,默认 22。',
        minimum: 0,
        maximum: 23,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.nightCareEndHour': {
        type: 'number',
        title: '夜间台词结束时间(点)',
        description: '夜间专用句子到几点结束(不含),默认 6。',
        minimum: 0,
        maximum: 23,
        'x-hot': true,
      },
      'worlds.feiyu-whispers.awareness': {
        type: 'boolean',
        title: '让 Coo 记得自己嘀咕过',
        description: '把最近放进气泡的台词写进环境提示词。不产生新的模型调用,只多几个输入 token。',
        'x-hot': true,
      },
      'worlds.feiyu-whispers.maxRecentLines': {
        type: 'number',
        title: '记忆台词条数',
        description: '环境提示词里最多列几句最近嘀咕过的话。',
        minimum: 1,
        maximum: 6,
        'x-hot': true,
      },
    },
  },
};