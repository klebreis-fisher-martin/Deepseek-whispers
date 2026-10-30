# cortico-world-feiyu-whispers

给 Coopanion 桌宠加一点“人味”:它会在自己的气泡里随机冒出一句**预置的肥鱼语录**。
有互动时按主题挑,没互动时过一阵自己嘀咕;不调用模型,不花生成 token。

- 语料:47 句,来自仓库根目录的 `feiyuyulu.txt`(逐字收录在 `src/lines.ts`)。
- 动作:戳一下、摸头、甩出去、拎起来放下、Coo 让桌宠做的动作,各有一组主题池。
- 时段:深夜偏困、饭点偏吃、白天偏工作;没有动作时按这个顺序挑。
- 概率:动作不是 100% 触发;间隔没到、你刚说过话、Coo 正在回复时都会跳过。
- 回应模式:在 Coopanion 的「习惯」页里对应桌面宠物的 `touch.wakeOn`。
  - 安静(`none`):关闭,不冒台词。
  - 默认(`poke`):上一个气泡结束后 ≥10 秒。
  - 积极(`all`):≥5 秒。
  - 自定义(`custom`):沿用默认的 10 秒。
- 让 Coo 知道:最近嘀咕过的台词会写进环境提示词,模型能“记得自己说过”,但不会因此被唤醒。
- 气泡记录:沿用桌宠自己的记录通道,所以 Coo 的聊天页里也能看到这句话。

## 安装

Coopanion 的扩展目录是 `Coopanion/data/extensions`(一个 pnpm workspace)。两种方式:

1. WebUI 的扩展页安装(发布到 npm 后)。
2. 本地链接:

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
| `ambientMinSeconds` | 75 | 没动作时,自己嘀咕的最短等待 |
| `ambientMaxSeconds` | 180 | 没动作时,自己嘀咕的最长等待(区间内随机) |
| `userBusySeconds` | 25 | 你说话之后先安静这么久,别和 Coo 抢气泡 |
| `awareness` | true | 把最近台词写进环境提示词 |
| `maxRecentLines` | 2 | 提示词里最多列几句 |

`enabled` 由框架读取;关掉它就是完全不挂载。

## 实现方式

- 选句、间隔、概率都是纯逻辑(`src/policy.ts`、`src/lines.ts`),有单元测试。
- 观察桌宠的事件库(`desktop-pet.touch` / `.self` / `.message` / `.speech`),用游标轮询,不订阅、不阻塞。
- 气泡通过 `src/bridge.ts` 送进桌宠世界:在同一个 Core 进程里加载应用自带的
  `cortico-world-desktop-pet`,在 `DesktopPetWorld.prototype` 的入口上套一层捕获,
  拿到实例后调用它内部的 `say({ script })`。这样气泡、聊天页记录、气泡排队时长
  都和 `pet_say` 完全一致;`stop()` 时还原原型。
- 预置台词不经过模型:没有 `pushEvent(... )` 投递,只有一条 `deliver: false` 的
  `feiyu-whispers.spoke` 记录;唯一进入模型上下文的是环境提示词里的那一小段。

## 已知限制

- 需要同时启用 Coopanion 自带的 `desktop-pet` World(它就是桌宠本体)。
- 原型桥接依赖桌面宠物包的内部结构。Coopanion 升级后如果 `say`/入口改名,需要跟着适配;
  这是本插件唯一“激进”的地方。文件一行没改,但扩展市场对“替换桌宠内部方法”的插件
  审查很严,上架可能需要上游先给一个正式的气泡注入接口。
- 桌宠自己走动/打盹是页面侧动画,World 看不到;所以“睡觉时说没吃饱喵”靠的是时段偏好,
  而不是精确检测睡姿。戳它时如果它正睡着,`touch` 事件里也不带 `asleep`。
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