# cortico-world-feiyu-whispers

给 Coopanion 桌宠加一点“人味”:它会在自己的气泡里随机冒出一句**预置的肥鱼语录**。
有互动时按主题挑,没互动时过一阵自己嘀咕;不调用模型,不花生成 token。

- 语料:89 句——`corpus/feiyuyulu.txt` 的 1–47 逐字收录,48–59 是补写的
  “肥鱼自己想说的话”,60–89 是模型梗、互动回嘴、被拖拽反应和内心 OS(`src/lines.ts`)。
- 挑句:不是按主题池硬切,而是**全部 89 句都有机会**,命中当前动作/时段的句子加权;
  同一句有冷却(默认 25 分钟),最近说过的还会再降权,所以不会来回只刷那十几句。
- 互动:戳一下、摸头、甩出去、拎起来放下会**立刻**响应(桥接层直接收页面互动,
  不用等互动事件被投递),默认每次必定回一句(`touchChance` 可调);
  戳→回嘴池,摸头→蹭/害羞池,甩出去→拖拽反应池,放下→安抚池。
  Coo 让桌宠做的动作走 `activity` 记录。
- 时段:深夜偏困、饭点偏吃、白天偏工作;只是轻微偏好,不会把其它句子排除。
  「记得好好休息......」只在夜间窗口(默认 22:00–06:00)出现。
- 固定日程:「工作时间太久了,老大快站起来活动一下!」默认每 40 分钟固定出现一次,
  不受动作概率影响(`workReminderMinutes`,设为 0 关闭)。
- 概率:动作不是 100% 触发;直接互动默认 100% 回一句。间隔没到、你刚说过话、
  Coo 正在回复时都会跳过。
- 回应模式:在 Coopanion 的「习惯」页里对应桌面宠物的 `touch.wakeOn`。
  - 安静(`none`):关闭,不冒台词。
  - 默认(`poke`):上一个气泡结束后 ≥10 秒。
  - 积极(`all`):≥5 秒。
  - 自定义(`custom`):沿用默认的 10 秒。
- 让 Coo 知道:最近嘀咕过的台词会写进环境提示词,模型能“记得自己说过”,但不会因此被唤醒。
- 气泡记录:沿用桌宠自己的记录通道,所以 Coo 的聊天页里也能看到这句话。

## 安装

Coopanion 的扩展目录是 `Coopanion/data/extensions`(一个 pnpm workspace)。三种方式:

1. 从 npm 安装(推荐):

```powershell
cd <Coopanion>\data\extensions
pnpm add cortico-world-feiyu-whispers
```

2. Coopanion WebUI 的扩展页搜索 `cortico-world-feiyu-whispers` 安装。
3. 本地链接开发:

```powershell
cd <Coopanion>\data\extensions
pnpm add link:<仓库路径>\plugins\cortico-world-feiyu-whispers
```

然后在配置里启用(默认 `enabled: true`,也可以显式写):

```json
{
  "worlds": {
    "feiyu-whispers": { "enabled": true }
  }
}
```

重启 Coopanion(没有热重载)。首次启动后,桌宠问候语或任意一次戳一戳之后应该能看到台词。

## 配置(`worlds.feiyu-whispers.*`,均可在 WebUI 热改)

| 键 | 默认 | 说明 |
|---|---:|---|
| `minGapDefaultSeconds` | 10 | 默认模式下两个气泡的最小间隔 |
| `minGapActiveSeconds` | 5 | 积极模式下的最小间隔 |
| `triggerChance` | 0.35 | 有动作且间隔已够时,真的开口的概率 |
| `touchChance` | 1 | 直接摸头/戳/甩/放下时回一句的概率;1 = 必定反馈 |
| `ambientMinSeconds` | 75 | 没动作时,自己嘀咕的最短等待 |
| `ambientMaxSeconds` | 180 | 没动作时,自己嘀咕的最长等待(区间内随机) |
| `userBusySeconds` | 25 | 你说话之后先安静这么久,别和 Coo 抢气泡 |
| `lineCooldownSeconds` | 1500 | 同一句说完后的冷却时间 |
| `avoidRecentLines` | 6 | 最近几句额外降权 |
| `workReminderMinutes` | 40 | 「工作时间太久了…」的固定间隔;0 = 关闭 |
| `workReminderLineId` | 46 | 固定提醒用哪一句(默认 46) |
| `nightCareStartHour` | 22 | 夜间专用句从几点开始允许出现 |
| `nightCareEndHour` | 6 | 夜间专用句到几点结束 |
| `awareness` | true | 把最近台词写进环境提示词 |
| `maxRecentLines` | 2 | 提示词里最多列几句 |

`enabled` 由框架读取;关掉它就是完全不挂载。

## 实现方式

- 选句、间隔、概率都是纯逻辑(`src/policy.ts`、`src/lines.ts`),有单元测试。
- 观察桌宠的事件库(`desktop-pet.self` / `.message` / `.speech`),用游标轮询,不订阅、不阻塞。
- 摸头/戳/甩/放下在 `bridge.ts` 里直接包住 `DesktopPetWorld.onTouch`,发生即入队;
  事件库里后来出现的同一次互动会被去重,不会重复触发。
- 气泡通过 `src/bridge.ts` 送进桌宠世界:在同一个 Core 进程里加载应用自带的
  `cortico-world-desktop-pet`,在 `DesktopPetWorld.prototype` 的入口上套一层捕获,
  拿到实例后调用它内部的 `say({ script })`。这样气泡、聊天页记录、气泡排队时长
  都和 `pet_say` 完全一致;`stop()` 时还原原型。
- 预置台词不经过模型:没有会被投递给模型的事件,只有一条 `deliver: false` 的
  `feiyu-whispers.spoke` 记录;唯一进入模型上下文的是环境提示词里的那一小段。

## 已知限制

- 需要同时启用 Coopanion 自带的 `desktop-pet` World(它就是桌宠本体)。
- 原型桥接依赖桌面宠物包的内部结构。Coopanion 升级后如果 `say`/入口改名,需要跟着适配;
  这是本插件唯一“激进”的地方。文件一行没改,但扩展市场对“替换桌宠内部方法”的插件
  审查很严,上架可能需要上游先给一个正式的气泡注入接口。
- 桌宠自己走动/打盹是页面侧动画,World 看不到;所以“睡觉时说没吃饱喵”靠的是时段偏好
  与睡眠动作记录,而不是精确检测睡姿。
- 表情名只有 Coo 立绘支持全套;换成鲸鱼等其它立绘时,不认识的表情会被静默丢掉,
  台词照常显示。
- 只在 Coopanion 0.2.x / world 契约 6 上验证过。

## 开发

```powershell
pnpm install
pnpm --filter cortico-world-feiyu-whispers test
pnpm --filter cortico-world-feiyu-whispers typecheck
```

## 许可

MIT。