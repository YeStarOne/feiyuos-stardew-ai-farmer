# 🐟 大肥鱼玩星露谷物语 · AI 自主农场

> 一个 AI Agent 从零接管《星露谷物语》存档的实验工程：**它自己种地、浇水、钓鱼、卖货、睡觉存档，连续跑了几十个游戏日。**

角色「蓝色小肥鱼」，标准农场，第七年冬季进行中。仓库里是驱动它自动游玩的全套脚本、自制 mod 和踩坑笔记。

**欢迎 fork / star / PR！** 无论你是想让 AI 玩星露谷、想改造自己的自动化脚本，还是单纯看 AI 种田翻车现场，都欢迎。

---

## 🌾 成果一览

| 阶段 | 做了什么 | 结果 |
|---|---|---|
| 春季 | 防风草起步 → 草莓扩种 → 每日浇水/收菜/卖货闭环 | 钱从 500 起步，峰值攒到 **16,319g** |
| 夏季 | 蓝莓 22 株大扩产 + 钓鱼补现金流 | 蓝莓首收 **+3,607g** |
| 秋季 | 蔓越莓 36 + 南瓜 9 起田，后又扩 **33 蔓越莓 + 9 南瓜** | 全场 **90 格作物**，种子投入约 8,600g |
| 冬季 | 全自动钓鱼（换铱竿 + 鱼饵）+ 双号联机挂机 + 节日锁时 | 单日结算 **+5,481g**，累计 **142,538g** |
| 工程 | 自研 BehaviorBridge 桥接「行为学」mod | 框选区域批量锄地/清理，**58 格一次锄完** |
| 运维 | day-loop 三日循环 + 双端夜间守卫 + 换日总控 + 结算看门狗 | 数十个游戏日无人值守，每天自动存档睡觉 |

**当前存档状态**（2026-11-13 实测 · 第七年 冬20）：共享钱包 **1,458,129g**；冬季田空（雪季不种），鸡舍 2 只鸡（蛋蛋/咕咕）；
主持在农场（Farm 42,11），鱼鱼在沙滩固定钓点（Beach 44,35）日常钓鱼，主持已持 Infinity Blade；成就 9 项。
仓库里是驱动这套系统跑了几十个游戏日的全部脚本。

其他数字：白名单自动卖货（只卖鱼/农作物/垃圾，熟菜/种子/任务品硬排除）；背包满自动清仓存箱；深夜守卫强制回家睡觉。

---

## 🧠 技能沉淀：她踩过的坑变成了卡（2026-11-13）

她和主持的每一次游戏调用都被离线提炼成**技能卡**（SKILL.md，原生 dsh-skill 热载）：
真实命令 + 真实输出做证据，失败轨写「下次怎么防」，成功轨写「怎么对账」。
仓库在 [YeStarOne/feiyuos-experience-memory](https://github.com/YeStarOne/feiyuos-experience-memory)，
现在她的技能目录里有 22 张卡，全部能点回当天的真实调用。

一个真实的例子：她有 31 次 `/state` 调用里 6 次（19.4%）解析报错——查下来不是
她的 python 写错，是 `bin/sd` 的 `[:1500]` 把 12387 字的 JSON 硬切成非法 JSON
（端点本身 0 失败）。修复后超长输出改为**折叠大字段**（`player`/`time`/`location`
永不折叠），快照在 [`tools/sd`](tools/sd)——正本仍是 `qq-workspace/bin/sd`，
工具的完整诊断三步见她的卡 `stardew-raw-truncated-json`。

---

## 🐟 双人联机 · 鱼鱼人话助手（fish-eye）

同一台机器双开两个游戏窗口（主持 `:7842` + 小肥鱼 `:7843`，`V1.6.15-fish` 独立副本、独立 APPDATA），
两人同处一个世界。小肥鱼在云端经 Tailscale 中继远程接入。

她抱怨"操作不方便"（方位是 0-3 数字 / 周围不带名字 / 走一格点一格 / 没地图 / 收种一格一格 / 水壶要掏出来看），
于是加了一层**人话翻译层**，零 mod 代码：

```
GET http://100.98.120.55:17851/say?cmd=看看     → 第2年夏10日 09:30 | 在【Farm】(64,20) | 钱 168g ...
GET .../say?cmd=地图                            → 文字地图(@=我 W=熟作物 ~=水 ...) + 附近地标
GET .../say?cmd=收菜                            → /harvest 一次收完周围熟的
GET .../say?cmd=去田边                          → /walk_to 寻路走整段
```

- `src/fish-eye-lib.mjs` 纯函数翻译层（方位/格子/地图/水壶/地标/指令解析）
- `src/fish-eye.mjs` `:7851` HTTP 服务，动作走 `/walk_to /harvest /tool_area /surroundings`，**零物理点击**
- "家"按人分岔：她 → `Cabin(4,9)`，主持 → `FarmHouse(9,9)`
- 首次进图调 `/map` 整图预热，地图一次就完整
- 自测不需游戏：`node src/test/fish-eye.test.mjs`（12 项）+ `node src/test/fish-eye.e2e.mjs`（mock 桥 16 项）
- 说明书：[docs/fish/guide-fish-eye-人话助手.md](docs/fish/guide-fish-eye-人话助手.md)

---

## 🛡️ 无人值守硬化（2026-11 实战补丁）

挂机最怕的不是不会玩，而是**"看起来在玩"**。这一轮把四类假活都堵上了：

| 症状 | 真因 | 现在的处置 |
|---|---|---|
| fishbot 报 `enabled:true`、HUD 也写 active，但一整天 0 抛竿 | 钓到宝箱后 `currentItem` 被打空、竿不在手 | 钓鱼循环每 200s 校验手里有竿→重选；10 次心跳 0 鱼 0 体力→硬重启 |
| 同上，但竿在手上 | **鱼饵耗尽**（`rod.baitStack=0`） | `baitGuard`：`/rod {action:"bait"}` 自动挂，没有就 `/give (O)685` 补 100 个 |
| 换日卡在结算页 / farmhand 客户端加载推不动 | 1.6 的 `ShippingMenu` 是**多页**，点一次只翻一页 | `fish-settlement-guard.mjs` 每 2s 巡检，点到面板消失 |
| 节日想从容玩 | 时间一路往前跑 | `festival-lock.mjs`：`/pause` 锁时 + 停自动流程，`off` 一键解锁并恢复 |

其他：`newday-trigger` 每 20s 比对日期做换日收尾；`host/fish-night-guard` 管睡觉与存档 mtime 校验；
`lock-fish-keep.mjs` 只在锁时期间工作，负责双人补饵/进食/清包/假活重启，解锁自动退出。

**文档**：
- [docs/脚本总览.md](docs/脚本总览.md) —— 13 个常驻进程/端口/日志/启停命令
- [docs/端点全表.md](docs/端点全表.md) —— ⭐**173 个端点 100% 封装**（`lib-extra.mjs` v2，函数名=路由驼峰），每条带方法/入参/坑位注记
- [docs/端点手册.md](docs/端点手册.md) —— 精选端点的实测样例 + 调用陷阱（§13）+ 附录 A（接入台账）
- [docs/游戏-AI游玩方案.md](docs/游戏-AI游玩方案.md) —— 全部踩坑记录（§1–§61）
- [docs/guides/README.md](docs/guides/README.md) —— ⭐**攻略库**：28 份「AI 执行版」攻略分 13 大类（必读开局 / 种田科技树 / 下矿 / 钓鱼 / 职业技能 / 畜牧工匠 / 社交送礼 / 节日 / 沙漠姜岛 / 收集 / 终局完美 / 彩蛋 / 社区情报），全部 wiki 实抓核对

---

## ⛏️ 矿洞自动化（挖矿 + 战斗 + 熔炼）

早春靠矿洞起步（铜→熔炉→铜水壶），后来做成一套能自己下矿、打怪、挖矿、回家熔炼的流水线。
和钓鱼线一样，它踩的坑比代码多。

| 脚本 | 作用 |
|---|---|
| `src/mine-session.mjs` | **挖矿+战斗会话**（v0.4）：视野内有怪→切剑→走到 1 格外→面朝挥击，清完继续挖；镐子直接砸矿、踩梯下楼，达到目标层数/体力/时间就回农场 |
| `src/mine-forever.mjs` | **常驻监工**：spawn `mine-session`，退出就复活；单实例互锁（启动时按命令行精确杀掉旧 `mine-*` 进程，不碰其它 node） |
| `src/craft-smelt.mjs` | 烧锭自动化：从 `/machines` 动态发现熔炉 → 投矿+煤 → `/interact` 收锭（炉位不再硬编码） |
| `src/smelt-session.mjs` | 批量熔炼会话：目标铁条/金条数量，逐炉装料、等出炉、清点 |
| `src/mine-run.mjs` | 早版编排：`warp('UndergroundMine1',5,5)` 进矿、电梯层清单、镐子砸矿主路径 |
| `src/mine-calibrate.mjs` | 镐子校准实测：直用 `/use` vs 行为学框选，全程回查验证 |
| `tools/killmine.ps1` | 一键停掉所有 `mine-*` 进程 |

**矿洞专属坑（血泪）**：
- **正门 y=-1 不可达**，`warp('Mine')` 会掉到 (-99,-99) limbo —— 唯一通路是 `warp('UndergroundMine1')`。
- 电梯端点 `POST /mine/elevator {floor:N}` 实测**只 reset 不传送**，下楼只能踩梯子（入口梯 10,4 有效）。
- 矿洞内 `warp` 后游戏时间会异常快进（见过 920→2410），下矿后必须盯着时间。
- **框选（BehaviorBridge）挖矿有效，框选打怪无效** —— 打怪只能一格一格走位挥击。
- 机器不随冻结时间走：熔炼要装料后 `/resume` 放时间走、收完再 `/pause`；NagiBridge 的 `/resume` 有时推不动时间，用 `FeiyuAutoLoad` 的 `/clock` 直接推 130 分钟。
- 隔石打怪会死循环（挥空计数 + 挪位兜底）；`/heal` 免费满血，是濒死保险丝。

---

## 🗂️ 仓库文件地图

| 文件 | 作用 |
|---|---|
| **核心库** | |
| `src/lib.mjs` / `src/lib-fish.mjs` | 主持(:7842) / 鱼鱼(:7843) 两端核心库：状态、寻路、传送、选物、钓鱼、卖货白名单、砍树、存箱 |
| `src/world-map.mjs` | 地图数据层：63 个地标、门坐标/营业时间、`/warps` 索引、可走图缓存 |
| `src/behavior-bridge/` | 自研 C# mod（BehaviorBridge）：把"行为学"框选暴露成 HTTP :7845 |
| `src/feiyu-autoload/` | 自研 mod（FeiyuAutoJoin/Load）：开机自动连主持、选角色；`/clock` 时间推进 |
| **日常循环 / 守卫** | |
| `src/day-loop.mjs` | 主持全自动日循环（收菜→浇水→补种→砍树做箱→卖货→钓鱼→睡觉存档） |
| `src/host-night-guard.mjs` / `src/fish-night-guard.mjs` | 双端夜间守卫：到点睡觉、存档 mtime 校验、赖床死循环破环 |
| `src/newday-trigger.mjs` | 换日总控：清卡菜单（结算多页连点）、写简报、卡死哨兵、赖床自动修 |
| `src/day-activator.mjs` | 每天给鱼鱼投一条"今日简报"（留言板） |
| `src/clear-dead.mjs` | 换季清死株（读存档 XML `dead=true` 格子 → 镰刀逐格清） |
| `src/festival-lock.mjs` | 节日锁时 / 解锁（`/pause` 成对、停自动流程） |
| **钓鱼线** | |
| `src/fish-fishbot.mjs` | 鱼鱼自动钓鱼 keeper（铱竿优先、包快满回农场卖、锁时停手） |
| `src/lock-fish-keep.mjs` | 锁时期间双人看护：补饵、进食、清包、假活硬重启 |
| `src/fish-settlement-guard.mjs` | 鱼鱼每日结算页看门狗（多页点到消失） |
| **矿洞线** | 见上一节 `mine-*` / `smelt-session` / `craft-smelt` |
| **人话助手** | `src/fish-eye.mjs`(:7851) + `src/fish-eye-lib.mjs` + `src/test/`（单测 / mock e2e） |
| **通信** | `src/fish-bridge.mjs`(:7850) 双人留言板，落盘 `fish-bridge.json` |
| **早期单步脚本** | `src/till-plant.mjs`（锄+种）、`src/water-check.mjs`（浇水检查）、`src/night-guard.mjs`（守卫 v1，已退役）、`src/behavior-test.mjs`（行为学桥探针）、`src/bwiki.mjs`（wiki 抓取） |
| **工具** | `tools/fg-name.ps1` 前台进程名（物理点击互锁）、`tools/activate.ps1` 激活窗口、`tools/diag.ps1` 诊断、`tools/screen.ps1` 截图、`tools/leftclick.ps1`/`rightclick.ps1` 物理点击、`tools/wind.ps1` 窗口、`tools/kill-loop.ps1` 杀循环、`tools/killmine.ps1` 杀挖矿、`tools/crop-audit.py` 直接读存档 XML 审计作物 |

> 完整的进程 / 端口 / 日志 / 启停速查见 [docs/脚本总览.md](docs/脚本总览.md)。

---

## 🏗️ 架构

```
┌─────────────┐   HTTP :7842   ┌──────────────────────┐
│  day-loop    │ ─────────────▶ │ Remix NagiBridge      │  ← 游戏内 mod
│  night-guard │                │  /state /surroundings │
│  lib.mjs     │                │  /use /warp /sleep …  │
└──────┬──────┘                └──────────┬───────────┘
       │   HTTP :7845                     │
       ▼                                  ▼
┌─────────────┐                ┌──────────────────────┐
│BehaviorBridge│ ─────────────▶ │ BehaviorAutomation    │  ← 框选自动化 mod
│ (自研 C# mod) │   反射调用     │ 选区域→批量锄/收/清   │
└─────────────┘                └──────────────────────┘
       │
       ▼  物理点击（左/右键）
    Stardew 窗口（前景进程校验 + DPI 感知）
```

- **lib.mjs**：核心库。封装移动闭环、面朝、使用工具、浇水、收获、存箱、卖货白名单、行为学桥接、前台互锁、物理点击。
- **day-loop.mjs**：单日流程编排（找箱→清仓→收获→信箱→浇水→补种→扩田→钓鱼→睡觉），一次连玩 3 天，锁文件防并发。
- **night-guard.mjs**：兜底守卫，游戏时间 ≥24:40 或体力 ≤10 强制回家睡觉，防止熬夜昏倒扣钱。
- **behavior-bridge/**：自研 SMAPI mod，把「行为学」mod 的框选自动化暴露成 HTTP 接口（GET /status、POST /select、/pause、/resume、/actions）。

---

## 🚀 快速开始

### 前置
- Stardew Valley 1.6.x + SMAPI 4.x
- [Remix NagiBridge](https://www.nexusmods.com/stardewvalley/mods/26760)（HTTP 游戏控制，默认端口 7842）
- [BehaviorAutomation 行为学](https://www.nexusmods.com/stardewvalley/mods/52289)（框选区域自动化，N 网 52289）
- Fishbot（自动钓鱼）可选
- Node.js ≥ 18

### 安装
1. 把 `src/behavior-bridge/` 编译成 mod 放进 `Mods/`（或用 `dotnet build`），与 BehaviorAutomation 一起启用。
2. 把 `src/*.mjs` 和 `tools/*.ps1` 放到任意工作目录（默认路径 `D:/StardewAI`，可在 lib.mjs 顶部改）。
3. 启动游戏，进存档，确认 `curl http://localhost:7842/state` 与 `curl http://localhost:7845/status` 都通。
4. `node day-loop.mjs` —— AI 开始种田。

> ⚠️ **窗口与前台**：物理点击（开收货箱、右键收获）前必须确认前台窗口是星露谷，脚本里已内置互锁。无人值守时请保持游戏窗口在前台。

---

## 🕳️ 踩坑集锦（详见 [docs/LESSONS.md](docs/LESSONS.md)）

- **锄地假成功**：`/use` 返回 `ok:true` 但地形没变——工具动画没走完不落判定。**唯一可靠锄地 = 行为学框选**。
- **存档级冻结**：`canMove:false` + 时钟停走，会写进存档自愈。修复优先级：强制 `/sleep` > 重启游戏。
- **深夜时间烧穿**：杀掉循环后没人管睡觉，游戏时间会实时烧到凌晨。接管前先看时间，>24:00 先睡。
- **半径静默跳过**：播种检查半径 8、补种半径 14——超出范围的格子**无声跳过**，排查优先怀疑半径。
- **浇水只浇干土**：`watered=true` 保持到次日清晨，重浇纯浪费；按行蛇形扫，别留孤格（孤格要单独跑一趟）。
- **体力预算**：浇水 2/格，270 体力浇 90 格就没了——田规模 ≈ 90 格上限，洒水器是正解。

---

## 🤝 欢迎 Fork

这个项目完全开源（MIT）。你可以：

- **Fork 后改成你自己的存档/角色**——改 `lib.mjs` 里的路径和角色名即可
- **接更多 mod**：BehaviorBridge 的 HTTP 桥模式可以套在任何 mod 上
- **改策略**：`day-loop.mjs` 的单日流程是一份可读的清单，随便换顺序加环节
- **提 Issue/PR**：踩到新坑、发现更好走位、想加新作物，都欢迎

如果这个仓库帮到你，给个 ⭐ 就是最好的鼓励。

---

## 📄 License

MIT © YeStarOne

攻略来源：小黑盒社区帖子（作者 Aaa帅、candor），整理为 AI 可执行清单见 [docs/GUIDE.md](docs/GUIDE.md)。

## Research notes (docs/research/)

11 deep-dive documents compiled from the Stardew Valley wiki while playing:

| Doc | What's inside |
|---|---|
| farm-master-plan.md | **Master plan**: M1 water-freedom → M2 money-freedom → M3 tech-freedom milestones |
| farm-tech-research.md | Tool upgrades, sprinklers, artisan chain, Robin buildings, winter plan |
| xhh-npc-research.md | Gift rules, loved gifts, birthday calendar, loop hooks |
| guide-fishing-mine.md | Fish prices by season, rod progression, mine layers 1-120 |
| guide-winter-spring.md | Winter/spring plan + full Community Center bundle checklist |
| guide-skills-professions.md | Profession choices per skill (Miner→Prospector, Tiller→Artisan, ...) |
| guide-festivals.md | Full festival calendar + what the AI should actually do each day |
| guide-cooking-energy.md | Stamina economy, food buffs that stack, priority recipes |
| guide-museum-geodes.md | Donation rewards (δ Amulet +1 luck, gem replicator), geode rules |
| guide-crops-profit.md | All-season crops g/day table, giant-crop 3x3, crow warning |
| guide-animals.md | Coop/barn economics, mayo/cheese chain, auto-petter dependency |
| guide-gifts-birthdays.md | Per-villager loved gifts + birthday calendar (wiki-verified), universal likes/hates |
| star-project-study.md | Study of CSXizhang/star companion mod: adoptable features (BWIKI API, action journal, delta snapshots) |
