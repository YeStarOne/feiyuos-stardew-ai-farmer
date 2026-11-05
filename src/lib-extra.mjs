// lib-extra.mjs v2 — NagiBridge 全量端点封装（173/173）(2026-11-06)
// ⚠️ 本文件由 dll-audit/_gen-lib.mjs 自动生成，手改会被覆盖；要改描述/坑位注记请改生成器里的 EXTRA/NOTES/CATS。
// 用法:
//   import { HOST, FISH, API } from './lib-extra.mjs';
//   await HOST.state();                      // 全量状态
//   await FISH.rod({ action: 'show' });      // 鱼竿/饵
//   await HOST.warp({ location: 'Farm', x: 64, y: 15 });
//   await HOST.queue([{ endpoint: '/face', body: { direction: 1 } }, ...]); // 批量
//   API['/warp']                             // 元数据 {method,params,cat,desc,note}
// 约定:
//   · GET 端点参数走 query；POST 端点参数走 JSON body（函数名 = 路由去 / 和 _ 的驼峰）。
//   · 标 ⚠️ 的条目有副作用/会抢前台/有历史坑，动手前先看 JSDoc。
//   · 中文一律 node fetch（本文件就是），绝不 curl 直发。
const PORT_BASE = p => `http://localhost:${p}`;

async function call(port, path, { method = 'GET', body, timeout = 12000 } = {}) {
  const r = await fetch(PORT_BASE(port) + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, status: r.status, raw: t.slice(0, 200) }; }
}

// 全部路由元数据（xp.mjs 的 api 命令和文档都吃这份数据）
export const API = {"/status":{"method":"GET","params":[],"cat":"状态/快照","desc":"桥版本、端口、worldReady、caps","note":""},"/move":{"method":"POST","params":["x","y"],"cat":"移动/传送","desc":"单步移动","note":""},"/tool":{"method":"POST","params":["name","power","special"],"cat":"物品/背包/装备","desc":"精确控工具（蓄力/特殊动作）","note":""},"/weapon_diag":{"method":"GET","params":[],"cat":"调试/截图","desc":"武器诊断","note":""},"/interact":{"method":"POST","params":["x","y"],"cat":"物品/背包/装备","desc":"对面朝格/NPC 交互（对话/机器/门），可带 x,y","note":""},"/furniture_pickup":{"method":"POST","params":["x","y"],"cat":"地图/地形","desc":"拾起家具","note":""},"/furniture":{"method":"GET","params":[],"cat":"地图/地形","desc":"当前图家具清单（类型/尺寸/是否储物/是否鱼缸）","note":""},"/tank":{"method":"GET","params":["x","y"],"cat":"地图/地形","desc":"鱼缸内容（鱼/帽子/容量）","note":""},"/decor":{"method":"GET","params":[],"cat":"地图/地形","desc":"铺地板/墙纸（只认房间不认格，限室内）","note":""},"/sittable":{"method":"GET","params":["radius"],"cat":"移动/传送","desc":"query radius(0-40,默认7)","note":"face 是 bool，朝向在 direction；free 是剩余座位数"},"/passable":{"method":"POST","params":["x","y","allowWater","location"],"cat":"地图/地形","desc":"单格可走性","note":""},"/passable_rect":{"method":"GET","params":["location"],"cat":"地图/地形","desc":"矩形可走图（一次 96×96）","note":"一次最多 96×96，大图分块"},"/chat":{"method":"POST","params":["message","color","notice"],"cat":"说话/提示/信箱","desc":"游戏内聊天","note":"中文必须 node fetch 发（curl 会 GBK 乱码）"},"/emote":{"method":"POST","params":["emote","id"],"cat":"移动/传送","desc":"emote 或 id","note":""},"/state":{"method":"GET","params":["consume_events","light"],"cat":"状态/快照","desc":"全量状态（player/location/time/inventory/otherPlayers/fishing）","note":"巡检第一入口：player/location/time/inventory/otherPlayers/fishing"},"/surroundings":{"method":"GET","params":["radius"],"cat":"地图/地形","desc":"周围格（terrain/object/crop），矩形上限 4096 格，超了报错不静默截断","note":"矩形上限 4096 格，超了直接报错不截断"},"/warps":{"method":"GET","params":[],"cat":"地图/地形","desc":"全图传送点清单（我们做 63 地标表用的就是它）","note":""},"/farm_buildings":{"method":"GET","params":[],"cat":"地图/地形","desc":"农场建筑清单（含坐标/类型）","note":""},"/doors":{"method":"GET","params":["location"],"cat":"地图/地形","desc":"当前图门列表 + interiorDoors 开关状态","note":""},"/fish_pond":{"method":"POST","params":["x","y","action"],"cat":"钓鱼/水产","desc":"x,y,action(钓)","note":""},"/rod":{"method":"POST","params":["action","item"],"cat":"钓鱼/水产","desc":"rodInfo:{name,upgrade,inHand,bait,baitStack,tackleInBag}","note":"action: show|bait|tackle|clear；饵 ID (O)685"},"/find_npc":{"method":"GET","params":["name"],"cat":"NPC/社交/任务","desc":"NPC 位置/是否睡着（实测 Abigail 在 SeedShop）","note":""},"/trinkets":{"method":"GET","params":[],"cat":"物品/背包/装备","desc":"饰品栏","note":""},"/trinket":{"method":"POST","params":["name"],"cat":"物品/背包/装备","desc":"装备饰品栏","note":""},"/rings":{"method":"GET","params":[],"cat":"物品/背包/装备","desc":"戒指栏","note":""},"/ring":{"method":"POST","params":["name","slot"],"cat":"物品/背包/装备","desc":"装备戒指到指定槽（slot）","note":""},"/equip":{"method":"POST","params":["name","slot","hand"],"cat":"物品/背包/装备","desc":"穿装备 / 脱某槽（boots/hat/shirt/pants/ring）","note":""},"/worn":{"method":"GET","params":[],"cat":"物品/背包/装备","desc":"当前穿戴（帽/衣/裤/靴/左右戒指/饰品）","note":""},"/alerts":{"method":"GET","params":["peek"],"cat":"状态/快照","desc":"事件流（hud 文本/菜单/升级/晕倒…最近 100 条），`?peek=true` 只看不取","note":"?peek=true 只读不消费"},"/appearance":{"method":"POST","params":["hair","hairColor","skin","shirt","pants","acc","eyeColor","pantsColor","hat"],"cat":"外观","desc":"改外观。⚠️ 源码中文警告：只能在创建角色/幻觉神龛的捏脸页开着时调；菜单外直调会写覆盖值，导致之后换衣服被覆盖（游戏错乱）","note":"⚠️ 只能在捏脸菜单开着时调；菜单外直调会写覆盖值导致换衣服错乱"},"/appearance_info":{"method":"GET","params":[],"cat":"外观","desc":"当前外观描述/发色/最爱之物","note":""},"/appearance_ref":{"method":"GET","params":[],"cat":"外观","desc":"合法 shirt/pants 索引表","note":""},"/appearance_creation":{"method":"GET","params":[],"cat":"外观","desc":"捏脸页可选外观清单","note":""},"/hair_ref":{"method":"GET","params":[],"cat":"外观","desc":"发型索引 + 贴图","note":""},"/character_customize":{"method":"POST","params":["name","farmname","favorite"],"cat":"外观","desc":"改角色名/农场名/最爱之物（需菜单）","note":""},"/color_pick":{"method":"POST","params":["hue","sat","val","hex"],"cat":"外观","desc":"颜色换算（HSV↔RGB/滑条位置），纯函数，不碰存档","note":""},"/stop":{"method":"GET","params":[],"cat":"移动/传送","desc":"停住当前移动","note":""},"/stand":{"method":"GET","params":[],"cat":"移动/传送","desc":"从坐姿起身","note":""},"/map":{"method":"GET","params":[],"cat":"地图/地形","desc":"当前地图元信息","note":""},"/buy":{"method":"POST","params":["id","quantity","price"],"cat":"买卖","desc":"在当前商店买东西（quantity/price 可选）","note":""},"/face":{"method":"POST","params":["direction"],"cat":"移动/传送","desc":"direction 0上1右2下3左","note":""},"/select":{"method":"POST","params":["name","quality"],"cat":"物品/背包/装备","desc":"选中背包物品（支持品质 0-4）","note":""},"/use":{"method":"POST","params":["force","mode","x","y"],"cat":"物品/背包/装备","desc":"对面朝格使用手上物品","note":""},"/pan":{"method":"POST","params":[],"cat":"钓鱼/水产","desc":"淘金盘（需社区中心鱼缸完成+水边闪光）","note":""},"/sleep":{"method":"POST","params":["stay"],"cat":"时间/睡眠/菜单","desc":"上床（返回 ok ≠ 写盘）","note":"返回 ok ≠ 写盘！验证只认存档文件 mtime"},"/wakeup":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"起床（只对 7843；主持会被瞬移到 BusStop）","note":"⚠️ 只对 7843(farmhand)；对 7842 会把主持瞬移"},"/queue":{"method":"POST","params":[],"cat":"状态/快照","desc":"一次 HTTP 提交多条命令，主线程顺序执行（省往返、动作更连贯）","note":"body 是命令数组不是对象；主线程顺序执行"},"/key":{"method":"POST","params":["key","count","hold","nofocus"],"cat":"点击/按键/窗口","desc":"模拟按键（菜单操作备用）","note":"⚠️ escape/confirm 加 nofocus:true 可纯后台；字母/数字/F 键是真键盘，用户在用时禁发"},"/minigame_click":{"method":"POST","params":["x","y","action"],"cat":"点击/按键/窗口","desc":"赌场下注点击","note":""},"/minigame_state":{"method":"GET","params":[],"cat":"点击/按键/窗口","desc":"赌场老虎机/21 点状态（牌面/下注/结果）","note":""},"/focus":{"method":"GET","params":[],"cat":"点击/按键/窗口","desc":"把游戏窗口拉到前台（⚠️ 会抢焦点，用户在用时别调）","note":"⚠️ 抢用户前台，用户在用电脑时别调"},"/eat":{"method":"GET","params":[],"cat":"物品/背包/装备","desc":"吃当前手持食物（先 /select 再 /eat {}）","note":"吃\"当前手持\"——先 /select 再 /eat {}"},"/buffs":{"method":"GET","params":[],"cat":"状态/快照","desc":"当前 buff：displayName/source/msRemaining（食物、饮料、雕像祝福）","note":""},"/set_pause":{"method":"POST","params":["outOfFocus"],"cat":"时间/睡眠/菜单","desc":"设置\"失焦暂停\"开关（outOfFocus）","note":""},"/guard":{"method":"POST","params":["on","weapon"],"cat":"矿洞/战斗","desc":"每 tick 找 3×3 内的怪 → 转身 + 挥近战，不移动。源码明确：只服务 farmhand（7843），房主进程直接拒绝（\"这是房主进程…guard 只服务 AI 的 farmhand\"）；背包没近战武器会报错，绝不拿别的凑数","note":"⚠️ 只服务 farmhand(7843)，房主被拒；会把武器换到手上，钓鱼/浇水中别开"},"/warp":{"method":"POST","params":["location","x","y"],"cat":"移动/传送","desc":"瞬移（下一 tick 落地，要轮询确认）","note":"下一 tick 落地——发完必须轮询 location 确认再动作"},"/warp_into":{"method":"POST","params":["location","x","y","near"],"cat":"移动/传送","desc":"触发进门事件（进房子/进矿洞用）","note":"触发进门事件（进房子/矿洞用），比 /warp 多走流程"},"/warp_building":{"method":"POST","params":["bx","by","x","y","near"],"cat":"移动/传送","desc":"按建筑格找门进室内","note":""},"/walk_to":{"method":"POST","params":["location","x","y","allowWater","allowWarp"],"cat":"移动/传送","desc":"自带寻路走过去","note":""},"/position":{"method":"POST","params":["x","y","check_passable","check_connectivity"],"cat":"状态/快照","desc":"坐标 + 是否可走","note":""},"/pause":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"冻结游戏时间（与 /resume 成对）","note":"与 /resume 必须成对"},"/resume":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"恢复游戏时间","note":""},"/give":{"method":"POST","params":["id","count","upgrade"],"cat":"物品/背包/装备","desc":"造物品，只认限定 ID（(O)388 木头），名字不认","note":"只认限定 ID（(O)388 木头、(O)685 鱼饵），写名字会造出 Error Item"},"/drop":{"method":"POST","params":["name","count"],"cat":"物品/背包/装备","desc":"丢弃手上/指定名物品（count）","note":""},"/gift":{"method":"POST","params":["target","item"],"cat":"NPC/社交/任务","desc":"送礼给 NPC（target,item），返回好感变化","note":""},"/friendship":{"method":"GET","params":["npc"],"cat":"NPC/社交/任务","desc":"好感度: points/hearts/giftsThisWeek/giftsToday/known","note":""},"/money":{"method":"POST","params":["amount"],"cat":"状态/快照","desc":"加/减钱","note":""},"/refill":{"method":"GET","params":[],"cat":"农活/地面","desc":"水壶补满（不用跑池塘）","note":""},"/heal":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"满血满体力（免费，别滥用）","note":"免费满血满体力（调试口，别滥用）"},"/ripen":{"method":"GET","params":["radius"],"cat":"农活/地面","desc":"作物催熟（调试）","note":""},"/sell":{"method":"POST","params":["name","all"],"cat":"买卖","desc":"出货箱卖货（只认 Farm 地图、整叠卖）","note":"只认 Farm 地图、整叠卖；在店里用 /sell_to_shop"},"/sell_to_shop":{"method":"POST","params":["name","count"],"cat":"买卖","desc":"在当前所在商店卖，可指定数量（/sell 只认 Farm 且整叠卖）","note":"认当前所在商店、可指定数量（/sell 的补位）"},"/harvest":{"method":"GET","params":["radius"],"cat":"农活/地面","desc":"—（范围）","note":""},"/store":{"method":"POST","params":["x","y","name","count","keepTools","slot","quality"],"cat":"箱子/存储","desc":"存一件","note":""},"/store_all":{"method":"POST","params":["what","counts","target","default"],"cat":"箱子/存储","desc":"批量存（可指定\"只存这些\"）","note":"what/counts/target/default，批量存箱"},"/name_chest":{"method":"POST","params":["x","y","tag"],"cat":"箱子/存储","desc":"给箱子命名","note":""},"/chest_color":{"method":"POST","params":["x","y","color"],"cat":"箱子/存储","desc":"改箱子颜色","note":""},"/chest":{"method":"POST","params":["x","y"],"cat":"箱子/存储","desc":"看箱子内容","note":""},"/chest_open":{"method":"POST","params":["x","y"],"cat":"箱子/存储","desc":"打开箱子 UI","note":""},"/chest_take":{"method":"POST","params":["x","y","name","count","slot","quality"],"cat":"箱子/存储","desc":"x,y,(name 或 slot)[,count][,quality]","note":""},"/chest_take_list":{"method":"POST","params":["items"],"cat":"箱子/存储","desc":"一次取多种","note":"items 数组一次取多种"},"/scan_chests":{"method":"GET","params":[],"cat":"地图/地形","desc":"附近箱子列表","note":""},"/placechest":{"method":"POST","params":["x","y"],"cat":"箱子/存储","desc":"放箱子","note":""},"/fishbot":{"method":"POST","params":["action"],"cat":"钓鱼/水产","desc":"⚠️ 不带 action = toggle","note":"⚠️ 不带 action = toggle！用 {\"action\":\"status\"|\"on\"|\"off\"}"},"/menu":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"当前菜单结构","note":""},"/menu/click":{"method":"POST","params":["option","button","x","y","item","right","quantity","action","slot","category","real","animal","animal_name","move_mouse"],"cat":"时间/睡眠/菜单","desc":"option,button,x,y,item,right,quantity,action,slot,category,animal,move_mouse","note":""},"/menu/number":{"method":"POST","params":["value","confirm"],"cat":"时间/睡眠/菜单","desc":"数量输入菜单","note":""},"/menu/claim_swap":{"method":"POST","params":["replace"],"cat":"时间/睡眠/菜单","desc":"ItemGrabMenu 领取侧的\"用背包物品替换\"（宝箱满时换出）","note":""},"/menu_close":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"关菜单（POST 必须带 {}）","note":"POST 必须带 {}，空 body 411"},"/open_questlog":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"打开任务日志","note":""},"/forge_set":{"method":"POST","params":["left","right"],"cat":"制作/机器","desc":"锻造台放料","note":""},"/tailor_set":{"method":"POST","params":["left","right","action"],"cat":"制作/机器","desc":"缝纫机","note":""},"/order_board":{"method":"GET","params":["type"],"cat":"NPC/社交/任务","desc":"left:{questKey:\"Wizard\",name:\"奇特物质\"} right:{questKey:\"Demetrius2\",name:\"生态平衡\"}","note":""},"/dump_tile":{"method":"GET","params":["x","y"],"cat":"地图/地形","desc":"query x=&y=&location=","note":"query 参数（GET），不是 JSON body"},"/crop_seasons":{"method":"GET","params":[],"cat":"地图/地形","desc":"作物季节表","note":""},"/pool":{"method":"GET","params":["location"],"cat":"状态/快照","desc":"玩家杂项：是否游泳/浴场/ bathing clothes 等","note":""},"/tile_props":{"method":"GET","params":["scan","value","layer","x","y","location"],"cat":"地图/地形","desc":"单格 x,y[,location]；全图 scan=<属性>&value=&layer=Back","note":"query 参数（GET），不是 JSON body"},"/mine_rock":{"method":"GET","params":[],"cat":"矿洞/战斗","desc":"敲入口巨石","note":""},"/water":{"method":"GET","params":["x","y","radius"],"cat":"农活/地面","desc":"浇水（当前手持水壶对周围格子）","note":""},"/fish_areas":{"method":"GET","params":["location"],"cat":"钓鱼/水产","desc":"waterTiles:3013, fishableTiles:2501, spotsFound:793，spots:[{waterX,waterY,standX,standY}]（?truncated 前 200 条）","note":""},"/crab_pots":{"method":"GET","params":["location"],"cat":"钓鱼/水产","desc":"蟹笼列表","note":""},"/crab_retract":{"method":"POST","params":["x","y","location","normalize"],"cat":"钓鱼/水产","desc":"收蟹笼","note":""},"/profile":{"method":"GET","params":[],"cat":"状态/快照","desc":"五项技能等级（farming/fishing/foraging/mining/combat）","note":""},"/levelup_choose":{"method":"POST","params":["side","profession"],"cat":"NPC/社交/任务","desc":"技能升级选专精（升级菜单开着时）","note":""},"/click":{"method":"POST","params":["x","y","no_move","no_mouse"],"cat":"点击/按键/窗口","desc":"UI 点击","note":"⚠️ 物理鼠标语义需游戏前台；自动流程优先 /menu/click"},"/click_tile":{"method":"POST","params":["x","y"],"cat":"点击/按键/窗口","desc":"点地图格","note":"⚠️ 同 /click，物理点击"},"/drag":{"method":"POST","params":["hold"],"cat":"点击/按键/窗口","desc":"鼠标拖拽（UI 滑条/整理背包）","note":"⚠️ 真鼠标拖拽，需前台"},"/craft":{"method":"POST","params":["name","count"],"cat":"制作/机器","desc":"制造物品（name,count）","note":""},"/cook":{"method":"POST","params":["name","count"],"cat":"制作/机器","desc":"烹饪（必须在厨房灶台旁）","note":""},"/recipes":{"method":"GET","params":[],"cat":"制作/机器","desc":"已知配方 + 现在能不能做 + 缺什么","note":""},"/craft_recipes":{"method":"GET","params":[],"cat":"制作/机器","desc":"同上（制造专用）","note":""},"/process_geode":{"method":"POST","params":["type"],"cat":"制作/机器","desc":"砸一个晶洞","note":""},"/process_geode_batch":{"method":"GET","params":["count"],"cat":"制作/机器","desc":"批量砸","note":""},"/museum_donate":{"method":"GET","params":[],"cat":"博物馆","desc":"把背包里可捐物捐进博物馆","note":""},"/museum_debug":{"method":"GET","params":[],"cat":"博物馆","desc":"博物馆已捐清单 + 展台占位诊断","note":""},"/museum_tiles":{"method":"GET","params":[],"cat":"博物馆","desc":"配合 /museum_donate","note":""},"/museum_diag":{"method":"GET","params":[],"cat":"博物馆","desc":"博物馆捐赠口诊断（位置类型/能否捐）","note":""},"/quest_list":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"任务原始 dump（含 whoToGreet 等）","note":""},"/quest_progress":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"{title,description,currentCount,maxCount,complete}","note":""},"/qi_shop":{"method":"GET","params":["QiGemShop"],"cat":"买卖","desc":"齐先生商店货架 + 齐钻余额","note":""},"/qi_buy":{"method":"POST","params":["id","count","QiGemShop"],"cat":"买卖","desc":"用齐钻买","note":""},"/museum_remove":{"method":"GET","params":["id"],"cat":"博物馆","desc":"取下某件展品","note":""},"/clear_ground":{"method":"GET","params":["x","y"],"cat":"农活/地面","desc":"清地面杂物","note":""},"/debris":{"method":"GET","params":[],"cat":"农活/地面","desc":"当前地图掉落物列表","note":""},"/drop_item":{"method":"POST","params":["item","count"],"cat":"物品/背包/装备","desc":"按物品 id/名丢弃（item,count）","note":""},"/machines":{"method":"GET","params":[],"cat":"制作/机器","desc":"机器状态（status/minutesLeft/holding）","note":""},"/farm_report":{"method":"GET","params":[],"cat":"地图/地形","desc":"作物/动物/机器汇总","note":""},"/machine_load":{"method":"POST","params":["itemId","location","type","count"],"cat":"制作/机器","desc":"给机器投料（itemId,type[,count][,location]）","note":"itemId 用限定 ID"},"/machine_reqs":{"method":"POST","params":["type","x","y","location","item"],"cat":"制作/机器","desc":"该机器要什么料、够不够","note":""},"/animals":{"method":"GET","params":[],"cat":"牧场","desc":"动物列表（age/friendship/fullness）","note":""},"/scan":{"method":"GET","params":[],"cat":"地图/地形","desc":"当前地图的交互动作格（门/投放箱/机器/垃圾箱），带 action 字符串","note":""},"/petbowl":{"method":"GET","params":[],"cat":"牧场","desc":"宠物碗（是否已添水）","note":""},"/ladder":{"method":"GET","params":[],"cat":"矿洞/战斗","desc":"找梯子","note":""},"/bombs":{"method":"GET","params":[],"cat":"矿洞/战斗","desc":"本图已放置炸弹的格/类型/半径（bombRadius>0 的临时精灵）","note":"只列\"已点燃\"的炸弹（temporarySprites），背包里的不算"},"/silo":{"method":"GET","params":[],"cat":"牧场","desc":"干草存量/容量","note":""},"/mastery":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"精通经验/奖牌","note":""},"/special_items":{"method":"GET","params":[],"cat":"状态/快照","desc":"特殊物品/精通解锁","note":""},"/achievements":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"成就列表","note":""},"/carpenter":{"method":"GET","params":[],"cat":"买卖","desc":"罗宾建筑目录：可造建筑/造价/材料/已建","note":"materials 是 {id,amount} 无名字；affordable=钱+料都够"},"/mine_debug":{"method":"GET","params":[],"cat":"矿洞/战斗","desc":"矿洞调试信息","note":""},"/mine/elevator":{"method":"GET","params":[],"cat":"矿洞/战斗","desc":"矿洞电梯","note":"实测只 reset 不传送，下楼要踩梯子"},"/festival":{"method":"GET","params":[],"cat":"节日","desc":"当前节日状态","note":""},"/event_state":{"method":"GET","params":[],"cat":"状态/快照","desc":"节日/事件状态","note":""},"/festival_data":{"method":"GET","params":["season","day"],"cat":"节日","desc":"节日数据","note":""},"/egg_tiles":{"method":"GET","params":["map"],"cat":"节日","desc":"扫地图 Paths 层的 fest* 图块 = 彩蛋节彩蛋坐标","note":"1.6 节日地图名 Town-EggFestival/Town-EggFestival2（旧名 spring13 报 not found）；与游戏 eggHunt 同源=真彩蛋坐标"},"/festival/interact":{"method":"POST","params":[],"cat":"节日","desc":"节日内交互","note":""},"/festival/answer":{"method":"POST","params":[],"cat":"节日","desc":"节日问答/报名（冰雪节报名用 answer:0）","note":""},"/dance_invite":{"method":"POST","params":["target"],"cat":"NPC/社交/任务","desc":"花舞节邀舞伴；源码说明 NPC 得走自然流程（/interact 弹选项），此端点只收在线玩家","note":""},"/unlocks":{"method":"GET","params":[],"cat":"地图/地形","desc":"矿洞/巴士/下水道等解锁状态","note":""},"/gsq":{"method":"GET","params":["q"],"cat":"调试/截图","desc":"GameStateQuery 条件求值（q=条件串），调试专用","note":""},"/minecarts":{"method":"GET","params":[],"cat":"地图/地形","desc":"矿车网络：解锁条件 + 目的地","note":""},"/unlock_debug":{"method":"GET","params":[],"cat":"调试/截图","desc":"技能解锁状态","note":""},"/chat/push":{"method":"POST","params":["sender"],"cat":"说话/提示/信箱","desc":"备用（一般用 /chat）","note":""},"/chat/history":{"method":"GET","params":[],"cat":"说话/提示/信箱","desc":"游戏内聊天历史（最近 N 条）","note":""},"/mail":{"method":"GET","params":[],"cat":"说话/提示/信箱","desc":"信箱状态（has_mail/unread/received）","note":""},"/bundles":{"method":"GET","params":[],"cat":"NPC/社交/任务","desc":"stars/areas_complete/areas_total + 每包 bundles[]","note":""},"/progress":{"method":"GET","params":[],"cat":"状态/快照","desc":"社区中心各区域告示位置","note":""},"/nuts":{"method":"GET","params":["location"],"cat":"状态/快照","desc":"姜岛金核桃数量/剩余","note":""},"/hud":{"method":"POST","params":["message"],"cat":"说话/提示/信箱","desc":"屏幕 HUD 提示","note":"中文必须 node fetch 发（curl 会 GBK 乱码）"},"/buy_animal":{"method":"POST","params":["animal_type","name","building"],"cat":"牧场","desc":"买动物","note":""},"/sprinklers":{"method":"GET","params":[],"cat":"农活/地面","desc":"{count,sprinklers:[{x,y,name}]}","note":""},"/till_area":{"method":"POST","params":[],"cat":"农活/地面","desc":"范围锄地","note":""},"/tool_area":{"method":"POST","params":["operation"],"cat":"物品/背包/装备","desc":"范围作业（浇水/锄地/收割一条龙）","note":"范围作业（浇水/锄地/收割），自动流程首选"},"/dig_spot":{"method":"POST","params":["x","y"],"cat":"农活/地面","desc":"挖蚯蚓格（Artifact Spot）","note":""},"/toggle_doors":{"method":"POST","params":["building","doorX","doorY"],"cat":"地图/地形","desc":"开关畜棚/鸡舍门（放动物出去吃草）","note":""},"/crawl_bed":{"method":"POST","params":["action","player","bed_x","bed_y","msg","quiet"],"cat":"多人","desc":"action(locate/beds/sleep) player","note":"参数是 player 不是 who；action locate|beds|sleep（sleep 有副作用）"},"/cancel_sleep":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"取消 ready（只解 UI，不解床位，还要 /wakeup）","note":"只解 UI 不解床位，还要 /wakeup 才真正起来"},"/settlement_confirm":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"点掉结算页（多页，要连点）","note":"1.6 结算页是多页，要连点到菜单消失"},"/ready_state":{"method":"GET","params":[],"cat":"时间/睡眠/菜单","desc":"睡觉 ready 状态","note":""},"/screenshot":{"method":"GET","params":[],"cat":"调试/截图","desc":"截图（base64 落盘）","note":""},"/screenshot_portrait":{"method":"GET","params":[],"cat":"调试/截图","desc":"头像截图","note":""},"/zoom":{"method":"GET","params":["level"],"cat":"点击/按键/窗口","desc":"当前缩放","note":""},"/resolution":{"method":"GET","params":["w","h"],"cat":"点击/按键/窗口","desc":"改分辨率","note":"⚠️ 会改游戏窗口分辨率"}};

export function extra(port = 7842) {
  const get = (p, timeout) => call(port, p, { timeout });
  const post = (p, body, timeout) => call(port, p, { method: 'POST', body, timeout });
  return {
    port,
    state: (p = {}) => call(port, '/state'),
    raw: { get, post },

  // ==================== 状态/快照 ====================
  /** GET `/state` —— 全量状态（player/location/time/inventory/otherPlayers/fishing） 巡检第一入口：player/location/time/inventory/otherPlayers/fishing
   *  入参: consume_events,light（query） */
  state: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/state' + (qq ? '?' + qq : '')); },
  /** GET `/status` —— 桥版本、端口、worldReady、caps
   *  入参: — */
  status: (p = {}) => call(port, '/status'),
  /** POST `/position` —— 坐标 + 是否可走
   *  入参: x,y,check_passable,check_connectivity */
  position: (p = {}) => call(port, '/position', { method: 'POST', body: p }),
  /** POST `/money` —— 加/减钱
   *  入参: amount */
  money: (p = {}) => call(port, '/money', { method: 'POST', body: p }),
  /** GET `/profile` —— 五项技能等级（farming/fishing/foraging/mining/combat）
   *  入参: — */
  profile: (p = {}) => call(port, '/profile'),
  /** GET `/special_items` —— 特殊物品/精通解锁
   *  入参: — */
  specialItems: (p = {}) => call(port, '/special_items'),
  /** GET `/pool` —— 玩家杂项：是否游泳/浴场/ bathing clothes 等
   *  入参: location（query） */
  pool: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/pool' + (qq ? '?' + qq : '')); },
  /** GET `/nuts` —— 姜岛金核桃数量/剩余
   *  入参: location（query） */
  nuts: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/nuts' + (qq ? '?' + qq : '')); },
  /** GET `/event_state` —— 节日/事件状态
   *  入参: — */
  eventState: (p = {}) => call(port, '/event_state'),
  /** GET `/progress` —— 社区中心各区域告示位置
   *  入参: — */
  progress: (p = {}) => call(port, '/progress'),
  /** GET `/alerts` —— 事件流（hud 文本/菜单/升级/晕倒…最近 100 条），`?peek=true` 只看不取 ?peek=true 只读不消费
   *  入参: peek（query） */
  alerts: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/alerts' + (qq ? '?' + qq : '')); },
  /** GET `/buffs` —— 当前 buff：displayName/source/msRemaining（食物、饮料、雕像祝福）
   *  入参: — */
  buffs: (p = {}) => call(port, '/buffs'),
  /** POST `/queue` —— 一次 HTTP 提交多条命令，主线程顺序执行（省往返、动作更连贯） body 是命令数组不是对象；主线程顺序执行
   *  入参: — */
  queue: (cmds = []) => call(port, '/queue', { method: 'POST', body: cmds }),

  // ==================== 地图/地形 ====================
  /** GET `/map` —— 当前地图元信息
   *  入参: — */
  map: (p = {}) => call(port, '/map'),
  /** GET `/warps` —— 全图传送点清单（我们做 63 地标表用的就是它）
   *  入参: — */
  warps: (p = {}) => call(port, '/warps'),
  /** GET `/surroundings` —— 周围格（terrain/object/crop），矩形上限 4096 格，超了报错不静默截断 矩形上限 4096 格，超了直接报错不截断
   *  入参: radius（query） */
  surroundings: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/surroundings' + (qq ? '?' + qq : '')); },
  /** GET `/tile_props` —— 单格 x,y[,location]；全图 scan=<属性>&value=&layer=Back query 参数（GET），不是 JSON body
   *  入参: scan,value,layer,x,y,location（query） */
  tileProps: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/tile_props' + (qq ? '?' + qq : '')); },
  /** POST `/passable` —— 单格可走性
   *  入参: x,y,allowWater,location */
  passable: (p = {}) => call(port, '/passable', { method: 'POST', body: p }),
  /** GET `/passable_rect` —— 矩形可走图（一次 96×96） 一次最多 96×96，大图分块
   *  入参: location（query） */
  passableRect: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/passable_rect' + (qq ? '?' + qq : '')); },
  /** GET `/dump_tile` —— query x=&y=&location= query 参数（GET），不是 JSON body
   *  入参: x,y（query） */
  dumpTile: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/dump_tile' + (qq ? '?' + qq : '')); },
  /** GET `/scan` —— 当前地图的交互动作格（门/投放箱/机器/垃圾箱），带 action 字符串
   *  入参: — */
  scan: (p = {}) => call(port, '/scan'),
  /** GET `/scan_chests` —— 附近箱子列表
   *  入参: — */
  scanChests: (p = {}) => call(port, '/scan_chests'),
  /** GET `/farm_report` —— 作物/动物/机器汇总
   *  入参: — */
  farmReport: (p = {}) => call(port, '/farm_report'),
  /** GET `/crop_seasons` —— 作物季节表
   *  入参: — */
  cropSeasons: (p = {}) => call(port, '/crop_seasons'),
  /** GET `/farm_buildings` —— 农场建筑清单（含坐标/类型）
   *  入参: — */
  farmBuildings: (p = {}) => call(port, '/farm_buildings'),
  /** GET `/doors` —— 当前图门列表 + interiorDoors 开关状态
   *  入参: location（query） */
  doors: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/doors' + (qq ? '?' + qq : '')); },
  /** POST `/toggle_doors` —— 开关畜棚/鸡舍门（放动物出去吃草）
   *  入参: building,doorX,doorY */
  toggleDoors: (p = {}) => call(port, '/toggle_doors', { method: 'POST', body: p }),
  /** GET `/furniture` —— 当前图家具清单（类型/尺寸/是否储物/是否鱼缸）
   *  入参: — */
  furniture: (p = {}) => call(port, '/furniture'),
  /** GET `/decor` —— 铺地板/墙纸（只认房间不认格，限室内）
   *  入参: — */
  decor: (p = {}) => call(port, '/decor'),
  /** POST `/furniture_pickup` —— 拾起家具
   *  入参: x,y */
  furniturePickup: (p = {}) => call(port, '/furniture_pickup', { method: 'POST', body: p }),
  /** GET `/tank` —— 鱼缸内容（鱼/帽子/容量）
   *  入参: x,y（query） */
  tank: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/tank' + (qq ? '?' + qq : '')); },
  /** GET `/unlocks` —— 矿洞/巴士/下水道等解锁状态
   *  入参: — */
  unlocks: (p = {}) => call(port, '/unlocks'),
  /** GET `/minecarts` —— 矿车网络：解锁条件 + 目的地
   *  入参: — */
  minecarts: (p = {}) => call(port, '/minecarts'),

  // ==================== 移动/传送 ====================
  /** POST `/warp` —— 瞬移（下一 tick 落地，要轮询确认） 下一 tick 落地——发完必须轮询 location 确认再动作
   *  入参: location,x,y */
  warp: (p = {}) => call(port, '/warp', { method: 'POST', body: p }),
  /** POST `/warp_building` —— 按建筑格找门进室内
   *  入参: bx,by,x,y,near */
  warpBuilding: (p = {}) => call(port, '/warp_building', { method: 'POST', body: p }),
  /** POST `/warp_into` —— 触发进门事件（进房子/进矿洞用） 触发进门事件（进房子/矿洞用），比 /warp 多走流程
   *  入参: location,x,y,near */
  warpInto: (p = {}) => call(port, '/warp_into', { method: 'POST', body: p }),
  /** POST `/walk_to` —— 自带寻路走过去
   *  入参: location,x,y,allowWater,allowWarp */
  walkTo: (p = {}) => call(port, '/walk_to', { method: 'POST', body: p }),
  /** POST `/move` —— 单步移动
   *  入参: x,y */
  move: (p = {}) => call(port, '/move', { method: 'POST', body: p }),
  /** POST `/face` —— direction 0上1右2下3左
   *  入参: direction */
  face: (p = {}) => call(port, '/face', { method: 'POST', body: p }),
  /** GET `/stop` —— 停住当前移动
   *  入参: — */
  stop: (p = {}) => call(port, '/stop'),
  /** GET `/stand` —— 从坐姿起身
   *  入参: — */
  stand: (p = {}) => call(port, '/stand'),
  /** GET `/sittable` —— query radius(0-40,默认7) face 是 bool，朝向在 direction；free 是剩余座位数
   *  入参: radius（query） */
  sittable: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/sittable' + (qq ? '?' + qq : '')); },
  /** POST `/emote` —— emote 或 id
   *  入参: emote,id */
  emote: (p = {}) => call(port, '/emote', { method: 'POST', body: p }),

  // ==================== 点击/按键/窗口 ====================
  /** POST `/key` —— 模拟按键（菜单操作备用） ⚠️ escape/confirm 加 nofocus:true 可纯后台；字母/数字/F 键是真键盘，用户在用时禁发
   *  入参: key,count,hold,nofocus */
  key: (p = {}) => call(port, '/key', { method: 'POST', body: p }),
  /** POST `/click` —— UI 点击 ⚠️ 物理鼠标语义需游戏前台；自动流程优先 /menu/click
   *  入参: x,y,no_move,no_mouse */
  click: (p = {}) => call(port, '/click', { method: 'POST', body: p }),
  /** POST `/click_tile` —— 点地图格 ⚠️ 同 /click，物理点击
   *  入参: x,y */
  clickTile: (p = {}) => call(port, '/click_tile', { method: 'POST', body: p }),
  /** POST `/drag` —— 鼠标拖拽（UI 滑条/整理背包） ⚠️ 真鼠标拖拽，需前台
   *  入参: hold */
  drag: (p = {}) => call(port, '/drag', { method: 'POST', body: p }),
  /** GET `/focus` —— 把游戏窗口拉到前台（⚠️ 会抢焦点，用户在用时别调） ⚠️ 抢用户前台，用户在用电脑时别调
   *  入参: — */
  focus: (p = {}) => call(port, '/focus'),
  /** GET `/zoom` —— 当前缩放
   *  入参: level（query） */
  zoom: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/zoom' + (qq ? '?' + qq : '')); },
  /** GET `/resolution` —— 改分辨率 ⚠️ 会改游戏窗口分辨率
   *  入参: w,h（query） */
  resolution: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/resolution' + (qq ? '?' + qq : '')); },
  /** POST `/minigame_click` —— 赌场下注点击
   *  入参: x,y,action */
  minigameClick: (p = {}) => call(port, '/minigame_click', { method: 'POST', body: p }),
  /** GET `/minigame_state` —— 赌场老虎机/21 点状态（牌面/下注/结果）
   *  入参: — */
  minigameState: (p = {}) => call(port, '/minigame_state'),

  // ==================== 物品/背包/装备 ====================
  /** POST `/select` —— 选中背包物品（支持品质 0-4）
   *  入参: name,quality */
  select: (p = {}) => call(port, '/select', { method: 'POST', body: p }),
  /** POST `/use` —— 对面朝格使用手上物品
   *  入参: force,mode,x,y */
  use: (p = {}) => call(port, '/use', { method: 'POST', body: p }),
  /** POST `/interact` —— 对面朝格/NPC 交互（对话/机器/门），可带 x,y
   *  入参: x,y */
  interact: (p = {}) => call(port, '/interact', { method: 'POST', body: p }),
  /** POST `/tool` —— 精确控工具（蓄力/特殊动作）
   *  入参: name,power,special */
  tool: (p = {}) => call(port, '/tool', { method: 'POST', body: p }),
  /** POST `/tool_area` —— 范围作业（浇水/锄地/收割一条龙） 范围作业（浇水/锄地/收割），自动流程首选
   *  入参: operation */
  toolArea: (p = {}) => call(port, '/tool_area', { method: 'POST', body: p }),
  /** POST `/drop` —— 丢弃手上/指定名物品（count）
   *  入参: name,count */
  drop: (p = {}) => call(port, '/drop', { method: 'POST', body: p }),
  /** POST `/drop_item` —— 按物品 id/名丢弃（item,count）
   *  入参: item,count */
  dropItem: (p = {}) => call(port, '/drop_item', { method: 'POST', body: p }),
  /** POST `/give` —— 造物品，只认限定 ID（(O)388 木头），名字不认 只认限定 ID（(O)388 木头、(O)685 鱼饵），写名字会造出 Error Item
   *  入参: id,count,upgrade */
  give: (p = {}) => call(port, '/give', { method: 'POST', body: p }),
  /** POST `/equip` —— 穿装备 / 脱某槽（boots/hat/shirt/pants/ring）
   *  入参: name,slot,hand */
  equip: (p = {}) => call(port, '/equip', { method: 'POST', body: p }),
  /** GET `/worn` —— 当前穿戴（帽/衣/裤/靴/左右戒指/饰品）
   *  入参: — */
  worn: (p = {}) => call(port, '/worn'),
  /** GET `/rings` —— 戒指栏
   *  入参: — */
  rings: (p = {}) => call(port, '/rings'),
  /** POST `/ring` —— 装备戒指到指定槽（slot）
   *  入参: name,slot */
  ring: (p = {}) => call(port, '/ring', { method: 'POST', body: p }),
  /** GET `/trinkets` —— 饰品栏
   *  入参: — */
  trinkets: (p = {}) => call(port, '/trinkets'),
  /** POST `/trinket` —— 装备饰品栏
   *  入参: name */
  trinket: (p = {}) => call(port, '/trinket', { method: 'POST', body: p }),
  /** GET `/eat` —— 吃当前手持食物（先 /select 再 /eat {}） 吃"当前手持"——先 /select 再 /eat {}
   *  入参: — */
  eat: (p = {}) => call(port, '/eat'),

  // ==================== 钓鱼/水产 ====================
  /** GET `/fish_areas` —— waterTiles:3013, fishableTiles:2501, spotsFound:793，spots:[{waterX,waterY,standX,standY}]（?truncated 前 200 条）
   *  入参: location（query） */
  fishAreas: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/fish_areas' + (qq ? '?' + qq : '')); },
  /** POST `/fishbot` —— ⚠️ 不带 action = toggle ⚠️ 不带 action = toggle！用 {"action":"status"|"on"|"off"}
   *  入参: action */
  fishbot: (p = {}) => call(port, '/fishbot', { method: 'POST', body: p }),
  /** POST `/rod` —— rodInfo:{name,upgrade,inHand,bait,baitStack,tackleInBag} action: show|bait|tackle|clear；饵 ID (O)685
   *  入参: action,item */
  rod: (p = {}) => call(port, '/rod', { method: 'POST', body: p }),
  /** POST `/fish_pond` —— x,y,action(钓)
   *  入参: x,y,action */
  fishPond: (p = {}) => call(port, '/fish_pond', { method: 'POST', body: p }),
  /** GET `/crab_pots` —— 蟹笼列表
   *  入参: location（query） */
  crabPots: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/crab_pots' + (qq ? '?' + qq : '')); },
  /** POST `/crab_retract` —— 收蟹笼
   *  入参: x,y,location,normalize */
  crabRetract: (p = {}) => call(port, '/crab_retract', { method: 'POST', body: p }),
  /** POST `/pan` —— 淘金盘（需社区中心鱼缸完成+水边闪光）
   *  入参: — */
  pan: (p = {}) => call(port, '/pan', { method: 'POST', body: p }),

  // ==================== 农活/地面 ====================
  /** GET `/harvest` —— —（范围）
   *  入参: radius（query） */
  harvest: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/harvest' + (qq ? '?' + qq : '')); },
  /** GET `/water` —— 浇水（当前手持水壶对周围格子）
   *  入参: x,y,radius（query） */
  water: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/water' + (qq ? '?' + qq : '')); },
  /** GET `/refill` —— 水壶补满（不用跑池塘）
   *  入参: — */
  refill: (p = {}) => call(port, '/refill'),
  /** POST `/till_area` —— 范围锄地
   *  入参: — */
  tillArea: (p = {}) => call(port, '/till_area', { method: 'POST', body: p }),
  /** GET `/ripen` —— 作物催熟（调试）
   *  入参: radius（query） */
  ripen: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/ripen' + (qq ? '?' + qq : '')); },
  /** GET `/clear_ground` —— 清地面杂物
   *  入参: x,y（query） */
  clearGround: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/clear_ground' + (qq ? '?' + qq : '')); },
  /** GET `/debris` —— 当前地图掉落物列表
   *  入参: — */
  debris: (p = {}) => call(port, '/debris'),
  /** POST `/dig_spot` —— 挖蚯蚓格（Artifact Spot）
   *  入参: x,y */
  digSpot: (p = {}) => call(port, '/dig_spot', { method: 'POST', body: p }),
  /** GET `/sprinklers` —— {count,sprinklers:[{x,y,name}]}
   *  入参: — */
  sprinklers: (p = {}) => call(port, '/sprinklers'),

  // ==================== 制作/机器 ====================
  /** GET `/machines` —— 机器状态（status/minutesLeft/holding）
   *  入参: — */
  machines: (p = {}) => call(port, '/machines'),
  /** POST `/machine_load` —— 给机器投料（itemId,type[,count][,location]） itemId 用限定 ID
   *  入参: itemId,location,type,count */
  machineLoad: (p = {}) => call(port, '/machine_load', { method: 'POST', body: p }),
  /** POST `/machine_reqs` —— 该机器要什么料、够不够
   *  入参: type,x,y,location,item */
  machineReqs: (p = {}) => call(port, '/machine_reqs', { method: 'POST', body: p }),
  /** POST `/craft` —— 制造物品（name,count）
   *  入参: name,count */
  craft: (p = {}) => call(port, '/craft', { method: 'POST', body: p }),
  /** GET `/craft_recipes` —— 同上（制造专用）
   *  入参: — */
  craftRecipes: (p = {}) => call(port, '/craft_recipes'),
  /** GET `/recipes` —— 已知配方 + 现在能不能做 + 缺什么
   *  入参: — */
  recipes: (p = {}) => call(port, '/recipes'),
  /** POST `/cook` —— 烹饪（必须在厨房灶台旁）
   *  入参: name,count */
  cook: (p = {}) => call(port, '/cook', { method: 'POST', body: p }),
  /** POST `/process_geode` —— 砸一个晶洞
   *  入参: type */
  processGeode: (p = {}) => call(port, '/process_geode', { method: 'POST', body: p }),
  /** GET `/process_geode_batch` —— 批量砸
   *  入参: count（query） */
  processGeodeBatch: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/process_geode_batch' + (qq ? '?' + qq : '')); },
  /** POST `/forge_set` —— 锻造台放料
   *  入参: left,right */
  forgeSet: (p = {}) => call(port, '/forge_set', { method: 'POST', body: p }),
  /** POST `/tailor_set` —— 缝纫机
   *  入参: left,right,action */
  tailorSet: (p = {}) => call(port, '/tailor_set', { method: 'POST', body: p }),

  // ==================== 箱子/存储 ====================
  /** POST `/chest` —— 看箱子内容
   *  入参: x,y */
  chest: (p = {}) => call(port, '/chest', { method: 'POST', body: p }),
  /** POST `/chest_open` —— 打开箱子 UI
   *  入参: x,y */
  chestOpen: (p = {}) => call(port, '/chest_open', { method: 'POST', body: p }),
  /** POST `/chest_take` —— x,y,(name 或 slot)[,count][,quality]
   *  入参: x,y,name,count,slot,quality */
  chestTake: (p = {}) => call(port, '/chest_take', { method: 'POST', body: p }),
  /** POST `/chest_take_list` —— 一次取多种 items 数组一次取多种
   *  入参: items */
  chestTakeList: (p = {}) => call(port, '/chest_take_list', { method: 'POST', body: p }),
  /** POST `/store` —— 存一件
   *  入参: x,y,name,count,keepTools,slot,quality */
  store: (p = {}) => call(port, '/store', { method: 'POST', body: p }),
  /** POST `/store_all` —— 批量存（可指定"只存这些"） what/counts/target/default，批量存箱
   *  入参: what,counts,target,default */
  storeAll: (p = {}) => call(port, '/store_all', { method: 'POST', body: p }),
  /** POST `/placechest` —— 放箱子
   *  入参: x,y */
  placechest: (p = {}) => call(port, '/placechest', { method: 'POST', body: p }),
  /** POST `/name_chest` —— 给箱子命名
   *  入参: x,y,tag */
  nameChest: (p = {}) => call(port, '/name_chest', { method: 'POST', body: p }),
  /** POST `/chest_color` —— 改箱子颜色
   *  入参: x,y,color */
  chestColor: (p = {}) => call(port, '/chest_color', { method: 'POST', body: p }),

  // ==================== 牧场 ====================
  /** GET `/animals` —— 动物列表（age/friendship/fullness）
   *  入参: — */
  animals: (p = {}) => call(port, '/animals'),
  /** POST `/buy_animal` —— 买动物
   *  入参: animal_type,name,building */
  buyAnimal: (p = {}) => call(port, '/buy_animal', { method: 'POST', body: p }),
  /** GET `/petbowl` —— 宠物碗（是否已添水）
   *  入参: — */
  petbowl: (p = {}) => call(port, '/petbowl'),
  /** GET `/silo` —— 干草存量/容量
   *  入参: — */
  silo: (p = {}) => call(port, '/silo'),

  // ==================== NPC/社交/任务 ====================
  /** GET `/find_npc` —— NPC 位置/是否睡着（实测 Abigail 在 SeedShop）
   *  入参: name（query） */
  findNpc: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/find_npc' + (qq ? '?' + qq : '')); },
  /** GET `/friendship` —— 好感度: points/hearts/giftsThisWeek/giftsToday/known
   *  入参: npc（query） */
  friendship: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/friendship' + (qq ? '?' + qq : '')); },
  /** POST `/gift` —— 送礼给 NPC（target,item），返回好感变化
   *  入参: target,item */
  gift: (p = {}) => call(port, '/gift', { method: 'POST', body: p }),
  /** GET `/quest_list` —— 任务原始 dump（含 whoToGreet 等）
   *  入参: — */
  questList: (p = {}) => call(port, '/quest_list'),
  /** GET `/quest_progress` —— {title,description,currentCount,maxCount,complete}
   *  入参: — */
  questProgress: (p = {}) => call(port, '/quest_progress'),
  /** GET `/open_questlog` —— 打开任务日志
   *  入参: — */
  openQuestlog: (p = {}) => call(port, '/open_questlog'),
  /** GET `/order_board` —— left:{questKey:"Wizard",name:"奇特物质"} right:{questKey:"Demetrius2",name:"生态平衡"}
   *  入参: type（query） */
  orderBoard: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/order_board' + (qq ? '?' + qq : '')); },
  /** GET `/bundles` —— stars/areas_complete/areas_total + 每包 bundles[]
   *  入参: — */
  bundles: (p = {}) => call(port, '/bundles'),
  /** POST `/levelup_choose` —— 技能升级选专精（升级菜单开着时）
   *  入参: side,profession */
  levelupChoose: (p = {}) => call(port, '/levelup_choose', { method: 'POST', body: p }),
  /** POST `/dance_invite` —— 花舞节邀舞伴；源码说明 NPC 得走自然流程（/interact 弹选项），此端点只收在线玩家
   *  入参: target */
  danceInvite: (p = {}) => call(port, '/dance_invite', { method: 'POST', body: p }),
  /** GET `/mastery` —— 精通经验/奖牌
   *  入参: — */
  mastery: (p = {}) => call(port, '/mastery'),
  /** GET `/achievements` —— 成就列表
   *  入参: — */
  achievements: (p = {}) => call(port, '/achievements'),

  // ==================== 说话/提示/信箱 ====================
  /** POST `/hud` —— 屏幕 HUD 提示 中文必须 node fetch 发（curl 会 GBK 乱码）
   *  入参: message */
  hud: (p = {}) => call(port, '/hud', { method: 'POST', body: p }),
  /** POST `/chat` —— 游戏内聊天 中文必须 node fetch 发（curl 会 GBK 乱码）
   *  入参: message,color,notice */
  chat: (p = {}) => call(port, '/chat', { method: 'POST', body: p }),
  /** GET `/chat/history` —— 游戏内聊天历史（最近 N 条）
   *  入参: — */
  chatHistory: (p = {}) => call(port, '/chat/history'),
  /** POST `/chat/push` —— 备用（一般用 /chat）
   *  入参: sender */
  chatPush: (p = {}) => call(port, '/chat/push', { method: 'POST', body: p }),
  /** GET `/mail` —— 信箱状态（has_mail/unread/received）
   *  入参: — */
  mail: (p = {}) => call(port, '/mail'),

  // ==================== 节日 ====================
  /** GET `/festival` —— 当前节日状态
   *  入参: — */
  festival: (p = {}) => call(port, '/festival'),
  /** GET `/festival_data` —— 节日数据
   *  入参: season,day（query） */
  festivalData: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/festival_data' + (qq ? '?' + qq : '')); },
  /** POST `/festival/interact` —— 节日内交互
   *  入参: — */
  festivalInteract: (p = {}) => call(port, '/festival/interact', { method: 'POST', body: p }),
  /** POST `/festival/answer` —— 节日问答/报名（冰雪节报名用 answer:0）
   *  入参: — */
  festivalAnswer: (p = {}) => call(port, '/festival/answer', { method: 'POST', body: p }),
  /** GET `/egg_tiles` —— 扫地图 Paths 层的 fest* 图块 = 彩蛋节彩蛋坐标 1.6 节日地图名 Town-EggFestival/Town-EggFestival2（旧名 spring13 报 not found）；与游戏 eggHunt 同源=真彩蛋坐标
   *  入参: map（query） */
  eggTiles: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/egg_tiles' + (qq ? '?' + qq : '')); },

  // ==================== 矿洞/战斗 ====================
  /** GET `/mine/elevator` —— 矿洞电梯 实测只 reset 不传送，下楼要踩梯子
   *  入参: — */
  mineElevator: (p = {}) => call(port, '/mine/elevator'),
  /** GET `/ladder` —— 找梯子
   *  入参: — */
  ladder: (p = {}) => call(port, '/ladder'),
  /** GET `/mine_rock` —— 敲入口巨石
   *  入参: — */
  mineRock: (p = {}) => call(port, '/mine_rock'),
  /** GET `/mine_debug` —— 矿洞调试信息
   *  入参: — */
  mineDebug: (p = {}) => call(port, '/mine_debug'),
  /** POST `/guard` —— 每 tick 找 3×3 内的怪 → 转身 + 挥近战，不移动。源码明确：只服务 farmhand（7843），房主进程直接拒绝（"这是房主进程…guard 只服务 AI 的 farmhand"）；背包没近战武器会报错，绝不拿别的凑数 ⚠️ 只服务 farmhand(7843)，房主被拒；会把武器换到手上，钓鱼/浇水中别开
   *  入参: on,weapon */
  guard: (p = {}) => call(port, '/guard', { method: 'POST', body: p }),
  /** GET `/bombs` —— 本图已放置炸弹的格/类型/半径（bombRadius>0 的临时精灵） 只列"已点燃"的炸弹（temporarySprites），背包里的不算
   *  入参: — */
  bombs: (p = {}) => call(port, '/bombs'),

  // ==================== 时间/睡眠/菜单 ====================
  /** POST `/sleep` —— 上床（返回 ok ≠ 写盘） 返回 ok ≠ 写盘！验证只认存档文件 mtime
   *  入参: stay */
  sleep: (p = {}) => call(port, '/sleep', { method: 'POST', body: p }),
  /** GET `/wakeup` —— 起床（只对 7843；主持会被瞬移到 BusStop） ⚠️ 只对 7843(farmhand)；对 7842 会把主持瞬移
   *  入参: — */
  wakeup: (p = {}) => call(port, '/wakeup'),
  /** GET `/cancel_sleep` —— 取消 ready（只解 UI，不解床位，还要 /wakeup） 只解 UI 不解床位，还要 /wakeup 才真正起来
   *  入参: — */
  cancelSleep: (p = {}) => call(port, '/cancel_sleep'),
  /** GET `/ready_state` —— 睡觉 ready 状态
   *  入参: — */
  readyState: (p = {}) => call(port, '/ready_state'),
  /** GET `/pause` —— 冻结游戏时间（与 /resume 成对） 与 /resume 必须成对
   *  入参: — */
  pause: (p = {}) => call(port, '/pause'),
  /** GET `/resume` —— 恢复游戏时间
   *  入参: — */
  resume: (p = {}) => call(port, '/resume'),
  /** POST `/set_pause` —— 设置"失焦暂停"开关（outOfFocus）
   *  入参: outOfFocus */
  setPause: (p = {}) => call(port, '/set_pause', { method: 'POST', body: p }),
  /** GET `/settlement_confirm` —— 点掉结算页（多页，要连点） 1.6 结算页是多页，要连点到菜单消失
   *  入参: — */
  settlementConfirm: (p = {}) => call(port, '/settlement_confirm'),
  /** GET `/menu` —— 当前菜单结构
   *  入参: — */
  menu: (p = {}) => call(port, '/menu'),
  /** GET `/menu_close` —— 关菜单（POST 必须带 {}） POST 必须带 {}，空 body 411
   *  入参: — */
  menuClose: (p = {}) => call(port, '/menu_close'),
  /** POST `/menu/click` —— option,button,x,y,item,right,quantity,action,slot,category,animal,move_mouse
   *  入参: option,button,x,y,item,right,quantity,action,slot,category,real,animal,animal_name,move_mouse */
  menuClick: (p = {}) => call(port, '/menu/click', { method: 'POST', body: p }),
  /** POST `/menu/number` —— 数量输入菜单
   *  入参: value,confirm */
  menuNumber: (p = {}) => call(port, '/menu/number', { method: 'POST', body: p }),
  /** POST `/menu/claim_swap` —— ItemGrabMenu 领取侧的"用背包物品替换"（宝箱满时换出）
   *  入参: replace */
  menuClaimSwap: (p = {}) => call(port, '/menu/claim_swap', { method: 'POST', body: p }),
  /** GET `/heal` —— 满血满体力（免费，别滥用） 免费满血满体力（调试口，别滥用）
   *  入参: — */
  heal: (p = {}) => call(port, '/heal'),

  // ==================== 买卖 ====================
  /** POST `/buy` —— 在当前商店买东西（quantity/price 可选）
   *  入参: id,quantity,price */
  buy: (p = {}) => call(port, '/buy', { method: 'POST', body: p }),
  /** POST `/sell` —— 出货箱卖货（只认 Farm 地图、整叠卖） 只认 Farm 地图、整叠卖；在店里用 /sell_to_shop
   *  入参: name,all */
  sell: (p = {}) => call(port, '/sell', { method: 'POST', body: p }),
  /** POST `/sell_to_shop` —— 在当前所在商店卖，可指定数量（/sell 只认 Farm 且整叠卖） 认当前所在商店、可指定数量（/sell 的补位）
   *  入参: name,count */
  sellToShop: (p = {}) => call(port, '/sell_to_shop', { method: 'POST', body: p }),
  /** GET `/qi_shop` —— 齐先生商店货架 + 齐钻余额
   *  入参: QiGemShop */
  qiShop: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/qi_shop' + (qq ? '?' + qq : '')); },
  /** POST `/qi_buy` —— 用齐钻买
   *  入参: id,count,QiGemShop */
  qiBuy: (p = {}) => call(port, '/qi_buy', { method: 'POST', body: p }),
  /** GET `/carpenter` —— 罗宾建筑目录：可造建筑/造价/材料/已建 materials 是 {id,amount} 无名字；affordable=钱+料都够
   *  入参: — */
  carpenter: (p = {}) => call(port, '/carpenter'),

  // ==================== 博物馆 ====================
  /** GET `/museum_donate` —— 把背包里可捐物捐进博物馆
   *  入参: — */
  museumDonate: (p = {}) => call(port, '/museum_donate'),
  /** GET `/museum_remove` —— 取下某件展品
   *  入参: id（query） */
  museumRemove: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/museum_remove' + (qq ? '?' + qq : '')); },
  /** GET `/museum_tiles` —— 配合 /museum_donate
   *  入参: — */
  museumTiles: (p = {}) => call(port, '/museum_tiles'),
  /** GET `/museum_diag` —— 博物馆捐赠口诊断（位置类型/能否捐）
   *  入参: — */
  museumDiag: (p = {}) => call(port, '/museum_diag'),
  /** GET `/museum_debug` —— 博物馆已捐清单 + 展台占位诊断
   *  入参: — */
  museumDebug: (p = {}) => call(port, '/museum_debug'),

  // ==================== 外观 ====================
  /** POST `/appearance` —— 改外观。⚠️ 源码中文警告：只能在创建角色/幻觉神龛的捏脸页开着时调；菜单外直调会写覆盖值，导致之后换衣服被覆盖（游戏错乱） ⚠️ 只能在捏脸菜单开着时调；菜单外直调会写覆盖值导致换衣服错乱
   *  入参: hair,hairColor,skin,shirt,pants,acc,eyeColor,pantsColor,hat */
  appearance: (p = {}) => call(port, '/appearance', { method: 'POST', body: p }),
  /** GET `/appearance_creation` —— 捏脸页可选外观清单
   *  入参: — */
  appearanceCreation: (p = {}) => call(port, '/appearance_creation'),
  /** GET `/appearance_info` —— 当前外观描述/发色/最爱之物
   *  入参: — */
  appearanceInfo: (p = {}) => call(port, '/appearance_info'),
  /** GET `/appearance_ref` —— 合法 shirt/pants 索引表
   *  入参: — */
  appearanceRef: (p = {}) => call(port, '/appearance_ref'),
  /** GET `/hair_ref` —— 发型索引 + 贴图
   *  入参: — */
  hairRef: (p = {}) => call(port, '/hair_ref'),
  /** POST `/color_pick` —— 颜色换算（HSV↔RGB/滑条位置），纯函数，不碰存档
   *  入参: hue,sat,val,hex */
  colorPick: (p = {}) => call(port, '/color_pick', { method: 'POST', body: p }),
  /** POST `/character_customize` —— 改角色名/农场名/最爱之物（需菜单）
   *  入参: name,farmname,favorite */
  characterCustomize: (p = {}) => call(port, '/character_customize', { method: 'POST', body: p }),

  // ==================== 多人 ====================
  /** POST `/crawl_bed` —— action(locate/beds/sleep) player 参数是 player 不是 who；action locate|beds|sleep（sleep 有副作用）
   *  入参: action,player,bed_x,bed_y,msg,quiet */
  crawlBed: (p = {}) => call(port, '/crawl_bed', { method: 'POST', body: p }),

  // ==================== 调试/截图 ====================
  /** GET `/gsq` —— GameStateQuery 条件求值（q=条件串），调试专用
   *  入参: q（query） */
  gsq: (p = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString(); return call(port, '/gsq' + (qq ? '?' + qq : '')); },
  /** GET `/unlock_debug` —— 技能解锁状态
   *  入参: — */
  unlockDebug: (p = {}) => call(port, '/unlock_debug'),
  /** GET `/weapon_diag` —— 武器诊断
   *  入参: — */
  weaponDiag: (p = {}) => call(port, '/weapon_diag'),
  /** GET `/screenshot` —— 截图（base64 落盘）
   *  入参: — */
  screenshot: (p = {}) => call(port, '/screenshot'),
  /** GET `/screenshot_portrait` —— 头像截图
   *  入参: — */
  screenshotPortrait: (p = {}) => call(port, '/screenshot_portrait'),
  };
}

export const HOST = extra(7842);
export const FISH = extra(7843);
