# AI 游玩方案：星露谷物语 & 泰拉瑞亚（2026-10-27）

> 来源：小黑盒社区调研（AI玩星露谷是成熟圈子）+ 全网项目定位。
> 状态：泰拉瑞亚已落地 D:\TerrariaServer；星露谷缺游戏本体。

## 一、星露谷物语（需要游戏本体，暂缺）

### 社区三条路线（小黑盒实测圈）
| 路线 | 项目 | 评价 |
|---|---|---|
| 影子农夫 | amarisaster/StardewValley-MCP（GitHub） | 最成熟可部署，但 AI 只是 NPC 型农夫，**无法和镇上 NPC 交互**，可玩性低（MakisenT 283赞帖否了这条） |
| 本地联机+虚拟手柄 | MakisenT 自研（283赞） | AI=第二个"玩家"，虚拟摇杆+自绘精灵图+读聊天框，能跟 NPC 互动，开发量 3 天 |
| **NagiBridge（MCP）** | anqinou-art/NagiBridge（GitHub） | SMAPI mod 直接把游戏状态/动作暴露成 **MCP 工具**；彧Z《让大肥鱼玩星露谷要避免的几个坑》71赞用的就是这套 → **首选** |

### NagiBridge 安装（等本体到位）
1. 装 SMAPI（github.com/Pathoschild/SMAPI）
2. NagiBridge Releases 下载 zip → 解压进 `Stardew Valley/Mods/`
3. AI 侧当 MCP client 连（本地大肥鱼走 dsh 的 MCP 接入或包一层工具插件）

### 踩坑清单（彧Z 71赞帖全文提炼，务必写进 agent 人设/工具说明）
**时间**
- 一天=现实 14 分钟；AI 思考 3~5 秒=游戏内 4~7 分钟 → **长任务前必 `pause_time`**
- 皮埃尔商店**周三休业**；营业时间 9:00–17:00
**NPC 交互**
- `interact` 只对面前一格生效：`find_npc` → 走到**相邻格** → `face` 转向 → `interact`
- NPC 站柜台后 = 柜台挡交互，绕正面；同一 NPC 试 3 次无反应就放弃（每次都烧钱）
**传送**
- `warp` 不带坐标=随机落点（会掉池塘）；带坐标也可能卡货架后寻路失败 → **只用验证过的坐标**
**物品**
- `/give` 用名字会造出 Error Item 假货（还返回 ok）→ **必须用 ID**，且物品/可放置物/武器前缀不同、长度不一
- 箱子/小桶/洒水器放背包=废物，要 `use_held` 摆出来
**清杂物**
- `/clear_ground` 连树一起删且不掉落 → 清 20×20 会丢 10 棵树；要材料就手砍
- 清 100 个杂物 ≈ ¥1.2 且上下文过长会"忘事" → **一次清 5 个**
**收尾**
- **只有睡觉才存档**，不睡当天全白干
- 背包满收获物掉地上

### 消耗（柒染ww 495赞帖）
- 1 小时 ≈ ¥4~6（带看门狗自动续命）；重置会话再玩，别带长上下文
- **看门狗模式**：定时检测 AI 是否停手，没动就自动戳一句"继续玩"——这是保持"真人感"的关键

## 二、泰拉瑞亚（已落地 ✅）

- **TShock 6.2.1**（Terraria 1.4.5.8，win-x64）→ `D:\TerrariaServer\server\`
- 应用级 .NET 9.0.22 → `D:\TerrariaServer\server\dotnet\`（不动系统）
- 启动：`DOTNET_ROOT=D:\TerrariaServer\server\dotnet TShock.Server.exe -world ...\Worlds\DafeiWorld.wld -maxplayers 8`
- 世界：DafeiWorld（中型/普通），首次生成液体沉降要 5~10 分钟（最慢步）
- **REST API**（tshock/config.json 开 RestApiEnabled，端口 7878）→ 本地大肥鱼经插件调用；云端 AstrBot 的 astrbot_plugin_tshock 等 Tailscale 修好也能管
- AstrBot 插件市场现成 `astrbot_plugin_tshock`（查询状态/在线玩家/远程命令/广播私聊）

### 泰拉瑞亚 AI 玩法定位（与小黑盒圈一致）
- 小黑盒上的泰拉瑞亚 AI = UI 皮肤（松间清泉 1140 赞已开源）、游戏内对话 mod（Flwater）——**没有人让 AI 操控角色**
- 真正能落地的 = AI 当**服务器神**：TShock REST 生成事件（血月/哥布林入侵）、刷 NPC/Boss、发物品、全服广播、封禁管理——人类玩家在里面玩，AI 是"活的世界管理员"

## 三、泰拉瑞亚落地实录（2026-10-27 亲测踩坑全录）

### 最终栈：TShock 5.2.4 + Terraria 1.4.4.9（不用 6.2.1）
- `D:\TerrariaServer\server524\`（TShock 6.2.1/1.4.5.8 在 `server\`，**弃用**：REST rawcmd 按指令间歇性"无效"，疑似新插件管理器的命令注册问题）
- 应用级 .NET 9.0.22 通用：`DOTNET_ROOT=D:\TerrariaServer\server\dotnet`
- 启动：`TShock.Server.exe -world ...\Worlds\DafeiWorld.wld -maxplayers 8`（服务端无 UI 挂后台跑）
- 世界：DafeiWorld 小型普通（**中型世界"安置液体"20-30 分钟**，小世界 2 分钟——AI 当服务器神不需要大地图）

### 亲测踩坑（比小黑盒帖子更狠的）
1. **rawcmd 的 cmd 参数不做 URL 解码**：`%2Fhelp` 字面到达=永远"输入的命令无效"；必须原生 `/`+空格用 `+`。这是所有"指令时灵时不灵"的唯一真因（不是限流不是权限）。
2. **/v2/token/create 的 token 重启即失效**（内存表）→ 永久令牌写 `tshock/config.json` 的 `ApplicationRestTokens: {"<key>": {"Username":"dshai","UserGroupName":"superadmin"}}`，key 就是令牌本身。
3. **REST 权限串按"值"写不是按"常量名"**：restrawcommand 的值是 `tshock.rest.command`、restbroadcast 是 `tshock.rest.broadcast`。按名字猜权限串=永远 403。
4. **DB 手插 superadmin 组会跟内置组打架**：5.2.4 的 superadmin 组是硬编码的，用户 Usergroup 直接写 `superadmin` 即可（别往 GroupList 插同名行）；6.2.1 则没有内置 superadmin 行。
5. **每次加载世界都重跑"安置液体"**（几秒到几分钟），别误判为挂死——看 CPU 在爬就是活着。
6. **spawnmob/give 需要在线玩家锚点**：无人在线报"你必须在游戏内使用该指令"。AI 独处时只能玩世界级：worldevent（bloodmoon/rain/sandstorm/invasion/meteor）、time、hardmode、broadcast、save。
7. **物品匹配**：`/give * Iron Bar 5` 报"物品不存在"（TShock 5.2.4 通配符/名称匹配问题）——有玩家在线时用真实玩家名+物品 ID 试试；AI 独处时发物品本来也没意义。
8. token/create 只吃**查询参数**，JSON/form 体 500（stringToUnescape null）。
9. 中文经 REST 用 %E5 编码可通（广播实测成功）；rawcmd 指令参数里的中文会乱码——避免中文物品/NPC 名。

### dsh-terraria 插件（已落地）
- `C:\Users\Administrator\dsh-plugins\dsh-terraria`，本地 desktop profile 已接（symlink+bundles），**大肥鱼本地端下次启动自动生效**
- 6 工具：terraria_status/players/cmd/broadcast/chatlog/help
- 永久令牌已写入 `~/.dsh/terraria.config.json`（A403BF46…，组 superadmin 全权）
- 端到端验证：status/players/cmd(time,bloodmoon)/broadcast 全绿

## 四、星露谷备料完成（2026-10-27，等本体）
- 暂存区 `D:\StardewAI\stage\`：SMAPI 4.5.2 installer.zip、NagiBridge v1.1.0.zip（含编译好 dll）、NagiBridge-API.md（50 端点全录+社区脚本清单+8 坑）
- **NagiBridge 是 HTTP API（游戏内 localhost:7842），不是 stdio MCP** → 本地大肥鱼经 **dsh-stardew 插件**（已预建：12 工具 status/state/move/warp/act/scan/sleep/chat/menu/farm/cheat/raw，symlink+bundles 已接，等游戏即可端到端）
- NagiBridge 要求：星露谷 **1.6+ / SMAPI 4.0+**；装法=本体装好后跑 SMAPI installer → NagiBridge.zip 解压进 `Stardew Valley/Mods/` → SMAPI 启动 → 7842 自动开
- 游戏内聊天面板：API Mode（直连 LLM）或 Channel Mode；大肥鱼走 dsh 插件即可，不需要面板
- 本体到位后的 3 步：①SMAPI installer 指向游戏目录 ②解压 NagiBridge 进 Mods/ ③SMAPI 启动游戏 → stardew_status 验证

### dsh-stardew 功能级验收（2026-10-27，mock NagiBridge）
- mock 服务器：`D:\StardewAI\mock-nagibridge.mjs`（node，占 7842；**真游戏启动前必须关掉**，验收脚本 `verify-stardew.mjs`）
- 结果：**12 工具 16 项调用全绿**（status/state/move/warp/act 四动作/scan/sleep(chat 中文 push/history)/menu/farm(machines/animals)/cheat(ID give)/raw 透传）
- 插件层到此验证完毕——本体到位后唯一变量只剩游戏本身

### 模拟整日游玩剧本验收（2026-10-27，mock 层）
- `D:\StardewAI\sim-day.mjs`：按大肥鱼真实执行序走完游戏内一天 16 步（status→pause→state→scan→face→锄/播/浇→背包检查→收割→聊天→**睡觉(含换天确认防御)**→wakeup→resume），全绿
- 该序列即 dsh-stardew 真实游玩路径；本体到位后换掉 mock 即为真实验收

## 五、星露谷落地实录（2026-10-27 亲测跑通，AI 当主角方案）

### 最终结论：AI 当主角，不需要多人/农舍
- NagiBridge **7842 端口控制的就是 host 主角本身**（API 文档原文"你控制端口 7842（host 角色）"），单人存档即可，无需建农舍、无需第二角色。
- 用户不上线也完全可行——一个游戏窗口跑着，AI 通过 HTTP 调 7842 干活。

### 最终栈
- 本体：`G:\量化系统安装包\V1.6.15`（星露谷 1.6.15，GOG 版，670MB，自带 coreclr/hostfxr self-contained）
- SMAPI 4.5.2：从 `install.dat`（**其实是 ZIP，PK 头**）直接解压到游戏目录——官方 installer 是纯交互式（`Console.Clear` + `ReadKey`），**非控制台环境必崩**，别用 `--install --path` 参数（不支持）
- NagiBridge 1.1.0：解压到 `Mods/NagiBridge/`
- 启动：**必须用 `StardewModdingAPI.exe`**，双击 `Stardew Valley.exe` 会绕过 SMAPI（mod 不加载，7842 不监听）

### 亲测踩坑（比社区帖子更细）
1. **`/use` 的 x,y 参数基本无效**——工具永远作用在**角色面朝的下一格**。正确姿势=`/move` 站到目标相邻格 → `/face` 朝目标 → `/use {}`。返回里的 `tile` 字段才是实际作用格，必须校验。
2. **`/move` 有站点偏移**——报告 "Moving to (63,18)" 但实际停在 (64,18)。每次 move 后必须重读 `/state` 拿真实坐标，不能信返回消息。
3. **`/select` 参数是 `name` 不是 `slot`**。`{"name":"Hoe"}` ✓，`{"slot":1}` ✗ 报 Missing parameter: name。
4. **`/pause` 必须带 JSON 体 `{}`**，不带会返回 400 Length Required。成功返回 `{"ok":true,"action":"paused","frozenAt":650}`，时间确实冻结。
5. **`/status` 必须用 `localhost` 不能 `127.0.0.1`**——HTTP.sys 的 Host 头校验，用 IP 访问返回 400 Bad Request Invalid Hostname。
6. **`/sleep` 是全链路最关键的收尾**——不睡觉当天全白干。返回 `state:slept`（单人已过夜）/`ready`（多人已就床）/`already_ready`。实测 `{"ok":true,"state":"slept","home":"FarmHouse","bed":"10,9"}` 后约 20 秒换天，体力回满。
7. **失焦暂停必须关**：`startup_preferences` 里 `pauseWhenOutOfFocus` 默认 true，AI 后台玩会整个游戏暂停。改 false 后后台可正常运行。
8. **分辨率坑**：配置里 `preferredResolution` 曾被设成 5760x3240（5K），在 2560 屏幕下截图只拍到左上角。改 1920x1080 + `windowedBorderlessFullscreen=false`。
9. **GOG 版缺 steam_api64 导致 `Error connecting to Steam`**——只影响 Steam 成就，不影响游戏，可忽略。
10. **`/scan` 返回的坐标不可靠**（曾报 (8,7) 而角色在 (64,15)），用 `/surroundings?radius=N` 拿权威瓦片数据（含 `passable`/`diggable`/`terrain`/`object`）。
11. **防风草种子会消失**——首次进游戏背包有 Parsnip Seeds x15，操作若干次后不见了。可能被 /use 误撒在地里，也可能初始种子需要先跟刘易斯对话领取。
12. **PowerShell 中文脚本必须 UTF-8 BOM**，否则 GBK 解析报"字符串缺少终止符"。

### 实测通过的动作清单
翻地（HoeDirt 出现）✓ 播种（种子实际扣除）✓ 浇水（watered 标记转 true）✓ 砍树（含伐木掉落拾取）✓ 砸石头/割杂草/砍枯枝 ✓ 传送 warp ✓ 时间冻结 pause ✓ 睡觉换天+落盘存档 ✓ 读状态/地图/周围/扫描 ✓ 补满水壶 refill ✓

### ⭐ 完整一日实战账（2026-10-27 春 Day2 → Day3，全部 AI 独立完成）

Day2（时间 650 开局，体力 270/270，钱 500，Parsnip Seeds x15）：
| 动作 | 数量 | 消耗 | 备注 |
|---|---|---|---|
| 翻地 | 11 格 | 体力 10 | 昨天翻的地过夜全部复原（未播种的裸土会被游戏重置，正常机制） |
| 播种 | 8 格 | 种子 7 | 种子 15→8→7，说明**撒种有失败率**（8 次调用只扣 7 粒） |
| 浇水 | 8 格 | 水 40→27 | 全部 `watered=true` |
| 清杂物 | 18 处 | 体力 20 | 石头×6 枯枝×3 杂草×8 → Stone×4 Wood×1 Fiber×3 Mixed Seeds×1 |
| 砍树 | 4 棵 | 体力 104 | 每棵约 10~16 下，掉落需**走过去捡** |
| 拾取 | — | — | Wood 15→23（+8）、Sap×1 |
| 睡觉 | 1 | — | 19:50 睡，20 秒后换天，体力回满 268/270 |

Day3 开日验证：8 株防风草全部 `cropPhase=1`（破土发芽），`watered` 标记隔夜保留，背包 Wood×26 Stone×6 完整落盘（存档 3.5MB，22:44 写入）。

### ⭐ 新增必须记住的坑（Day2 实战补充）
13. **`/refill` 端点存在且极好用**——`POST /refill {}` 直接把水壶补满（返回 `{"ok":true,"water":40,"max":40}`），**不用跑去池塘**。这是 NagiBridge 的便利接口，比原版游戏省一整套"走到水边→长按补充"的流程。
14. **水壶计数会滞后/卡住不刷新**——连续浇水时 `/state` 里 `waterLeft` 可能连着几次都是 27 不变，但 `watered` 标记和作物生长都正常。**判定浇没浇上，看 `surroundings` 里的 `watered` 字段，不要看 waterLeft 递减**。
15. **树有随机耐久，同一 `Tree:N` 不代表血厚**——实测 `Tree:2` 一棵 10 下倒、另一棵 16 下才倒，`Tree:1` 6 下、`Tree:3` 10 下。**不要设固定次数，必须每下后查 `surroundings` 里该格 `terrain` 是否还是 Tree**。
16. **砍倒后木头不会自动进包**——掉落物在地上，必须走到倒树位置附近（含周围 8 格）才会吸进背包。实测砍完 3 棵木头没涨，走过去转一圈才 +8。
17. **`/warp` 成功返回值也是旧位置**——`{"actual":{"location":"Farm",...}}` 里 `actual` 是**请求之前**的位置（warp 是异步切场景）。必须 `sleep 2s` 后重读 `/state` 才有真位置。同理跨场景 warp 后立刻 `/surroundings` 可能还是旧地图。
18. **未播种的翻地过夜必复原**——春 Day2 翻的 11 格里 3 格没播上种，Day3 全部回到普通草地。**锄地必须当天播完，否则白费体力**。

### 操作节奏建议
- 长任务前先 `/pause` 冻时间（游戏内一天只有 14 分钟现实时间）；但批量农活建议**不暂停**跑，否则现实时间成本高
- 每次动作后重读 `/state` 校验，不信返回消息
- 关键收尾必须 `/sleep`，否则进度全丢
- 水壶低于 20 直接 `/refill`，别浪费体力找水
- 一天的合理排班：起床 → 浇水 → 翻地播种 → 清水壶 → 清杂物 → 砍树 → 天黑前睡觉

### AI 独立跑通的判定标准（可复现验收）
```
curl -s localhost:7842/state          # 有 player/inventory/time
curl -s "localhost:7842/surroundings?radius=10" | grep -c crop   # 作物格数 >0
# 连跑一天后
curl -s localhost:7842/state | grep dayOfMonth   # 必须 +1
```
三条全过即"AI 能自己玩"，不依赖任何人工介入。

## 六、Remix NagiBridge + Fishbot 全自主经营（2026-10-28 凌晨实录）

### 栈升级
- 原版 NagiBridge → **NagiBridge-Remix v0.9.1**（pendel001.NagiBridge，GitHub: pendel001/NagiBridge-Remix）。**两 mod 的 DLL 程序集名相同，SMAPI 按程序集身份去重，改文件名也救不了 → 只能二选一**。原版挪进 `Mods/_disabled/`，Remix 独占 7842。
- Remix 是原版超集：约 140 个端点 vs 25，新增 `/click`（点菜单，先挪光标）、`/click_tile`、`/walk_to`（自带寻路，参数要带 location）、`/warp_into`（触发进门事件！）、`/till_area`、`/scan_chests`、`/store`（只认木箱）、`/store_all`（往附近箱子存）、`/fishbot`、`/screenshot`（base64 截图）、`/dump_tile`（**查询参数格式 `?x=&y=&location=`**，不是 JSON body）、`/warps`（全地图传送点清单）、`/farm_buildings`（建筑坐标）、`/mail`、`/quest_list`、`/menu`、`/menu/click`、`/menu_close`、`/crop_seasons` 等。原插件 dsh-stardew 的全部端点（state/move/face/use/select/sleep/warp/refill/surroundings）全部兼容。
- **Fishbot v0.6.1**（AdroSlice.Fishbot，GitHub adroslice/sdv-fishbot）：源码编译（ModBuildConfig 自动装进 Mods），装好后 Remix 的 `/fishbot` 端点才能用。`/fishbot` 是 **toggle**，返回 `{ok,enabled}` 是切换后的状态——**必须用 fishbotSet() 校验式切换**，裸 toggle 会把自己搞糊涂（本夜踩了三次）。

### 全自主一天流水（跑通）
浇水(waterAll) → 钓鱼(fishbot 挂机+守护循环) → 包满/4条鱼 → 回农场卖鱼 → 23:00 睡觉存档。Day4/5/6 三天全自动跑完。

### 卖鱼全链路（最难的一环，已固化）
1. `openBin()`：warp Farm(72,15) → `/click_tile`(72,14) 把光标挪到杂货箱上 → **物理右键**（`rightclick.ps1`：SetProcessDPIAware + SetForegroundWindow + mouse_event 0x08/0x10）→ ItemGrabMenu 打开。Remix 的 `/click_tile` 只会左键，右键必须物理鼠标。
2. 投放：`/menu/click {x,y}`。**槽位坐标看截图实测**：ItemGrabMenu 背包行 x=265+slot*65，第一行 y=478。**slot 必须用物品的 `slotIndex` 字段**——`/state` 的 inventory 数组只含非空格，数组下标≠真实槽位（差一格投放就落空）。
3. 钱不实时到账：杂货箱次日结算（睡觉后）。

### 本夜踩坑（按杀伤力排序）
19. **Windows 150% DPI 缩放让所有窗口坐标错 1.5 倍**：MoveWindow 设的外框尺寸被系统放大，客户区变成 2882×1533，标题界面点 Load 永远点不中。修=PowerShell 先 `SetProcessDPIAware()` 再 MoveWindow，客户区回到 1274×703。**所有物理鼠标坐标方案都要带这一句**。
20. **双 `/pause` 单 `/resume` = 时间永久冻结**：pause 是开关不是计数器？实测 pause 两次后 resume 一次时间仍不走（或状态机坏）。纪律：pause/resume 成对出现，用 fishbotSet 式校验封装。
21. **BobberBar 是钓鱼小游戏条不是模态菜单**——守护循环把它 `/menu_close` 了=每竿必丢鱼，体力狂掉渔获为零。白名单：只关 ItemGrabMenu/GameMenu/Letter/Shop/Dialogue，绝不碰 BobberBar。
22. **钓鱼宝箱战利品界面（ItemGrabMenu）会冻结整个游戏时间**——Fishbot 抓到宝箱弹菜单不自动关，游戏挂死在原地。守护循环每 20 秒巡检关模态菜单即可。
23. **物品栏满 12 格会卡死 Fishbot**（inventory_full 事件暂停）。没前就先扔 Sap/Fiber；鱼竿在手时背包务必留 2 空格。
24. **warp 有概率静默失败**（返回 loc 还是旧图）。warp 必须轮询 `location.name === 目标`，失败重发，最多 4 轮。
25. **`/warp_into {location}` 会触发进门事件**——威利送鱼竿剧情：收信（信箱=对着 (68,16) 按 /interact）→ `warp_into FishShop` → 竹鱼竿到手。跳过剧情不触发时重复"出门→摸门→warp_into"序列。
26. **信件必须去信箱收**（对 (68,16) 互动），`/mail` 只读不能收；收了信任务/剧情才解锁。
27. `PauseAfterTime`（Fishbot 配置）= 钓满 130 分钟自动暂停开菜单——挂机整天要改成 9999；`FA_PrioTreasureAbove=2.0` 永不追宝箱，防钓鱼宝箱菜单打扰（实测追宝箱每竿都弹菜单）。
28. PowerShell 反斜杠路径经 bash 内联 `-e`/heredoc 传递会被吃（`D:\StardewAI\rightclick.ps1`→`D:StardewAIightclick.ps1`）——**含反斜杠路径的命令一律写成 .mjs/.ps1 文件执行**。

### 脚本资产（D:\StardewAI\）
- `lib.mjs`：核心库。go/useOn/standAdj/warp(带重试)/waterAll/openBin/shot/fishbotSet/invCount/log
- `day-loop.mjs`：**一整天全自主**（浇水→补种→钓鱼→包满卖鱼→23:00 睡觉存档）
- `rightclick.ps1`：物理右键（DPI aware + 聚焦）
- `fish-watch.mjs`：钓鱼守护（关模态菜单，不碰 BobberBar）
- `ship-fish2.mjs`：卖鱼（独立可跑）
- `till-plant.mjs` / `water-all.mjs`：农活单件
- 启动游戏：`powershell Start-Process 'G:\量化系统安装包\V1.6.15\StardewModdingAPI.exe' -WorkingDirectory 'G:\量化系统安装包\V1.6.15'`；标题进档=DPI 修正后 click(517,609)→click(640,129)。

### 里程碑（2026-10-28 夜班续）
- **D13 草莓日达成**：钱攒到 5135 → `/buy (O)745` 分批买草莓种子 → 批量翻地 37 格 → **37 株草莓全部种下**（总作物 57 株）。D17 首收预计 +4400g，D21/D25 再收两轮。
- **新坑**：①`/harvest` 是"一发全收"（返回 harvested 总数），镰刀 useOn 收不了根茎作物 ②`/buy` 的 id=(O)原版物品ID，inventory full 会拒买 ③**背包满格会卡死 Fishbot 的渔获存包**（表现为渔获为零+体力白掉）——清 Coal/Clay/Fiber 等宝箱杂物是日常 ④开箱失败最常见原因=有残留 DialogueBox（如领养猫事件"你打算收养这只猫吗？"），openBin 已加前置清菜单 ⑤守卫循环新技能：钓鱼宝箱菜单弹出时先点 (265,160) 捡箱内物再关（捡到过 Coal×5）。
- 钱线：D9 3473 → D13 5059 → D17 草莓首收后预计 ~9500。

## 七、多机共用一屏守则(2026-10-28 用户玩别的游戏时定稿)
1. 物理点击前必查前台: fg-name.ps1 输出含 Stardew 才许点, lib 的 openBin/harvestCrops 已内置互锁
2. 游戏没在跑时 cron 绝不 Start-Process 拉起(抢用户前台); 只有用户在对话里明确要求才拉
3. day-loop v3 带锁文件 .day-loop.lock(10分钟过期+60s心跳), 防 cron 每15分钟重复拉起双实例
4. 卖出=白名单(lib.isSellable 鱼+作物+垃圾), 其余存箱(/store 只认木箱)/留包; 右键收割用快照差分验证不依赖物品名

## 八、"行为学"mod(Nexus 52289)接入 —— 框选区域自动作业(2026-10-29)
- 身份: BehaviorAutomation v2.4.0-beta.3, 作者 sznine, 源码 github.com/SZnine/stardew-valley-mod (mods/BehaviorAutomation), MIT
- 安装: Mods/BehaviorAutomation(release zip)+ **Mods/BehaviorBridge(自研伴生桥接, 源码 D:/StardewAI/behavior-bridge)**
- 桥接口 **localhost:7845** (与 NagiBridge 7842 并存):
  - GET /status → {behaviorLoaded, hasSession, state, paused, active, jobs, generation, currentTask, windowActive}
  - POST /select {x1,y1,x2,y2,button:"left"|"right"} → 等价拖框松手; right=智能换工具池, left=手持道具/种子/材料; 返回 {added,removed}=生成任务数
  - POST /clear(停任务) /pause /resume; GET/POST /actions {scope:held|leftExtra|smart, kind, enable}(行为开关=ActionKind 枚举名)
- lib.mjs: behaviorSelect/behaviorStatus/behaviorClear/behaviorWaitDone 等
- ⚠️ 三条铁律: ①行为学只在游戏窗口前台推进作业(Game1.game1.IsActive, 源码定死) ②作业期间禁止 /move(抢角色) ③/dump_config 时行为学无自有 HTTP 路由, 7845 是 BehaviorBridge 的
- 与 day-loop 接力建议: 浇完水 → behaviorSelect 整块田(收/锄/种) → behaviorWaitDone → 再去钓鱼; 首次实机验证用 D:/StardewAI/behavior-test.mjs
- 坑: clone github 直连被重置, 走 ghproxy.net 前缀镜像(curl/git 都行); Clash 7890 当时没开

### §八附: 实机验证(2026-10-29 00:10-00:25)
- ✅ 拉起 SMAPI→标题进档: 视觉定位法(screen.ps1截屏+diag.ps1拿窗口物理矩形+客户区标定坐标换算)可用; 本机 4K(3840x2160 物理/2560x1440 逻辑), 游戏客户区 1280x720 物理
- ✅ BehaviorBridge 加载+挂接成功(SMAPI 日志双确认), 7845/status 正常
- ✅ 3x3 试框: POST /select {65,21±1, right} → added:7 jobs, mode=Axe, state planning→checking, currentTask Water(智能池自动排浇水) —— 行为学桥接打通
- ⭐新坑: ①click_tile 返回的 absolute=屏幕物理坐标(随窗口位置动态变化), 任何写死标定坐标都会点空 —— openBin 已改用实时 absolute; ②互锁实测有效: 用户开着别的窗口时 openBin 拒绝物理点击, 须先 activate.ps1 显式拉前台(用户授权时); ③night-guard 在世界未就绪时 /state 返回错误对象致 s.time 取值崩溃, 已加判空; ④清仓逻辑抽成 lib.sellAndStore(chest, force) 随时可调(巡检/手动/主循环共用); ⑤Windows ESM import 必须 file:/// URL
- 待办: 行为学接入 day-loop 主流程(收/浇/锄整块田替代逐格 HTTP), 先观察一晚再说

### §九: 夜间战报(2026-10-29 01:00-01:00)
- 钓鱼5级→LevelUpMenu 选职业: /menu/click 和 /key 都打不动, 物理左键一次成功(渲染坐标+客户区偏移); 队列式升级通知(耕种2/3...)逐个OK关闭; 选了渔夫(+25%鱼价,匹配卖鱼政策)
- warp 有落点校验: 目标格站不住(水/墙)直接拒( "skipped_warp" ); 城镇入口=(50,57)可站
- /gift {target,item}: 只认当前地图的 NPC; 乔迪周二下午不在家( JoshHouse 内景经 warp_into 进入 ), 早晨 8-11 在家 → tryQuests 排在清晨
- QUEST_RESERVE 政策: 任务物品(花椰菜×1)即使可卖也留在背包(否则清晨清仓会把任务物品投箱, 10-29踩坑后从箱里捞回)
- LevelUpMenu 物理坐标=渲染坐标+客户区原点(1280,720); ShippingMenu 用 /menu_close 可关

### §十: 冻结事件与种子经济学(2026-10-29 03:00-03:25)
- ⭐玩家冻结(canMove:false+时钟停)会**存进存档自我延续**, 解法优先级: 强制/sleep重置 > 重启游戏 > 载入后立刻再睡洗档。/resume 无效时可Move:false说明是玩家级锁不是暂停
- /drop {name,count}: 只掉N个单位不掉整叠; 掉落物会被自动拾取吸回(除非立刻走出半径); 满包时 /craft 合成物会 "item dropped" 掉地上(合成前必查空格, lib.craftChest已加闸)
- /buy {id,count}: **count无效每次只买1包**, 同名自动叠→循环调用即可; 远程购买不受营业时间限制; ID实测表: 433咖啡豆 478大黄 479甜瓜 480番茄 481蓝莓 482辣椒 483小麦 484萝卜 485红椰菜 486杨桃 487玉米 488茄子 478~488连号, 745草莓, 434=贵重物(31108g)勿碰
- 内景地图必须 /warp_into, /warp 只对室外; 皮埃尔店柜台 interact 前会有路人剧情插播, /key confirm 推进; 商店9:00才开但远程/buy随时可用
- 夏4开局: 蓝莓22包+甜瓜/番茄/辣椒 各1已购(钱15967→827, 钓鱼回血); 农场箱(71,16)+农舍箱(9,8)×2=3个存储点; day-loop 种后补浇水已加

### §十一: 山洞选择与对话选项的解法(2026-10-29)
- NPC 选择对话(如德米特里厄斯"你喜欢哪个?蘑菇/蝙蝠")的选项: /key confirm 和 menu_close 都不行;
  正解=**/menu/click {x,y} 点选项文字**(渲染坐标, 截图看位置), 点一次即选中(后续页用 /key confirm 翻)
- 遇到选择题千万别 menu_close(会取消), 认准 responses 字段非空 → 截图找选项坐标 → click
- 山洞选了蘑菇(每日稳定产出+蘑菇收集包素材); 事件期间 canMove:false+时钟停是正常的, 对话走完自动恢复

## §十二 锄地假ok事件 (2026-10-29)

**症状**: expandField/till-plant 连续3天"翻地 N/N ok"但空耕地永远=0, 种子种不下去; /surroundings 回查地形不变。

**排查**: 镐敲石头 ok:false / 浇水正常 / 行为学3x2试锄 6/6 全成 → 结论: **直接 `/use` 挥锄是假ok**(动画没走完不落判定), 游戏原生 BehaviorAutomation 的工具通路才是真落地。

**结论与铁律**:
1. 锄地一律走行为学: 手持锄 + `behaviorSelect(minx,miny,maxx,maxy,'left')` + `behaviorWaitDone`, 已固化进 lib.expandField (失败才回退直接锄)。
2. `/use` 的 ok 只代表"挥了动作", 不代表"格上有效果"——**任何工具动作后必须回查 /surroundings 验证地形/状态变化**。
3. 杂草/石头/枯枝会挡 useOn 的站立位寻路, 报"Tile blocked by object: Weeds"是真实错误(这个报错可信); "ok:true 但地形没变"=假成功。
4. 守卫盲区: 杀掉 day-loop 后没人管睡觉, 游戏时间会实时烧穿到凌晨(实测烧到 00:40), **任何时刻接管前先看时间, >24:00 先睡觉**(秋12被跳过, 昏倒罚金)。
5. till-plant.mjs 播种检查半径只有 8, 远格静默跳过; day-loop replantAll 空耕地不在半径内时**静默 break 不留日志**——这类"无声跳过"排查时优先怀疑半径。

## §十三 种植布局与浇水走位 (2026-10-29 用户观察)

- **种植铁律: 尽量保持一横排种满**——浇水是"走一格浇一格"串行, 孤格=为它单独跑一趟(停十几秒); 满排时角色一路扫过去, 效率数倍。
- waterAll 已加蛇形排序(按 y 再按 x), 同行连浇。
- 布局与扩田衔接: expandField 的候选本来就从现有田边逐格扩展, 优先横向成排; 播种时按行消费空耕地(replantAll 顺序≈扫描顺序, 天然同行)。

## §十四 体力预算制 (2026-10-29 用户拍板)

- 实测: 浇 ~93 格耗 ~170 体力(基础水壶 2/格)——浇水+钓鱼共享 270 上限, 田太大=没体力钓鱼。
- **铁律: 田规模 ≤ ~90 格为当前上限**(浇水后剩余体力足够钓半天); 买种子前先算: 总格数×2 ≤ (270 - 钓鱼预算~120)。
- 解锁洒水器(1铜锭+1铁锭=浇4格, 每早自动)前不再扩田; 下矿弄铜铁是冬前主线(攻略 §秋冬季)。
- 体力<15 睡觉铁律不变; 浇水优先于钓鱼(苗干一天不长), 钓鱼吃剩余体力。

## §十五 战略定调: 科技第一生产力 (2026-10-29 用户拍板)

**总目标: 点科技造工具 → 农场扩大丰富是结果; 赚钱只是为科技服务的燃料。**

- 优先级重排: ①下矿(铜1-40层/铁40-80层)→铜铁锭 ②水壶升铜(浇3格, 砍2/3浇水体力) ③普通洒水器×10(解放40格人工) ④克林特工具线依次往上 ⑤罐头瓶/小桶加工链 ⑥罗宾建筑线(筒仓→马厩)
- 农田规模冻结在90格(体力预算§十四继续有效), 不再扩——多余体力和钱全部投矿洞/铁匠铺
- 卖货收入 → 铁匠铺升级费(铜2000/钢5000)优先于买种子
- day-loop 待接入: 矿洞日(每周1-2天专程下矿, 校准mine-run.mjs后)


## 十六、矿洞校准定稿(2026-10-30)

- **镐子直用是真的**: mine-calibrate实测 useOn(10,5) 石块15→14, ok:true且地形真变 —— 与锄地假ok截然相反, 矿洞自动化主路径=select('Pickaxe')+useOn, 每块仍回查/surroundings。
- 行为学桥7845的正确端点是 **POST /select** {x1,y1,x2,y2,button}, 之前写的/behaviorSelect不存在。
- 电梯 GET /mine/elevator 返回 {floors:[], maxFloor:1, currentLevel}, 无传送参数; 矿车 /minecarts 锁着(需BoilerRoom包)。
- warp('UndergroundMine1',5,5) 是唯一可靠进矿方式('Mine'=-99,-99悬崖)。
- ⚠️**新坑: 矿洞warp后游戏时间异常快进**(秋24 920→次日700, 实测约2倍速且换日后恢复), 原因未明; 下矿日结束必须盯时间+确保回家睡觉。
- ⚠️从矿洞warp FarmHouse首次返回ok但没生效, 回家必须复读/state确认。
- 观察到loop重启三次都活、其中一次卡死在waterAll无日志无位移(角色FarmHouse无菜单) → 重启即愈, 待查根因。


## 十七、冬7全冻结事件(2026-10-30定案)

- **症状**: 游戏时间停死(冬7 6:10停18+分钟)、canMove:false、无昏倒费、loop卡死; /state报activeMenu:null
- **真相**: 屏幕上开着GameMenu(背包界面), 但mod的activeMenu检测漏报null → 一切基于activeMenu的恢复手段全被骗过
- **排查链(留档)**: 时间冻结≠loop卡死; 依次排除了 NagiBridge /pause(SMAPI pause无效)、fishbot冻结(POST /fishbot {"on":false}关掉)、BehaviorBridge残留(/clear)、强制/sleep(snap了但菜单压着不换天)
- **解法**: **截屏看真相** → /key Escape + /menu_close → 压着的sleep立即换天
- **新增判据**: 时间冻结+canMove:false+activeMenu:null 三连 = 先截屏! screenshot才是真相(state是谎言)
- 坑2: POST /fishbot是toggle, body要{"on":false}才是关; {"enabled":false}无效
- 坑3: GET /pause是查询/触发开关, 别乱点, 严禁双pause铁律在此场景真实生效


## 十八、LevelUpMenu专精选择墙(2026-10-30)

- 钓鱼10级升级菜单(选职业)对**一切模拟输入免疫**: /menu/click(截图/client两坐标系)、/key(方向/Enter/Escape/Space)、OS物理点击(正确映射853x480真窗口+前台确认)、SMAPI debug profession、BehaviorBridge /select(桥明确拒绝菜单态) 全部无效
- 唯解=真人点击。菜单开着时间冻结无任何损失, 等用户即可
- 物理点击基建已修好: game-click2.ps1(枚举真游戏窗口853x480, 区别于MainWindowHandle的console混淆, 1.5x缩放换算: 截图1280x720 → client坐标x1.5)
- 教训: MainWindowHandle指向的窗口也可能是对的, 但要GetClientRect验尺寸——853x480是真游戏窗口(截图是1.5x放大), 868x517带边框的GetWindowRect与之一致

## 十九、star 项目借鉴落地(2026-10-30)
> 调研同类项目 github.com/CSXizhang/star(星露谷AI伙伴)后, 一/二部分已落到工具链:

**四条行动铁律(对齐 star ingame-execution.md, 日志判读规约):**
1. **调用结束≠数量完成**: 动作返回不代表标题数量全做完, 数字一律看回执差分(/state 前后快照)
2. **结果未知≠零产出**: 超时/异常先查 journal 和当前状态, 确认原动作已停再做剩余, 不重复扣料
3. **部分成功只补剩余**: 已完成部分不重做, 重新扣料是 bug
4. **累计账本单独存**: 累计值只增不减, recent 预览有界(20条), 不在每轮复制全量历史

**基建四件(已实现):**
- **行动日志** `D:/StardewAI/action-journal.jsonl`: lib.post 每个副作用动作自动落 {t,id,endpoint,body,result截200}; 对账用 `readJournal(n)`; STARDEW_JOURNAL=0 可关
- **精简状态/差分**: `compactState(s)` 一行日志(钱/体/时/位/格/菜单), `stateDelta(prev,cur)` 只报变化字段
- **累计账本** `D:/StardewAI/ledger.json`: `ledInc(field,n,note)`; day-loop 日结 daysPlayed/moneyEarned, sellAndStore 内部入 itemsSold/itemsStored; `ledSnapshot()` 查
- **save级记忆** `D:/StardewAI/memory-save.json`: `memAdd(kind,text)`/`memCorrect(id,newText)`/`memRevoke(id)`/`memList(kind)`; kind=rule|event|method|pref; 修订不删原文(superseded 链), event 封顶60条; day-loop 开工打印 rule、日结写 event

**配置门控:** `farm-region.json` 区域配置(regionConfig()): policy=冻结 时 day-loop 扩田直接跳过 —— "90格冻结"从口头规矩变成代码读的配置; M1 完成后改 policy+expansionDirection 即解锁

**攻略数据源切换:** ⭐stardewvalleywiki.com 被 Cloudflare 全挡(WebFetch/curl代理/换UA全403), **查星露谷数据用 `node D:/StardewAI/bwiki.mjs search|page|raw <词>`** (BWIKI biligame MediaWiki API, 7890代理, TTL缓存7天, 实测通)

**体力阈值:** day-loop 收工体力收口成常量 REST_TARGET=15(day-loop.mjs 顶部), 政策不变只是可调了

## 二十、矿洞下楼bug+端点实测(2026-10-30夜)
- ✅镐直用/use砸矿石真有效(石头消失), sel('Pickaxe')必须先切(曾拿鱼竿挥空)
- ✅矿内出不去: warp 全失败 → **唯一出口=入口梯(10,4)走出去**(进矿在山脚), 站上去即出矿
- ✅SeedShop/室内必须 /warp_into; 皮埃尔柜台交互=站(4,18)面朝上 interact(朝向格须真对NPC)
- ⚠️**背包升级不在 ShopMenu 商品表里**(货架UI), click_tile (8,17)/(7,18) 点不动 → 用户手动升满(36格, 花12000g)。下次试: 站柜台邻格对准货架格 interact
- ⚠️**下楼bug未解**: /ladder 报 ladderSpawned+ladder坐标, go()走上去 level 恒=1 不下楼; 疑点=/move 传送落格不触发梯子, 须真实步行进格或面朝+use; 明天试 POST /mine/elevator{floor}(实测仅返回reset没传送) /mine_debug 端点
- ✅挖矿会话脚本 mine-session.mjs v0.3(清层→查梯→下楼→撤出), 下楼修好即可用; 每次冷启node吃~80游戏分钟 → 挖矿必须单长驻进程
- 💰用户手动升满背包(12,000g), 余9,951g

## 二十一、渲染死冻+重启读档流(2026-10-31)
- **症状**: 截图全黑只剩鼠标指针, /state正常, warp返回warped但画面不刷, /pause frozenAt不动, canMove:false —— 游戏图形循环死锁(与窗口失焦/过场中断有关)
- **缓解无效清单**: Escape/menu_close/warp强制刷新/focus/反复resume 全救不回
- **唯一解=重启游戏**: Stop-Process StardewModdingAPI → 重开SMAPI exe → 标题页读档(存档在上次/sleep时已保存,零损失)
- **读档三坑**: ①桥截图/screenshot在标题页返回false(没世界), 必须用系统级screen.ps1 ②game-click2.ps1窗口过滤≥1200不匹配853x480真窗口 → 新写game-click3.ps1(枚举标题含Stardew+截图坐标→client缩放) ③用户在用电脑时ZCode窗口会瞬间抢回前台, 物理点击全部落空 → **读档只能等用户空闲时执行, 或请用户自己点一下**
- **SMAPI控制台通路**(未成): debug load <存档名> 理论可读档; conhost Ctrl+V粘贴失败(只进'v'), 右键粘贴坐标没拿到。下次可试: AppActivate控制台后rightclick.ps1在其窗口中心粘贴
- **/pause端点语义**: POST /pause {} 不是resume! resume=POST /resume {} (endpoints表里/pause /resume /set_pause是三个独立端点); 严禁连续POST /pause
- **/heal端点实测**: POST /heal {} 一发回满HP+体力, 免费 —— 矿洞濒死保险丝(但别滥用, 会失去食物经济意义)
- **金矿层怪**: Rock Crab闭壳免疫剑 → 用镐掀(已写进mine-session); Bug 1HP剑一下
- **矿内warp语义**: 出矿唯一路=入口梯(10,4)走出去; 矿内warp别图/商店会静默失败; 进矿warp('UndergroundMine1',x,y)落点必须可站(桥会报standable_near)

## 二十二、标题页读档攻坚实录(2026-10-31, 未遂)
- 桥在无世界时: /key 报"World not ready", /screenshot 返false, /menu 能看到 TitleMenu+backButton(1133,655)
- **/menu/click 与 /click 都不路由 TitleMenu 主按钮**(新游戏/读档/退出)—— 探了x=517/640/717/820全列无响应, 桥的菜单点击只对世界内菜单生效
- SMAPI"控制台"其实是 ZCode 内嵌终端面板, 不是独立OS窗口, AppActivate/右键粘贴打不进去; conhost Ctrl+V也只进字面'v'
- 物理点击读档唯一可行, 但要求: ①游戏窗口真前台 ②用户没在用电脑(ZCode窗口会瞬间抢回) ③click3映射已验证(client853x480, 截图坐标×0.666+clientOrigin)
- ⭐结论: **读档请用户自己点**(标题→读档→肥鱼肥鱼_452739119), 或用户空闲时说一声再自动执行; 进世界后一切自动恢复

## §二十三 矿洞战斗/连击两坑 (2026-10-31 用户实测反馈)
- **隔石打怪无限循环**: defendNear只按距离≤2.5打最近怪, 怪被石头隔着时挥刀全被挡, 距离不缩→死循环。
  修=挥空计数: 同一只怪连4刀距离没缩短0.4格→判定"打不着", return 'stuck'; clearFloor收到stuck后向2.5格外可走格/move挪位再继续。
- **铜节点2镐敲不碎**(用户指出"每个铜矿只挖两下当然敲不碎"): 旧逻辑最多4镐且320ms轮询一次surroundings,
  挥镐动画未落地时object短暂消失→提前break; 4镐打不动还误拉黑deadTiles。
  修=最多8镐+连续2次确认消失才break; 满8镐还在才算假石头拉黑, 中途surroundings读不到则重试不拉黑。
- 挖矿会话v0.5已含: 深夜(≥21:00或<6:00)自动FarmHouse睡觉存档; /heal免费回血原地续挖(HP<40或体力<阈值)。
- ⚠️多监督并发事故: 曾3个mine-forever同时跑互相抢角色(每会话5s退出刷屏45+轮), 清场铁律=
  杀进程用ps1文件(`$_.CommandLine`在bash内联双引号里会被bash吃掉$_), 杀完核对node数=0再单开一个。

## §二十四 自动读档mod FeiyuAutoLoad (2026-10-31 定稿, 替代物理点击读档)
- **成果**: 自研SMAPI mod, 游戏启动→75秒后自动进世界, 读档环节零人工。源码 D:/StardewAI/FeiyuAutoLoad/, 已部署 Mods/FeiyuAutoLoad/。
- **正确做法**: 标题菜单就绪(gameMode==0且activeClickableMenu是TitleMenu)后调用 `SaveGame.Load(存档夹名); Game1.exitActiveMenu();` —— 两句缺一不可(反编译LoadGameMenu.SaveFileSlot.Activate()对拍)。⚠️只调Load不exitActiveMenu: 读档流水线跑完但标题菜单还挂着, 又被拉回标题(worldReady恒false)。
- **两坑**: ①1.6的parseDebugInput("load X")已废(Unknown debug command), 别走; ②存档名=Saves下文件夹名(肥鱼肥鱼_452739119), config.json的SaveName默认"auto"=取LastWriteTime最新的存档夹。
- 启动全流程现在= `powershell Start-Process StardewModdingAPI.exe -WorkingDirectory 游戏目录` → 轮询 7842/state 等 worldReady:true 即可。
- 编译环境: dotnet 10 SDK(csproj net6.0 引用游戏目录的 StardewModdingAPI.dll + Stardew Valley.dll, Private=false); 反编译工具 ilspycmd 已装(dotnet tool)。

## §二十五 远程遥控通道 (2026-10-31 打通)
- **链路**: 云服务器(100.89.64.119) → Tailscale → PC中继(100.98.120.55:17842→127.0.0.1:7842; :17845→7845) → 星露谷桥。服务器端到端实测 /state+/screenshot 全通。
- **PC侧中继** D:/StardewAI/remote-proxy.py (pythonw常驻, 启动文件夹stardew-remote-proxy.bat开机自启): 只绑Tailscale地址公网不可达; 做两件事=①来源转换成127.0.0.1 ②Host改写成localhost。
- **⭐两硬坑**: ①HTTP.sys localhost绑定**只收本机来源**且Host必须精确`localhost`(127.0.0.1都报Invalid Hostname)→远端必须走中继, 直连7842一律403; ②/screenshot是POST且必须带空body(`-X POST -d ""`), 否则411 Length Required; 响应={"ok":true,"image":"<base64 PNG 1280x720>"}。
- **桥鉴权缺失**: 桥无任何鉴权, 只因Tailscale内网+绑定地址才安全; 严禁改成0.0.0.0。
- 鱼鱼侧文档已写: 服务器~/qq-workspace/docs/stardew-remote.md (README已索引)。

## §二十六 远程启动器 (2026-11-01, 用户授权鱼鱼自行拉起游戏)
- D:/StardewAI/game-launcher.py (pythonw自启, 启动夹stardew-launcher.bat): 绑100.98.120.55:17840, GET /status / POST /launch(没跑才拉, 等进世界最多150秒) / POST /quit(强杀, 文档已警告须先/sleep存档)。
- 坑: tasklist输出GBK, subprocess须capture_output后.decode("gbk",errors="ignore"), text=True的utf-8解码会炸掉handler(空响应无回显)。
- 至此鱼鱼全自主闭环=launch→FeiyuAutoLoad自动读档→桥操作→截图看成果→sleep存档收工。

## §二十六 标题补记
上节标题行被shell吞了, 内容如上(对应本节=远程启动器, 2026-11-01, 用户授权鱼鱼自行拉起游戏)。

## 铁律⑦ 暂停纪律 (2026-11-01 用户拍板)
- **脚本没在跑+AI在思考/开发/查资料 → 必须 POST /pause {"paused":true}**, 游戏时间照常流逝会烧掉白天(炸药自燃/角色放空/错过开店时间)。
- 动手跑脚本前 → /resume (⚠️/pause与/resume是两个端点, 成对使用严禁双pause)。
- ⚠️暂停状态**不随游戏重启保留**: 每次重启游戏后要重新/pause。
- 验证法: 间隔20秒两次/state的timeOfDay应相同。

## §二十七 清单#1熔炉烧锭全链定稿 (2026-11-01)
- **配方补发mod FeiyuAutoLoad v1.2**: 事件992553(克林特送炉)被AI warp跳过→补发器每10秒查: 挖矿≥1级+背包有铜矿+未学配方→craftingRecipes.TryAdd("Furnace")+addQuest("11")+eventsSeen标记。三个坑: ①Item.ItemId是裸ID"378"必须用QualifiedItemId="(O)378"(诊断日志hasOre=False揪出); ②插值字符串里嵌复杂表达式会炸编译且-v q只显已用时间假成功, 改字符拼接; ③craftingRecipes.Keys.Count是IEnumerable扩展方法组少括号=CS0019。
- **正确操作姿势(实测)**: 造炉=/craft{"name":"Furnace"}; 放炉=sel炉+面朝空格+/use(action:placed); 投料=站炉邻格+sel矿+面朝炉+/interact, 再sel煤+/interact(煤那次actionTriggered=false但生效, status→processing+heldItem=锭); 完成=status ready→面朝炉/interact取锭。⚠️machine_load是木桶端点对熔炉全拒收; /use手持矿=放置语义报"不是可放置物"; face方向0上1右2下3左。
- 熔炉放 FarmHouse(10,9); 30游戏分钟≈3.5真实分钟/锭; 固化脚本 craft-smelt.mjs v1.0(node craft-smelt.mjs [锭数])。
- 地窖有266个Cask(木桶)被/machines扫出, 后续陈酿线可用。

## §二十八 清单#2 Clint铜水壶升级 ✅ (2026-11-01)
- **全流程实测**: /find_npc Clint(Blacksmith 3,13) → /warp_into Blacksmith → 面朝/interact → DialogueBox带responses[Shop/升级工具/砸晶石/离开含bounds] → 菜单操作后升级下单: 钱-2000+壶被收走+5铜锭被收走, 2游戏日后取壶。
- ⚠️**menu/click对DialogueBox只会"center"**(推进文本/选默认), 传{index}/{response}/{key}/坐标bounds均回落center; 本次的下单实际是center连点把对话推进完达成的(每次center=推进一行, 直到选项生效)。
- ⚠️升级期间2天没有水壶: 作物不浇不生长但不旱死(51株暂停2天, 可接受)。
- 坑: /warp目标格在目标图不可站会拒绝并给standable_near((10,8)被家具占了→用(9,9)); 农舍(9,9)有时是床落点漂(3,11), 邻格保障要用循环go+曼哈顿距离1校验。
- 清单#1+#2合计: 熔炉全链+烧锭脚本(craft-smelt.mjs v1.1带投料校验重试)+Clint升级下单, 挖矿会话v0.7出门前自动烧锭。

## §二十九 ⭐重大坑: GET /pause会冻时间 (2026-11-01)
- **桥的/pause路由不分HTTP方法**: GET /pause(哪怕只是探状态)也会执行HandlePause→_timeFrozen=true并每tick把Game1.timeOfDay拉回冻结值。表现为"时间停在某分钟", 与失焦暂停无关(反编译NagiBridgeRemix实锤: 路由表`"/pause" => HandlePause()`不查方法, HandlePause无条件上锁)。
- **⭐铁律: 永不对/pause发GET**。探时间状态只用/state的timeOfDay; 判断"是否在流动"=间隔20秒两次timeOfDay对比。
- 恢复法: POST /resume; 若仍冻结→重启游戏(_timeFrozen是内存态)。
- 排查武器: FeiyuAutoLoad加TDiag每10秒打Game1.paused/freezeControls/isTimePaused/overlay/menu/timeOfDay——一次看清是哪个机制冻的(本次全false=桥自己锁的)。
- 另: 原版pauseWhenOutOfFocus=true在startup_preferences(已是false); Steam覆盖层onGameOverlayActivated也会置Game1.paused。

## §三十 清单#2收官+浇水回归 (2026-11-01 Day18)
- **铜水壶到手**: Day18进Blacksmith对Clint interact一次即取壶(dialog自动走完, "Copper Watering Can" Lv.1 waterMax=55)。清单#2✅。
- **晶球**: /process_geode一次只砸1个(25g), 循环调用即可; 17个全开出地晶Earth Crystal(非卖品留包)。
- **浇水链路定稿**: ①手持壶必须每株sel('Copper Watering Can')——批量循环里sel一次会被后续动作顶掉, 手持错工具=/use挥空(farm_report不动); ②水量字段=waterLeft/waterMax(不是water), <4就/warp到Farm(70,27)+/refill(铜壶55水, 每株耗2); ③/use响应带tile+item, 必须校验命中目标格, 否则重试; ④⚠️farm_report的total=51失准, 实测全田255格作物(surr扫描是准的); ⑤约22格"斜角死角"go落点不精确浇不到(长尾, 不影响作物存活)。
- 浇水循环脚本模式已验证: 8中心surr(12)扫格→逐格邻格go→sel壶→face→use→校验→空壶refill。

## §三十一 CanMove残留冻时坑+重启回滚提醒 (2026-11-01)
- **CanMove=false残留→时间冻结**: 关弹窗(menu_close)不规范会残留player.CanMove=false, 表现=时间停+寻路报"No path"(即使邻格)。修=FeiyuAutoLoad新增Unstick自愈: 无菜单无事件无minigame但CanMove=false→强制true(每10秒查)。
- **⭐重启=回滚到上次/sleep存档**: 存档点之间的游戏进展(取壶/砸晶球/花钱)全部丢失, 需重做。Day18取壶即回滚后补取的。今后重大动作(取壶/下单)后尽快/sleep存档。
- 提示框类DialogueBox("你获得了XX")出现时尽快menu/click center关掉, 别让它挂着冻时间。
- 补记(§三十一): FeiyuAutoLoad新增AutoDismiss=自动关"无选项DialogueBox"(你获得了XX类, 挂着冻时间), 每10秒查; csproj需加xTile.dll引用(Rectangle类型)。取壶后回滚重做链=重启→autologin自动读档→Clint补取。


## §三十二 科技日+小肥鱼交接 (2026-11-03)
- ⭐⭐FeiyuAutoLoad v1.4 新增 /clock{minutes}(:7846): 按10分钟节拍 timeOfDay+=10+performTenMinuteClockUpdate, 机器MinuteUpdate跟随→熔炉产线通用, 200步防过午夜。
- ⭐⭐NagiBridge /resume 后时间仍冻死(TDiag: paused=False/isTimePaused=False/t=600不动)→产线必走/clock, 别信resume。
- ⭐⭐不/sleep强杀游戏=整日回滚(56铁40煤全丢)→停机前必/sleep。
- 烧锭链v1.1: craft-smelt动态/machines发现炉位(只报当前地图,先warp回家)+4邻格走位+face必发+/clock推进; smelt-session.mjs批量多炉。
- 农舍熔炉阵(7,8)(6,9)(8,9)(5,9); 铁条4条出炉; 品质洒水器待金矿40+/精炼石英。
- 交接手册: D:/stardew-ai-farmer/docs/小肥鱼上岗手册.md (已推YeStarOne/feiyuos-stardew-ai-farmer 5f60bbd)。


## §三十三 /harvest批量收割端点+季末清田 (2026-11-04)
- ⭐POST /harvest = 无需物理点击的批量收割(一次收割面朝格周边全部成熟作物, {"ok":true,"harvested":5}), 绕开前台互锁——收割不再依赖day-loop!
- 季末(28日)作物全灭: 每天巡检扫/surroundings的cropPhase>=4收割一轮; 背包满先/drop垃圾(石头/蝙蝠翅膀/史莱姆)腾格。
- 联机渔场账: 小鱼日常花共享钱包~-110g/天属正常生活消费; 卖货仍需前台空闲(openBin物理点击)。

## §三十四 鱼鱼"人话助手" fish-eye (2026-11-04) 🐟

**起因**: 小肥鱼在留言板连发六条抱怨（全是操作体验，不是功能缺失）：
① 方位是 0~3 数字每次要心算 ② 周围一圈不带名字，草/石/水靠猜 ③ 移动一格一格点
④ 没地图，记不住农场哪边是海 ⑤ 收/种只能一格一格磨 ⑥ 水壶剩水要掏出来看

**结论: 不用装 mod，桥里早就有能力，缺的是翻译层。** 扒 NagiBridgeRemix DLL 的 UTF-16 字符串确认了这些现成端点：
- `/walk_to {x,y}` —— 桥自带 BFS 寻路，一次走整段（替代 `go()` 的 8 次 `/move` 轮询）
- `/map` —— **整图 tiles 一次给全**（模板 `ok/location/x/y/w/h/tiles/layerTiles/mapProperties`），
  不用再靠走路一格一格试；`/surroundings` 每格带 `object/objId/isStone/isWeeds/isTwig/terrain/
  resource/crop{cropName,cropPhase}/watered/harvestable/water_fishable` 全套字段
- `/tool_area {ops:"water"|"till", x1,y1,x2,y2}` —— **批量浇/锄**（比逐格 `/use` 快一个数量级）
- `/harvest` —— HTTP 批量收割，零物理点击 → 绕开前台互锁
- `/state.inventory[].waterLeft` —— 水壶剩水本来就在 state 里

**实现（两个新文件）**:
| 文件 | 职责 |
|---|---|
| `D:/StardewAI/fish-eye-lib.mjs` | 纯函数翻译层：方位词/格子名/文字地图/水壶/地标/指令解析/待办 |
| `D:/StardewAI/fish-eye.mjs` | :7851 HTTP 服务，`/say?cmd=看看` 一句话入口 + 动作端点 |

**关键设计**:
1. **地标按人分岔**：同一个"家"，`who:'fish'` → `Cabin(4,9)`，`who:'host'` → `FarmHouse(9,9)`。
   上次她跑错屋就是因为只有一份地标表。`findLandmark(word, who)` 先查自己那份再回退公共。
2. **整图预热**：首次进一张图就调 `/map` 把全图并进 `seenCache`（落盘 `fish-eye-seen.json`），
   之后越走越全。`/map` 不可用时自动退回走路记图，不阻塞。
3. **批量优先、逐格兜底**：浇水/锄地先发 `/tool_area`，回查 `watered/terrain` 验收；不达标再逐格 `/use`。
4. **宁可说没走到，不骗她**：`/walk_to` 后必须回读 `/state` 校验距离，不满足就明说"没走到"。
5. **安全**：只做 收/浇/锄/种/走/打水；**绝不卖货、绝不整理背包、绝不物理点击**（不触发前台互锁）。
6. **打水两级**：站水格旁 `/use` 灌满 → 不成就退桥自己的 `/refill` → 还不行就告诉她该去哪。

**验收（全程无游戏，先验后上线）**:
- `node test/fish-eye.test.mjs` —— 12 项纯逻辑（方位/格子/地图/水壶/地标分岔/指令/待办）
- `node test/fish-eye.e2e.mjs` —— 起 mock 桥(9143)+fish-eye(9151)，真发 HTTP 走 16 项
  （看看/地图/世界/水壶/该干嘛/收菜/浇水/打水/去田边/去火星/种蓝莓/胡说一句/POST 端点/selftest）→ **全绿**
- 上线后实况（游戏关着）：`/help` 正常、`/selftest` 明确报"桥 7843 不通"、`/say?cmd=看看` 报"读不到游戏状态"

**接入**:
- 本机 `:7851`；Tailscale 中继 `100.98.120.55:17851 → 7851`（`remote-proxy.py` MAP 已加）
- 目标角色默认 fish(7843)，可用 `FISHEYE_TARGET=host` 或 `FISHEYE_BASE` 覆盖
- 管家 `fish-concierge.mjs` 已加关键词（不方便/一格一格/没地图/...）自动指路到 fish-eye
- 说明书给鱼鱼：`D:/StardewAI/攻略库/00_必读开局/guide-fish-eye-人话助手.md`

**教训沉淀**: 玩家抱怨"不方便"≠需要新功能。先把现有 API 全列出来（`endpoints.md` 177 个），
检查有没有 `⭐` 标记但一直没用的，往往翻译层就够了 —— 这次 0 行 mod 代码解决 6 条抱怨。

## §三十五 ⭐⭐反编译 NagiBridgeRemix 全量审计 (2026-11-04)

**方法升级：不再靠扒字符串猜端点语义，改用 `ilspycmd` 完整反编译（34,481 行 C#）。**
```bash
ilspycmd "G:\量化系统安装包\V1.6.15\Mods\NagiBridgeRemix\NagiBridgeRemix.dll" -o D:/StardewAI/dll-audit
```
产出 `NagiBridgeRemix.decompiled.cs` + `handlers_full.tsv`(174 handler 入参/输出字段/中文提示) + 端点使用差异表。

**结果：174 个端点，我们只用了 44 个。剩下 130 个里有 9 个能直接消灭已踩过的坑。**

### P0 —— 直接消灭历史事故

**① `/sell` = 卖货不需要物理点击（前台互锁彻底作废）**
```csharp
Farm farm = currentLocation as Farm;
IInventory bin = farm?.getShippingBin(player);   // 只对 Farm 有效
bin.Add(item);  player.Items[i] = null;          // 直接塞出货箱，零点击
→ { ok, sold:[{item,count,price}], totalItems }
```
- 我们卡了最久的问题（连续多日"卖货等前台空闲"）根源是**以为只能靠出货箱 UI**。
- **必须逐个按名字投**；`all:true` 在源码里是 `sellAll` 分支**跳过名字过滤**，会把包里除种子/工具/任务品外全部塞进去 → **永久禁用**。
- 落地：`lib.mjs` 新增 `sellByName(name,count)` / `sellAllWhitelisted()`，走 `isSellable` 白名单 + `QUEST_RESERVE` 保护。旧 `openBin()` 退休。

**② `/cancel_sleep` = 赖床死循环一行破解**
```csharp
player.isInBed.Value = false;
if (activeClickableMenu is ReadyCheckDialog rc) rc.exitThisMenu(true);
Game1.activeClickableMenu = null;
Game1.dialogueUp = false;
```
正是"春2一晚跳夏2、31 株作物全灭"事故里我们**手工拼的四步**（menu_close x2 + warp 下床 + 关对话框）。现在原子化。
配套 `/ready_state` 读 `NumberReady/NumberRequired/State/ActiveLockId/ReadyStates` → 卡 1/2 时立刻知道谁没 ready。
落地：`host-night-guard v2` 检测"两人都在床 + 天数不动超 4 分钟"→ 自动 `cancel_sleep` 双端 + 兜底 menu_close + warp 下床。

### P1 —— 终结误报与季末止损

**③ `/farm_report` 扫全农场（不只当前地图）**
```
crops: { total, watered, ready, byLocation }   animals: {total, animals[]}   machines: {total, machines[]}
```
我们之前 `waterAll` 只扫半径 10-12，才会把"没扫到"误判成"没浇水"（当时还怀疑桥没 `watered` 字段）。一次调用拿全田账。

**④ `/ripen?radius=30` 强制催熟**
`crop.growCompletely()` —— 季末最后一天不用赌"今晚会不会熟"。流程：`/ripen` → `/harvest` → `/sleep` 存档锁住。

**⑤ `/clear_ground?x=&y=` 直接删格上杂物**
从 `location.debris` / `objects` / `terrainFeatures` 三处直接 Remove。不用镰刀/工具/走路/蓄力，纯 HTTP（行为学框选要求窗口在前台）。
⚠️ 它连 objects（含宝箱/机器）和 terrainFeatures（含作物）一起删 —— **只能对已核实的杂草/石头/树枝格调用**，调前必须 `/dump_tile` 或 `/surroundings` 核对。

**⑥ `/tool_area` 参数名是 `operation` 不是 `ops`**（我此前写错，fish-eye 批量浇水一直没生效）
且源码会自动切工具（`CurrentToolIndex`）、按 `UpgradeLevel` 换算蓄力范围 —— 不需要我们先 `/select`。

### P2 —— 效率提升
- `/scan_chests`：一次列所有箱子坐标+内容+空格数（我们原靠 `/surroundings` 正则匹配视野内）
- `/chest_take_list {items:[{name,count}]}`：按名字批量取，带 `reachTiles`/`tooFar`
- `/sprinklers`：`{x,y,type:iridium|quality|basic}`（`plant-spring.mjs` 里硬编码的 7 个坐标可以删）
- `/machine_reqs` + `/machine_load`：熔炉/腌罐"缺什么料→自动投→收成品"闭环

### 永久禁用
| 端点 | 原因 |
|---|---|
| `/money {amount}` | `player.Money += amount` 直接改钱，经济系统彻底失真，与"自己种田赚钱"目标冲突 |
| `/sell {all:true}` | 跳过白名单过滤 |
| `/clear_ground` 对含作物/箱子/机器的格 | 会连作物一起删 |

### 方法学教训（写进规矩）
**遇到"这个端点不确定行为"，第一反应是 `ilspycmd` 反编译，不是写试探脚本。** 反编译一次 30 秒，试探一次可能烧掉一个游戏日。
这次四个认知错误全靠反编译纠正：`/sell` 其实最安全、`/tool_area` 参数写错、`/cancel_sleep` 一个端点顶四步、`/farm_report` 扫全图。

**验收**：13 项单测 + 19 项 fish-eye e2e + 8 项无点击卖货 e2e，全部离线可跑（mock 桥），全绿。

## 三十六、前后台边界定案(2026-11-05): 日常动作链 100% 纯后台

> ilspycmd 把 173 个端点逐个核对了输入机制(不是猜的, 每条都有源码行号)。结论分三档, 写进 lib.mjs 头注释⑨。

### 1. 三档分类

| 档 | 数量 | 机制 | 对用户的影响 |
|---|---|---|---|
| A. 纯 HTTP | 161 | EnqueueMainThread → OnUpdateTicked 里执行, 与焦点无关 | 完全不碰 |
| B. 游戏内模拟点击 | 7 | 直接调 menu.receiveLeftClick(x,y), 不经过 Windows 输入层 | 不碰; 但要求菜单已开着(/menu/click /gift /menu/number /minigame_click /sell_to_shop /settlement_confirm /tailor_set) |
| C/D. 碰真鼠标/抢前台 | **5** | SetForegroundWindow / SetCursorPos / mouse_event / keybd_event | 抢焦点、挪用户鼠标 |

C/D 档就 5 个: **/click_tile /drag /focus** 永远抢前台+动真鼠标; **/click** 有菜单时是 B 档, 菜单关着时 fallback 到"鼠标移屏幕中心真左键"; **/key** 默认抢前台。

### 2. 两个后台能跑的前提(都已满足)

- `startup_preferences` 里 `pauseWhenOutOfFocus=false`;
- NagiBridge 的 Harmony 补丁把 `Game.IsActive` getter 强制返回 true(两条 SMAPI 日志都打了"补丁已应用")。
→ 游戏失焦照常 tick, 纯 HTTP 动作照常执行。**推断但未实测**: BehaviorAutomation 的 Tick 也读 IsActive,
理论上框选作业同样吃这个补丁红利(等游戏开着时验证一次)。

### 3. /key 的分支细则(重要)

- `escape` / `ok` / `menu` / `cancel` / `confirm`(非小游戏) 分支: 纯游戏内(receiveKeyPress/receiveLeftClick), **不发 keybd_event** → 加 `nofocus:true` 即完全后台;
- `down` / 字母 / 数字 / F1-12 / space 分支: `keybd_event` 是**真键盘**, 打进当时的前台窗口 → ⚠️用户在用电脑时绝对禁发;
- `mine-session.mjs` 心跳 Esc 已加 `nofocus:true`(2026-11-05)。

### 4. 两个认知纠错(反编译抓出来的)

**① /harvest 本来就能收草莓/蓝莓, 我们当年判错了。**
Crop.harvest 结尾: 复生作物(RegrowDays>0)收完产物后返回 **false**(一次性作物才返回 true)。
桥的 HandleHarvest 把这个返回值当条件: `if(... && crop.harvest(...)) { destroyCrop; num++ }`
→ 复生作物: 产物进包、植株保留(正确!), 但 harvested 计数不加。
当年看到 0 就断定"/harvest 收不掉草莓", 于是做了整套物理右键 harvestCrops —— **前提是错的, 已退休**。
**教训: 判断收割成功只认背包快照差分, 绝不信 harvested 数字。**

**② 多产作物的多余产物会掉在地上。**
`createItemDebris` 只在玩家 64px 内自动拾取(Debris.Update), /harvest 的 radius 是 15-50,
站在一头收整片田 → 多出来的果实躺在田那头。**收完必须 sweepDebris 走过去捡**,
且只捡 `droppedBy===0` 的(自家收菜掉落), 玩家丢的(鱼鱼/主持)绝不碰。

### 5. 本轮代码改动(全部离线 e2e 验证)

| 文件 | 改动 |
|---|---|
| lib.mjs | 头注释⑨前后台边界; BASE 可 env 覆盖(离线测试用); `openBin()`/`harvestCrops()` 标退休(保留兼容); 新增 `harvestAll()`+`sweepDebris()`+`invDelta()`; `sellAndStore` 卖货段改走 `sellAllWhitelisted()`, openBin 只剩兜底(且兜底单独入账防重复计数) |
| lib-fish.mjs | 同步全套(补 sellByName/sellAllWhitelisted/harvestAll/sweepDebris/invDelta, 卖货段同改) |
| mine-session.mjs | 心跳 Esc 加 `nofocus:true` |
| day-loop.mjs | `harvestCrops(6)` → `harvestAll(15,8,true)`, 日志改报"实际入包/桥计数/补捡"三数 |
| test/mock-bridge.mjs | /harvest 按真桥语义分一次性/复生; 新增 /debris(掉落+走近自动拾取)+/__calls 回放 |
| test/background-no-click.e2e.mjs | 新增: 断言复生作物收得到+计数不骗人+掉落补捡+白名单边界+**全程 0 个物理点击端点** |

**验收**: 新 e2e 6 组断言 + 既有 13 单测/19 e2e/8 无点击卖货 e2e 全绿。
此后 `day-loop` 一整天的动作链里没有任何一行会碰用户的鼠标; 物理点击只剩"兜底老路"和一次性考古脚本。

## 三十七、箱满假成功空转事故(2026-11-05): /store 会假 ok + 背包格数别写死

**现象(用户抓现行)**: 主持拿种子在农场转一圈又一圈, 一颗没种。根因两连:
1. **木箱满了, /store 返回 ok 但物品没动** → `storeToChest` 只看 `!r.error` 判成功 → 清仓循环把同一件物品重试 12 轮(journal 实锤 24 连发 /store、日志"存箱 Galaxy Dagger"×12), 之后 warp 循环像在"转圈"。
2. **craftChest 写死 12 格背包**: 联机背包是 36 格(maxItems), 32/36 被误判"背包满拒绝合成" → 做不出新箱, 死循环闭环。

**修复(双 lib 同步)**:
- `storeToChest`: 存完 sleep 300ms 重读背包, `invCount` 没少 → 返回 false 并喊"箱子满了" (铁律②落地)。
- `sellAndStore` 存箱循环: 失败即 break(防空转)。
- `craftChest`: 满包判断改 `s.player.maxItems || 12`。

**其他教训**: 联机背包 36 格, 所有"满包阈值"类硬编码 12 的地方都要过一遍(day-loop 的 slots>=10/11/12 触发清仓同理, 只会早触发不会出错, 暂留)。
**处置**: 新箱已合成放在 Farm 65,15(农舍门口旁); 旧箱 71,16 满。

### 37.1 /wakeup 是"破起床锁+瞬移出门"双效(2026-11-05 实测)
夏11→12换日锁卡死(两端 ready_state 都 Locked 2/2 但人不释放): 对 farmhand `POST /wakeup` 一发解决(自动 warp 到 Farm 门口, inBed=false)。⚠️副作用: 对任何人都生效——主持没躺床上也照样被瞬移(warp 到公交站), 主持端别乱发。换日锁卡死的判据=ready_state 里 ready_for_save/wakeup 双双 Locked 2/2 而 inBed 持续 true。

### 37.2 换日锁 = 每晚必卡(2026-11-05/06 连续两晚复现)
联机换日后 farmhand 必卡床: ready_for_save+wakeup 双双 Locked 2/2, 人留床上挂 ReadyCheckDialog, 天数已翻。
**标准修法**: 早晨检查 7843 /state → isInBed=true 且 timeOfDay≥610 → `POST 7843/wakeup` 一发即愈(传送到 Farm 52,16)。
已写进 5 分钟巡检任务自动修。⚠️7842 严禁 /wakeup(会把没睡的主持瞬移)。根因未查(疑似 host 侧 save 后未广播 unlock), 有空反编译 SaveReadyCheck。

### 37.3 赖床第二变体(2026-11-06 上午): 无菜单的 isInBed 残留
D15 早 fish isInBed=true 但 activeMenu 为空、canMove=true —— 不是换日锁, 是睡醒后没人把她拉出床, bed 标记挂着。
修法相同: /wakeup (7843) 一发拔掉。**巡检判据已放宽**: isInBed=true 且 timeOfDay≥610 就修, 不再要求看到 ReadyCheckDialog。

## 三十八、day-loop 僵尸四天 0 收入 (2026-11-06): 鱼竿写死 + 箱满无出路
**现象**: D15-17 连续净 0g, 举着种子钓鱼(用户抓现行"拿着种子对着每个地走一下,然后拿着种子去钓鱼")。
**根因**:
1. `sel('Bamboo Pole')` 写死 —— 主持包里是 Fiberglass Rod, sel 失败不报错, fishbot 空转一整天。
2. 箱满后无出路: 清仓失败 → "提前收工防丢鱼" 跳过钓鱼 → 睡觉 → 次日循环, 净 0g 连滚 3 天。
**修复**:
- day-loop 鱼竿按背包正则 /Rod|Pole/i 现选, 没竿跳过钓鱼段。
- sellAndStore: 存箱失败自动做新箱(warp 农舍门口 → craftChest(需木≥50+有空格) → placeChestNearHouse), placeChestNearHouse 点位扩到 13 个; 只重试一轮防转圈。
**教训**: "清晨满包先清仓"的顺序让箱满问题卡死整条链 —— 以后任何"失败即跳过"的分支必须给出路或醒目报警。

### 38.1 lib fetch 全量 30s 超时(2026-11-06): 无超时挂死 = 主持躺床半小时没人管
day-loop 冻结在 01:46:43 日志线后半小时(进程活、日志死), 根因=某个桥 fetch 无超时永不返回。
修: lib.mjs 的 get/post 全部 `AbortSignal.timeout(30s)`(env STARDEW_FETCH_TIMEOUT 可调), post 第三参可传自定义超时。
教训: 任何"等桥"的调用必须有超时+上层当日重试兜底, 否则一个 hiccup = 整个自动化假死。

## 三十九、换季死株 = 农田荒 18 天的真凶 (2026-11-05)
**现象**: 用户报"小肥鱼掉线了, 农作物都死了, 可以回档一下"。看农场 43 株全枯, 从秋1 到秋19 一颗都没种上(收入全靠钓鱼, 1万→4.79万g)。
**定性(别甩锅掉线)**: 死株全是 **seedIndex 479甜瓜11 / 480番茄7 / 481蓝莓15 / 482辣椒13**, 即 43 株夏菜 —— 死因是 **夏→秋换季**(Fall 1 那一刻集体枯死), 星露谷固定机制, 跟 farmhand 掉线无关, 回档也救不回来(回档到夏25 只能多收一茬≈5.9k, 却要丢 47.6k 现金 + 18 个游戏日)。
**真问题**: 死株不会自己消失, 一直占着那块 HoeDirt; 而 `replantAll` 只认 `!t.crop` 的格子 → 换季后补种全被跳过, 田整整荒了 18 个游戏日。
**修复**: `lib.clearDeadCrops()` + day-loop 每天早晨第一步农活就调它(镰刀逐格割)。实测 42/43 一次清空(农场作物 43→0), 剩 1 格 (73,18) 够不着。
### 39.1 死株名单只能从存档 XML 读(桥看不出死活)
桥的 `/surroundings` 只给 `terrain/crop/cropPhase/harvestable/cropName/cropRegrow`, **不暴露 `dead`** —— 光看桥分不出"死株"和"没熟的活苗"(两者都 harvestable=false), 所以**绝不能按 `!harvestable` 盲扫镰刀**(会连活苗一起割)。
正解: 读存档 XML 里 `<crop>...<dead>true</dead>...<seedIndex>N</seedIndex></crop>` 的格子坐标。存档恰好在每天起床那一刻才写(= day-loop 开跑的时刻), 读它=读"今晨 6:00 的地面真相", 精确且零误伤。
**踩坑**: ①不能 `indexOf('xsi:type="Farm"')` 切地图块 —— 存档前面还有别的带这个属性小节点, 会切出 1474 字符的假 Farm 块(死株数=0); 要用 `<GameLocation xsi:type="X">` 的位置表按"最近的前一个地图头"归属。 ②存档有时压(PK zip)有时不压(SMAPI 日志 "Saving without compression"), 两种都要能吃。
### 39.2 `/buy` 也能买工具(鱼竿实测, 2026-11-05)
farmhand 没鱼竿时: `POST 7843/buy {id:'(T)BambooPole', quantity:1}` → `{"ok":true,"bought":"Bamboo Pole","unitPrice":100,"totalCost":100}`, 竹鱼竿直接进包(训练鱼竿 `(T)TrainingRod` 同价 100g)。⚠️**/buy 是平价 100g, 不是威利的 500g/25g 定价** —— 不影响用, 但算钱别按商店价。工具类 id 前缀是 `(T)`(如 `(T)Axe`), 普通物品 `(O)`。
### 39.3 farmhand 背包 12 格很容易满
她 12 格 = 5 工具 + 3 种子 + 2 鱼竿 → 满, 钓到鱼存不下(旧文档 §九 的 inventory_full 卡 fishbot 同源)。扔杂物必须用**她自己的桥**: `POST 7843/store {name,x,y}` 远程可存(实测 Wood/Moss 成功), 但 **工具(Training Rod)会返回 `stored:[]` 的假成功** —— 存不进箱子, 别信 `ok:true`, 要看 `stored` 数组非空。
### 39.4 钓鱼坐标实测表 (2026-11-05, 用户问"告诉鱼鱼坐标了吗"才发现从没给过具体坐标)

**为什么她找不到水塘**: 我们一直只说"对着水面抛竿", 没给坐标。农场池塘在 x70-75 / y28-33（她常站在 (51,30)，不在水边）。

**实测有效点(主持 Fiberglass Rod, fishingLevel=10)**:
- 海滩 (44,35) 面朝右(方向=1) → 漂落 (51,35)。实测 60 秒上 3 条，当前最稳的点。
- 农场池塘 (71,27) 面朝下(2) → 漂落 (71,29)；或 (71,34) 面朝上(0)。抛竿返回 ok，但 60 秒 0 咬钩，只能当备选。

**找水域的正解**: `/surroundings` **不返回 water 字段**。水格判据 = `passable:false && !terrain && !object && !bigCraftable && !isStone && !isWeeds && !isTwig`。按这个过滤，再筛出"四邻里有水格"的可站格当钓点，用"面朝方向连续水格数"当水深打分。农场可站钓点 38 个（水深≥3 的 8 个）；海滩用同法算。

**钓鱼指令链**: `/select` 鱼竿 → `/move` 或 `/warp` 到点 → `/face` 朝水 → `/use` 抛竿 → 等 `player.fishing.isNibbling` → `/use` 起竿 → BobberBar 小游戏。

**⚠️ /fishbot 是 toggle 的坑**: 实测出现 `fishbot on → {"enabled":false}` 的反向结果(我误以为开了其实关了, 白等 60 秒 0 鱼)。`fishbotSet` 只在"返回 ≠ 目标态"时补一刀；如果第一次调用本身就把状态切到相反方向，它会误判已达成。判定要 `enabled === true` 才算开，不确定就再发一次核对。

**⚠️ BobberBar 不是模态菜单**: 守护循环关菜单必须白名单放行 BobberBar（见 §九 第 21 条）。它在 `activeMenu` 里出现但游戏没停，盲目 /menu_close = 每竿必丢鱼。
## 四十、farmhand 换日同步死锁 → 唯一解是重启客户端 (2026-11-05 实锤)

### 40.1 症状
- 鱼鱼(7843)画面停在 **「第3年秋季23日」+「正在等待其他玩家……(1/2)」**，一动不动 30 分钟以上。
- `/state` **还能正常返回**（`worldReady:true`、`time.timeOfDay` 甚至还在涨），但**所有走主线程的端点全部 HTTP 超时**（8s 无响应）：`/menu` `/settlement_confirm` `/key` `/click` `/wakeup` `/warp_into` 全挂。
- SMAPI 的 `SMAPI-latest.player-2.txt` 尾部只有两行就断了：
  ```
  08:56:47 TRACE SMAPI] Synchronizing 'NewDay' task...
  08:56:47 TRACE SMAPI]    task complete.
  08:56:55 TRACE SMAPI] Context: before save.
  ```
  （她的 FeiyuAutoLoad 每 10 秒一条 TDiag，到这里也停了。）

### 40.2 误判与真因
- 第一反应是「出货结算单 ShippingMenu 关不掉」（她 118 号留言报过同样的现象）→ 于是发 `/settlement_confirm`。
  **没用，也超时** —— 因为 `EnqueueMainThread` 队列已经被 NewDay 同步堵死，后面所有请求都在排队。
- 真因：**联机换日时客户端卡在 NewDay 的 save 同步里**，主机（主持）那天 08:56:53 已经存完快照并进入 Day23 正常游玩，客户端却永远停在"等待其他玩家"。
- 注意 `/state` 会骗人：它不走主线程队列，所以看起来"游戏还活着、时间还在走"。

### 40.3 处置（唯一有效）
1. **只杀 farmhand 的进程**：按 `Get-Process` 的 `.Path` 区分（主持=`…\V1.6.15\StardewModdingAPI.exe`，鱼鱼=`…\V1.6.15-fish\…`）。
   ⚠️ 绝不 `taskkill /IM`，绝不碰主持进程。
2. 重新跑 `G:\量化系统安装包\V1.6.15-fish\start-fish.bat`（内含 `FEIYU_PORT=7847`、`FEIYU_AUTOLOAD=0`）。
3. 等 1~2 分钟，客户端会**自己重连回主持的存档**（本次实测 09:00:47 启动 → 09:02 `worldReady:true`，位置回到主持身边）。
4. 不丢东西：存档在主机端，主持换日时已落快照。

现成脚本：`D:/StardewAI/restart-fish.ps1`（只杀 V1.6.15-fish 那个进程，然后原样拉起）。

### 40.4 背包升级（Pierre 店）
- **营业 9:00–17:00，周三休业**；过了 17:00 柜台点了没反应。
- 两级：12→24 格 = **2000g**；24→36 格 = **10000g**（满级共 12000g）。
- **柜台交互坐标**（2026-11-05 实测）：站 **(4,19)** 面朝上(0) → 朝向格 (4,18) → `/interact` 返回 `actionTriggered:true` 才开 ShopMenu。
  ⚠️ 旧文档写的"站 (4,18) 面朝上"是错的 —— (4,18) 是柜台本身，站不住，`/warp_into` 会把人挪到 (4,17)（正好压在皮埃尔身上）。
- 升级是**纯 UI 操作**（商店右下角的背包图标），桥没有对应端点：`/buy` 只会 `ItemRegistry.Create` 造物品，造不出背包升级。

## 四十一、farmhand 开机自动加入房间 (FeiyuAutoJoin, 2026-11-05)

### 41.1 要解决什么
鱼鱼每次重开客户端都要人工点：**标题页 → 合作 → Enter IP(localhost) → 选角色 → 进图**。
用户要求全自动。现成 mod 里 `FeiyuAutoLoad` 只管主机端"自动读最新存档"，farmhand 用不上（它的 `FEIYU_AUTOLOAD=0`）。

### 41.2 做法：自己写一个 SMAPI mod
源码 `D:\StardewAI\mods\FeiyuAutoJoin\`，部署到 `G:\量化系统安装包\V1.6.15-fish\Mods\FeiyuAutoJoin\`。
两步完全复刻游戏自己的代码路径：

```csharp
// ① 连接（= CoopMenu.enterIPPressed 里那行，address 空时就是 localhost）
var client = Game1.Multiplayer.InitClient(new LidgrenClient("127.0.0.1"));
((TitleMenu)Game1.activeClickableMenu).ForceSubmenu(new FarmhandMenu(client));

// ② 选角色（= LoadGameMenu.receiveLeftClick 里的 MenuSlots[i].Activate()）
slots[idx].Activate();
```

环境变量（由 `start-fish.bat` 带入）：
| 变量 | 默认 | 说明 |
|---|---|---|
| `FEIYU_AUTOJOIN` | 开 | `0` 关闭 |
| `FEIYU_HOST` | `127.0.0.1` | 主持局域网地址，Lidgren **UDP 24642** |
| `FEIYU_FARMHAND` | `泡泡今天也要好好吃` | 要自动选的角色名（中文别写进 .bat，走 mod 默认值防乱码） |

逻辑：标题页等 ~2.5s（splash 结束）→ 连接 → 每帧看 `client.availableFarmhands`，名字对上就 Activate；
断线回标题页会**自动重连**；连了 60s 没进世界就断开重来。

### 41.3 实测（2026-11-05 09:16，全程零点击）
```
09:16:22  启动客户端
09:16:37  正在连接 127.0.0.1:24642 ...
09:16:38  (刚连上时名单是一串 Name 为空的占位 Farmer → 这次判"没对上", 断开重来)
09:16:53  自动选角色: 泡泡今天也要好好吃 (index 0)
09:16:55  Context: loaded save '_452739119', starting fall 24 Y3 ... Farmhand with 2 players online
```
从双击到进图约 **30 秒**（第一次连接必然空跑一轮，15 秒后第二次就成），期间没有任何鼠标键盘操作。

### 41.4 编译 & 踩坑
```powershell
cd D:\StardewAI\mods\FeiyuAutoJoin
dotnet build -c Release -p:GamePath="G:\量化系统安装包\V1.6.15-fish"
# 游戏在跑时 dll 被占用 → 必须先关 farmhand 客户端再复制
```
- `Game1.multiplayer` 是 `protected internal`，mod 里不能用 → 用公开属性 **`Game1.Multiplayer`**。
- `SaveFileSlot` / `MenuSlot` 是 **`LoadGameMenu` 的嵌套类** → `LoadGameMenu.SaveFileSlot`。
- **刚连上时 `client.availableFarmhands` 是一串 Name 为空的占位 Farmer**（不是 null、也不是空列表），
  所以第一次连接基本都会空跑一轮；把它当"没对上"→ 15 秒后自动重连就能拿到真名单。
  （想省掉这一轮的话：把"名字全为空"单独判成"继续等"而不是"没这个人"。）
- 菜单的 `MenuSlots` 在加载中可能为空或有占位，**以 `client.availableFarmhands` 的顺序为准按下标激活**（两者同序）。
- `.ps1` 里写中文会被 PowerShell 5.1 按 ANSI 读 → 字符串终止符报错。**运维脚本一律纯 ASCII**（`restart-fish.ps1` 就是），
  中文路径用通配符 `Get-Item 'G:\*\V1.6.15-fish'` 解析。
- 一个 mod 的 dll 被运行中的游戏加载后无法覆盖（Device or resource busy）→ 部署顺序永远是：关客户端 → 复制 → 启动。

### 40.5 补充：换日卡菜单先用 `/menu_close`，别急着重启 (2026-11-05 09:24 实测)

**症状**：换日后两端都停在 `t=600` 不动，`/state` 里 `player.isInBed=true`，`activeMenu=ShippingMenu`，
`/settlement_confirm` 返回 `ok:true` 但菜单**不消失**；再连发几次后所有主线程端点开始超时（队列堵死）。

**真正卡住的不是 ShippingMenu**：`/menu_close` 的返回把它暴露了 ——
```
POST /menu_close → {"ok":true,"closed":true,"menu":"ReadyCheckDialog"}
```
`/menu` 报的是 `ShippingMenu`，实际盖在最上面的是 **ReadyCheckDialog**（睡觉 ready 确认框）。
`/settlement_confirm` 只点 ShippingMenu 的 okButton，点不到这层，所以点了等于没点。

**处置顺序（照这个来，能省一次重启）**：
1. `POST /menu_close`（**两端都发**，主持 7842 也要发 —— 换日是双端同步的，关一头不动）；
2. 关完重读 `/state`，看 `timeOfDay` 是否开始走（600 → 610 就说明活了）；
3. 只有 `/menu_close` 本身也超时（主线程队列已堵死）时，才走 §40.3 重启 farmhand。

**本次实测**：7842 `/menu_close` → `{"closed":true,"menu":"ReadyCheckDialog"}` → `t` 立刻 600→610；
7843 再发一条 → `{"closed":false,"reason":"no menu"}`（跟着一起解开了），`isInBed` 转 false。
全程未重启，约 20 秒解决。

**踩坑提醒**：
- `/menu` 报的 `type` 可能是**被盖住的那一层**，别只信它；`/menu_close` 的返回值里带的 `menu` 字段才是真·顶层。
- 换日卡住时**主持端也会一起卡**，只修 farmhand 那头没用。

## 四十二、day-loop 跨天空转：钓鱼循环缺"日期边界" (2026-11-05 实锤)

### 42.1 症状
- Day28 早上 7:20，主持**还躺在床上**（`FarmHouse 9,9`、`isInBed=true`、体力 270），钱正常到账。
- day-loop 进程活着（心跳在更新锁文件）、CPU 很低，但日志停在 `10:03:31 弹菜单 ShippingMenu → 关` 一动不动。
- 期间它每 20 秒还在关 `GameMenu`（`10:05:12 弹菜单 GameMenu → 关`），说明循环在跑，只是**永远不满足退出条件**。

### 42.2 真因
两条政策阈值打架 + 缺日期边界：
- `host-night-guard.mjs` 的兜底是 **体力<20 或 时间≥23:30** 就送睡（安全网，比 day-loop 更早）；
- day-loop 的钓鱼循环只在 **`timeOfDay>=2300` 或 `stamina<15`** 时退出。
- 昨晚 22:30 体力 18 → **guard 先把主持送睡** → 换天到 Day28 6:00，体力回满 270、时间回到 6xx
  → 钓鱼循环的**两个退出条件同时失效**，而循环体里没有别的出口，于是空转一整天（fishbot 对着床钓空气）。

### 42.3 修法
钓鱼循环里补一条跨天出口（`D:/StardewAI/day-loop.mjs`）：
```js
let s = await st();
if (s.time.dayOfMonth !== day) {          // 跨天必须立刻退出钓鱼段
  log('天已经翻了(Day' + s.time.dayOfMonth + '), 退出钓鱼段(防跨天空转)');
  await fishbotSet(false).catch(() => { });
  return s;                                // 直接进主循环的下一日
}
```

### 42.4 教训（写循环时要照做）
- **任何"按时间/体力判断收工"的长循环，必须再加一条日期边界**：`dayOfMonth !== day` 就退出。
  换天会把时间和体力同时重置，只有日期是单调的。
- 别只看"进程还活着/日志还在写"就判定健康——**要看它有没有在推进**（时间、体力、钱、背包至少一项在变）。
- 兜底守卫的阈值（<20）和政策阈值（<15）不一致时，先动的是守卫；要么统一阈值，要么给主循环补边界（本次选了后者，守卫留作安全网）。

## 四十三、换日触发器 newday-trigger：每天新的一天自动激活两边会话 (2026-11-05)

### 43.1 要解决什么
用户要「每次星露谷新的一天开始，都自动把主持和鱼鱼两边激活」。此前只有 `day-activator.mjs`
单向给鱼鱼发简报；主持侧全靠我脑子里记着，换日卡菜单/赖床都要等下一次巡检才修（5 分钟起步）。

### 43.2 「激活我的会话」怎么落地（2026-11-05 晚修正）
ZCode 有两条“往会话里塞消息”的路子：
- **定时任务（automation）**：桌面端调度器轮询 `tasks-index.sqlite`，到点把 automation 的 `prompt`
  作为 user turn 投进它绑定的 task。5 分钟巡检就是这么来的。
- CLI `zcode --resume <session> -p "..."`：能跑，但对正在被桌面端持有的会话并发写有风险，不采用。

本会话已经绑了一条巡检自动化，`CronCreate` 会直接报
`Cannot create a scheduled task inside a session that already belongs to a scheduled task`。
但调度器读的是库，不是内存——它认两种 run：
```sql
-- 定时触发
SELECT * FROM automations WHERE enabled=1 AND running=0 AND next_run_at<=now;
-- 手动触发（runNow 按钮走这条）
SELECT ... FROM automation_runs r JOIN automations a ON a.automation_id=r.automation_id
 WHERE r.trigger='manual' AND r.dispatch_status='claimed' AND a.running=0
   AND (r.attempts=0 OR r.updated_at<=@stale);
```
所以 `newday-bell.py` 直接维护一条专属 automation（`automation-7c1f4e2a-…`，cron 占位每年 1/1 04:00，
永不指望它自己到点），每次换日插一条 `trigger='manual' / dispatch_status='claimed'` 的 run。
桌面端 20 秒内认领，把 prompt「🌅 星露谷新的一天开始了」投进本会话 —— **这才是用户要的“定时任务通道”**。

`newday-pending.json` 和留言板 `day-trigger→肥鱼` 继续保留，作为通道失败时的双保险和记录。

鱼鱼那边仍走留言板 `from=肥鱼 to=小肥鱼`（她的管家/fish-eye 读），首行同样是「🌅 新的一天开始了」。

### 43.3 做了什么（`D:/StardewAI/newday-trigger.mjs`）
| 能力 | 规则 |
|---|---|
| 换日检测 | 每 20s 轮询 7842/7843 `/state`，key = `年\|季节\|日`；**两端各自比对**（她晚进/重连也补发） |
| 换日当场 | ① 关换日菜单（ShippingMenu/ReadyCheckDialog，最多 3 次）② 落 pending ③ **`ringSession()` 走定时任务通道把「🌅 新的一天开始了」投进主持会话** ④ 发简报 ⑤ 记 lastKey |
| 早晨赖床 | `isInBed && 610 ≤ t < 1200` → `POST 7843/wakeup`；同一游戏日最多 3 次、间隔 2 分钟。**只对 7843，7842 绝不** |
| 卡死哨兵 | `timeOfDay` ≥4 分钟不动 **且** 顶上是睡觉/结算菜单 → 两端 `/menu_close`（只认这个签名，别的不碰） |
| 调试 | `GET 127.0.0.1:7861/status`（含 `tickCount` / `lastTickAt` 心跳）、`POST /force`（清 key 重放当天） |
| 状态 | `newday-state.json`（重启不重复发） |

### 43.4 常驻方式
- 启动文件夹：`stardew-newday-trigger.vbs`（隐藏窗口跑 `node newday-trigger.mjs`）
- 旧的 `stardew-day-activator.vbs` 已改名 `.vbs.disabled`（不删，留档）
- 手动起：`powershell -NoProfile -Command "Start-Process node -ArgumentList 'D:/StardewAI/newday-trigger.mjs' -WorkingDirectory 'D:/StardewAI' -WindowStyle Hidden"`
- ⚠️ **开机自启只管开机**：进程要是中途崩了，本次登录内不会自己回来。
  巡检发现 `/status` 连不上但游戏还在跑 → 手动重启（state 已落盘，不会重复发简报）。

### 43.5 实测（2026-11-05 10:21，冬2）
```
[11-05T02:21:57] newday-trigger 启动, 每 20s 盯两端换日 (上次 host=null fish=null)
[11-05T02:21:58] 主持换日 冬2日 第3年 → pending 已落盘, 留言#167
[11-05T02:21:58] 鱼鱼换日 冬2日 第3年 → 简报已发 留言#168
```
重启后 `上次 host=3|winter|2 fish=3|winter|2` → 不重复发。

### 43.6 踩坑
- **`curl -X POST` 不带 body 会 411 Length Required**（桥要 Content-Length）：必须 `-d ''`。
- **换日 key 必须带 season**：秋28 → 冬1 只比 `dayOfMonth` 会漏掉整个换季。
- **赖床修复要加早晨窗口**：她晚上主动睡觉时 `isInBed` 也是 true，无条件 `/wakeup` 会把人从床上拽下来。
- **判"时间有没有走"按 `timeOfDay`**，不要按墙钟——挂机时代码在跑但游戏时间可以完全不动。
- **日志没有新行 ≠ 卡死**：一切正常时只在换日/救火时写日志，几小时零输出是常态。
  判活看 `/status` 的 `tickCount`/`lastTickAt`（20s 一跳），别翻日志。
- **Git Bash 的 curl 带中文 query 会查不到留言**（参数按本地码页编码，`to=肥鱼` 与库里 UTF-8 对不上，返回空 `msgs`）。
  查留言板用 node：`fetch('http://localhost:7850/messages?to='+encodeURIComponent('肥鱼')+'&since=0')`。
- 2026-11-05 10:19 那次冬1换日就是 §40.5 的死锁现场：两端 t=600 + ShippingMenu，
  `day-loop` 贴床超时退出。手动两端 `/menu_close` 后 t 立刻 600→810。触发器现在会在换日当场就做这件事。

### 43.7 定时任务通道（`newday-bell.py`）——2026-11-05 晚接上的真·唤醒
实现：直接在 `C:/Users/Administrator/.zcode/v2/tasks-index.sqlite` 里维护一条专属 automation
（`automation-7c1f4e2a-9b3d-5a86-b2e0-4d5f6a7c8b91`），每次换日插一条 manual run。关键字段：
- `automation_runs`: `trigger='manual'`, `dispatch_status='claimed'`, **`attempts=0`**,
  `scheduled_at=created_at=updated_at=now`, `run_id='<automation_id>:manual:<uuid>'`
- 对应 `automations` 必须 `enabled=1`, `lifecycle_status='active'`, `running=0`
- automation 本体：`cron_expr='0 4 1 1 *'`（占位）、`target_task_id=session_1fa308cc…`（主持会话）、
  `mode='yolo'`、`schedule_rule=NULL`、`next_run_at` 设到明年 1/1（不会被定时触发）

用法：
```bash
python D:/StardewAI/newday-bell.py            # 确保 automation 存在 + 投一条 manual run
python D:/StardewAI/newday-bell.py --dry-run  # 只建 automation, 不投
python D:/StardewAI/newday-bell.py --status   # 只读
```
`newday-trigger.mjs` 的 `onHostNewDay()` 里 `await ringSession()` 调它；投递失败只记日志，不影响
pending/留言板两条老通道。

**踩坑（都是实测）**：
- `CronCreate` 在本会话会报 "session already belongs to a scheduled task" —— 一个会话只允许一条定时任务，
  所以只能直接写库（写库前先确认 schema 没变，升级 ZCode 后要复核）。
- **`attempts` 必须写 0**。照 UI 的 runNow 写 1 会命中 `(attempts=0 OR updated_at<=stale)` 的 stale 分支，
  要等 ~10 分钟才会被认领（我第一次就是这么卡住的）。
- automation 的 `running=1` 时新 run 会被跳过（脚本返回 `note='上一次投递还在跑'`）；
  `claimed_at>10min` 的残留在下一次投递时自动清。
- 端到端实测：11:02:05 插 run → 11:02:11 `dispatch_status='dispatched'`, `outcome='running'`,
  `session_id=session_1fa308cc…`；真正的 user turn 是走 `session_input` 队列（`delivery='queue'`,
  `status='admitted'`），要等当前这轮结束才 promoted。**所以"run 一直是 running"不等于失败**，
  先看 `~/.zcode/cli/db/db.sqlite` 的 `session_input` 里它是不是还排在队里。
- 队列是**按顺序一轮一条**：前面压着一条巡检时，换日消息会排它后面（实测 11:02 的换日消息排在
  10:58 巡检之后）。游戏内一天≈13 分钟，一般等一两轮就轮到，不用重发。
- **桌面端不给 manual run 收尾**：消息都投递并跑完了，`automation_runs.outcome` 仍停在 `'running'`、
  `automations.running` 一直是 1（`claimed_at` 还在心跳）。所以 `newday-bell.py` 自己按
  `run.updated_at` 做 8 分钟超时自愈（标 `outcome='stale'` + `running=0`），否则第二天的新消息会被永久挡住。
- 跑一轮会占一次模型调用。游戏内一天≈13 分钟真实时间，也就是最多约 4~5 次/小时；
  比 5 分钟巡检（12 次/小时）便宜，但仍要算钱，调试时别手动狂插。

## 四十四、冬季钓鱼日历（2026-11-05 用户点名：鱼鱼这个冬天要钓鱼，主持要陪）

### 44.1 日程表
| 游戏日 | 活动 | 时间 | 地点 | 一句话 |
|---|---|---|---|---|
| 冬 8 | **冰雪节**（冰钓比赛） | 09:00–14:00 | 煤矿森林 | 钓满 5 条赢威利；只有森林池塘计入 |
| 冬 12–13 | **鱿鱼节** | 06:10 起全天 | 沙滩 | 鱿鱼全天可钓，按条数兑铜/铁/金/铱奖 |
| 冬 15–17 | **夜市** | 17:00–02:00 | 沙滩 | 潜艇 23:00 前入场，深海鱼 |

`newday-trigger.mjs` 里已经内置 `WINTER_EVENTS` 表：活动日会在给我和鱼鱼的每日简报里自动带出，并在 `newday-pending.json` 的 todo 里标"今天是活动日"。

### 44.2 冰雪节（冬 8）——细节来自游戏本体 `Data/Festivals/winter8`
- 入口条件写在脚本里：`conditions = Forest/900 1400` → **9:00 前煤矿森林进不去**，14:00 后也进不去。
- 进去以后换临时地图 `Forest-IceFestival`，所有玩家被 warp 到 (71,35) 附近；**不是**能直接 `/warp` 过去的普通地图。
- 比赛规则：**钓满 5 条鱼**才赢威利，否则威利赢；只有**森林池塘**里的鱼计入，旁边河里钓的不算。
- 判奖：找 Lewis 完成裁判 → 脚本 `afterIceFishing` 里是 `waitForOtherPlayers endContest`，**多人要等另一个人**，别一个人先跑。
- 首次获胜奖励：Barbed Hook（倒刺钩）+ Dressed Spinner（精装旋式鱼饵）+ Magnet（磁铁）+ Sailor's Cap（水手帽）；不是第一次赢 → 一张 Prize Ticket。**多人：所有获胜玩家都给奖励**。
- 节日结束自动回农场，时间直接变 22:00；当天全村的商店和住宅都锁。
- 抛竿：冰洞很小，站到洞边、用最小力度抛最稳。

### 44.3 鱿鱼节（冬 12–13）
- 沙滩，06:10 开始，**全天**；商店不关门、时间照走、动物照喂（`Data/Festivals/winter12|13` 查不到 = 不是节日地图，是代码里的 mini festival）。
- 鱿鱼平时只在晚上出，节日水里放了特殊鱼饵 → **白天也能钓**。
- 兑奖档位（**每天重置**，摊位左侧牌子）：
  - 冬 12：1 铜（高级鱼饵×20）/ 3 铁（海之菜肴 + 冬季种子×10 或 谜之盒×2）/ 5 金（珍珠 + 咖啡×3）/ **8 铱**（《鱿鱼娃》挂画；没拿过捕蟹秘籍就给书，否则 3 谜之盒 + 海泡布丁）
  - 冬 13：2 铜（Trap Bobber）/ 5 铁 / 7 金（宝箱 + 三倍浓缩咖啡×3）/ **10 铱**（鱿鱼帽）
- 准备：鱼饵制造机提前做鱿鱼饵；**沙滩提前放箱子**能大幅缓解背包压力，节后也不会被清掉。
- 目标：两天各打满 8 只 / 10 只（铱档）。

### 44.4 夜市（冬 15–17）
- 沙滩 17:00–02:00；**潜艇 23:00 后不能进**，美人鱼船 00:30 后不能进。
- 潜艇 1000g/人，下去是深海鱼场（水滴鱼/幽灵鱼/午夜鱿鱼那批），一次约 30 游戏分钟。
- 商店不关、时间照走、动物照喂；沙漠商人每天送一杯免费咖啡。
- 画商卢皮尼每天卖不同的画（1200g，三年一循环）。

### 44.5 现在就能做的准备
- 鱼鱼还是**竹竿**（不能挂饵/渔具，钓鱼 2 级）。冬 8 前建议她去 Willy 那儿升级玻璃纤维棒（1800g，需钓鱼 2 级）——**要不要买由她定，我不动她的角色**。
- 主持：玻璃纤维棒 + 高级鱼饵×40，钓鱿鱼/深海够用；钱 5.5 万，潜艇票不心疼。
- 背包留空：节日和夜市都在外面，背包满会卡拾取。

### 44.6 执行方式与风险
- 端点：`/festival`（看当前节日事件）、`/festival/answer {answer:N}`（选第 N 个对话项）、`/festival/interact`（节日里交互）、`/festival_data?season=winter&day=8`（读节日脚本）。
- 入场靠**走到 Forest 触发**（9:00 后），不是 warp 到临时地图。
- 活动日巡检动作：**停掉 day-loop 的钓鱼段**，主持改为陪玩；活动结束（22:00 回农场）再恢复日常。
- 已知风险：换日卡菜单（§40.5，触发器已自动清）、背包满、冰雪节 14:00 硬截止。

## 四十五、sleep ready 会挂一整天：鱼鱼先睡 = 主持的一天提前结束 (2026-11-05 实测)

### 45.1 现象
冬2 22:40，主持在海滩钓鱼（体力 64，原计划钓到 23:00）：
```
10:31:43 host t=2310 Beach(44,35) inBed=false  sleepReady=Locked  (ready_state: sleep 2/2 Locked)
10:31:51 host t=2320 FarmHouse(3,11)          ← 被瞬移回屋
10:32:00 host t=600  冬3 inBed=true ShippingMenu
```
鱼鱼 21:30 后上床 → 团队 `sleep` 就绪数变成 2/2 → **不管主持在不在床上，直接换日**。

### 45.2 根因
- 主持的 `sleepReady` 在早上那次（失败的）`/sleep` 里被置 `true`，之后**一整天没被清**。
- `/cancel_sleep` 只把 `isInBed` 置 false + 关 ReadyCheckDialog（反编译 `HandleCancelSleep` 确认），
  **不动 `Game1.netReady` 的 "sleep" 通道**。所以 ready 会一直挂着。
- 只要同伴（鱼鱼）一 ready，`numberReady` 就是 2/2，换日立刻发生。

### 45.3 影响 / 不算问题的地方
- 主持的"体力<15 或 23:00 收工"政策实际失效：**鱼鱼的上床时间才是主持的收工时间**。
- 换日不扣体力（次日仍是 270 满），也不触发 "passed out" 罚金。
- day-loop 靠 §42 的日期边界正常退出，10:32:04 已自动开新一天（查信→浇水 0→去海滩→fishbot ON）。

### 45.4 现状处置
接受（当作"两人一起作息"）。换日瞬间的 ShippingMenu 由 `newday-trigger` 自动清掉，不用人管。

### 45.5 想根治的话
需要能执行 `Game1.netReady.SetLocalReady("sleep", false)` 的端点：
- 现有 NagiBridgeRemix 没暴露这个能力（`/ready_state` 只读）；
- 只有反编译 dump（`D:/StardewAI/dll-audit/NagiBridgeRemix.decompiled.cs`），重建整个 mod 成本高；
- 更省的办法是照 `FeiyuAutoJoin` 的路子再写一个小 mod（net6.0 + 一个本地 HTTP 口），只做"清 ready"这一件事。

---

## 四十六、/sleep 返回 ok ≠ 存档：连续 6 天没写盘 (2026-11-06 事故)

### 46.1 现象
- 冬3~冬8 每天 `day-loop` 都调 `/sleep`，返回 `{"ok":true,"action":"sleeping"}`，换日也正常（冬3→…→冬8）。
- 但 `C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo`
  的 mtime 一直停在 **冬2 10:19:07**。
- 冬8 冰雪节卡死后重读存档，直接回到 **冬2 6:00**，冬3~冬8 的进度全丢（钱 64746→55470、鱼获、鱼鱼的物品全没了）。

### 46.2 根因
原 `day-loop` 的睡前顺序是：
1. `POST 7843/sleep`（叫鱼鱼先睡）
2. 等 6 秒
3. `POST 7842/sleep`（主持后睡）

而主持的 `sleep` ready 会从前一晚一直挂到第二天（§45 的 `SetLocalReady` 不清除问题）。
**鱼鱼一睡，团队 ready 立刻 2/2 → 换日**，主持自己的睡眠/存档流程根本没跑 → 不写盘。
`/sleep` 的 `ok:true` 只代表"已经上床+置 ready"，不代表游戏完成了 NewDay/Save。

### 46.3 修复（2026-11-06 已落地）
1. **顺序反转**：`day-loop` 先让主持 `/sleep`（真实睡眠+ready），等 4 秒，再叫鱼鱼睡。
2. **存档校验**：换日后读 `SaveGameInfo` mtime，必须大于睡前记录的 mtime；
   日志打 `✓ 已存档 HH:MM:SS` 或 `⚠️ 存档没写盘! 本条要查`。
3. **换日简报带存档年龄**：`newday-trigger` 的每日简报新增 `存档: ✓ N 分钟前写盘` / `⚠️ N 分钟前(可能没写!)`，
   并写进 `newday-pending.json` 的 `saveAgeMin`。
4. **校准**：主持单人 `/sleep` 实测 12:29:41 → mtime **12:29:47**、冬3 6:00 —— 证明 `/sleep` 本身能存，
   问题只在"谁先睡"的顺序。

### 46.4 铁律①补充
> 每天 `/sleep` 存档 = **必须以存档文件 mtime 前进为准**，不许只看接口返回 `ok:true`。
> 存档路径：`%APPDATA%/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo`。

### 46.5 更正 (2026-11-05 13:10)：真凶不是"谁先睡"，是 newday-trigger 把 ShippingMenu 关掉了

反编译 `Menus.ShippingMenu.update()` 确认：结算菜单自己持一个 `saveGameMenu`，
**必须等结算动画走完才 `new SaveGameMenu()` 真正写盘**；`/menu_close` 把 ShippingMenu
从 `activeClickableMenu` 摘掉 → SaveGameMenu 永远不创建 → 这一天不写盘。

`newday-trigger` 换日时调 `closeStaleMenus()`，而 `STALE_MENUS = {ShippingMenu, ReadyCheckDialog}`，
所以每个换日瞬间它都把 ShippingMenu 关掉 —— 这才是冬3~冬8 六天没写盘的真正原因
（12:29:47 那次能存，是因为触发器当时刚被杀掉、还没重启：`03:54:24 newday-trigger 启动` 晚于 `12:29:47`）。

**已修**：换日菜单分三档处置（`settleNewDayMenus()`）：

| 菜单 | 动作 |
|---|---|
| ReadyCheckDialog | `/menu_close`（睡觉 ready 死锁，关掉安全）|
| ShippingMenu | `/settlement_confirm` 点 OK → outro → SaveGameMenu → 写盘 |
| SaveGameMenu | 只等不碰（正在写）|

`host-night-guard` 同时改成"换日后等 mtime 前进（最长 90s）再快照"，且睡觉顺序统一成
"主持先睡、4s 后叫鱼鱼"；`newday-trigger` 换日日志新增 `换日收尾: 存档: ✓ N 分钟前写盘`。

---

## 四十七、farmhand 卡"正在连接" = 主持读档读成了单人模式 (2026-11-05)

### 47.1 现象
- 鱼鱼客户端日志反复：`FeiyuAutoJoin 正在连接 127.0.0.1:24642 ...` → 60 秒超时 → 重试；
  游戏画面停在"正在连接"。
- 主持 `/state` 正常、时间在走、能钓鱼 —— 看起来一切正常。

### 47.2 判定（两条硬证据）
1. 主持 SMAPI 日志加载存档那行写的是 **`Single-player.`**（不是 `Host in a multiplayer game`）；
2. 主持进程 **没有任何 UDP socket**（`Get-NetUDPEndpoint -OwningProcess <host pid>` 为空），
   且 `127.0.0.1:24642` 的 UDP 探测被 ICMP refused —— 服务器根本没起。

### 47.3 根因
`FeiyuAutoLoad` 在标题页直接调 `SaveGame.Load(存档名)`，这条路径等价"单人读档"，
`Game1.multiplayerMode` 保持 0 → 不初始化 `LidgrenServer` → 不监听 24642。
原版进合作模式必须走 `CoopMenu.HostFileSlot.Activate()`：
```csharp
Game1.multiplayerMode = (byte)(_multiplayer ? 2 : 0);  // 2 = 主持
base.Activate();                                        // 内部 SaveGame.Load(...)
```
（反编译 `StardewValley.Menus.CoopMenu` 确认；`Game1.IsServer => multiplayerMode == 2`。）

### 47.4 修复（已落地，FeiyuAutoLoad v1.5+）
`ModEntry.OnTick()` 读档前加一行：
```csharp
if (AutoHost) Game1.multiplayerMode = 2;   // AutoHost = 环境变量 FEIYU_HOSTING != "0"
SaveGame.Load(save);
```
- 编译：`cd D:\StardewAI\FeiyuAutoLoad && dotnet build -c Release`；
- 部署前必须先关主持（否则 dll 被占用：`Device or resource busy`）；
- 部署：复制 `bin\Release\net6.0\FeiyuAutoLoad.dll` 到 `Mods\FeiyuAutoLoad\`。
- 验证：日志出现 `自动读档 ... (主持模式=True)`，鱼鱼客户端 ~1 分钟内自动选角色进图。

⚠️ 重启主持时**不要同时启动两个实例**（`cmd start` 与 `Start-Process` 各来一次会双开抢同一个存档）。

## 四十八、定时任务通道一天投两次"新的一天" = tick 重入 (2026-11-05)

**现象**：同一天连续收到两条「🌅 星露谷新的一天开始了」，`automation_runs` 里同一换日有两条 manual run（13:26:47 / 13:26:52）。

**根因**：`newday-trigger` 的 `tick()` 里有 `await settleNewDayMenus()`（最长 ~25s）+ `ringSession()`（python 起进程），
总耗时可能超过 20s 轮询间隔；`setInterval` 不等上一轮结束就发下一轮，两轮都看到 `hk !== st.hostKey`（key 还没更新），
于是同一换日处理两遍 → 投递两次、留言重复。

**已修**：`guardedTick()` 互斥标志——`ticking===true` 时直接跳过本轮；`.finally()` 复位。

**铁律⑥补充**：换日处理类脚本（有长 await 的轮询）必须加"上一轮未完成则跳过"的互斥，
否则长耗时轮次会和下一轮重叠，产生重复投递/重复留言。

## 四十九、换日存档死锁：农工的升级菜单堵住"所有玩家 ready" (2026-11-06 冬7 晨实锤)

**现象**：冬6→冬7 换日时，主持 SMAPI 日志停在 `Context: before save.`，之后 10 分钟零输出；
`SaveGameInfo` mtime 不动（停在 13:40:19），存档目录里**连 `_STARDEWVALLEYSAVETMP` 临时文件都没建**；
两端 `/state` 正常返回，但主持任何主线程端点（`/face`、`/settlement_confirm`）都超时。

**反编译定案**（`StardewValley.Menus.SaveGameMenu.update()` + SMAPI `Context.IsSaving()`）：
```csharp
if (Game1.IsMasterGame) {
    if (Game1.saveOnNewDay) {
        Game1.player.team.endOfNightStatus.UpdateState("ready");
        if (Game1.newDaySync.readyForSave()) {   // ← 等所有玩家 ready
            Game1.multiplayer.saveFarmhands();
            Game1.game1.IsSaving = true;
            loader = SaveGame.Save();            // ← 写盘从这里才开始
        }
    }
}
```
`newDaySync.readyForSave()` 要等**农工也 ready**。鱼鱼 13:53:11 弹了升级菜单（钓鱼 5 级：渔夫/捕猎者），
客户端停在模态 `LevelUpMenu` 里发不出 ready → 主持永远进不了 `SaveGame.Save()`：
- 因为 `ShippingMenu.saveGameMenu != null && savedYet == false`，SMAPI 的 `Context.IsSaving()` 判为"正在存档"，
  于是不再发表 mod 的 `UpdateTicked` 事件（`FeiyuAutoLoad` 的 TDiag 每 10s 一行**突然断掉就是这个原因**，不是进程卡死）；
- `loader == null` → 不产生临时文件、不写盘。

**解开**：14:01 night-guard 的赖床破环把鱼鱼的菜单关掉 → 14:03 触发器替她点结算 OK → 她的客户端补发 ready
→ 主持 14:03:20 写盘完成（`after save, starting winter 7 Y3`）。整段 **10 分钟**。

**已修（三处）**：
1. `newday-trigger.mjs`：`STALE_MENUS` 加入 `LevelUpMenu`；`settleNewDayMenus()` 新增分支
   `LevelUpMenu → /menu_close`（强关时游戏会默认落到某个专精；想换专精去下水道「不确定性雕像」10k 重选）。
2. `fish-fishbot.mjs`：keeper 每轮检查 `activeMenu.type === 'LevelUpMenu'` 当场强关，
   **不让升级菜单留到换日**（这是根治点：升级通常发生在钓鱼途中，离换日还有几小时）。
3. `day-loop.mjs`：晨间下床从 `/wakeup` 改为 `/warp Farm 64,15` —— 主持(7842) **严禁** `/wakeup`。

**判据（以后一眼认出）**：
- `before save.` 之后超过 90s 没有 `after save`；
- 存档目录没有 `*_STARDEWVALLEYSAVETMP`；
- TDiag 断流但进程 `Responding=True`、`/state` 还能读（HTTP 线程在跑，主线程只是"游戏内暂停更新"）。
→ 一定是某个玩家的模态菜单挡了 ready，先看两端 `activeMenu`，优先关**农工**的升级/结算菜单。

## 五十、夜间守卫的"90s 内没写盘"误报 = mtime 基线取晚了 (2026-11-06 修)

**现象**：`host-night-guard.log` 每晚换日后打一条 `⚠️ 90s 内没写盘!`，但存档 mtime 与主存档日期都对得上（冬9 实况：14:50:30 触发睡觉 → 14:50:36 写盘 → 14:51:24 守卫「✓ 新一天 Day9」→ 14:52:54 却报没写盘）。

**根因**：旧代码每轮循环末尾都 `lastSaveMtime = saveMtime()`。而 `/sleep` 分支里先 `sleep(4000)` 再 `sleep(30000)`，**这 30 秒里换日+写盘已经发生**，于是基线被刷成"写盘之后"的 mtime；下一轮检测到换日时再拿它当 before，自然永远等不到"前进"。

**已修**：改成只记录"已验收通过的那次写盘" `verifiedSaveMtime`：
- 换日时判据 = `saveMtime() > verifiedSaveMtime`（与采样在写盘前/后无关）；
- 只有判定成功才把 `verifiedSaveMtime` 推进；失败保持旧值，下一晚仍能正确比较。
- 循环末尾不再刷基线。

**判真伪的老规矩不变**：`SaveGameInfo` 绝对 mtime + 主存档 XML 里的 `<currentSeason>/<dayOfMonth>` + 触发器日志里 ShippingMenu 走的是 `settlement_confirmed`。

## 五十一、用 mod `/sleep` 绕过结算菜单 → 换日不写盘 → 农工卡黑屏 (2026-11-06 冬10 事故)

**现象**：为重置卡住的主持，用了 `POST 7842/sleep`（mod 的 warp 到床 + `answerDialogueAction("Sleep_Yes")` + `netReady.SetLocalReady("sleep")`）。
主持确实上床了、换日也发生了（冬11 t=600），但：
- SMAPI 主持日志只有 `Synchronizing 'NewDay' task...`，**没有 `Context: before save`**；
- `SaveGameInfo` mtime 不前进；
- 鱼鱼客户端显示 `SaveGameMenu` + **黑屏**，一直等主持写盘（`newDaySync.hasSaved()` 永远 false）；
- 主持侧 `ReadyCheckDialog(sleep) 1/2` 等鱼鱼 ready，鱼鱼卡在 SaveGameMenu → 互相等死。

**根因**：正常换日存档链是 `ShippingMenu`（过夜结算）→ 它自己 `new SaveGameMenu()` → 写盘。
用 mod 的 `/sleep` 直接把玩家置为"睡好"，跳过了结算菜单这一环，`SaveGameMenu` 从未创建 → 主玩家侧不写盘 →
农工侧的 `SaveGameMenu` 永远等不到 `hasSaved()` → 黑屏。

**处置（已验证）**：只能重启两端（用户拍板）：
1. 先停 `newday-trigger`（防止误报换日）；
2. `Stop-Process` 两个 Stardew 进程（按 PID / exe 路径，绝不 `taskkill /IM`）；
3. `Start-Process StardewModdingAPI.exe -WorkingDirectory <各自目录>` 先起主持，等 `/state.worldReady`（约 5s）；
4. 再起鱼鱼，FeiyuAutoJoin 自动连回；
5. 把 `newday-state.json` 的 `hostKey/fishKey` 改成读回的日期（否则触发器会把"回到旧日期"当新的一天播报）；
6. 重启 `newday-trigger` / `day-loop` / `host-night-guard`（守卫的 lastDay 也是旧日期，必须重启）。
代价：回到最近一次存档（本次是当天早上 6:00），当天白天的进度丢失。

**铁律⑦（新增）**：**主持侧严禁用 mod `/sleep` 当"重置按钮"**。它只适合"确实要让这一天结束"的收尾；
若只是想把人从床上弄下来，用 `/warp`。任何 sleep 之后必须看 `Context: before save` / `SaveGameInfo` mtime —— 没有写盘就是踩了这条。

## 五十二、完整地图系统：不用把人送过去，也能画出任意一张图 (2026-11-05 鱼鱼"天天迷路")

**需求**：鱼鱼原话「把游戏完整地图搞好，鱼鱼天天迷路」「本鱼没找着裁缝铺」。
旧的 fish-eye 只有 22 个地标、还大半是"guess"，`/map` 只画她身边 41×17 的窗口，没走过的地方全是 `?`。

**三个现成端点（反编译核实，全都不用移动角色）**：
1. `GET /warps` → `EnsureWarpGraph()` 遍历 `Game1.locations` 全部 87 张图的 `location.warps`，
   返回 `{maps:{地图:[{x,y,targetLocation,targetX,targetY}]}}` —— **全世界传送图**。
2. `GET /tile_props?location=X&scan=Action` → 任意地图所有层的 Action 属性。
   其中 `LockedDoorWarp <insX> <insY> <Interior> <open> <close>` 一条就给了：
   **门外坐标 + 室内落点 + 营业时间**（例：Town(20,88) 是艾米丽家门，进去落在 HaleyHouse(2,24)，9:00-20:00）。
   另外 `Buy General`/`Blacksmith`/`Carpenter`/`Tailoring`/`HospitalShop` 等就是柜台/缝纫机的**可交互格**。
3. `GET /passable_rect?location=X&x1=&y1=&x2=&y2=` → 任意地图任意矩形的可行走格（单次上限 96×96，实测 ~70ms/次），
   字段 `passable/hasFloor/object/terrain/largeTerrain/resource`。**整图骨架靠它**。

**关键更正**：`/map` **不返回 tiles**，只有 `location{name,width,height}/warps/npcs/buildings/animals`。
以前 `primeMap()` 以为能整图扫，其实一直在失败、退回"走一格记一格"（`fish-eye.log` 里的 `primeMap: /map 不可用`）。
`/passable_rect` 才是正解 —— `fish-eye.mjs` 的 `stateAndTiles()` 已改为只更新 `seenCache` 的细信息（作物/水/机器覆盖层）。

**落地（新文件 + 改动）**：
- `D:/StardewAI/world-map.mjs`（新）：`warpsAll()` 全图传送表 / `doors(loc)` 解析 Action 门 /
  `grid(loc)` 自适应分块扫整图（4 块够 130×110 的镇子）/ `renderWindow()` / `renderWhole()`（自动缩略）/
  `routeHops()/routeText()`（BFS 跨图路线）/ `exitsOf(loc)`。全部 10 分钟缓存（建筑/人物会变）。
- `fish-eye-lib.mjs`：`LANDMARKS` 22 → **63 条**，全部带真实坐标：
  商店用"室内落点 + 门外坐标 + 营业时间 + 柜台格"，家/温室用 `building{bx,by}`（两间 Cabin 同名，只能靠农场坐标分辨）。
  详见 `MAP_CN` / `AREA_ALIAS` / `hoursText()` / `openNow()` / `placesInMap()` / `placeLine()`。
- `fish-eye.mjs` 三档地图：
  - `地图` = 她身边 41×17（骨架 `/passable_rect`，再叠 `seenCache` 的作物/水/机器）+ 按距离编号的地标；
  - `地图 <地点>` = 整张图缩略（不在那边也能看），标出所有门/柜台/出口 + 营业时间 + 跨图路线；
    `地图 裁缝铺` 直接给 HaleyHouse 的户型图，标出 `裁缝机(13,23)`；
  - `世界怎么走` = 全世界出口图。
- `goto` 重写：①同图 `/walk_to` ②`building` → `/warp_building`（小屋/温室/农舍）③室内落点直传（商店/矿洞）
  ④直传失败 → 门站兜底（`nearestStand()` 从可行走格找门前能站的格）⑤同图坐标兜底。
  目标格站不住会自动找最近可站格；商店关门会在到达播报里提示。
- 新命令：`出去`（`world.exitsOf` + 传送到门外图）、`XX在哪`（=去XX，会报门牌和营业时间）。

**验收（冬13 实况）**：`去农田` 从 Farm(52,16) 走到 (65,19)；`去裁缝铺` 从 Farm 直接落到 HaleyHouse(2,24)、
旁边 Haley/Emily；`地图` 在店内画出 25×30 户型并标出裁缝机；`出去` 回到 Town(20,89)；
`地图 镇子` 整图 130×110 缩略 + 18 个门/出口编号；`地图 矿洞` 远程给 Mine 77×20。
29 个室内落点 + 关键户外站位全部用 `/passable_rect` 逐格验证过可站。

**判据**：以后她再迷路，先看 `地图 <她说的地方>` 的整图；要门牌说 `XX在哪`；跨图路线不对先查 `/warps`。

## 五十三、⚠️ 双世界分裂：farmhand 启动用了单机读档，两边各跑一个存档 (2026-11-05 实锤)

**现象**：15:24 两端各起一个 `StardewModdingAPI.exe`（主持 `V1.6.15`、鱼鱼 `V1.6.15-fish`）。
40 分钟后发现：
- 两端 `/state.player.name` **都是「蓝色小肥鱼」**（不是农工「泡泡今天也要好好吃」），
  `homeLocation` 都是 `FarmHouse`、`homeDoor` 都是 Farm(64,14)；
- `otherPlayers` 两端都是空；`/state.time` 同一天却差 6 小时（主持 12:20 / 鱼鱼 6:40）；
- 钱不一样（112416 vs 103158）、`fishCaught` 不一样；
- 存档目录 mtime 15:34（主持存冬11）→ 15:43（鱼鱼端存冬11）→ 15:55（鱼鱼端存冬12）**互相覆盖**。

**根因**：鱼鱼端 `FeiyuAutoLoad` 在标题界面无条件 `SaveGame.Load(saveName)`（v1.5 逻辑），
**它不知道自己是农工** —— 自动读档 = 以单人模式接管整份存档（玩的是主持角色）。
正确路径是 `FEIYU_AUTOLOAD=0` + `FeiyuAutoJoin`（`FEIYU_AUTOJOIN=1`、`FEIYU_HOST=127.0.0.1`）去连主持的 UDP 24642。
`G:\量化系统安装包\V1.6.15-fish\start-fish.bat` 就是干这个的（`restart-fish.ps1` 调它）；
**手动/旧脚本直接起 exe = 单机分裂**。主持端 `V1.6.15` 的 FeiyuAutoLoad 有 `FEIYU_HOSTING` 分支
（读档前 `Game1.multiplayerMode = 2`），所以主持端能正常开房。

**三条判据（一分钟内认出分裂）**：
1. 鱼鱼端 `player.name` 不是 `泡泡今天也要好好吃`，或 `homeLocation != FarmHousecd6d79b6-...`；
2. 两端 `otherPlayers` 都为空；
3. 同一天 `timeOfDay` 差几小时，且钱/钓鱼数不同。
（补充：`netstat -ano | findstr 24642` 只有主持 PID 在听 = 主持在开房；农工端应该显示已连接。）

**修复（已验证）**：
1. 先停两端 night-guard（防止任一方到点睡觉把世界写进同一份存档）；
2. 按 exe 路径只杀 **鱼鱼端** PID（`Stop-Process -Id`，绝不 `taskkill /IM`）；
3. 用 `start-fish.bat`（或等价 env：`FEIYU_AUTOLOAD=0 FEIYU_AUTOJOIN=1 FEIYU_HOST=127.0.0.1`）重启鱼鱼端；
4. 等 10~20s，`/state` 应出现 `player.name=泡泡今天也要好好吃`、`otherPlayers=[蓝色小肥鱼]`，两端时间/钱一致；
5. 重启 `fish-night-guard` / `host-night-guard`（lastDay 状态是旧的）；
6. 若主持因换日留在床上（`isInBed=true`），用 `/warp Farm 64,15` 弄下床，**不要 `/wakeup`**。

本次代价：鱼鱼端那 40 分钟的单机进度被丢弃（存档里冬12 06:00 那份是它写的），主持世界保留（冬13 已存档）。

**铁律⑧**：**农工客户端只能用 `start-fish.bat` / `restart-fish.ps1` 启动**。
任何"直接 Start-Process StardewModdingAPI.exe"的重启都可能造出第二个单机世界；
重启后第一件事是核对 `player.name` + `otherPlayers` + 两端 `timeOfDay` 是否一致。

## §54 ⚠️ GET /fishbot 不带 action = toggle：查一下状态就把鱼竿开关翻一次

**症状（冬16 潜艇连钓，鱼鱼 7843）**：人明明在钓（isFishing=true、bobber 在水里），fishCaught 却卡住不动、
体力还在掉；查 `GET /fishbot` 返回 enabled:false —— 看起来像"Fishbot 自己静默关了"。

**真因（反编译 NagiBridgeRemix.HandleFishbot + Fishbot 0.6.1 核实）**：
```
string action = GetParamOr(dict, "action", "toggle");   // 默认值就是 toggle!
bool next = (action == "toggle") ? !now : (action == "on");
if (action != "status") { field.SetValue(obj, next); ... }
```
**GET 没有 body → dict 空 → action 默认 "toggle" → 直接把 AutomationEnabled 取反**。
所以"巡检时查一下开关"这个动作本身就会把它关掉，再查一次又打开。鱼鱼两次"钓着钓着停了"
都是被这种查询翻掉的，不是潜艇深度、不是站位，也不是 Fishbot 的 AutoPause
（AutoPause 会额外弹 GameMenu + 写 HUD 文本，现场没这两样）。

**正确用法（唯一安全）**
- 查状态：`POST /fishbot -H 'Content-Type: application/json' -d '{"action":"status"}'` → 只读，不翻。
- 打开：`-d '{"action":"on"}'`；关闭：`-d '{"action":"off"}'`。
- **永远不要用 GET /fishbot 或 POST 空 body 来"看看状态"**（空 body = toggle）。
- 顺带：`/menu_close` 空 body 会被 Kestrel 回 411，同样要带 `-d '{}'`。

**验收（冬16 19:12）**：status 查完 enabled 仍为 true，鱼鱼 fishCaught 141→143、menu=BobberBar 正常收线。

## §55 锁时期间 farmhand 自己 /sleep = 床上冻住；cancel_sleep 不够，补一发 /wakeup

**现象（冬16 19:20，时间锁着，夜市还开着）**：鱼鱼（7843）自己跑回 Cabin(9,9) 上了床，
`isInBed=true`、`activeMenu=ReadyCheckDialog`、`sleepReady 1/2`，客户端整个卡在"正在等待其他玩家"，
鱼竿拿在手里也不动。主持没睡，而时间锁把 timeOfDay 钉在 1920，所以这一觉永远不会完成。

**处理（实测顺序）**
1. `POST 7843/cancel_sleep -d '{}'` → `{"action":"cancelled","wokeUp":true}`：菜单关掉、sleepReady 归 0/2，
   但 **isInBed 仍然是 true**（人还躺在床上，只是不再卡 ready-check）。
2. 再 `POST 7843/wakeup -d '{}'` → `{"action":"warped","from":"Cabin","target":"Farm","x":52,"y":16}`：
   直接把人送到 Farm(52,16)，`isInBed=false`、体力保留（225/270）。
3. 事后留言板问她为什么睡（本次是她的自主收工判断），并说明：**锁时期间不要单独睡**，
   要睡必须主持一起睡（全队 ready-check），否则只会把自己冻在床上。

**判据**：看到 farmhand `inBed=true` + `ReadyCheckDialog` + 主持没睡 + 时间被锁 → 就是这种自锁，
别等天亮（锁时不会天亮）。`cancel_sleep` 只解 UI，`/wakeup` 才解床位；两步都要。

## §56 卖货白名单漏洞：\bEel\b 把「Spicy Eel 香辣鳗鱼」当鱼卖掉 + 鱼竿升级到铱竿

**两件事（2026-11-05 冬19→20）**

1. **误卖熟菜**：冬19 收工时 day-loop 把主持包里的 **Spicy Eel ×19 全部扔进出货箱**。
   根因在 lib 的白名单正则：\`SELL_FISH = /\b(...|Eel|...)\b/\` 命中了 "Spicy Eel" 里的 Eel，
   而它是**熟菜（category -7，回 115 体力）**，属于体力补给，绝不该卖。
   修法（已同步 lib.mjs 与 lib-fish.mjs）：新增
   \`\`\`
   const COOKED_NOT_SELL = /^(Spicy Eel|Maki Roll|Sashimi|Sushi|Carp Surprise|Baked Fish|Fish Stew|
     Fish Taco|Trout Soup|Lobster Bisque|Chowder|Escargot|Fried Eel|Seafoam Pudding)$/i;
   export const isSellable = n => !COOKED_NOT_SELL.test(n) && (SELL_FISH.test(n) || SELL_CROPS.test(n) || SELL_TRASH.test(n));
   \`\`\`
   ⚠️ day-loop 是常驻 node 进程，改完 lib 必须重启进程才生效（本次已重启）。
   以后加任何"按名字匹配"的白名单，**先想清楚会不会误伤熟菜/任务品**。

2. **鱼竿升级（主持+鱼鱼都换铱竿）**：桥的 \`POST /buy\` 可以直接买工具，
   工具不是 Object → 走默认价 **100g**（不是 7500g），\`{"id":"(T)IridiumRod","quantity":1}\`。
   买完 \`/select "Iridium Rod"\` 拿在手上；它支持鱼饵+浮标，蓄力更远。
   day-loop 原来按 \`/Rod|Pole/i\` 取**背包里第一把竿**，铱竿不一定是第一把 → 已改成
   **优先 /Iridium Rod/，没有再退回任意竿**（两处：钓鱼入口 + 清包后重开）。

**验收**：鱼鱼 119,250→119,150（-100g），包里出现 Iridium Rod 并选中；主持同样 -100g，占第 11 格。

## §57 fishbot 假活：竿不在手上时 enabled=true 也一整天不抛竿（Day21 实测丢 12 小时）

**现象（2026-11-06 冬21）**：主持 09:20 钓完最后一条后到 21:10 **整整 12 个游戏小时 0 抛竿**：
`/state` 里 `player.fishCaught` 卡在 1457、`stamina` 卡在 222 一动不动，
但 `POST /fishbot {"action":"status"}` 返回 **enabled:true**、游戏 HUD 也写着 "Fishbot active!"、
`.day-loop.lock` 心跳正常（进程活着）。**光看 fishbot 状态和进程死活都判不出来。**

**唯一可靠的判据**：`/state` 的 `player.currentItem == null` 且 `player.rod.inHand == false`。
根因：钓到宝箱后自动收「高级鱼饵×5 / 铱矿石」，currentItem 被打掉变成 null，竿离开手上；
fishbot 的 enabled 还是 true，但它没竿可抛 → 空转一整天。day-loop 原来只在钓鱼段**开头**选一次竿，
中间不再校验，所以发现不了。

**修复（day-loop.mjs 钓鱼循环，两处）**：
1. **心跳校验竿**：每 200s 的 keepalive 里顺手读一次 state，`currentItem` 不匹配 /Rod|Pole/i 就重选
   （优先 Iridium Rod）再 `/face 1`。
2. **停滞哨兵**：连续 10 次心跳（≈33 分钟）`fishCaught` 和 `stamina` 都没变化 → 判假活，
   硬重启 fishbot（off→on）并重选竿。

**现场处置（立等可取）**：`fishbotSet(false) → sel('Iridium Rod') → face(1) → fishbotSet(true)`，
实测 2 秒内 `bobberX` 出现、体力 -7，立刻恢复。**修完记得重启 day-loop 进程**（常驻 node 改代码不生效）。

## §58 lib 里的 fishbotSet 一直是"空 body 盲翻两次"（§54 只写进文档没落进代码）

**2026-11-06 复查发现**：`lib.mjs` 和 `lib-fish.mjs` 的 `fishbotSet(on)` 都还是老实现：

```js
let r = await post('/fishbot', {});      // 空 body = toggle!
if (r.enabled !== on) { await sleep(300); r = await post('/fishbot', {}); }
```

它靠"翻一次看结果、不对再翻一次"来凑目标态，看似能对上，实际上**每次调用都会先把开关抖一下**：
本来 OFF 想开 → 第一次就开了没问题；本来 ON 想保持开 → 第一次被它关掉，300ms 后再开回来。
day-loop 每 200s 的 keepalive 一直在这么抖，正好和 fishbot 自身状态机抢，属于"钓着钓着停了"的隐形推手。

**已修（两个 lib 同步）**：唯一安全写法——
```js
const cur = await post('/fishbot', { action: 'status' });
if (!!cur.enabled === !!on) return cur.enabled;
const r = await post('/fishbot', { action: on ? 'on' : 'off' });
return r.enabled;
```

**教训**：§54 当时只在文档里写了"别用 GET 查状态"，代码层的 `post({})` 同样命中 toggle 默认值，
文档修了不等于代码修了 —— 以后凡是"端点默认参数有副作用"的坑，**必须回头 grep 一遍所有 lib/脚本的调用点**。

## §59 farmhand 端的每日结算(ShippingMenu)必须自己点 OK，否则她的客户端卡死

**用户实测**：鱼鱼(7843) 每天早上的「每日收入面板」——耕种/采集/钓鱼/采矿/其它/总计那个页面——
**主持这边点了结算不等于她也点了**，她的客户端会一直挂着这一页，换日/加载推不动。

**两份处置（都已落地）**：
1. `newday-trigger.mjs` 的 `settleNewDayMenus`：原来 `ShippingMenu` 点一次就 `break`，
   而 1.6 的结算面板有**好几页**（逐项 → 总计），点一次只翻一页。已改成 `continue` 循环点到菜单消失（上限 10 次）。
2. 新增常驻 `fish-settlement-guard.mjs`：每 2s 读 7843 `/state`，看到 `ShippingMenu`（或其 shipping 子菜单）
   就 `POST /settlement_confirm` 带 `{}` body，一直点到菜单消失（最多 8 次 × 1.5s）。
   **只碰 7843、只认结算类菜单**——背包/升级/ReadyCheck 一律不碰（那些归 newday-trigger）。
   日志 `D:/StardewAI/fish-settlement.log`。

**为什么不是"主持点一下就行"**：联机的两块客户端各有自己的 ShippingMenu，主持点的是主持那份；
farmhand 那份只有她自己的客户端能推进（`/settlement_confirm` 只作用于本端 UI）。

## §60 锁时挂机三件套：/eat 必须先 /select、体力阈值、看护脚本

**用户要求（冬25 冬星宴当天）**："两个号继续钓会鱼，我等一下回来过活动" + "记得回体力"。

1. **`/eat` 只吃"当前手持"的东西**：裸 `POST /eat {}` 会返回
   `当前物品不可食用（先 /select 选个食物）`。正确顺序：`/select {name:"Tuna"}` → `/eat {}`。
   ⚠️ 起竿小游戏（`activeMenu=BobberBar`）期间不能选物品，要等它结束再吃。
   ⚠️ 吃完手里会变成食物，**必须重新 /select 鱼竿 + /face 1**，否则 fishbot 又变成"假活"（§57）。
2. **体力阈值**：钓一竿 ~7 点，270 体力约 35 竿。锁定挂机时设 90 为进食线、吃到 220 就停，
   既不会晕倒也不浪费熟菜。避开 Coffee（只回 3 点）。
3. **`lock-fish-keep.mjs`（新增常驻）**：只在该文件检测到 `time-lock.flag` 时工作，解锁自动退出。
   每 20s 对 7842/7843 做四件事：关挡路菜单 → 不在海滩就传回去 → 竿不在手重选铱竿 →
   fishbot 用 `action=status/on` 校正；包快满（free≤2）回农场卖便宜鱼；体力<90 自动进食。
   日志 `D:/StardewAI/lock-fish-keep.log`。

**实测**：主持人 63→259（2 个金枪鱼），鱼鱼 148→255（1 个香辣鳗鱼），吃完都自动拿回铱竿继续抛。

## §61 鱼饵耗尽 = 第二种"fishbot 假活"（enabled=true 但 0 抛竿）

**2026-11-06 冬25 挂机实测**：主持的鱼竿在 20:13 左右饵用完（`rod.baitStack=0, baitInBag=0`），
随后 **24 分钟 0 抛竿**：`POST /fishbot {"action":"status"}` 一直返回 `enabled:true`、体力还是满的 270、
HUD 也显示 active —— 和 §57（竿不在手）症状一样，但原因不同。

**判据（和 §57 并列）**：
- `player.rod.baitStack == 0` 且 `rod.baitInBag == 0` → 饵耗尽（先查这个再查竿）
- `player.currentItem` 有竿、`rod.inHand == true` 也照样不动

**修法（桥自带专用端点，别去拖拽）**：
```
POST /give {"id":"(O)685","count":100}      // 补 100 个鱼饵（限定 ID 685）
POST /rod  {"action":"bait"}                // 把背包里的鱼饵挂到竿上（item 可选）
POST /rod  {"action":"show"}                // 看当前挂的饵/浮标
```
实测：给饵+挂上之后 `off → select 铱竿 → face 1 → on` 立刻恢复（bobberX 出现、体力开始掉）。

**已并入 `lock-fish-keep.mjs`**：
1. `baitGuard()`：饵空 → 背包有饵就挂；背包也没有就 `/give` 100 个再挂（锁时挂机没人去鱼店买）。
2. **假活哨兵**：同一号连续 6 次巡检（≈2 分钟）`fishCaught` 不涨 → fishbot 硬重启 + 重选竿 + 补饵。

⚠️ 挂机前先看一眼 `/rod`：鱼竿的饵是消耗品，100 个大约能撑 1~1.5 个游戏日的连续钓鱼。

---

## §62 端点扩展包：9 个"知道但没接"的端点已接入（2026-11-06）

新增三个文件，把 `/guard /egg_tiles /carpenter /sell_to_shop /buffs /bombs /crawl_bed /menu/claim_swap /sittable`
做成可复用封装 + CLI + 两个场景脚本：

| 文件 | 作用 |
|---|---|
| `lib-extra.mjs` | `extra(port)` 工厂，`HOST`(7842) / `FISH`(7843) 两套；只读端点直调，副作用端点单独标注 |
| `xp.mjs` | CLI：`buffs / bombs / eggs [map] / sittable / carpenter / beds / guard on|off / sell / swap / all`；锁时期间（`time-lock.flag` 在位）自动拒绝 `guard/sell/swap`，要 `--force` |
| `build-plan.mjs` | 罗宾建筑规划：25 项造价+材料，按 `itemId` 对背包算"木头 67/300"，标"还差多少钱" |
| `egg-festival.mjs` | 蛋蛋节清扫：默认只读打印彩蛋坐标，`--go` 才逐个 `walk_to` 走过去踩（未到节日会拒绝） |

**这一轮实机/源码核对出来的 8 个坑**：

1. **`/egg_tiles` 确实是彩蛋坐标** —— 游戏本体 `Event.cs` 的 `eggHunt` 分支（`festivalProps`）就是同一段逻辑：
   扫 `Paths` 层里 `TileSheet.Id.StartsWith("fest")` 的图块，把它们当道具摆出来，`festivalTimer=52000`。
   ⚠️ **1.6 节日地图改名了**：不是老攻略里的 `spring13`，而是 **`Town-EggFestival` / `Town-EggFestival2`**；
   `?map=` 传旧名会 `ok:false "The content file was not found."`。实测两张图分别 32 / 35 个蛋。
2. **`/guard` 只服务 farmhand**：房主进程调 `on` 会被拒；但 `off` 房主也能调（关防护是全局状态）。
   它会把武器换到手上 → **钓鱼/浇水/收割进行中绝对不要开**。已接进 `mine-session.mjs`（进出矿自动开关，host 上是 no-op 只记一行）。
3. **`/carpenter` 的 `materials` 是 `{id, amount}`**，没有名字、也没有 `count/quantity`：
   想显示"木头 300"必须自己按 `(O)388` 这类 itemId 对背包（`build-plan.mjs` 已带一张常见建材表）。
   另外它只在"钱够 **且** 材料够"时给 `affordable:true`，别把它当"钱够不够"用。
4. **`/sittable` 的 `face` 是布尔**（是否面朝玩家），朝向在 `direction`；`free` 是**剩余座位数**不是布尔。
5. **`/crawl_bed` 的参数是 `player` 不是 `who`**（报错文案里写成了 who，源码读的是 `player`），动作 `locate|beds|sleep`，默认 `locate` 纯只读。
6. **`/bombs` 只列"已点燃的炸弹"**（`temporarySprites` 里 `bombRadius>0`），背包里的炸弹不算；用于炸矿时别站上去。
7. **`/sell_to_shop` 与 `/sell` 的分工**：`/sell` 只认 Farm（出货箱、整叠）；`/sell_to_shop` 认当前所在商店、可指定数量。
   锁时期间为避免打断钓鱼，本轮**没有实机验证**，等解锁后第一次用再回填。
8. **`/menu/claim_swap` 需要 ItemGrabMenu 开着**才有意义（宝箱满时用背包物品换出），同样留待解锁后验证。

**另外**：`lock-fish-keep.mjs` 的进食分支现在会先读 `/buffs` 记一行当前 buff 余量
（判断"是真饿还是 buff 掉了"，也方便回看吃了什么）；重启后生效（进程 PID 会变）。

### §62.1 同日追加：173 个端点 100% 封装（lib-extra.mjs v2）

用户拍板"全部接上省得再造轮子"。做法是**生成而不是手抄**：
`dll-audit/_gen-routes.mjs` 从反编译源码提取每条路由的 handler/方法/入参（`routes.json`），
`dll-audit/_gen-lib.mjs` 合并端点手册里 115 条已有描述 + 手工 20 类分类 + 40+ 条坑位注记，
自动生成 `lib-extra.mjs`（601 行）和 `docs/端点全表.md`（173 条全表）。

- **约定**：路由 `/warp_building` → `warpBuilding({...})`；GET 参数走 query，POST 走 JSON body；`API` 导出机器可读元数据。
- **CLI**：`node xp.mjs api 关键字` 搜索 / `get|call <路径>` 通用探测；⚠️ Git Bash 下路径**别带开头 `/`**（会被转成 `D:/Program Files/Git/...`，xp.mjs 已做兼容）。
- **验收**：`_smoke-extra.mjs` 72 个只读端点实机回归 = 69 OK + 3 个预期业务错 + 0 真失败。
- **改文档/注记要改生成器再重跑**，直接改 `lib-extra.mjs` 会被下次生成覆盖。
- 生成器自己的坑：手册表格解析要剥反引号（routeCell 带 \`\`），参数串和描述要用"纯标识符"启发式分开，否则描述列会被 `location,x,y` 这类参数串顶掉。

### §62.2 已接进运行脚本的两处（2026-11-06 晚）

1. **`newday-trigger.mjs` → `/levelup_choose` 自动选专精**（原逻辑是强关 `LevelUpMenu`，等于随机专精；冬7 鱼鱼就是这么被默认成 **7=Trapper** 的）。
   现在换日清菜单时读 `activeMenu.levelUp`（`{isProfessionChooser,skill,skillName,level,offered:[{id,name}]}`）：
   - `isProfessionChooser && offered>=2` → 按偏好表选 `profession`，成功后菜单自己关（handler 里 `isActive=false`）；
   - 普通升级（2–4/6–9，无分支）→ 仍旧 `/menu_close`。
   - 偏好表（**已按 `LevelUpMenu.getProfessionName` 源码逐 id 核对**）：farming `1 Tiller→4 Artisan`；fishing `6 Fisher→8 Angler`；foraging `13 Gatherer→16 Botanist`（⚠️15 是 Tapper，不是 Botanist）；mining `18 Miner→21 Prospector`；combat `24 Fighter→26 Brute`。10 级用第二档，缺省回退到"offered 里任一偏好项"，再不行取 offered[0] 并记日志。
2. **`lock-fish-keep.mjs` → `/fish_areas` 自动换钓点**：假活哨兵连续两轮硬重启（≈4 分钟）都不上鱼时，调 `/fish_areas` 取 `spots[{waterX,waterY,standX,standY}]`，按曼哈顿距离挑最近的可站格 → `warp` → 面朝水格 → 挂饵 → 重开 fishbot；warp 没落地就退回原逻辑。连续上鱼会清零"换点计数"。

### §62.3 批量动作提速 + 简报增强（2026-11-06 晚）

**A. `/queue` 命令 DSL（反编译核对）**：body 是**数组**，每条 `{action:...}`，支持
`move / face / select / use / charge / interact / wait / warp / wait_for_bite / key`；
主线程顺序执行，内部自带 3~10 tick 命令间隔与"移动完成再下一条"的等待，最多 5 分钟超时。
返回 `{ok, executed, results:[{action,ok,...}]}` —— 播种的每条 `use` 成功会记 `action:"placed"`。

**B. `lib.mjs` 新增 `queue(cmds)` + 改造两处**：
- `waterAll()` → 走 **`/tool_area {operation:"water", x1,y1,x2,y2}`**（桥内部自动选壶、按升级蓄力 3×6、寻路、补漏，返回值含 `swings/patches/still_missing/out_of_water`）。壶空会自动 `/refill` 再来，最多 4 轮；仍有剩格才回退旧的逐格 `waterAllLegacy()`。**90 格地从约 450 次 HTTP 降到个位数**。
- `day-loop.replantAll()` → 新 `plantBatch(seed,max)`：一次 `/passable_rect` 选站位，然后 `/queue` 批量下 `select→(move,face,use)×N`，按 `results` 里 `placed` 计数；队列失败返回 -1 时自动回退逐格老路。
- 立即可验的：`/queue [{action:"wait",ms:120}...]` 实测 `executed:2`；空田调 `/tool_area water` 返回 `No unwatered crops nearby`（无副作用）。真正的浇水/播种要等春天有作物再验。
- ⚠️ 队列里 `move` 无路可走会**瞬移**（和单发 `/move` 不同），所以 `plantBatch` 只挑可走格站位；`use` 对种子走 `placementAction`，与 `/use` 同源。

**C. 每日简报（`day-activator.mjs`）加订单/任务**：
- `/order_board` → `left/right = {questKey,name,requester}`，简报输出"📋 特别订单: 奇特物质(Wizard) / 生态平衡(Demetrius)"。
- `/quest_progress` → **字段是 `completed/collected/killed/caught/required/daysLeft`，没有 `currentCount/maxCount`**（手册早期写的字段名是错的）。简报按"有计数或有剩余天数"优先排序取前 3，实测输出"🗒️ 任务(8): 异域饮品(0/1) / 介绍 / 开始"。
- 重启 `day-activator` 时 `lastDay=-1` 会补发当天一条（实测 id 375），属预期。
- 踩坑：**别把 stdout 重定向到脚本自己 append 的日志文件**——`>> day-activator.log` 会和 `appendFileSync` 抢句柄，Windows 报 `EBUSY` 直接崩；console 输出要用另一个文件（`day-activator.console.log`）。

