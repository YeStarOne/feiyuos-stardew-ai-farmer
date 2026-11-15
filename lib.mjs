// 星露谷 AI 自主游玩脚本库 v2 (Remix NagiBridge, localhost:7842, 必须用 localhost)
// v2 变更(2026-10-28):
//   ① 卖出白名单政策(用户拍板): 只卖 鱼+农作物+垃圾, 其余绝不卖 → 存木箱或留背包
//      (教训: 曾按黑名单 KEEP 卖掉 Deluxe Bait / Sonar Bobber)
//   ② 物理点击前台互锁: 用户可能在同一台电脑玩别的游戏, 物理点击前先确认前台是 Stardew(fg-name.ps1)
//      ⚠️2026-11-05 起日常动作链已 100% 纯后台: openBin/harvestCrops 两条物理右键路退休(见⑨),
//      互锁只对"兜底老路"生效 —— 新代码禁止再引入物理点击
//   ③ (退休) 通用右键收割 harvestCrops —— 它的前提是错的: /harvest 本来就能收草莓/蓝莓,
//      只是桥把复生作物的 harvest() 返回值当 false → harvested 计数不含它们(见⑨/harvestAll 注释)
//   ④ 木箱: findChest / storeToChest / craftChest / placeChestNearHouse
//   ⑤ 移植验证过的 chopWood(砍树) / tillTiles+expandField(翻地扩田)
//   ⑧种田三步铁律(2026-11-05用户拍板, 违反=白干): ①作物种在整块连续区域(禁止东一格西一格)
//      ②下种前必须先清场(行为学框选清枯枝/杂草/石块) ③流程=清场→锄地(翻土)→才准拿种子
//      (实测多次看到拿种子到处跑/锄头翻杂草=种子全废); 参考BehaviorAutomation三遍走: 清场→Hoe→Seeds
//   ⑨ 前后台边界(2026-11-05 ilspycmd 反编译, 173 端点逐一核对, 详见 docs/游戏-AI游玩方案.md §三十六):
//      A.纯HTTP 161个 = 零前台零鼠标(种/浇/收/卖/存箱/睡/破环全在这档);
//      B.游戏内模拟点击 7个 = 要菜单开着但不碰真鼠标(/menu/click /gift /minigame_click...);
//      C/D.碰真鼠标或抢前台只有 5个: /click_tile /drag /focus 永远抢前台+动真鼠标;
//      /click 菜单关着时会真点屏幕中心; /key 默认抢前台 —— escape/confirm(非小游戏)分支
//      加 nofocus:true 即纯后台, 但 down/字母/数字/F1-12 分支 keybd_event 是真键盘,
//      ⚠️用户在用电脑时绝对禁发那几个键。
//      后台能跑的基础设施: pauseWhenOutOfFocus=false + NagiBridge 把 Game.IsActive 补丁成恒 true
//      (两条 SMAPI 日志都验证过"补丁已应用") → 游戏失焦照常 tick。
const BASE = process.env.STARDEW_BASE || 'http://localhost:7842';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';

// 2026-11-06: 所有桥调用加超时 —— 曾因一个无超时 fetch 挂死整个 day-loop 半小时(主持躺床上没人管)
export const FETCH_TIMEOUT = Number(process.env.STARDEW_FETCH_TIMEOUT || 30000);
const fetchTO = (ms) => AbortSignal.timeout(ms);
export const get = async (p) => (await fetch(BASE + p, { signal: fetchTO(FETCH_TIMEOUT) })).json();

// ⭐⭐⭐2026-11-11 春18(一天两次, 凌晨2点 + 12:07): 主持"主线程死但桥还活着"。
//   症状铁证矩阵: /state 40ms 正常返回(它只读缓存的好对象), 而 /surroundings /farm_report /chat/history
//   全部 6-30s 超时; SMAPI-latest.txt 最后一行停在 `Synchronizing 'NewDay' task...` 再也不动.
//   ⇒ **/state 回 200 绝对不等于游戏活着**. 判活必须探一个"要碰世界状态"的接口.
//   ⇒ 治法只有重启主持进程(当天已按天落盘, 最多丢当天进度); 重启后 fish 若还停在 60s 连接超时,
//      光重启 fish 没用 —— 必须主持整进程再起一次(残留的 NewDay 同步不放), 然后 fish 才进得来.
export async function worldAlive(port = 7842, ms = 8000) {
  try {
    const r = await fetch(`http://localhost:${port}/farm_report`, { signal: AbortSignal.timeout(ms) });
    return r.ok;
  } catch { return false; }
}

// ⭐⭐⭐2026-11-11 18:05 事故: 重复主持实例 —— 桥"端口自动顺延"是隐形的.
//   病根: farm-watchdog 用 execSync 拼一段带 \" 的 PowerShell 去杀主持, cmd.exe 把内层引号吃掉
//   → 命令残缺 → 非零退出 → 被空 catch{} 吞掉 → **一个进程都没杀**, 紧接着 _relaunch-host 又拉
//   一个 → 因为 7842 还被卡死的旧实例占着, NagiBridge 悄悄换到 7844, 单机加载同一份联机存档
//   (otherPlayers:[]), 差 100 游戏分钟就要在 26:00 倒地写盘把真存档盖掉(pid 17384).
//   ⇒ 铁律: ①杀进程/拉起一律走 .ps1 + -File, 绝不 execSync 内联带引号的 PowerShell;
//          ②重启路径上禁用空 catch —— 它把这个系统里最贵的错误变成静默;
//          ③探活只认约定的那个口(主持 7842 / 鱼鱼 7843), **绝不扫 7844-7847 找"谁在"**:
//            那几个口有监听 = 一定有多实例(不是备用实例, 是抢存档的实例);
//          ④"主持活着"还要看 otherPlayers 非空 —— 空 = 单机实例, 立刻停下别让它跑完一天.
//   反编译/实录见 docs/游戏-AI游玩方案.md §106; 杀进程脚本 D:/StardewAI/_kill-host.ps1.

// ⭐⭐⭐2026-11-11 夏18(只活了7分钟): sleep 的 ready 票**换日不清零**.
//   ReadyCheckDialog.update() 每帧都 SetLocalReady(checkName,true)(ReadyCheckDialog.cs:74),
//   而 HandleCancelSleep 只清 isInBed/菜单, **不碰 netReady** ⇒ 昨晚那两票一直挂着,
//   第二天下午读 /ready_state 的 sleep 档照样是 "Locked 2/2 isReady=true"(两人都在农场站着也是).
//   ⇒ 任何"读 ready 就行动"的闸都必须问一句"这票什么时候投的": 只认"她真的在睡"的形态
//     (她 isInBed / 她占着 ReadyCheckDialog|SaveGameMenu / 已过深夜门槛 t>=2520), 别单看 isReady.
//   实录见 docs/游戏-AI游玩方案.md §107. 同类: festival 等档共用同一个 netReady, 都可能残留.

// ⭐⭐⭐2026-11-11 跳天(Day20 → Day22, Day21 只活 10 秒): 两个 /sleep 同时到点 + 主线程死着.
//   day-loop 的睡觉闸 `t>=BED_TIME(2520)` 和 host-night-guard 的兜底闸 `t>=2520` 是同一个值,
//   到点后两边各发一次 /sleep(动作台账 18:35:06 同秒两条); 当时主持主线程卡在 NewDay 上,
//   这两个请求**既进不了队列也取消不了**, 等死锁一解就**一起执行** → 连翻两天.
//   ⇒ ①两个"该睡了"的闸绝不能同值同时到点: day-loop 在跑(锁新鲜)时守卫一律不插手;
//      ②/sleep 返回 TimeoutError **不代表没生效** —— 它可能躺在主线程队列里等着补执行.
//        任何"超时就重试"的写操作(/sleep /warp /menu/click /buy)都要先 worldAlive() 探主线程,
//        探不通就别再发(发了就是往队列里埋雷);
//      ③判跳天: dayOfMonth 一次跳 >1 就是, 那一天没人干活也没有独立存档可回退.
//   解死锁的首选是**重启 farmhand**(她是 farmhand 没本地存档, 重连不丢进度), 不是重启主持.
//   实录见 docs/游戏-AI游玩方案.md §109.

// ⭐⭐⭐2026-11-11 18:58 看护停摆: 心跳日志 ≠ 存活判据 (本节写给所有 setInterval 常驻脚本).
//   farm-watchdog 的 bedSince/bedMin 被 `const` 声明在 if 块内部, 块外的 hostBedReal 又用它 ⇒
//   每轮 ReferenceError: bedMin is not defined, 被 `main().catch(e => log('本轮异常'))` 收成一行.
//   而 log('轮询: ...') 在抛异常**之前**就打了 ⇒ 日志每分钟都有心跳, 却 15 轮全部报废:
//   不拉 day-loop、不探主线程、不重启主持, 三条兜底一起失效, 表面完全正常.
//   ⇒ ①常驻脚本的 catch 前缀必须区别于心跳, 且巡检要**单独计数** catch 行, 不能只看"有输出";
//     ②`const` 是块级作用域 —— 想在 if 外面用就声明在 if 外面, 不要指望它"漏出去";
//     ③改完 node --check 通过 ≠ 修好, 必须重启进程 + 看一整轮"轮询后面没有本轮异常";
//     ④persist 的 ok 也只证明"它认为进程在", 不证明进程在干活(同 §106 端口在听、§108 /state 200).
//   实录见 docs/游戏-AI游玩方案.md §110 / §111.

// ⭐⭐⭐2026-11-11 20:22 换季日第二次 NewDay 死锁(§113, 秋1 又被翻走): 验活闸的判据还差一格.
//   §112 之后 day-loop 的"晨间在床上"分支已经是"worldAlive 通 + 时钟前进"双条件, 今天照样撞死:
//   20:22:05 两条都满足(farm_report=200, 时钟 600→610) → 放行 warp → 立刻卡在
//   `Synchronizing 'NewDay' task...`, /farm_report 12s 超时、时钟冻在 610、秋1 全天报废.
//   ⇒ **换日后的存档加载/NewDay 同步会持续几个游戏分钟, 这期间时钟在走、/farm_report 也通,
//     但世界还没交出来.** "时钟在走" ≠ "换日完成".
//   实测对照(同日同位置, 只差时间): t=610 warp → 死锁; t=620 warp → 正常落地干活.
//   所以闸补第三条硬条件: **t >= 620**(换日后 20 游戏分钟沉降期), 外加
//   ready_state 里不许有"半满"就绪锁(!isReady && numberReady>0 = 换日/睡觉流程还在飞).
//   宁可晚 2 分钟下床, 不要白丢一天 —— 这条路径上"慢"的代价远小于"再翻一天".
//   破锁仍是 §108 那套: 只重启 farmhand(restart-fish.ps1), 主持 PID 不动. 实录见 §113.
//
// ⚠️⚠️§113 补记(20:40, 同一天我自己踩的): 上面那条"半满锁"第一版**没按 id 过滤**, 写成
//   `checks.some(c => !c.isReady && c.numberReady > 0)`. 而 `wakeup` 档常年是 1/2(鱼鱼的旧票,
//   netReady 从不清 —— 就是 §107 记的那件事) ⇒ 这道闸**恒为真** ⇒ 换日后永远不下床, 一天照样废.
//   实测: Day3 t=700 还站在 FarmHouse 床上, 而 farm_report 200、时钟一路在走, 日志看着完全正常,
//   只有 `锁在飞=true` 那一项在撒谎. 修 = 白名单只认 sleep / ready_for_save 两档.
//   ⇒ **铁律: 闸的判据用白名单不用黑名单.** "任一条件不满足就拦"会把一个跟自己无关的长期状态
//     变成永久拦截; 加闸前必须先看一眼这个信号平时的值(平时就不满足 = 一上线就常关);
//     改常驻脚本的闸改完**必须重启进程**并盯第一轮真跑通(node --check 只证明语法);
//     拦截日志要把每个条件各自的真值都打出来, 否则只能靠猜. 实录见 §113 补记.

// ================= 行动日志 (star 项目 0.3.22 借鉴, 2026-10-30 落地) =================
// 每个副作用动作都落 D:/StardewAI/action-journal.jsonl: {t,id,endpoint,body,result}
// 用途: loop 重启后对账"刚才那个动作到底成没成"—— 结果未知≠成功(对齐 star 铁律)
// STARDEW_JOURNAL=0 可关
const JOURNAL_PATH = process.env.STARDEW_JOURNAL_PATH || 'D:/StardewAI/action-journal.jsonl';
const JOURNAL_ON = process.env.STARDEW_JOURNAL !== '0';
let journalSeq = 0;
function jour(endpoint, body, result) {
  if (!JOURNAL_ON) return;
  try {
    fs.appendFileSync(JOURNAL_PATH, JSON.stringify({
      t: new Date().toISOString(), id: Date.now() + '-' + (++journalSeq),
      endpoint, body: body ?? {}, result: JSON.stringify(result).slice(0, 200)
    }) + '\n');
  } catch { /* 日志失败绝不影响动作 */ }
}
export function readJournal(n = 20) {
  try {
    const lines = fs.readFileSync(JOURNAL_PATH, 'utf8').trim().split('\n');
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

export const post = async (p, b = {}, timeoutMs) => {
  const r = await (await fetch(BASE + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    signal: fetchTO(timeoutMs || FETCH_TIMEOUT)
  })).json();
  jour(p, b, r);
  return r;
};
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function st() { return (await get('/state')); }
export async function surr(radius = 8) { return (await get(`/surroundings?radius=${radius}`)); }
export async function sel(name) { return post('/select', { name }); }
export async function face(dir) { return post('/face', { direction: dir }); }

// 方向: 0=上 1=右 2=下 3=左
export const faceToward = (fx, fy, tx, ty) => {
  const dx = tx - fx, dy = ty - fy;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
};

// 闭环移动：重读 state 校验，最多 8 次
// ⭐2026-11-09 §89: /move 是【绝对坐标寻路且异步】(HandleMove→FindPath→_pathQueue)。
//   不是偏移, 也没有"0,0 陷阱" —— 读到 (0,0) 是在读中间态(我上一版注释写错了)。
//   寻路途中被打断(地形/门/挤)就停; 本函数每轮重新下令算自愈, 但仍偏弱:
//   要更稳用 _walk.mjs 的 walkTo(900ms 轮询 + 6s 重下令 + 60s 超时)。走位系整体不可靠见 §86/§88。
export async function go(x, y) {
  for (let i = 0; i < 8; i++) {
    const s = await st();
    if (s.player.x === x && s.player.y === y) return true;
    await post('/move', { x, y });
    await sleep(1200);
  }
  const s = await st();
  return s.player.x === x && s.player.y === y;
}

// 站到目标四邻中第一个能站住的格
export async function standAdj(tx, ty) {
  for (const [cx, cy] of [[tx, ty + 1], [tx, ty - 1], [tx + 1, ty], [tx - 1, ty]]) {
    if (await go(cx, cy)) return { x: cx, y: cy };
  }
  return null;
}

// 对 (tx,ty) 用手持物品/工具：走过去面朝它 use，返回 tile 是否命中
export async function useOn(tx, ty) {
  const stand = await standAdj(tx, ty);
  if (!stand) return { ok: false, why: 'unreachable' };
  const c = await st();
  await face(faceToward(c.player.x, c.player.y, tx, ty));
  await sleep(120);
  const r = await post('/use', {});
  const hit = r.tile && r.tile.x === tx && r.tile.y === ty;
  return { ok: !!hit, r, stand };
}

// 传送并等待切场景完成；失败自动重试（warp 返回的 actual 是旧位置，必须轮询 location）
// opts.tries/polls/wait: 时间敏感场景用快档(2026-11-02 用户"磨蹭太久被动传送回家": 默认4×8×1.2s≈40s/次, 入口链18点能把一整天烧光)
export async function warp(loc, x, y, opts = {}) {
  const tries = opts.tries ?? 4, polls = opts.polls ?? 8, wait = opts.wait ?? 1200;
  for (let attempt = 0; attempt < tries; attempt++) {
    const r0 = await post('/warp', { location: loc, x, y }).catch(() => null);
    // 桥明确拒绝(落点站不住/超解锁范围)→不空轮询, 立即失败返回
    if (r0 && (r0.ok === false || r0.skipped_warp)) return { loc, x, y, failed: true, rejected: true, raw: r0 };
    for (let i = 0; i < polls; i++) {
      await sleep(wait);
      const s = await st();
      const cur = s.location?.name || s.location;
      if (cur === loc) return { loc: cur, x: s.player.x, y: s.player.y };
      if (s.activeMenu) { await post('/menu_close', {}); await sleep(400); }
    }
    log('warp未到', loc, '重试', attempt + 1);
  }
  const s = await st();
  return { loc: s.location?.name || s.location, x: s.player.x, y: s.player.y, failed: true };
}

// ===== 2026-11-06 批量动作: /queue 一次提交多条命令(主线程顺序执行, 省往返) =====
// 命令 DSL: {action:'move'|'face'|'select'|'use'|'charge'|'interact'|'wait'|'warp'|'wait_for_bite'|'key', ...}
// 返回 {ok, executed, results[]}; 失败抛错由调用方兜底。
export async function queue(cmds) {
  if (!cmds?.length) return { ok: true, executed: 0, results: [] };
  return post('/queue', cmds, 300000); // 桥侧队列最长等 5 分钟(内部有 3~10 tick 命令间隔)
}

// 浇半径内所有作物（自动 refill），返回成功数
// 2026-11-06 v2: 改走 /tool_area 批量(内部自动选壶/按升级蓄力/寻路/补漏), 1 次 HTTP 浇一片;
//   失败/剩格才回退到逐格 waterAllLegacy。实测场次: 90 格从 ~450 次请求降到 3~6 次。
// ⭐§88(2026-11-08): day-loop 日循环已弃用本函数(host 浇水连日卡死三犯), 仅手动脚本用。日循环正解=BWF water_crops 先行。
export async function waterAll(radius = 12) {
  const s0 = await st();
  if ((s0.location?.name || s0.location) !== 'Farm') { log('不在农场(' + (s0.location?.name || s0.location) + '), 跳过浇水(防床里死磨)'); return 0; }
  await sel('Watering Can');
  const dry = async () => {
    const sr = await surr(radius);
    return sr.tiles.filter(t => t.crop && !t.watered);
  };
  let crops = await dry();
  if (!crops.length) { log('浇水: 没有干土'); return 0; }
  const total0 = crops.length;
  log(`浇水(批量): 干土 ${crops.length}/${(await surr(radius)).tiles.filter(t => t.crop).length}`);
  let ok = 0;
  for (let round = 0; round < 4; round++) {
    crops = await dry();
    if (!crops.length) break;
    const x1 = Math.min(...crops.map(t => t.x)), x2 = Math.max(...crops.map(t => t.x));
    const y1 = Math.min(...crops.map(t => t.y)), y2 = Math.max(...crops.map(t => t.y));
    let r;
    try { r = await post('/tool_area', { operation: 'water', x1, y1, x2, y2 }, 240000); }
    catch (e) { log('tool_area 失败 → 回退逐格:', String(e).slice(0, 80)); break; }
    log('tool_area:', JSON.stringify({ ok: r?.ok, swings: r?.swings, patches: r?.patches, missing: (r?.still_missing || []).length, out: r?.out_of_water }).slice(0, 180));
    if (r?.out_of_water) { await post('/refill', {}); await sleep(700); continue; }
    if (r?.ok === false && !(r?.still_missing || []).length) break; // 没得浇/工具问题
    if (!(await dry()).length) break;
    if ((r?.still_missing || []).length === crops.length) { log('tool_area 没进展 → 回退'); break; }
  }
  const left = (await dry()).length;
  ok = total0 - left;
  if (left > 0) {
    log(`批量后还剩 ${left} 格 → 逐格兜底`);
    ok += await waterAllLegacy(radius);
  }
  log('浇水', ok, '/', total0);
  return ok;
}

// 逐格浇水(旧实现, 保留作 tool_area 的兜底)
export async function waterAllLegacy(radius = 12) {
  // 2026-11-06: 换日晕倒后人会在 FarmHouse 床里, 蛇形扫描对 48 块地逐块 8 次无效寻路 = 磨几十分钟假死
  const s0 = await st();
  if ((s0.location?.name || s0.location) !== 'Farm') { log('不在农场(' + (s0.location?.name || s0.location) + '), 跳过浇水(防床里死磨)'); return 0; }
  await sel('Watering Can');
  const sr = await surr(radius);
  // 只浇干土: watered=true 的格子保持到次日清晨, 重浇纯浪费(2026-10-29 用户指出)
  const crops = sr.tiles.filter(t => t.crop && !t.watered);
  // 蛇形逐行扫: 先按行再按列, 同行连浇少跑路(孤格停十几秒的根因=跳行走位, 2026-10-29 用户观察)
  crops.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  log(`浇水(逐格): 干土 ${crops.length}/${sr.tiles.filter(t => t.crop).length}`);
  let ok = 0;
  for (const t of crops) {
    let done = false;
    for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
      if (await go(cx, cy)) {
        await sel('Watering Can');
        const c = await st();
        const can = c.inventory.find(i => i.name === 'Watering Can');
        if (can && can.waterLeft !== undefined && can.waterLeft <= 0) {
          log('水壶空, refill');
          await post('/refill', {});
          await sleep(800);
        }
        await face(faceToward(c.player.x, c.player.y, t.x, t.y));
        await sleep(150);
        const r = await post('/use', {});
        await sleep(250);
        done = r.tile && r.tile.x === t.x && r.tile.y === t.y;
        break;
      }
    }
    if (done) ok++;
  }
  log('浇水(逐格)', ok, '/', crops.length);
  return ok;
}

// 批量播种(2026-11-06): 一次 /queue 把"走到位→面朝→下种"全下给主线程。
// 返回成功下种数; 返回 -1 = 队列不可用/没进展, 调用方回退逐格。
export async function plantBatch(seedName, maxCount = 99) {
  const s = await st();
  const sr = await surr(14);
  const tiles = sr.tiles.filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x)).slice(0, Math.max(0, maxCount));
  if (!tiles.length) return 0;
  // 一次拿可走图, 给每格挑一个站位(优先下方/上方/右/左)
  const x1 = Math.min(...tiles.map(t => t.x)) - 1, x2 = Math.max(...tiles.map(t => t.x)) + 1;
  const y1 = Math.min(...tiles.map(t => t.y)) - 1, y2 = Math.max(...tiles.map(t => t.y)) + 1;
  let pass = new Map();
  try {
    const pr = await get(`/passable_rect?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}&location=${s.location?.name || 'Farm'}`);
    for (const t of pr.tiles || []) if (t.passable) pass.set(t.x + ',' + t.y, true);
  } catch { }
  const isPass = (x, y) => pass.size ? pass.has(x + ',' + y) : true;
  const cmds = [{ action: 'select', name: seedName }];
  for (const t of tiles) {
    const stand = [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]].find(([cx, cy]) => isPass(cx, cy));
    if (!stand) continue;
    cmds.push({ action: 'move', x: stand[0], y: stand[1] });
    cmds.push({ action: 'face', direction: faceToward(stand[0], stand[1], t.x, t.y) });
    cmds.push({ action: 'use' });
  }
  if (cmds.length <= 1) return 0;
  const r = await queue(cmds).catch(e => ({ ok: false, error: String(e) }));
  const placed = (r?.results || []).filter(x => x?.action === 'placed').length;
  log(`批量播种: ${placed}/${tiles.length} 株 (queue ${r?.ok === false ? '失败:' + (r.error || '') : 'ok'})`);
  if (r?.ok === false || (!placed && tiles.length)) return -1;
  return placed;
}

// ================= 换季清死株 (2026-11-05 事故驱动) =================
// 事故: 夏→秋换季那一刻农场上 43 株夏菜(种子 479甜瓜/480番茄/481蓝莓/482辣椒)全部枯死。
//   死株不会自己消失, 一直占着那块 HoeDirt; 而 replantAll 只认 `!t.crop` 的格子 →
//   从秋1 到秋19 整整十八个游戏日, 主持一颗种子都没种下去(收入全靠钓鱼), 用户看到"农作物都死了"。
// 难点: 桥的 /surroundings 不暴露 crop.dead(只有 crop/cropPhase/harvestable/cropName),
//   光看桥分不出"死株"和"没熟的活苗" —— 盲扫镰刀会把活苗一起割掉, 所以不能靠桥判断。
// 出路: 死株名单只从存档 XML 读。存档恰好在每天起床那一刻才写(= day-loop 开跑的时刻),
//   所以读它=读"今晨 6:00 的地面真相", 既精确又零误伤(只割 dead=true 的格子)。
// ⚠️别改成"按 !harvestable 扫一遍": 没熟的活苗同样 !harvestable, 会连苗一起割。
export const SAVE_PATH = process.env.STARDEW_SAVE
  || 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/肥鱼肥鱼_452739119';

// 读存档原文: 游戏有时压(PK zip)有时不压("Saving without compression" 那档), 两种都吃
export function readSaveText(p = SAVE_PATH) {
  const buf = fs.readFileSync(p);
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (i < 0) throw new Error('存档是 zip 但找不到本地文件头');
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extraLen, compSize = buf.readUInt32LE(i + 18);
    const method = buf.readUInt16LE(i + 8);
    const raw = buf.subarray(start, start + compSize);
    return (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
  }
  return buf.toString('utf8');
}

// 死株坐标(只取 Farm 地图块内的: 姜岛的够不着, 不列)
// ⚠️别用 indexOf('xsi:type="Farm"') 找地图块起点 —— 存档里前面还有别的带这个属性的小节点,
//   会切出一段不含作物的假 Farm 块(实测踩过: 切出 1474 字符的空块, 死株数=0)。
//   正解: 用 <GameLocation xsi:type="X"> 的位置表, 取每条记录前面最近的那个地图名。
export function deadCropTiles(p = SAVE_PATH) {
  const t = readSaveText(p);
  const heads = [...t.matchAll(/<GameLocation xsi:type="(\w+)"/g)].map(m => ({ i: m.index, name: m[1] }));
  const locAt = (i) => { let n = '?'; for (const h of heads) { if (h.i < i) n = h.name; else break; } return n; };
  const out = [];
  const re = /<key><Vector2><X>(\d+)<\/X><Y>(\d+)<\/Y><\/Vector2><\/key><value>(.*?)<\/value><\/item>/gs;
  for (const m of t.matchAll(re)) {
    if (!m[3].includes('<dead>true</dead>')) continue;
    if (locAt(m.index) !== 'Farm') continue;   // 只清主农场
    out.push({ x: +m[1], y: +m[2] });
  }
  return out;
}

// 挥镰刀清死株, 返回清掉的格数; 没有死株=零开销直接返回
// ⭐⭐⭐2026-11-12 夏11→12 取证: 苗的**另一种消失**(函数管不到的那种) —— 游戏每日农场碎片刷新
//   (杂草/石头) 的落点可以选到耕地格, 一落上去就**把 HoeDirt 连同 crop 一起替换掉**。存档签名
//   = 原格 terrain 变 null、objects 里多一个 Weeds(和"扩田锄掉"一模一样), 但窗口内**没有任何
//   工具动作**(两端 SMAPI 无 tool-area/anim), 全农场杂草 76→79 同夜 +3 ⇒ 原版机制, 不是脚本。
//   后果: deadCropTiles 看不到它(不是 dead=true, 是整格没了), replantAll 也只补"空 HoeDirt" ⇒
//   每晚静静少 1~2 株, 谁都没报错。要真修只能"田块坐标表 + 每日巡检补砌(清杂草→重新开垦→补种)"。
//   判因铁律: 先划时间窗, 窗口内没有工具动作就别往脚本身上推; 数量类证据(杂草/石头计数)比单格状态更能定性。
export async function clearDeadCrops(p = SAVE_PATH) {
  const tiles = deadCropTiles(p);
  if (!tiles.length) { log('清死株: 存档里没有死株, 跳过'); return 0; }
  log(`清死株: 存档里有 ${tiles.length} 株死株(换季枯死), 上镰刀`);
  const before = (await get('/farm_report').catch(() => null))?.crops?.total;
  // ⭐2026-11-10: (65,21) 已不是可站格(田块状态变了), 连两天 "到不了农场,放弃" → 换季死株没人清。
  //   改为候选落点逐个试, 任一落地即开割; 全败才放弃。
  let w = null;
  for (const [cx, cy] of [[65, 21], [54, 17], [64, 19], [66, 22], [52, 16]]) {
    await warp('Farm', cx, cy);
    await sleep(900);
    const s0 = await st();
    if (s0?.location?.name === 'Farm' && Math.abs((s0.player.x ?? -999) - cx) <= 2 && Math.abs((s0.player.y ?? -999) - cy) <= 2) { w = { ok: true }; break; }
  }
  if (!w || !w.ok) { log('清死株: 候选落点全部失败, 放弃(别乱挥镰刀)'); return 0; }
  // ⭐2026-11-07 §72 换季事故: 存档 XML 是"上一次写盘时"的死株名单, 手工清完/换季期间会严重过期。
  //   day-loop 重启后按陈旧名单逐格挥镰, 空格子也挥, 每格 ~39 秒 × 90 格 ≈ 一小时空转, 游戏时间飞逝。
  //   修: 先拉一次大半径 /surroundings, 只处理"实况里真的有作物"的格子; 名单里有、地图上没有 = 已清掉, 直接跳过。
  const live = new Map();
  try {
    const look = await surr(20);
    for (const t of look.tiles ?? []) if (t.crop) live.set(`${t.x},${t.y}`, t);
  } catch { log('清死株: 实况地图拉不到, 退回按存档名单处理(可能空挥)'); }
  const real = live.size ? tiles.filter(t => live.has(`${t.x},${t.y}`)) : tiles;
  if (live.size && real.length < tiles.length) log(`清死株: 存档名单 ${tiles.length} 株, 实况只剩 ${real.length} 株(其余已清/已不存在, 跳过)`);
  if (!real.length) { log('清死株: 实况已无死株, 跳过(名单过期)'); return 0; }
  real.sort((a, b) => (a.y - b.y) || (a.x - b.x));  // 蛇形: 同行连着割少跑路
  let ok = 0;
  for (const t of real) {
    let done = false;
    for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
      if (!(await go(cx, cy))) continue;
      await sel('Scythe');            // 每格重选: 中途 /use 弹过菜单/换过手持就不认了
      const c = await st();
      await face(faceToward(c.player.x, c.player.y, t.x, t.y));
      await sleep(120);
      const r = await post('/use', {});
      done = !!(r.tile && r.tile.x === t.x && r.tile.y === t.y);
      break;
    }
    if (done) ok++; else log(`死株(${t.x},${t.y}) 没割掉(够不着?)`);
    await sleep(120);
  }
  const after = (await get('/farm_report').catch(() => null))?.crops?.total;
  log(`清死株: 挥镰 ${ok}/${real.length}(名单 ${tiles.length}), 农场地里作物 ${before} → ${after}(该到 0)`);
  return ok;
}

// fishbot 设定到指定状态（/fishbot 是 toggle，必须校验 enabled 再决定是否补一刀）
export async function fishbotSet(on) {
  // ⭐2026-11-06 §54 根治: /fishbot 不带 action 就是 toggle。老实现 post({}) 盲翻两次,
  //   看着"能对上", 实际每次调用都在开/关之间抖一下(和 fishbot 自己的状态机抢)。
  //   唯一安全写法: action=status 读 → 不一致才 action=on/off 写。
  const cur = await post('/fishbot', { action: 'status' });
  if (!!cur.enabled === !!on) return cur.enabled;
  const r = await post('/fishbot', { action: on ? 'on' : 'off' });
  return r.enabled;
}

// ⭐⭐⭐2026-11-11 春11 事故: `/settlement_confirm` 的 ok **只证明点击塞进去了**, 不证明页面关了。
//   源码: ShippingMenu.receiveLeftClick 首行 `if(!CanReceiveInput()||outro||savedYet) return;`,
//   CanReceiveInput 要求 introTimer<=0 && saveGameMenu==null && !outro —— 不满足就静默吞, 桥照回 ok。
//   ⇒ 判据只能落在"下一轮 activeMenu 还是不是 ShippingMenu"上。同一族的假绿灯还有:
//   /sleep(ok≠写盘, 只认 SaveGameInfo mtime) / /warp(下一tick才落地) / /dig(ok≠掉出东西)。
//   ⚠️ 结算页绝不能 /menu_close —— 它是存档链一环(结算动画走完才 new SaveGameMenu()), 强关=不写盘。
//   处置: 点 1 次 → 下一轮还在就再点 1 次 → 仍在 = 客户端僵住, 直接 restart-fish.ps1(主持不动)。
export async function menuStillOpen(port = 7843, type = 'ShippingMenu') {
  try {
    const d = await (await fetch(`http://localhost:${port}/state`, { signal: AbortSignal.timeout(8000) })).json();
    const m = d?.activeMenu || d?.menu;
    return (typeof m === 'object' ? m?.type : m) === type;
  } catch { return false; }   // 读不到=世界没就绪, 别误判成"还开着"
}

// ================= 物理点击安全互锁 =================
// 用户可能在同一台电脑玩别的游戏: 任何物理鼠标点击前必须确认星露谷在前台
export async function foregroundIsStardew() {
  try {
    const name = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "D:/StardewAI/fg-name.ps1"',
      { encoding: 'utf8', timeout: 15000 }).trim();
    return /Stardew/i.test(name);
  } catch { return false; }
}

// 物理右键 (rightclick.ps1 已内置 SetProcessDPIAware, 坐标=1920x1080 逻辑像素)
export function physicalRightClick(ax, ay) {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "D:/StardewAI/rightclick.ps1" -ax ${ax} -ay ${ay}`,
    { timeout: 30000 });
}

// ================= 卖出白名单政策 (2026-10-28 用户拍板) =================
// 原则: 只有白名单内的东西才卖; 白名单外一律 存木箱(没有箱子就留背包), 宁可停钓不可误卖
const SELL_FISH = /\b(Bass|Bullhead|Trout|Catfish|Chub|Perch|Carp|Sunfish|Shad|Walleye|Bream|Pike|Eel|Sardine|Anchovy|Flounder|Halibut|Octopus|Squid|Snapper|Tuna|Albacore|Herring|Tilapia|Red Mullet|Sea Jelly|River Jelly|Cave Jelly|Mackerel|Sturgeon|Lingcod|Void Salmon|Super Cucumber|Midnight Carp|Woodskip|Tiger Trout|Cucumber|Stonefish|Ghostfish|Dorado|Blobfish|Slimejack|Pufferfish|Stingray|Lionfish|Salmon|Ice Pip|Lava Eel|Sandfish)\b/;
const SELL_CROPS = /^(Parsnip|Strawberry|Cauliflower|Potato|Melon|Tomato|Blueberry|Hot Pepper|Pepper|Wheat|Corn|Eggplant|Pumpkin|Yam|Grape|Amaranth|Kale|Radish|Green Bean|Starfruit|Rhubarb|Hops|Tea Leaves|Unmilled Rice|Fiddlehead Fern|Cranberries|Sweet Gem Berry|Ancient Fruit)$/;
const SELL_TRASH = /^(Trash|Driftwood|Soggy Newspaper|Broken CD|Broken Glasses|Joja Cola|Seaweed|Green Algae|White Algae)$/;
// ⭐2026-11-05 政策漏洞(实测): SELL_FISH 里的 \bEel\b 会把「Spicy Eel 香辣鳗鱼」这种**熟菜**当成鱼,
//   day-loop 收工卖货时把主持的 Spicy Eel×19 全部扔进出货箱。熟菜是体力补给, 一律不卖 → 显式排除。
const COOKED_NOT_SELL = /^(Spicy Eel|Maki Roll|Sashimi|Sushi|Carp Surprise|Baked Fish|Fish Stew|Fish Taco|Trout Soup|Lobster Bisque|Chowder|Escargot|Fried Eel|Seafoam Pudding)$/i;
export const isSellable = n => !COOKED_NOT_SELL.test(n) && (SELL_FISH.test(n) || SELL_CROPS.test(n) || SELL_TRASH.test(n));

// 任务保留位(用户拍板"有邮件优先做任务"): 这些物品即使可卖也要留 N 件在背包
// quest 101 = 乔迪要 1 花椰菜(10-29)
// 2026-11-07: 传说之鱼是纪念品，鱼鱼交代过'钓上来别卖'；同族传说鱼一并保留。
export const QUEST_RESERVE = { Cauliflower: 1, Legend: 1, 'Legend II': 1, Crimsonfish: 1, Angler: 1, Glacierfish: 1, 'Glacierfish Jr.': 1, 'Mutant Carp': 1, 'Mutant Carp Jr.': 1, 'Ms. Angler': 1, 'Son of Crimsonfish': 1, 'Radioactive Carp': 1 };

// 常驻背包类: 既不卖也不存(工具/鱼竿/鱼饵/鱼钩/种子/待放置的箱子)
export const isCarry = n =>
  /^(Axe|Hoe|Watering Can|Pickaxe|Scythe|Bamboo Pole|Fiberglass Rod|Iridium Rod|Training Rod|Chest|.*Bobber|.*Bait|.*Tackle)$/i.test(n)
  || /Seeds$|Starter$|Shoot$/i.test(n);

// 应存箱: 不卖、也不必常驻背包的(采集物/素材/矿石/食物/多余装备)
// 注意: 采集物不卖 — 社区中心收集包(春季/夏季采集包)会用到
export const shouldStore = n => !isSellable(n) && !isCarry(n);

// ================= 背包快照工具 =================
export function invSnapshot(s) {
  const m = {};
  for (const i of s.inventory) if (i.name) m[i.name] = (m[i.name] ?? 0) + (i.stack ?? 1);
  return m;
}
// b 相对 a 的总增量
export function snapshotGain(a, b) {
  let n = 0;
  for (const k in b) if ((b[k] ?? 0) > (a[k] ?? 0)) n += b[k] - (a[k] ?? 0);
  return n;
}
// b 相对 a 的逐物品增量 [[name, delta], ...] (只报增加; 收菜/补捡的"到底收到了啥"靠它)
export function invDelta(a, b) {
  const out = [];
  for (const k in b) { const d = (b[k] ?? 0) - (a[k] ?? 0); if (d > 0) out.push([k, d]); }
  return out;
}

// 【已退休 2026-11-05】开杂货箱物理右键 —— 被 /sell 整套取代(见下方 sellByName 注释)。
// 保留只为旧脚本兼容; 卖货一律 sellAllWhitelisted, 别再调这个(它抢前台+动真鼠标)。
// 杂货箱在 Farm (72,14); /store 对它无效, 只能走 UI
export async function openBin() {
  if (!(await foregroundIsStardew())) {
    log('!! 前台不是星露谷(用户可能在玩别的), 拒绝物理右键');
    return false;
  }
  await warp('Farm', 72, 15);
  // 先清掉残留对话框, 否则物理右键会落在对话框上
  for (let i = 0; i < 2; i++) {
    const s0 = await st();
    if (!s0.activeMenu) break;
    await post('/menu_close', {});
    await sleep(600);
  }
  // 注意: /click_tile 不会移动系统鼠标(它只做游戏内点击/返回坐标), 真实鼠标由
  // rightclick.ps1 定位。坐标必须用 click_tile 实时返回的 absolute(屏幕物理坐标,
  // 随窗口位置走)—— 写死标定值会因窗口挪位而点空(10-29 实测踩坑)
  const c = await post('/click_tile', { x: 72, y: 14 });
  if (!c?.absolute) { log('click_tile 拿不到杂货箱屏幕坐标'); return false; }
  physicalRightClick(c.absolute.x, c.absolute.y);
  await sleep(1500);
  let s = await st();
  if (s.activeMenu?.type !== 'ItemGrabMenu') {
    physicalRightClick(c.absolute.x, c.absolute.y);
    await sleep(1500);
    s = await st();
  }
  return s.activeMenu?.type === 'ItemGrabMenu';
}

// ================= (退休)右键收割 =================
// ⚠️2026-11-05 结论: 它的前提是错的 —— /harvest 本来就能收草莓/蓝莓这类复生作物,
// 当年只是被 harvested:0 骗了(Crop.harvest 对复生作物返回 false, 见 harvestAll 注释)。
// 这个物理逐株版保留兼容(day-loop 已改走 harvestAll), 新代码一律 harvestAll()。
export async function harvestCrops(maxWaves = 6, slotLimit = 11) {
  if (!(await foregroundIsStardew())) {
    log('!! 前台不是星露谷, 跳过右键收割');
    return 0;
  }
  // 手持切到种子类, 防右键触发工具动作
  const s0 = await st();
  const seedItem = s0.inventory.find(i => /Seeds$|Starter$|Shoot$/i.test(i.name));
  if (seedItem) await sel(seedItem.name);
  let total = 0;
  for (let wave = 0; wave < maxWaves; wave++) {
    const sr = await surr(14);
    const ripe = sr.tiles.filter(t => t.harvestable);
    if (!ripe.length) break;
    log('收割 wave' + wave, '成熟', ripe.length);
    let waveGain = 0;
    for (const t of ripe) {
      if ((await st()).inventory.filter(i => i.name).length >= slotLimit) {
        log('背包将满, 中断收割');
        wave = 99;
        break;
      }
      let pos = null;
      for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
        if (await go(cx, cy)) { pos = { cx, cy }; break; }
      }
      if (!pos) { log('够不着', t.x, t.y); continue; }
      const c = await post('/click_tile', { x: t.x, y: t.y }).catch(() => null);
      if (!c?.absolute) { log('拿不到坐标', t.x, t.y); continue; }
      const before = invSnapshot(await st());
      physicalRightClick(c.absolute.x, c.absolute.y);
      await sleep(900);
      let after = invSnapshot(await st());
      let gain = snapshotGain(before, after);
      if (!gain) { // 一次没中补一发
        physicalRightClick(c.absolute.x, c.absolute.y);
        await sleep(900);
        after = invSnapshot(await st());
        gain = snapshotGain(before, after);
      }
      if (gain) { total += gain; waveGain += gain; log('摘到 @', t.x, t.y, '+', gain); }
      else log('没摘到 @', t.x, t.y);
      const s3 = await st();
      if (s3.activeMenu) { await post('/menu_close', {}); await sleep(400); }
    }
    if (!waveGain) break; // 整轮颗粒无收, 防死循环
  }
  log('== 右键收割共', total, '==');
  return total;
}

// ================= 全 HTTP 收割 (2026-11-05 反编译实锤, 替代右键逐株) =================
// 源码证据(HandleHarvest → Crop.harvest):
//   对半径内所有 readyForHarvest 的作物直接调 crop.harvest(), 不走路不点击。
//   一次性作物(防风草/甜瓜...) → 收进背包 + 清格, 返回 true;
//   复生作物(草莓/蓝莓/番茄/辣椒/玉米) → 收进背包 + 设复生日, 但返回 **false**
//   → 桥的 harvested 计数**不含复生作物**! 判断成功只认背包快照差分, 绝不信 harvested 数字。
//   背包满时 addItemToInventoryBool 失败 → 那格整格不收(产物不损), 先清包再来。
// 多产作物(蓝莓等)超出背包那 1 个的会 createItemDebris 掉在地上, 只有玩家在 64px 内才自动拾取
//   → 收完必须 sweepDebris 走过去捡, 否则等于白收一半。
// 半径: /harvest?radius=N 上限 50(默认15); /surroundings?radius 上限 30。
// 参数: { radius, maxRounds, sweep } ; 返回 { gained, items, rounds, harvested, picked, leftover }
export async function harvestAll(radius = 15, maxRounds = 8, sweep = true) {
  const R = Math.max(1, Math.min(Number(radius) || 15, 50));
  const base = invSnapshot(await st());   // 总基线: 最终 items/gained 全按它算差分
  let prev = base;
  let rounds = 0, harvested = 0;
  for (let round = 0; round < maxRounds; round++) {
    const s = await st();
    if (s.activeMenu && !/BobberBar/i.test(s.activeMenu.type || '')) {
      await post('/menu_close', {}); await sleep(400);
    }
    const slots = (s.inventory || []).filter(i => i.name).length;
    // 2026-11-07 修坑: 原写死 slots>=12 是 12 格小包时代的遗产, 36 格大包下收菜永远"满"
    //   (实测 6 株熟菜从春9 躺到春12)。改读 /state 的 maxItems, 留 2 格余量防堆叠溢出。
    const maxSlots = Number(s.player?.maxItems) || 36;
    if (slots >= maxSlots - 2) { log(`背包满(${slots}/${maxSlots}), 停手 —— 先清仓/存箱再来收`); break; }
    // ⭐2026-11-07 §78 收菜正解: /harvest 恒返回 harvested:0(§75), 镰刀 /use 只对 cropScythe 作物有效。
    //   实测唯一可靠: warp 到四邻之一 + /interact {x,y}(返回 actionTriggered:true 即入包)。
    //   83 株 33 秒(go() 走路每格 39 秒, 必须用 warp)。
    const sr = await get(`/surroundings?radius=${R}`).catch(() => null);
    const ready = (sr?.tiles || []).filter(t => t.harvestable);
    if (!ready.length) { harvested += 0; break; }
    let got = 0;
    for (const t of ready) {
      let done = false;
      for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
        const w = await post('/warp', { location: 'Farm', x: cx, y: cy }).catch(() => null);
        if (!(w?.ok || w?.landing)) continue;
        await sleep(220);
        const r = await post('/interact', { x: t.x, y: t.y }).catch(() => null);
        if (r?.actionTriggered) { done = true; got++; break; }
      }
      await sleep(100);
      if (got && got % 10 === 0 && ready.length > 20) await cleanInventoryJunk();
    }
    harvested += got;
    await sleep(500);            // 掉落物/拾取要等游戏 tick 跑一下
    const cur = invSnapshot(await st());
    const gain = snapshotGain(prev, cur);
    rounds++;
    if (gain) log(`收 wave${round}: interact 收 ${got} 株, 实际入包=${gain}`);
    if (!gain) break;            // 这一轮包里啥都没进 → 周围没有熟的了
    prev = cur;
  }
  const picked = sweep ? await sweepDebris() : 0;
  const after = invSnapshot(await st());
  return { gained: snapshotGain(base, after), items: invDelta(base, after), rounds, harvested, picked };
}

// 清掉背包里的 ErrorItem 垃圾(§77, 2026-11-07): price:0 探 id / 误买会产生 ErrorItem,
// 丢到地上会变 debris, 玩家站在那格会立刻捡回来 → 必须"丢一件 + 立刻 clear_ground 脚下那格"。
export async function cleanInventoryJunk() {
  let n = 0;
  // ⭐2026-11-07 更新: "丢一件+clear_ground"会出现"丢一个又冒一个"(背包净数不降), 改成塞进
  //   专门的垃圾箱 (30,44)。箱子不在时退回 丢+清 的组合。
  const JUNK = [{ x: 30, y: 44 }, { x: 32, y: 45 }];   // 2026-11-07: 两个 36 格垃圾箱, 轮着塞
  const hasJunk = async () => (await get('/chest').catch(() => null)) !== null;
  for (let i = 0; i < 60; i++) {
    const s = await st();
    const e = (s.inventory || []).find(x => /ErrorItem|Error Item/.test(x.name || ''));
    if (!e) break;
    let stored = false;
    for (const box of JUNK) {
      try {
        const r = await post('/store', { ...box, name: e.name });
        if (r?.ok && (r.stored || []).length) { stored = true; break; }
      } catch { /* ignore */ }
    }
    if (!stored) {
      await post('/drop_item', { item: e.name, count: 1 });
      await fetch(`http://localhost:7842/clear_ground?x=${s.player.x}&y=${s.player.y}`, { signal: AbortSignal.timeout(5000) }).catch(() => { });
    }
    n++;
  }
  if (n) log(`清背包垃圾 ${n} 件`);
  return n;
}

// 扫 /debris 把地上没人认领的掉落走过去捡掉(纯 HTTP 走位, 零点击)
// 只捡 droppedBy===0 的(自家收菜/系统掉落); 玩家丢的(鱼鱼/主持)绝不碰 —— 那是人家的东西
// 返回捡到的总件数
export async function sweepDebris(maxVisits = 40) {
  let picked = 0, visits = 0;
  const stuck = new Set();
  const owned = (list) => list.filter(x => Number(x.droppedBy ?? 0) === 0 && !stuck.has(`${x.x},${x.y}`));
  while (visits < maxVisits) {
    const d = await get('/debris').catch(() => null);
    const list = owned(d?.debris || []);
    if (!list.length) break;
    const t = list[0];
    visits++;
    const before = invSnapshot(await st());
    let stood = await go(t.x, t.y);
    if (!stood) for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
      if (await go(cx, cy)) { stood = true; break; }
    }
    if (!stood) { stuck.add(`${t.x},${t.y}`); continue; }
    await sleep(700);            // Debris.Update 在玩家 64px 内才 collect
    const gain = snapshotGain(before, invSnapshot(await st()));
    const d2 = await get('/debris').catch(() => null);
    const still = (d2?.debris || []).some(x => x.x === t.x && x.y === t.y && Number(x.droppedBy ?? 0) === 0);
    if (gain) picked += gain;
    if (!gain && still) stuck.add(`${t.x},${t.y}`);   // 走到了也没触发 → 这格卡住, 跳过
  }
  if (visits) log(`扫地上掉落: 走了 ${visits} 格, 捡回 ${picked} 件`);
  return picked;
}

// ================= 木箱 =================
// 找附近木箱(/store 只认木箱, 杂货箱不行)
export async function findChest(radius = 18) {
  const sr = await surr(radius);
  const c = sr.tiles.find(t => /Chest/i.test(t.object || ''));
  return c ? { x: c.x, y: c.y, name: c.object } : null;
}

// 按名字存一件进木箱 (纯 HTTP, 不需要 UI)
export async function storeToChest(name, chest) {
  // 2026-11-05 坑: 箱满时 /store 假 ok(桥返回 ok 但物品没动) → 清仓循环拿种子在农场空转一整天(用户抓现行)。
  // 铁律②: 存完必须重读背包, 确认真少了一件才算数。
  // 2026-11-08 坑(§84): ①/store 默认 keepTools=true, 而武器(MeleeWeapon)是 Tool 子类 → 全被跳过
  //   (Galaxy Dagger/Neptune's Glaive 连着几天 stored:[] 把包塞满 35/36 触发"提前收工防丢鱼") → 显式 keepTools:false。
  // ② 家具/部分物品 Name 字段是本地化的 → 英文名匹配不上, displayName 兜底再试一次。
  const s0 = await st();
  const before = invCount(s0, name);
  const it0 = (s0.inventory || []).find(i => i.name === name);
  const r = await post('/store', { name, x: chest.x, y: chest.y, keepTools: false });
  if (r.error) return false;
  await sleep(300);
  if (invCount(await st(), name) < before) return true;
  const dn = it0?.displayName;
  if (dn && dn !== name) {
    const r2 = await post('/store', { name: dn, x: chest.x, y: chest.y, keepTools: false });
    if (r2.error) return false;
    await sleep(300);
    if (invCount(await st(), name) < before) return true;
  }
  log('存箱没生效(' + name + ') —— 箱满/名字不匹配? 该换箱/做新箱');
  return false;
}

// 合成木箱 (需 50 木)
// ⚠️ 10-29 血泪坑: 背包满时合成会 "item dropped" 掉地上! 合成前必须有空格
export async function craftChest() {
  const s = await st();
  if (s.inventory.filter(i => i.name).length >= (s.player.maxItems || 12)) { log('背包满, 拒绝合成(防掉落)'); return false; }  // 2026-11-05: 原写死12格, 联机背包36格被误判满
  const r = await post('/craft', { name: 'Chest' }).catch(e => ({ error: String(e) }));
  log('craft Chest →', JSON.stringify(r).slice(0, 150));
  return !r.error;
}

// 把手上的箱子放到杂货箱(72,14)附近空地, 成功返回箱子坐标
export async function placeChestNearHouse() {
  const spots = [[71, 16], [70, 16], [73, 15], [71, 13], [73, 13], [70, 14], [66, 16], [67, 16], [74, 16], [75, 15], [76, 15], [62, 16], [63, 16]];
  for (const [x, y] of spots) {
    const t = (await surr(14)).tiles.find(z => z.x === x && z.y === y);
    if (!t || t.object || t.crop || t.terrain === 'HoeDirt') continue;
    const r = await useOn(x, y); // 手上需已选中 Chest
    if (r.ok) {
      const c = await findChest(18);
      if (c) { log('箱子放置成功 @', c.x, c.y); return c; }
    }
  }
  log('箱子放置失败(留在背包, 明天再放)');
  return null;
}

// ================= 砍树攒木 (chop.mjs 验证版移植) =================
export async function chopWood(target = 50, staminaFloor = 40) {
  let wood = invCount(await st(), 'Wood');
  const needed = target - wood;
  if (needed <= 0) return wood;
  const sr = await surr(14);
  const trees = sr.tiles.filter(t => /^Tree/.test(t.terrain || ''));
  log('砍树: 现有木', wood, '还差', needed, '| 附近树', trees.length);
  let chopped = 0;
  for (const t of trees) {
    if (chopped >= needed) break;
    // ⭐2026-11-06 事故(Day22): needed 是"还差几块木头", 却被当成"砍几棵树"的上限用;
    //   一棵树实际只掉 2~3 木(剩余散落要捡), 于是硬砍 38 棵、烧掉 180 体力(270→64)。
    //   正解: 每砍 3 棵回读一次背包, 木头到 target 就停。
    if (chopped && chopped % 3 === 0 && invCount(await st(), 'Wood') >= target) {
      log('木头已够', target, ', 停手(已砍', chopped, '棵)');
      break;
    }
    for (let i = 0; i < 20; i++) {
      const s = await st();
      if (s.player.stamina < staminaFloor) { log('体力低停手'); return invCount(await st(), 'Wood'); }
      let ok = false;
      for (const [cx, cy] of [[t.x, t.y + 1], [t.x, t.y - 1], [t.x + 1, t.y], [t.x - 1, t.y]]) {
        if (await go(cx, cy)) { ok = true; break; }
      }
      if (!ok) break;
      await sel('Axe');
      const c = await st();
      await face(faceToward(c.player.x, c.player.y, t.x, t.y));
      await sleep(120);
      await post('/use', {});
      await sleep(250);
      const tile = (await surr(4)).tiles.find(z => z.x === t.x && z.y === t.y);
      if (!tile || !/^Tree/.test(tile.terrain || '')) {
        chopped++;
        log('砍倒 @', t.x, t.y);
        await go(t.x, t.y).catch(() => null);
        await sleep(400);
        break;
      }
    }
  }
  // 走一圈捡掉落
  for (const [x, y] of [[65, 21], [61, 20], [63, 22], [67, 20], [70, 21]]) {
    await go(x, y).catch(() => null);
    await sleep(300);
  }
  wood = invCount(await st(), 'Wood');
  log('砍树后木头:', wood);
  return wood;
}

// ================= 翻地/扩田 (till-plant.mjs 验证版移植) =================
export async function tillTiles(targets = []) {
  await sel('Hoe');
  let tilled = 0;
  for (const [x, y] of targets) {
    const t = (await surr(10)).tiles.find(z => z.x === x && z.y === y);
    if (t && t.terrain === 'HoeDirt') continue;
    if (t && t.object) { log('跳过(有物)', x, y, t.object); continue; }
    const r = await useOn(x, y);
    if (r.ok) tilled++;
    await sleep(300);
  }
  log('翻地', tilled, '/', targets.length);
  return tilled;
}

// 贴着现有田边自动扩格(种子有剩但地不够时用), 最多 maxTiles 格
export async function expandField(maxTiles = 10) {
  const sr = await surr(16);
  const dirt = sr.tiles.filter(t => t.terrain === 'HoeDirt');
  if (!dirt.length) return 0;
  const cand = [];
  for (const d of dirt) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = d.x + dx, ny = d.y + dy;
      if (cand.some(c => c[0] === nx && c[1] === ny)) continue;
      const t = sr.tiles.find(z => z.x === nx && z.y === ny);
      if (!t) continue;
      if (t.terrain === 'HoeDirt' || t.object || t.crop) continue;
      if (/Water|Sea/i.test(t.terrain || '')) continue;
      cand.push([nx, ny]);
    }
  }
  if (!cand.length) return 0;
  log('扩田候选', cand.length, '格, 取', Math.min(maxTiles, cand.length));
  // ⚠️2026-10-29: 直接 /use 锄地是假ok(挥空不动), 唯一可靠锄地通路=行为学框选(3x2实测6/6, 58格全成)
  //
  // ⭐⭐2026-11-12 实修(夏3~6 连掉 13→9→8→7, 一开始怀疑乌鸦): 存档逐格比对抓到被吃的是田区**最外沿**
  //   (62,18) —— 那一格第二天既没有 dead 株、也没有采收记录, 而是 HoeDirt **整块消失**变成空地,
  //   过夜长出一丛 Weeds。乌鸦只会叼走苗、留 HoeDirt; 这里是连土都没了 ⇒ 是我们自己框选的锅:
  //   behaviorSelect 对角(min..max)锄**矩形内每一格**, 矩形跨过有苗的格子时那些苗也被锄掉。
  //   修法: 按候选贪心分组, **每组框出的 bbox 不许包含任何有 crop 的格子**; 一旦会包含就新开一组。
  const cropPt = new Set(sr.tiles.filter(t => t.crop).map(t => t.x + ',' + t.y));
  const bboxHasCrop = (grp) => {
    if (!cropPt.size) return false;
    const xs = grp.map(p => p[0]), ys = grp.map(p => p[1]);
    const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
    for (const k of cropPt) {
      const [cx, cy] = k.split(',').map(Number);
      if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) return true;
    }
    return false;
  };
  const groups = [];
  let cur = [];
  for (const p of cand.slice(0, maxTiles)) {
    if (cur.length && bboxHasCrop([...cur, p])) { groups.push(cur); cur = [p]; }
    else cur.push(p);
  }
  if (cur.length) groups.push(cur);
  try {
    let total = 0;
    for (const grp of groups) {
      const bx = grp.map(p => p[0]), by = grp.map(p => p[1]);
      await sel('Hoe');
      const r = await behaviorSelect(Math.min(...bx), Math.min(...by), Math.max(...bx), Math.max(...by), 'left');
      if (r.ok && r.added > 0) {
        await behaviorWaitDone(5 * 60 * 1000);
        const after = await surr(16);
        const tilled = grp.filter(([x, y]) => after.tiles.some(t => t.x === x && t.y === y && t.terrain === 'HoeDirt')).length;
        log('行为学翻地', tilled, '/', grp.length, groups.length > 1 ? `(组 ${groups.indexOf(grp) + 1}/${groups.length})` : '');
        total += tilled;
      }
    }
    if (total > 0) return total;
  } catch (e) { log('行为学不可用, 回退直接锄:', String(e).slice(0, 60)); }
  return tillTiles(cand.slice(0, maxTiles));
}

// ================= 基础工具 =================
// 截图存盘: await shot('D:/StardewAI/shot.png')
export async function shot(path = 'D:/StardewAI/shot.png') {
  const r = await post('/screenshot', {});
  if (r.image) { fs.writeFileSync(path, Buffer.from(r.image, 'base64')); return true; }
  return false;
}

// 背包里找物品数量
export function invCount(s, name) {
  const it = s.inventory.find(i => i.name === name);
  return it ? (it.stack ?? 1) : 0;
}

// 日志工具
export const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

// ================= 行为学桥接 (BehaviorAutomation+BehaviorBridge, localhost:7845) =================
// 框选区域自动作业(自动寻路+智能换工具+蓄力浇水+动物照料), 替代物理拖框
// ⚠️ ①行为学只在游戏窗口前台时推进作业(源码 Tick 传 Game1.game1.IsActive)
//    ②作业期间不要再发 /move(双方抢角色), 等 behaviorWaitDone 回来再动
//    ③2026-10-29 装, 尚未实机验证 —— 首次使用先 GET /status 确认 behaviorLoaded
const BB = 'http://localhost:7845';
const bbGet = async (p) => (await fetch(BB + p)).json();
const bbPost = async (p, b = {}) => (await fetch(BB + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
})).json();

// 框选并开工: button 默认 'right'(智能换工具池, 自动选斧/镐/锄/镰), 'left'=手持道具/种子/材料
// 返回 {ok,added,removed,mode,smart,state}: added=这次框选生成的任务数
export const behaviorSelect = (x1, y1, x2, y2, button = 'right') => bbPost('/select', { x1, y1, x2, y2, button });
export const behaviorStatus = () => bbGet('/status');
export const behaviorClear = () => bbPost('/clear', {});
export const behaviorPause = () => bbPost('/pause', {});
export const behaviorResume = () => bbPost('/resume', {});
export const behaviorActions = () => bbGet('/actions');
export const behaviorSetAction = (scope, kind, enable) => bbPost('/actions', { scope, kind, enable });

// 等行为学把选区做完(轮询 status), 超时返回最后状态
export async function behaviorWaitDone(timeoutMs = 10 * 60 * 1000) {
  const t0 = Date.now();
  let s = null;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(5000);
    try { s = await behaviorStatus(); } catch { continue; }
    if (!s.hasSession || (!s.active && s.jobs === 0)) break;
  }
  return s;
}

// ================= 白名单清仓(随时可调, day-loop 与手动共用) =================
// 卖 isSellable(鱼+农作物+垃圾) → 其余 shouldStore 存木箱(纯 HTTP); force=true 不看格数直接清
// 2026-11-05: 卖的部分改走 /sell 无点击(sellAllWhitelisted), openBin 只剩兜底 —— 全程零前台
export async function sellAndStore(chest, force = false) {
  let s = await st();
  const items = s.inventory.filter(i => i.name);
  const slots = items.length;
  // 任务保留: 名单内物品绝对不卖(整叠保护, 10-29 曾把乔迪的花椰菜整叠卖掉)
  const sellables = items.filter(i => isSellable(i.name) && !QUEST_RESERVE[i.name]);
  const storables = items.filter(i => shouldStore(i.name));
  if (!force && slots < 11) return 0;
  if (!sellables.length && !(chest && storables.length)) { log('背包' + slots + '/12 无可卖无箱可存, 跳过'); return 0; }
  log('背包', slots + '/12 → 清仓 | 卖:', sellables.map(i => i.name + 'x' + (i.stack ?? 1)).join(',') || '无',
    '| 存箱:', storables.map(i => i.name).join(',') || '无');
  // 存箱走纯 HTTP /store, 不需要前台 —— 必须放在 openBin 之前(openBin 失败曾把存箱一起吞掉, 用户 10-30 抓现行)
  let stored = 0;
  if (chest) {
    const cur0 = await st();
    const curLoc0 = cur0.location?.name || cur0.location;
    if (chest.loc && curLoc0 !== chest.loc) {
      await warp(chest.loc, chest.x, chest.y + 1);
      await sleep(600);
    }
    let chestRetried = false; // 2026-11-06: 箱满曾让 day-loop 僵尸循环 3 天 0 收入 → 满了自动做新箱
    for (let round = 0; round < 12; round++) {
      const it = (await st()).inventory.find(i => i.name && shouldStore(i.name));
      if (!it) break;
      if (await storeToChest(it.name, chest)) { stored++; log('存箱', it.name); await sleep(400); continue; }
      if (!chestRetried) {
        chestRetried = true;
        // 2026-11-08(§84): 满箱先换备用箱再谈做新箱 —— 之前只认一个箱, 最近箱满就整段放弃
        // ⭐⭐⭐2026-11-12 夜实拍: /scan_chests 是**按角色当前所在地图**扫的。尾清仓先把 chest 指向
        //   FarmHouse(9,8) 那个满箱并 warp 进屋 ⇒ 在农舍里只扫到「共 1 个, 有空位 0 个」, 而农场
        //   实际 9 个箱子里 (71,16) 空 23 格、(67,16) 空 5 格 —— 换箱永远换不成, 每晚都"存箱失败"。
        //   ⇒ 扫之前必须人在 Farm, 不在就先拉回农场。
        try {
          const curL = (await st()).location?.name;
          if (curL !== 'Farm') { log('换箱前先回农场(当前', curL + ')'); await warp('Farm', 64, 15); await sleep(500); }
        } catch (e) { log('换箱前回农场失败:', String(e).slice(0, 60)); }
        try {
          const j = await get('/scan_chests');
          const all = (j.chests || []);
          const roomy = all.filter(c => (c.items || []).length < (c.capacity || 36));
          // 2026-11-12: 这行是"为什么没换箱"的唯一证据 —— 之前 catch 吞异常、也不打计数,
          //   日志只剩「箱子满了→做新箱(木头8)→失败」, 看不出是没箱可用还是扫描挂了。
          log(`箱况: 共 ${all.length} 个, 有空位 ${roomy.length} 个` + (roomy.length ? ' → ' + roomy.slice(0, 4).map(c => `(${c.x},${c.y})${(c.items || []).length}/${c.capacity || 36}`).join(' ') : ''));
          const alt = roomy
            .filter(c => !(c.x === chest.x && c.y === chest.y))
            .sort((a, b) => (Math.abs(a.x - 64) + Math.abs(a.y - 15)) - (Math.abs(b.x - 64) + Math.abs(b.y - 15)))[0];
          if (alt) { log('满箱, 换备用箱 @ (' + alt.x + ',' + alt.y + ')'); chest = { x: alt.x, y: alt.y, loc: 'Farm' }; chestRetried = false; continue; }
        } catch (e) { log('换箱扫描失败:', String(e).slice(0, 80)); }
        // ⭐ 2026-11-12 实修: 包里已经有做好的箱子时就先放箱子, 别去凑 50 木头。
        //   那天日志「尝试做新箱 (木头 8)」而背包里躺着 Chest×2 ⇒ 背包 36/36 满到第二天(钓鱼没格子收鱼)。
        const sChest = await st();
        if (sChest.inventory.some(i => i.name === 'Chest')) {
          try {
            if ((sChest.location?.name || '') !== 'Farm') await warp('Farm', 64, 15);
            await sel('Chest');
            const c2 = await placeChestNearHouse();
            if (c2) {
              // findChest 可能又指回那个满箱 → 重扫一遍挑最近的有空位箱
              try {
                const j2 = await get('/scan_chests');
                const alt2 = (j2.chests || []).filter(c => (c.items || []).length < (c.capacity || 36))
                  .sort((a, b) => (Math.abs(a.x - 64) + Math.abs(a.y - 15)) - (Math.abs(b.x - 64) + Math.abs(b.y - 15)))[0];
                if (alt2) { chest = { x: alt2.x, y: alt2.y, loc: 'Farm' }; log('箱已放好, 改用 @ (' + alt2.x + ',' + alt2.y + ')'); chestRetried = false; continue; }
              } catch { }
              chest = { ...c2, loc: 'Farm' }; log('用背包里的箱子放了新箱 @', c2.x, c2.y); chestRetried = false; continue;
            }
          } catch (e) { log('放背包里的箱子失败:', String(e).slice(0, 80)); }
        }
        const s3 = await st();
        log('箱子满了, 尝试做新箱 (木头', invCount(s3, 'Wood') + ')');
        if (invCount(s3, 'Wood') >= 50 && s3.inventory.filter(i => i.name).length < (s3.player.maxItems || 12)) {
          await warp('Farm', 64, 15); // placeChestNearHouse 的备选点位都在农舍门口附近
          await craftChest();
          if ((await st()).inventory.some(i => i.name === 'Chest')) {
            await sel('Chest');
            const c2 = await placeChestNearHouse();
            if (c2) { chest = { ...c2, loc: 'Farm' }; log('新箱已放 @', c2.x, c2.y); continue; }
          }
        }
      }
      log('存箱失败(没木头做新箱/放置失败), 停止重试(防空转)');
      break;
    }
  }
  // 2026-11-05 改无点击: openBin 物理右键整套退休(源码实锤 /sell 直接塞出货箱, 零点击零前台)。
  // 注意: sellAllWhitelisted 返回的是"件数"(按 stack 计), 且内部已入账 itemsSold —— 这里不重复 ledInc。
  let sold = 0;
  try { sold = await sellAllWhitelisted(true); }
  catch (e) { log('无点击卖货异常:', String(e).slice(0, 80)); }
  // 兜底老路: /sell 没清干净才回物理右键(理论上不该走到 —— 走到说明桥太旧/没在 Farm)。
  // ⚠️这条路抢前台+动真鼠标, 有前台互锁; 走到它本身就说明该修桥而不是修脚本。
  if ((await st()).inventory.some(i => i.name && isSellable(i.name) && !QUEST_RESERVE[i.name])) {
    log('!! /sell 后包里仍有可卖物品 → 回退 openBin 老路(需要前台, 仅兜底)');
    for (let pass = 0; pass < 6; pass++) {
      const left = (await st()).inventory.filter(i => i.name && isSellable(i.name) && !QUEST_RESERVE[i.name]).length;
      if (!left) break;
      const opened = await openBin(); // 内含前台互锁
      if (!opened) { log('杂货箱没开成(前台被占/残留菜单), 存箱已完成', stored, '件, 卖货稍后再试'); break; }
      for (let round = 0; round < 25; round++) {
        s = await st();
        if (s.activeMenu?.type !== 'ItemGrabMenu') break;
        const item = s.inventory.find(i => i.name && isSellable(i.name));
        if (!item) break;
        // 必须用 item 自己的 slotIndex(inventory 数组会跳过空格, 数组下标≠格子)
        const idx = item.slotIndex ?? s.inventory.findIndex(i => i.name === item.name);
        const x = 265 + (idx % 12) * 65, y = idx < 12 ? 478 : 545;
        await post('/menu/click', { x, y }).catch(() => null);
        await sleep(800);
        s = await st();
        if (!s.inventory.some(z => z.name === item.name)) { sold++; log('投放', item.name); }
        else { log('投放失败', item.name); break; }
        if (s.activeMenu?.type !== 'ItemGrabMenu') break;
      }
      await post('/menu_close', {}); await sleep(500);
      await post('/menu_close', {}); await sleep(300);
    }
    if (sold) ledInc('itemsSold', sold, '清仓卖出(老路兜底)');
  }
  // (存箱已前置到 openBin 之前, 这里只管卖)
  s = await st();
  log('清仓', sold, '件 存箱', stored, '件 | 钱', s.player.money, '| 格子', s.inventory.filter(i => i.name).length + '/12');
  if (stored) ledInc('itemsStored', stored, '存木箱');
  return sold;
}

// ================= 无点击卖货 (2026-11-04 ilspycmd 反编译实锤) =================
// 源码证据(HandleSell): farm.getShippingBin(player).Add(item) —— 直接把物品塞进出货箱,
// 零物理点击、零 UI、零前台依赖; 下次睡觉结算照常变成钱。
// ⚠️ 必须逐个按名字投; 绝不能传 all:true(源码里 sellAll 分支跳过名字过滤 = 卖光非种子非工具非任务品)
// ⚠️ 必须在 Farm 地图(源码: getShippingBin 只对 Farm 有效, 否则 "No shipping bin found")
// 返回 { ok, sold:[{item,count,price}], totalItems }
export async function sellByName(name, count) {
  const body = count ? { name, count } : { name };
  return post('/sell', body);
}
// 💥 2026-11-07 事故: 手搓 {items:[{name,count},...]} 数组格式喂 /sell —— 桥不认这个格式,
//   实测把包里一堆"可卖白名单外"的东西全投了出货箱(Wood/Seaweed/Coal/Emerald/Geode/Nautilus Fossil 全没)。
//   教训: /sell 只认 {name} 或 {name,count} 单物品格式(见上), 要卖多种就逐个 sellByName, 同名多叠先合并 count。

// 把所有 isSellable(且不在 QUEST_RESERVE) 的整叠逐个投进出货箱, 不依赖前台
// 与旧 openBin 的区别: 无物理右键 → 用户在用电脑时也能卖
export async function sellAllWhitelisted(verbose = true) {
  const cur = await st();
  const loc = cur.location?.name || cur.location;
  if (loc !== 'Farm') {
    const w = await warp('Farm', 72, 15).catch(() => null);
    if ((await st()).location?.name !== 'Farm') {
      if (verbose) log('不在 Farm 且 warp 失败, 无法用出货箱');
      return 0;
    }
  }
  let total = 0;
  for (let round = 0; round < 12; round++) {
    const s = await st();
    const items = s.inventory.filter(i => i.name && isSellable(i.name) && !QUEST_RESERVE[i.name]);
    if (!items.length) break;
    let moved = 0;
    for (const it of items) {
      const r = await sellByName(it.name);
      if (r?.ok && Array.isArray(r.sold) && r.sold.length) {
        moved += r.sold.reduce((a, x) => a + (x.count ?? 1), 0);
        if (verbose) log('投箱', it.name + 'x' + (it.stack ?? 1), '→', (r.sold[0]?.price ?? 0) + 'g');
        ledInc('itemsSold', r.sold.length, '投出货箱');
      } else {
        if (verbose) log('投箱失败', it.name, JSON.stringify(r).slice(0, 80));
        break;
      }
    }
    total += moved;
    if (!moved) break;
  }
  const s2 = await st();
  if (verbose) log('无点击卖货完成:', total, '件 | 包里还剩可卖', s2.inventory.filter(i => i.name && isSellable(i.name) && !QUEST_RESERVE[i.name]).length, '种');
  return total;
}

// 室内传送(2026-10-29验证: POST /warp_into {location,x,y})
export async function warp_into(loc, x, y) {
  return post('/warp_into', { location: loc, x, y });
}
// 村民速查: 位置/是否在睡/当前台词 (GET /find_npc?name=X)
export async function findNpc(name) {
  return get(`/find_npc?name=${encodeURIComponent(name)}`);
}

// ================= star 项目借鉴(2026-10-30): 精简状态/累计账本/结构化记忆/区域配置 =================

// --- 精简世界状态(增量快照的基元): 一行日志说清"钱/体力/时间/位置/格子", 防日志膨胀 ---
export function compactState(s) {
  if (!s?.player) return 'state?';
  const slots = (s.inventory || []).filter(i => i.name).length;
  return `Day${s.time?.dayOfMonth} ${s.time?.timeOfDay} 钱${s.player.money} 体${Math.round(s.player.stamina)} `
    + `${s.location?.name || s.location}@(${s.player.x},${s.player.y}) 格${slots}/12`
    + (s.activeMenu ? ` 菜单:${s.activeMenu.type}` : '');
}

// 相邻两次 /state 的差分(只报变化字段), day-loop 轮询时用它替代整包日志
export function stateDelta(prev, cur) {
  if (!prev) return { money: cur.player?.money, stamina: cur.player?.stamina, first: true };
  const d = {};
  if (prev.player?.money !== cur.player?.money) d.money = cur.player.money;
  if (Math.round(prev.player?.stamina ?? -1) !== Math.round(cur.player?.stamina ?? -1)) d.stamina = Math.round(cur.player.stamina);
  if (prev.time?.timeOfDay !== cur.time?.timeOfDay) d.time = cur.time.timeOfDay;
  if ((prev.location?.name || prev.location) !== (cur.location?.name || cur.location)) d.loc = cur.location?.name || cur.location;
  if (prev.player?.x !== cur.player?.x || prev.player?.y !== cur.player?.y) d.xy = [cur.player.x, cur.player.y];
  const pm = prev.inventory?.filter(i => i.name).length ?? 0;
  const cm = cur.inventory?.filter(i => i.name).length ?? 0;
  if (pm !== cm) d.slots = `${pm}->${cm}`;
  if (!!prev.activeMenu !== !!cur.activeMenu) d.menu = cur.activeMenu?.type || null;
  return Object.keys(d).length ? d : null;
}

// --- 累计账本 ledger.json: 累计值单独存, recent 只留 20 条有界预览(防历史无限膨胀) ---
// 铁律: 累计只增不减; "调用结束≠数量完成", 数字一律来自回执差分, 不来自动作标题
const LEDGER_PATH = process.env.STARDEW_LEDGER || 'D:/StardewAI/ledger.json';
function ledLoad() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch { return { totals: {}, recent: [] }; }
}
function ledSave(l) {
  try {
    const tmp = LEDGER_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(l, null, 1));
    fs.renameSync(tmp, LEDGER_PATH);
  } catch { }
}
export function ledInc(field, n = 1, note = '') {
  const l = ledLoad();
  l.totals[field] = (l.totals[field] ?? 0) + n;
  if (note || n !== 1) l.recent.unshift({ t: new Date().toISOString(), field, n, note });
  l.recent = l.recent.slice(0, 20);
  ledSave(l);
  return l.totals[field];
}
export function ledSnapshot() { return ledLoad(); }

// --- save 级结构化记忆 memory-save.json (star companion_memory 借鉴) ---
// 条目: {id,kind,text,status,createdAt,supersededBy,source}; kind: rule|event|method|pref
// 修订不删原文: correct/supersede 把旧的标 superseded 并挂新条目, 冲突有据可查
// event 类自动封顶 60 条(最旧的直接挤掉, 事件没有修订价值)
const MEM_PATH = 'D:/StardewAI/memory-save.json';
const SAVE_ID = '肥鱼肥鱼_452739119';
function memLoad() {
  try { return JSON.parse(fs.readFileSync(MEM_PATH, 'utf8')); } catch { return { saveId: SAVE_ID, nextId: 1, entries: [] }; }
}
function memSaveDb(m) {
  const tmp = MEM_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 1));
  fs.renameSync(tmp, MEM_PATH);
}
export function memAdd(kind, text, source = 'day-loop') {
  const m = memLoad();
  const e = { id: m.nextId++, kind, text: String(text).slice(0, 300), status: 'active', createdAt: new Date().toISOString(), source };
  m.entries.push(e);
  if (kind === 'event') {
    const evs = m.entries.filter(x => x.kind === 'event');
    if (evs.length > 60) for (const old of evs.slice(0, evs.length - 60)) old.status = 'dropped';
  }
  memSaveDb(m);
  return e.id;
}
export function memCorrect(id, newText, why = '') {
  const m = memLoad();
  const old = m.entries.find(e => e.id === id && e.status === 'active');
  if (!old) return null;
  old.status = 'superseded';
  const e = { id: m.nextId++, kind: old.kind, text: String(newText).slice(0, 300), status: 'active', createdAt: new Date().toISOString(), source: `correct#${id}${why ? ':' + why : ''}` };
  m.entries.push(e);
  memSaveDb(m);
  return e.id;
}
export function memRevoke(id, why = '') {
  const m = memLoad();
  const old = m.entries.find(e => e.id === id && e.status === 'active');
  if (!old) return false;
  old.status = 'revoked';
  if (why) old.note = why;
  memSaveDb(m);
  return true;
}
export function memList(kind = null) {
  const m = memLoad();
  return m.entries.filter(e => e.status === 'active' && (!kind || e.kind === kind));
}

// --- 农场区域配置 farm-region.json (star farmRegion 借鉴): 扩田行为读它, 不靠口头规矩 ---
const REGION_PATH = 'D:/StardewAI/farm-region.json';
export function regionConfig() {
  try { return JSON.parse(fs.readFileSync(REGION_PATH, 'utf8')); }
  catch {
    const def = {
      policy: '冻结', maxTiles: 90, expansionDirection: null, reservedPaths: [],
      note: 'M1(铜水壶2000g+10洒水器)完成前不扩田 — farm-master-plan.md 战略定调',
      updatedAt: new Date().toISOString()
    };
    try {
      const tmp = REGION_PATH + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(def, null, 1));
      fs.renameSync(tmp, REGION_PATH);
    } catch { }
    return def;
  }
}

// ⭐⭐⭐ 2026-11-13 春2 实测：`/surroundings` 的矩形模式**只回 x/y/passable/diggable**，
// 压根没有 terrain/object/crop（反编译 HandleSurroundings：terrainFeatures 里查不到的格
// 就不填 terrain 字段）。⇒ 想"看田里有几格草 / 几格是翻地 / 作物在哪" 一律走 `/passable_rect`，
// 它回 terrain(Grass/Tree/HoeDirt)/object/largeTerrain，实测 Farm 田区 130 格一次到位。
// 别再用 surr()/surrFarm() 去判草：那些格子 `t.terrain` 是 undefined，过滤条件会全部漏过。
export async function fieldTiles(x1 = 58, y1 = 17, x2 = 70, y2 = 26, location = 'Farm') {
  const r = await get(`/passable_rect?location=${location}&x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}`).catch(() => null);
  if (!r?.tiles?.length) return null;   // null = 读不到，别当成"田里全空"
  return r.tiles;
}
// ⭐⭐⭐ 2026-11-13 春2 冷启动翻地 0/40 的真因，两条铁律：
// ① **先有草必须先锄草**：Spring 换季把 HoeDirt 洗掉后整片田是 Grass(TerrainFeature)，
//    `/till_area` 看到 terrainFeatures 里有非 HoeDirt 的条目就记 `occupied`（反编译 HandleTillArea
//    28198：先查 terrainFeatures → 是 HoeDirt 记 already_tilled，否则 occupied，才轮到 objects/Diggable）。
//    实测田区 107 格草 107 格全是 Diggable —— 所以跳过锄草怎么犁都是 0。
// ② `/clear_ground` 是**一格一个请求**（`?x=&y=`，HandleClearGround 只解析单点），不收 tiles 数组；
//    逐格发上限 60 格，发完**必须重读 terrain** 确认草真没了（它恒回 ok:true，不看就假绿）。
// ⭐ 读农场前必须过这道：人在室内时 /surroundings 的矩形会被静默夹成 11×11，
// 返回 ok:true + tiles:[]，看着像"田里什么都没有"。下面这个封装会先 warp 到农场，
// 并校验 scanned 是否等于请求的矩形，不相等就抛错，绝不返回空数组让人误判。
export async function surrFarm(x1 = 50, y1 = 14, x2 = 68, y2 = 28) {
  const go = await post('/warp', { location: 'Farm', x: 64, y: 18 });
  await sleep(1800);
  const d = await get(`/surroundings?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}`);
  const sc = d.scanned || {};
  if (d.location !== 'Farm' || sc.x2 !== x2 || sc.y2 !== y2) {
    throw new Error(`surroundings 被夹范围: location=${d.location} scanned=${JSON.stringify(sc)}`);
  }
  return d;
}

// ⭐⭐⭐ 背包：桥没有 /inv 端点，但 /state 里一直有完整 inventory 数组
// （每个槽带 name/displayName/itemId/slotIndex/stack/quality/sellable/edibleValue/value）。
// 2026-11-09 春25 才发现 —— 之前一直误以为"桥读不到背包"，跑去用 /craft_recipes 猜。
// 返回 { 名字: 总数量 }，同名的多个槽会累加。
export async function inv() {
  const s = await st();
  const out = {};
  for (const it of s.inventory || []) {
    if (!it || !it.name) continue;
    out[it.name] = (out[it.name] || 0) + (it.stack || 1);
  }
  return out;
}

// 单个物品有多少个（没有就是 0）
export async function invCount2(name) {
  const m = await inv();
  return m[name] || 0;
}

// ⭐⭐⭐ /wakeup 的名字是骗人的：源码 HandleWakeup 只是「把玩家瞬移到当前地图 warps[0] 那道门」，
// 不碰 isInBed；而且 ok:true 里的 x/y 是"门的坐标"，不是玩家落地坐标，
// Game1.warpFarmer 排队后立刻 SetResult —— 人没动它照样报成功。
// 这个封装：调完轮询 /state，location 真的变了才返回 true，否则抛错。
// ⚠️ 她正在等换日（inBed && sleepReady 已 ready）时禁止调 /wakeup —— 会把当晚换日搞掉。
export async function wakeupOk({ want = null, timeoutMs = 6000, pollMs = 400 } = {}) {
  const before = await st();
  const from = before.location?.name;
  await post('/wakeup', {});
  const t0 = Date.now();
  let last = before;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(pollMs);
    last = await st();
    if (last.location?.name !== from && (!want || last.location?.name === want)) return true;
  }
  throw new Error(`/wakeup 假成功: 仍在 ${last.location?.name}(${last.player?.x},${last.player?.y})，未离开 ${from}`);
}
