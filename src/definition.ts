import type { WorldDefinition } from 'cortico/world.ts';
import { FEIYU_DEFAULTS, type FeiyuConfigSection } from './config.ts';
import { FeiyuWhispersWorld } from './world.ts';

export const FEIYU_WHISPERS: WorldDefinition<FeiyuConfigSection> = {
  id: 'feiyu-whispers',
  label: '肥鱼语录',
  defaults: () => ({ ...FEIYU_DEFAULTS }),
  // ctx.cfg 是 worlds.feiyu-whispers 的活引用;数值热改后下一次判定就生效。
  create: (ctx) =>
    new FeiyuWhispersWorld({
      cfg: ctx.cfg,
      timezone: ctx.timezone,
      botDir: ctx.botDir,
      repoRoot: ctx.repoRoot,
    }),
  // 自描述:没有模型工具;只推一条不投递给模型的记录事件。
  describe: {
    tools: [],
    events: [
      {
        type: 'feiyu-whispers.spoke',
        description: {
          zh: '往桌面宠物气泡里放进了一句预置语录(只落库,不唤醒模型)。',
          en: 'A preset line was placed in the desktop pet bubble (stored, never delivered to the model).',
        },
      },
    ],
  },
};