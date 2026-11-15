// 全自主日循环 v3 (2026-10-28)
// 政策(用户拍板): 只卖 鱼+农作物+垃圾(lib.isSellable 白名单); 其余存木箱/留背包 绝不卖
//                 体力用到 <15 才收工(用完再睡不浪费); 物理点击有前台互锁(用户可能玩别的游戏)
// 流程/天: 一键收+右键补收 → 信箱 → 浇水 → 通用补种 → 扩田 → 攒木做箱 → 白名单卖货/存箱
//          → 海滩钓鱼(fishbot) → 23:00 或体力<15 收工 → 尾清仓 → 回家睡觉
// ⭐⭐⭐2026-11-11 主人拍板「为什么要三天，直接一直环，非意外不停」: 一次运行不再限 3 个游戏日
//   (旧设计 MAX_DAYS=3 自退后靠人/watchdog 接, 禁窗期没人接就整段空转) —— 现在无限环,
//   玩到点睡、睡醒接着玩, 只有意外才停(游戏没了/主线程验活失败/stopRequested), 见主流程处注释。
//   拉起它的仍是 farm-watchdog(每分钟判活); 锁文件防并发: 手动/watchdog 重复拉起时靠锁避免双实例打架。
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  st, warp, sel, useOn, waterAll, plantBatch, log, invCount, sleep, post, get, surr,
  fishbotSet, foregroundIsStardew,
  isSellable, shouldStore, harvestAll, sellAndStore,
  findChest, storeToChest, craftChest, placeChestNearHouse,
  chopWood, expandField, clearDeadCrops, cleanInventoryJunk,
  compactState, ledInc, ledSnapshot, memAdd, memList, regionConfig, worldAlive,
  behaviorStatus, behaviorSelect
} from './lib.mjs';

// 收工体力目标(star rest 借鉴: 阈值收口成常量, 调整不用翻流程) — 政策仍是"用完再睡不浪费"
const REST_TARGET = 15;
// ⭐2026-11-11 主人拍板「每天24点准时兜底睡觉」。游戏时间编码是 hhmm 的变体:
//   2400=午夜, 2520=凌晨1:20, 2600=2:00 强制倒地. 取 2520 = 比强制倒地早 40 游戏分钟收工,
//   给"走到床边+进被窝+ShippingMenu 结算+SaveGameMenu 写盘"留余量; 留不到就会倒地罚钱。
//   ⚠️ 三处必须同值: day-loop / fish-night-guard / host-night-guard, 改一处等于没改。
const BED_TIME = 2520;

// ⭐⭐2026-11-11 主人: 「loop 里常驻给包里补充一些食品」「体力见底要么回体力要么吃东西」。
//   以前体力<15 就收工 → 天天 22:10 就换日(实测 host-night-guard 16:48:27 "时间2210 体12"),
//   主人定的 24:00 睡觉那条根本没轮到。现在: 每天早上把包里补到 FOOD_TARGET 份, 钓鱼途中体力低就吃。
//   选 Salad((O)196): 220g / 回 113 体力 = 1.95g/体力, 比花椰菜(175g 卖价 / 75 体力)划算, 且不用厨房。
//   /buy 走 HandleBuy: 纯内存 Create + 扣钱, 不需要站在商店里(和补鱼饵同一条路)。
const FOOD_ID = '(O)196';
const FOOD_NAME = 'Salad';
const FOOD_TARGET = 10;   // 包里常备几份
const EAT_BELOW = 60;     // 体力低于这个就吃(留出从海滩走到床的余量)
const EAT_UNTIL = 180;    // 吃到这个以上再回去钓
const foodCount = (inv) => (inv || []).filter(i => i?.name === FOOD_NAME).reduce((a, i) => a + (i.stack ?? 1), 0);
// ⭐⭐⭐2026-11-11 实测: 桥的 /state.inventory **只列有东西的格子**, 空槽根本不在数组里
//   (36 格只回 25 个对象, slotIndex 还不连续)。所以"数空槽"必须用 maxItems - 已占格数,
//   用 `filter(i => !i.name).length` 结构上恒为 0 → `free < 1` 永远成立 → 一份食品都买不到
//   (那天日志连刷三条「🍞 没空格补食品, 跳过」, 而实际空着 11 格)。
const freeSlots = (s) => Math.max(0, (s.player?.maxItems ?? 36) - (s.inventory || []).filter(i => i?.name).length);

async function ensureFood() {
  try {
    const s = await st();
    const have = foodCount(s.inventory);
    if (have >= FOOD_TARGET) { log(`🍞 食品充足: ${FOOD_NAME} x${have}`); return have; }
    const free = freeSlots(s);
    if (free < 1) { log(`🍞 没空格补食品(${(s.inventory || []).filter(i => i?.name).length}/${s.player?.maxItems ?? 36}), 跳过(等清仓后再说)`); return have; }
    const need = Math.min(FOOD_TARGET - have, free);   // 空格不够就买到装满, 别指望一次买齐
    const b = await post('/buy', { id: FOOD_ID, quantity: need, price: 220 }).catch(() => null);
    if (!b?.ok) { log('🍞 补食品失败:', JSON.stringify(b).slice(0, 120)); return have; }
    const after = foodCount((await st()).inventory);
    log(`🍞 补食品: ${FOOD_NAME} +${need} (${b.totalCost}g, 单价${b.unitPrice}) → 包里 x${after}`);
    return after;
  } catch (e) { log('🍞 补食品异常:', e.message); return 0; }
}

// 吃到 until 以上。⚠️ 有菜单(钓鱼小游戏/商店/结算)时绝不碰, 会打断那条链。
async function eatUp(until) {
  let n = 0;
  try {
    let s = await st();
    if (s.activeMenu) { return 0; }
    while (Math.round(s.player?.stamina ?? 0) < until && n < 12) {
      if (foodCount(s.inventory) <= 0) { log('🍞 食品吃完了, 该去补货'); break; }
      await sel(FOOD_NAME);
      await sleep(400);
      const r = await get('/eat').catch(e => ({ error: String(e) }));
      await sleep(1200);
      s = await st();
      n++;
      log(`🍞 吃 ${FOOD_NAME} → 体力 ${Math.round(s.player?.stamina ?? 0)}`, r?.ok === false ? JSON.stringify(r).slice(0, 80) : '');
    }
    // 吃完把竿换回手上 + 面朝右(钓鱼段的既定姿态)
    if (n > 0) {
      const inv = (await st()).inventory || [];
      const rod = inv.find(i => /Iridium Rod/i.test(i?.name || '')) || inv.find(i => /Rod|Pole/i.test(i?.name || ''));
      if (rod) { await sel(rod.name); await sleep(300); }
      await post('/face', { direction: 1 }).catch(() => { });
      await sleep(300);
    }
  } catch (e) { log('🍞 吃异常:', e.message); }
  return n;
}

// ⭐2026-11-06 存档事故: /sleep 返回 ok 不等于写盘。每次睡完必须看 SaveGameInfo 的 mtime 有没有前进,
//   否则会像冬3~冬8 那样"天天换日、一次没存"(存档停在冬2 10:19, 重读丢了 6 天)。
const SAVE_INFO = 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo';
const saveMtime = () => { try { return fs.statSync(SAVE_INFO).mtimeMs; } catch { return 0; } };

// ===== 锁文件: 防止 cron 重复拉起多实例 =====
const LOCK = 'D:/StardewAI/.day-loop.lock';
try {
  const age = Date.now() - fs.statSync(LOCK).mtimeMs;
  if (age < 10 * 60 * 1000) {
    console.log('已有 day-loop 实例在跑(锁龄', Math.round(age / 1000), 's), 退出');
    process.exit(0);
  }
} catch { /* 无锁, 继续 */ }
// ⭐双保险(2026-11-06): 锁文件曾被外部误删 → 巡检+手动各拉一个实例, 两个实例抢一个角色
//   (症状: 一边在海滩开 fishbot 一边在田里浇水 = "田里抛竿/拿鱼竿浇水")。进程级再查一次。
try {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/get-dayloop-pids.ps1', { encoding: 'utf8', timeout: 15000 });
  const others = out.split(/\s+/).map(Number).filter(pid => pid && pid !== process.pid);
  if (others.length) { console.log('发现其他 day-loop 进程', others, ', 退出(防两实例抢角色)'); process.exit(0); }
} catch { /* 进程查询失败则退回锁文件兜底 */ }
fs.writeFileSync(LOCK, process.pid + ' ' + new Date().toISOString());
const heartbeat = setInterval(() => { try { fs.utimesSync(LOCK, new Date(), new Date()); } catch { } }, 60000);
process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch { } });

// ⭐⭐⭐2026-11-11 主人: 「等 loop 报账 / reporter 按 schema 等事件」—— 五处安全点发结构化事件 + 一个停止信号口子。
//   reporter(队友)按 schema 收; 事件一律**追加**到 .day-loop.events.jsonl, 一行一个 JSON, 谁都能 tail 对账。
//   ⚠️停止检查点只放在这五处 + 钓鱼 20s 心跳: 睡眠 attempt 内 / ShippingMenu 挂着 / 清仓做到一半 **绝不**读 stop(醒了会丢当天存档链)。
const EVENTS = 'D:/StardewAI/.day-loop.events.jsonl';
const BEAT = 'D:/StardewAI/.day-loop.beat';      // 给外部判活: 不用锁 mtime(锁会被 process.on('exit') 删)
const STOP = 'D:/StardewAI/.day-loop.stop';
const emit = (phase, data) => {
  const d = globalThis.__dlS || {};
  const day = d.time ? `${d.time.season}|${d.time.year}|${d.time.dayOfMonth}` : null;
  const obj = { at: new Date().toISOString(), pid: process.pid, day, phase, ...(data || {}) };
  try { fs.appendFileSync(EVENTS, JSON.stringify(obj) + '\n'); } catch { }
  // 队友 loop-reporter 的消费格式: {ts, phase, day, season, t, data} —— 他硬依赖 ts + phase, 字段名定了别改
  try { fs.appendFileSync('D:/StardewAI/loop-events.jsonl', JSON.stringify({ ts: Date.now(), phase, day, season: d?.time?.season ?? null, t: d?.time?.timeOfDay ?? null, data: data || {} }) + String.fromCharCode(10)); } catch { }
  return obj;
};
// 判活分两个信号, 含义不同, 别混:
//   .day-loop.beat = 里程碑(只在 emit 时写) —— 表示"流程在往前走"
//   .day-loop.tick = 60s 定时(和锁同频) —— 表示"主线程还能跑到事件循环"
// ⭐2026-11-11 队友(loop-reporter)实测: 农活长段十几分钟没有里程碑, beat 单用 300s 阈值会假报"心跳停了";
//   而 /tool_area 那种长任务是**同步占住主线程**的, 定时器会被一起饿住 → tick 和锁会同时停, 判据仍然诚实。
//   对外约定: tick ≤180s 或 beat ≤300s 任一新鲜即算活, 两边都停 >3 分钟才算"可能卡住"。
const TICK = 'D:/StardewAI/.day-loop.tick';
const beatWrite = () => { try { fs.writeFileSync(BEAT, String(Date.now())); } catch { } };
const tickWrite = () => { try { fs.writeFileSync(TICK, String(Date.now())); } catch { } };
beatWrite(); tickWrite();
setInterval(tickWrite, 60000);
// 返回 true = 调用方该干净退出(不是崩: 收手前已过安全点)
function stopRequested() {
  if (!fs.existsSync(STOP)) return false;
  let why = ''; try { why = fs.readFileSync(STOP, 'utf8').trim(); } catch { }
  try { fs.unlinkSync(STOP); } catch { }
  emit('stopped', { why });
  log('🛑 收到 .day-loop.stop → 在安全点优雅退出:', why.slice(0, 120) || '(无理由)');
  return true;
}


const SEED_RE = /Seeds$|Starter$|Shoot$/i;

// 2026-11-10 补全四季真正的节日(旧表只有冬季特色活动, 主人追问「夏天有节日吧」才发现漏了一大片).
// 来源 = 现跑游戏的 Data/Festivals/<season><day>: 7842 /festival_data?season=&day= 四季度 112 天只有这 8 天 ok:true.
// 鱿鱼节(冬12/13)/夜市(冬15-17) 不是正式节日, 单独留在下面的 WINTER_EVENTS 里.
const FESTIVAL_DAYS = {
  'spring13': '复活节', 'spring24': '花舞节',
  'summer11': '夏威夷宴会', 'summer28': '月光水母之舞',
  'fall16': '星露谷展览会', 'fall27': '万灵节',
  'winter8': '冰雪节', 'winter25': '冬日星盛宴',
};
const festivalToday = (s) => FESTIVAL_DAYS[String(s?.time?.season || '') + String(s?.time?.dayOfMonth || '')] || null;

// ⭐⭐⭐ 2026-11-10 摸鸡终于跑通(鱼鱼卡了两天): 关键既不是朝向、也不是多按几次, 是**人得挨着鸡**.
//   /animals 给的 x,y 是鸡**当前**所在格, 鸡自己会走 —— warp 过去它早就挪窝了, 于是 /interact {x,y}
//   永远 ok:true + actionTriggered:false("ok 骗人", 见手册坑4/坑6)。
//   正确顺序(每步都要重读): /animals → 站到它四邻之一 → **再读一次**确认曼哈顿距离==1 → interact → 再读 wasPetToday。
//   亲密度 +15/次(实测 8→23), 判据只认 wasPetToday, 不认 actionTriggered。
//   ⚠️ 它返回的是格子坐标, 别拼 JSON 字符串(会出 '3' is invalid after a value), 一律对象体。
async function petAnimals() {
  const all = (await get('/animals')).animals || [];
  const need = all.filter(a => !a.wasPetToday);
  if (!need.length) { log('摸动物: 今天都摸过了'); return; }
  let done = 0;
  for (const want of need) {
    for (let round = 0; round < 6; round++) {
      const now = ((await get('/animals')).animals || []).find(a => a.name === want.name);
      if (!now || now.wasPetToday) { if (now) done++; break; }
      let hit = false;
      for (const [sx, sy] of [[now.x - 1, now.y], [now.x + 1, now.y], [now.x, now.y - 1], [now.x, now.y + 1]]) {
        await warp('Farm', sx, sy);
        await sleep(900);
        const s = await st();
        if (s?.location?.name !== 'Farm' || s.player.x !== sx || s.player.y !== sy) continue;
        const t2 = ((await get('/animals')).animals || []).find(a => a.name === want.name);
        if (!t2 || Math.abs(t2.x - sx) + Math.abs(t2.y - sy) !== 1) continue; // 它走了, 换邻格/下一轮
        await post('/interact', { x: t2.x, y: t2.y });
        await sleep(500);
        const a3 = ((await get('/animals')).animals || []).find(a => a.name === want.name);
        if (a3?.wasPetToday) { log(`摸动物: ${want.name} ✓ 亲密度 ${a3.friendship}`); done++; }
        hit = true;
        break;
      }
      if (hit) break;
      await sleep(1000);
    }
  }
  log(`摸动物完成: ${done}/${need.length}`);
}

// ⭐⭐ 2026-11-13 假绿修复: /animals 扁平列表只含【室外】动物 —— 鸡在 inBuildings{"Coop":2} 里,
//   旧逻辑读到空表 → 永远「今天都摸过了」(farm_report 的 wasPetToday:false 才是真相, 巡检实锤)。
// ⭐⭐⭐ 2026-11-13 二次翻案(冬21 live 三连实测): 建筑内**桥侧走位全废** ——
//   ① /move {鸡自己的格子} 每轮直接 "No path from (2,9) to (9,5)" (室内图寻路根本不工作);
//   ② /warp_into 鸡四邻一律 "(x,y) 附近没有可站的格子", 连人正站着的 (2,9) 都报不可站;
//   ③ 只有 door /interact 进得去(落点固定 (2,9))。
//   ⇒ 任何"桥自己走位"的室内方案都不成立(旧版 10 轮 /move 因此永远 完成 0)。
//   正解 = BWF 行为学(7845): 它的 smart 池里就有 Pet(/actions 实测), 用游戏内寻路走进围栏摸,
//   只需框住动物矩形。落地后仍以 /animals.wasPetToday 为准做对账(不认 BWF 自己的"成功")。
async function petAnimalsIndoor() {
  try {
    const meta = await get('/animals');
    const names = Object.entries(meta.inBuildings || {}).filter(([, v]) => v > 0).map(([k]) => k);
    if (!names.length) return;
    for (const bname of names) {
      const fb = await get('/farm_buildings').catch(() => null);
      const b = ((fb?.buildings) || []).find(x =>
        String(x?.type || '').toLowerCase().includes(bname.toLowerCase()) ||
        String(x?.typeDisplay || '').includes(bname));
      if (!b || b.doorX == null) { log(`摸动物(室内): ${bname} 门没找到`, JSON.stringify(fb || {}).slice(0, 150)); continue; }
      const dx = b.doorX, dy = b.doorY;
      await warp('Farm', dx, dy + 1);
      await sleep(700);
      await post('/interact', { x: dx, y: dy }).catch(() => null);
      await sleep(1600);
      const s = await st();
      if (s?.location?.name !== bname) { log(`摸动物(室内): ${bname} 进不去(loc=${s?.location?.name})`); continue; }
      const todoA = ((await get('/animals')).animals || []).filter(a => !a.wasPetToday);
      if (!todoA.length) { log(`摸动物(室内${bname}): 今天都摸过了`); await warp('Farm', 64, 15).catch(() => null); await sleep(900); continue; }
      try {
        const bw = await behaviorStatus();
        if (!bw?.windowActive) {
          log(`摸动物(室内): 游戏不在前台(BWF windowActive=false) → 今天跳过, 不硬摸`);
        } else {
          const xs = todoA.map(a => a.x), ys = todoA.map(a => a.y);
          // ⭐21:31 首跑通: pad=1 一次就 已摸 2/2。但此前三次都翻车 ⇒ 失败换大框重试一次(总耗时仍远小于出勤损失)。
          for (let attempt = 0; attempt < 2; attempt++) {
            const pad = attempt + 1;
            const r = await behaviorSelect(Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad),
                                           Math.max(...xs) + pad, Math.max(...ys) + pad, 'right');
            log(`摸动物(室内${bname}): BWF 框选(第${attempt + 1}次 pad=${pad}) ${todoA.map(a => a.name + '(' + a.x + ',' + a.y + ')').join(' ')}`,
              JSON.stringify(r || {}).slice(0, 120));
            // 自验等待: 只看 /animals 是否全绿(不信 BWF 的 active/jobs), 第一次 45s / 第二次 20s 封顶。
            // ⭐21:11 实测: select 后 BWF 回 {state:"planning", added:14}, 但第 8 秒 active/jobs 短暂归零
            //   (规划间隙) → 旧的「8s 没活就 break」把还没开始的摸鸡判成失败(已摸 0/2)。
            //   ⇒ BWF 的 active/jobs 不是完成信号, 只认 /animals.wasPetToday 全绿或等满上限。
            const t0 = Date.now();
            const cap = attempt === 0 ? 45000 : 20000;
            while (Date.now() - t0 < cap) {
              await sleep(2500);
              const arr = ((await get('/animals')).animals || []);
              if (!arr.filter(a => !a.wasPetToday).length) break;
            }
            const leftMid = ((await get('/animals')).animals || []).filter(a => !a.wasPetToday);
            if (!leftMid.length) break;
            log(`摸动物(室内${bname}): 第${attempt + 1}次没全绿, 还没摸: ${leftMid.map(a => a.name).join(',')}`);
          }
        }
      } catch (e) { log('摸动物(室内): BWF 失败', String(e).slice(0, 80)); }
      const after = ((await get('/animals')).animals || []);
      const left = after.filter(a => !a.wasPetToday).map(a => a.name);
      log(`摸动物(室内${bname}): 已摸 ${after.filter(a => a.wasPetToday).length}/${after.length}` + (left.length ? ` | 还没摸: ${left.join(',')}` : ' | 全绿'));
      await warp('Farm', 64, 15);
      await sleep(900);
    }
    // ⭐春2 实测缺口: 室外步可能漏摸(动物恰在门口/移动中, interact 未命中 → "摸动物完成: 0/1"),
    //   而室内步只认 inBuildings ⇒ 漏摸的室外动物当天没人管。
    //   收尾补一刀: 只要扁平列表里还有没摸的(=室外动物), 用 BWF 框选补 —— BWF 自己寻路, 不吃
    //   「manhattan==1 才 interact」的亏。依旧只认 wasPetToday 全绿, 30s 封顶, 不阻塞晨链。
    try {
      const left = ((await get('/animals')).animals || []).filter(a => !a.wasPetToday);
      if (left.length) {
        const bw2 = await behaviorStatus();
        if (bw2?.windowActive) {
          const xs = left.map(a => a.x), ys = left.map(a => a.y);
          await behaviorSelect(Math.max(0, Math.min(...xs) - 1), Math.max(0, Math.min(...ys) - 1),
                               Math.max(...xs) + 1, Math.max(...ys) + 1, 'right');
          const t0 = Date.now();
          while (Date.now() - t0 < 30000) {
            await sleep(2500);
            const arr = ((await get('/animals')).animals || []);
            if (!arr.filter(a => !a.wasPetToday).length) break;
          }
        }
        const after = ((await get('/animals')).animals || []);
        const still = after.filter(a => !a.wasPetToday).map(a => a.name);
        log(`摸动物(室外补): ${still.length ? '还没摸: ' + still.join(',') : '全绿'}`);
      }
    } catch (e) { log('摸动物(室外补)异常:', String(e).slice(0, 80)); }
  } catch (e) {
    log('摸动物(室内)异常:', String(e).slice(0, 100));
    await warp('Farm', 64, 15).catch(() => null);
  }
}

async function checkMail() {
  // 查信箱: 对 (68,16) 互动, 有信逐封关掉(自动接任务)
  log('查信箱...');
  await warp('Farm', 67, 16);
  await post('/face', { direction: 1 });
  await sleep(150);
  const mail0 = await get('/mail').catch(() => null);
  if (!mail0?.has_mail) { log('无信件'); return; }
  log('有信:', (mail0.unread || []).map(u => u.title).join(', '));
  await post('/interact', {});
  await sleep(1200);
  // 逐封关闭 (LetterViewerMenu: 关一封弹下一封)
  for (let i = 0; i < 8; i++) {
    const s = await st();
    if (s.activeMenu?.type !== 'LetterViewerMenu') break;
    const m = await get('/menu').catch(() => null);
    log('读信:', m?.letterTitle || '(无标题)');
    await post('/menu_close', {});
    await sleep(900);
  }
  const s = await st();
  if (s.activeMenu) { await post('/menu_close', {}); await sleep(400); }
  log('信件处理完');
}

// 白名单清仓(实现已抽到 lib.sellAndStore, 手动/巡检也能随时调)
async function manageInventory(chest, force = false) {
  const s = await st();
  if (!force && s.inventory.filter(i => i.name).length < 10) return 0;
  log('fishbot OFF =', await fishbotSet(false));
  return sellAndStore(chest, force);
}

// 补种: 只种**当季**的种子, 种到空翻地
// ⭐⭐⭐2026-11-09 事故(夏5): 原逻辑 `inventory.find(SEED_RE)` 抓背包里第一个种子就种,
//   结果 20:23 现场把春作物 Cauliflower Seeds 种进夏天的地里 —— 春作物夏天种下去永远不结,
//   鱼鱼的 26 株花椰菜就是这么全枯的(她自己查 /crop_seasons 才发现 (O)190 只有 ["spring"])。
//   ⇒ 种之前必须用 /crop_seasons 核对季节; **查不到季节的一律不种**(查不到 = 不在表里 = 不是作物种子)。
// ⭐2026-11-07 事故(夏11): 空翻地在 surr(14) 里但角色够不到/种不进时, plantBatch 报 "queue ok 0/20",
//   回退 useOn 又逐格返回假 ok → planted=19 每轮都"成功"但作物总数一动不动, replayAll 死循环 8 分钟
//   (日志刷 "种 Eggplant Seeds 19 株", 现实是 0 株, 人还卡在农舍)。修法: ①最多 4 轮 ②每轮对账
//   /farm_report 的 crops.total, 没涨就判定"播种无实效"立刻收手(铁律② 动作后校验, 别信单次 ok)。
async function cropSeasons() {
  try {
    const r = await fetch('http://localhost:7842/crop_seasons', { signal: AbortSignal.timeout(8000) });
    return (await r.json()).seasons || {};
  } catch { return {}; }
}

// 背包物品名 → (O)xxx 编号。种子 API 的 key 是 (O)472 这种, 背包给的是 displayName。
// 优先用接口自己带的 id 字段; 没有再退回"交给桥"—— 桥的 /buy /plant 都吃 (O)xxx。
function seedIdOf(it) {
  const raw = String(it?.id || it?.itemId || '');
  const m = raw.match(/^\(O\)\d+$/);
  if (m) return raw;
  const q = String(it?.qualifiedId || it?.qualifiedItemId || '');
  return /^\(O\)\d+$/.test(q) ? q : null;
}

async function replantAll() {
  const cropTotal = async () => {
    try { return (await (await fetch('http://localhost:7842/farm_report', { signal: AbortSignal.timeout(8000) })).json()).crops?.total ?? -1; }
    catch { return -1; }
  };
  const seasons = await cropSeasons();
  for (let round = 0; round < 4; round++) {
    const s = await st();
    const seasonNow = String(s.time?.season || '').toLowerCase();
    // ⭐2026-11-10 排雷(我踩过): 地已满种时, 下面那句"包里有种子但都不是当季"照样会打 ——
    //   我照着它去翻箱找"消失的秋种", 白查了半小时合同(种子早种下去了, 只是包里只剩一包春种)。
    //   ⇒ 先判"有没有空株可补": 没有就直接说清楚, 别再提种子, 免得下一个人(或我)再当故障查。
    {
      const emptyNow = (await surr(14).catch(() => ({ tiles: [] }))).tiles.filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object);
      if (!emptyNow.length) {
        const fr0 = await cropTotal();
        log('补种: 无空株可补(地里已有', fr0, '株), 不种 —— 正常, 不是故障');
        break;
      }
    }
    // ⭐只挑"当季"的: seasons[id] 里含当前季节, 且能拿到 id。查不到=不种。
    const pick = s.inventory.find(i => {
      if (!SEED_RE.test(i.name) || (i.stack ?? 1) <= 0) return false;
      const id = seedIdOf(i);
      if (!id) return false;                       // 认不出编号 → 不敢种
      const ss = seasons[id];
      if (!Array.isArray(ss) || !ss.length) return false;  // 不在 /crop_seasons 表里 → 不种
      return ss.map(x => String(x).toLowerCase()).includes(seasonNow);
    });
    if (!pick) {
      const skipped = s.inventory.filter(i => SEED_RE.test(i.name) && (i.stack ?? 1) > 0);
      if (round === 0 && skipped.length) {
        log('补种: 包里有种子但都不是当季(' + seasonNow + '), 不种 —— '
          + skipped.map(i => i.name + '×' + (i.stack ?? 1)).join(', '));
      }
      break;
    }
    const seed = pick;
    await sel(seed.name);
    const cur = (await surr(14)).tiles.filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object);
    if (!cur.length) break;
    const before = await cropTotal();
    // 2026-11-06 批量播种: 一次 /queue 把"走到位→面朝→下种"全下给主线程(90 株从 ~300 次请求降到个位数)
    let planted = await plantBatch(seed.name, seed.stack ?? 1).catch(() => -1);
    if (planted < 0) {
      // 队列不可用 → 回退逐格老路
      planted = 0;
      for (const t of cur.slice(0, seed.stack ?? 1)) {
        const r = await useOn(t.x, t.y);
        if (r.ok) planted++;
        await sleep(220);
      }
    }
    const after = await cropTotal();
    log('种', seed.name, planted, '株', before >= 0 && after >= 0 ? `(田地 ${before}→${after})` : '');
    if (!planted) break;
    if (before >= 0 && after >= 0 && after <= before) {
      log('⚠️ 播种无实效(作物总数没涨), 停止重试 —— 空翻地够不到? 见 2026-11-07 事故');
      break;
    }
  }
}

// ===== 邮件任务(用户拍板: 有邮件优先做任务) =====
// quest 101 = 乔迪要花椰菜(/gift 交付)
// ⭐⭐2026-11-09 连挂三天(冬26/冬27/春1), 三层错叠在一起, 全部是"先猜再验"的错:
//   ① 房子写错: 乔迪住 SamHouse(她是山姆的妈), 我一开始写 JoshHouse(艾芙琳/乔治一家), 跟她无关。
//   ② 光知道房子还不够: /gift 原文是 NPC = currentLocation.characters.FirstOrDefault(...)
//      —— 只找【当前地图】里的 NPC, 不会寻路。天没亮/没出门时 warp 进去也是空的。
//   ③ 用 BWF get_state 查位置: 得先还原 \uXXXX 且匹配【中文名】「乔迪」, 而 18081 跑在鱼鱼端,
//      查的是【她的】世界, 且它的 give_gift 会去挪【她的】角色 —— 主持的任务不该走那条路。
//   ⇒ 正解 = 桥自带 /find_npc(全图扫, 给 location+x,y+isSleeping), 查主持自己的世界, 一行搞定:
//      GET /find_npc?name=Jodi  →  {"count":1,"npcs":[{"name":"Jodi","displayName":"乔迪","location":"SamHouse","x":5,"y":5,"isSleeping":false}]}
//      ⚠️ 参数走【query string】不是 JSON body; body 传 {"name":...} 会静默返回 count:0。
async function findNpcOnMap(name) {
  // ⚠️ 中文名要走 URL 编码, 否则 HttpListener 直接 400
  const r = await get('/find_npc?name=' + encodeURIComponent(name)).catch(() => null);
  return r?.npcs?.[0] ?? null;
}
// ⭐⭐2026-11-09 补: 上面那版还会失败, 因为【乔迪会走】—— 实测 12:24 她在 SamHouse 6,5,
//   12:26 已在 JojaMart 14,21。warp 进去(落点固定 4,24)再查, 她早换图了, /gift 报"当前地图无此 NPC"。
//   追着她 warp 是徒劳(2 秒一次, 她走得比这快)。正解 = 【只在她停在稳定地点时送】:
//     SamHouse(家) / JojaMart(9:00-17:00 上班收银) / SeedShop(串门) —— 路上(Town/Mountain/Beach)一律不追。
//   花椰菜有 QUEST_RESERVE 保着不会被卖, 送到就是早晚的事, 不值得为它烧游戏日。
const STABLE_NPC_SPOTS = new Set(['SamHouse', 'JojaMart', 'SeedShop', 'TownSquare']);
// ===== 新季播种日程(§121, 2026-11-12 主人「开始春种日程加入,顺便测试之前的端点」) =====
// 旧循环只补种「包里现成的当季种子」,从不买种 —— fall 20 实测:扩田翻好的空翻地全空着,
// 包里只有 Cauliflower Seeds(春)种不进。⇒ 换季窗(day<=3)且补种后仍有空翻地时:
//   查 /crop_seasons → 按目录买当季种子(**运行时再对 crop_seasons 核一遍 id**,查不到就退下一项)
//   → /buy → replantAll 种上 → hostWater 浇水。链路 2026-11-12 已全链实测
//   (/buy 茄子种 6 颗 120g 入包 → plantBatch 3 株 → farm_report 41→44)。
const SEED_CATALOG = {
  spring: [ { id: '(O)474', name: 'Cauliflower Seeds', price: 80 }, { id: '(O)472', name: 'Parsnip Seeds', price: 20 } ],
  summer: [ { id: '(O)480', name: 'Blueberry Seeds', price: 80 }, { id: '(O)482', name: 'Melon Seeds', price: 80 } ],
  fall:   [ { id: '(O)428', name: 'Cranberry Seeds', price: 240 }, { id: '(O)490', name: 'Pumpkin Seeds', price: 100 }, { id: '(O)488', name: 'Eggplant Seeds', price: 20 } ],
  winter: [],   // 冬天田里不种(扩田有冬闸), 不买不种
};
// 空翻地计数: 与 plantBatch 同口径(terrain==='HoeDirt' && !crop && !object), 站农舍门口 surr(14)
async function emptyTilledCount() {
  try {
    const sr = await surr(14).catch(() => null);
    return (sr?.tiles || []).filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object).length;
  } catch { return 0; }
}
async function buySeasonSeedsIfNeeded() {
  try {
    const s = await st();
    const dayNum = s.time?.dayOfMonth ?? 99;
    const season = s.time?.season;
    if (dayNum > 3 || !season) return;                 // 只在新季窗(day 1-3)
    const emptyTiles = await emptyTilledCount();
    if (emptyTiles <= 0) { log(`新季播种: 无空翻地, 跳过`); return; }
    const cs = await cropSeasons();
    const cand = (SEED_CATALOG[season] || []).find(c => (cs[c.id] || []).includes(season));
    if (!cand) { log(`新季播种: 目录里没有 ${season} 能种的种子(crop_seasons 核验), 跳过`); return; }
    const inBag = s.inventory.filter(i => SEED_RE.test(i.name || '') && (cs[seedIdOf(i)] || []).includes(season))
      .reduce((a, i) => a + (i.stack ?? 1), 0);
    const need = Math.max(0, emptyTiles - inBag);
    if (need <= 0) { log(`新季播种: 包里当季种子够用(${inBag} ≥ 空格 ${emptyTiles}), 不买`); return; }
    const b = await post('/buy', { id: cand.id, quantity: need, price: cand.price }).catch(() => null);
    log('新季播种: 买', cand.name, 'x' + need, JSON.stringify(b || {}).slice(0, 110));
    if (b?.ok) {
      await sleep(800);
      await replantAll();
      if (!(await hostWater())) await bwfWater();      // 播完当场浇(§117: 不借鱼鱼身体, bwf 只兜底)
    }
  } catch (e) { log('新季播种异常:', String(e).slice(0, 80)); }
}

async function tryQuests() {
  let s = await st();
  if (!(s.inventory.find(i => i.name === 'Cauliflower'))) return;
  const npc = await findNpcOnMap('Jodi');
  if (!npc) { log('任务: 全图找不到乔迪(可能还没生成), 花椰菜留着'); return; }
  log('任务: 乔迪在', npc.location, npc.x + ',' + npc.y, '| 睡:' + npc.isSleeping);
  if (npc.isSleeping) { log('任务: 乔迪还在睡, 跳过(花椰菜不会被卖, 留着明天)'); return; }
  if (!STABLE_NPC_SPOTS.has(npc.location)) {
    log('任务: 乔迪在路上(' + npc.location + '), 不追(边走边找必然扑空), 花椰菜留着');
    return;
  }
  // 她跟你在同一张图才直接送; 否则先传进她那张图, 再核实一次(中间可能走了)
  const cur = await st();
  if (cur.location?.name !== npc.location) {
    // ⭐⭐2026-11-09 再补: /warp_into 不给 x/y 时【落点是该地点的第一个 warp 出口】(源码 14255
    //   val.warps.FirstOrDefault()), SamHouse 那个出口在 (4,24), 而她常在里面 (5,5) —— 差 20 格,
    //   warp 完 2 秒内 /gift 仍然找不到(实测 Day5 6:20 她在 SamHouse 5,5 醒着, 但 gift 还是报无此 NPC)。
    //   ⇒ 必须把坐标一起传: {location, x: npc.x, y: npc.y}; FindWalkableTile 会自动找最近可站格。
    const w = await post('/warp_into', { location: npc.location, x: npc.x, y: npc.y }).catch(() => null);
    if (!w || w.ok === false) { log('warp ' + npc.location + ' 失败, 跳过'); return; }
    await sleep(1200);
  }
  const now = await findNpcOnMap('Jodi').catch(() => null);
  if (!now || now.location !== npc.location) { log('乔迪刚走了(' + (now?.location ?? '?') + '), 跳过'); return; }
  const r = await post('/gift', { target: 'Jodi', item: 'Cauliflower' }).catch(() => null);
  log('gift Jodi@' + npc.location + ' →', JSON.stringify(r).slice(0, 120));
}

// ===== 单日流程 =====
// ⭐2026-11-07 换季跨天比较: dayOfMonth 在换季日会 28→1 倒退, 只比 dayOfMonth 会把"已经换日"
//   误判成"没睡成", 触发 sleep 重试连环换日(实录: 夏1→2→3 每分钟烧掉一整天, 三次存档全绿但两天白扔)。
//   所以一切"天翻没翻"的判断一律比 年|季|日 三元组, 不再裸比 dayOfMonth。
const dayKeyOf = s => `${s?.time?.year ?? '?'}|${s?.time?.season ?? '?'}|${s?.time?.dayOfMonth ?? '?'}`;
// ⭐2026-11-10 事故(静默空转, 我踩过): 农活开场固定 `warp Farm 65,21` 去田里, 但那格后来被自己的
//   扩田/作物占了 —— 桥回 {"ok":false,"skipped_warp":true,...,"standable_near":[]}, **人原地没动**。
//   旧代码把这行只 log 不检查, 于是"从农舍出发"的那天: 收菜 0 件、浇水整段跳过, 日志还写着"收菜完成"。
//   实测 秋25: farm_report crops.ready=34, 收菜完成 实际入包 0 件。
//   ⇒ 改成一串候选落点(农舍门口优先, 那格贴房子结构性不可耕地), 谁站得住用谁; 全失败就吼, 别静默。
const FARM_ANCHORS = [[64, 15], [54, 11], [60, 20], [65, 21]];
async function warpFarmAnchor() {
  for (const [x, y] of FARM_ANCHORS) {
    const r = await warp('Farm', x, y).catch(e => ({ failed: true, error: String(e) }));
    if (r && !r.failed) return r;
  }
  log('⚠️ 农场落点全站不住(田/机器把候选格占了) → 回农舍门口兜底, 农活这步可能空转');
  return await warp('FarmHouse', 9, 10).catch(() => null);
}
// ⭐⭐⭐2026-11-13 春2 修: 冷启动翻地 0/40, 春种开不了张。
//   现场(day-loop.log 11:58:17): 落点 64,15(农舍门口) → 选 40 格干净格 → /till_area 回
//   {tilled_count:0, skipped:[40 格 not_diggable]}。「干净格」是按 surroundings 挑的, 那 40 格本身
//   确实能挖; 但 /till_area 的 CalculateAreaTiles 优先吃 p["tiles"](反编译确认), 坐标没问题。
//   ⇒ 真因是 64,15 那一带在换季当天 Diggable 不在(田区 56-72/15-28 里 193 格有 Back Diggable,
//     但农舍门口这一圈不在其中) —— 同一时刻 `tile_props?location=Farm&scan=Diggable` 能远程读到
//     哪些格真有 Diggable, 所以不用瞎猜: **下锄前先把候选格与 Diggable 求交**, 交不上就换锚点。
//   另外 skipped 的 reason 以前只数个数, 分不清"已经犁过/被占/不可犁" —— 这次全打出来。
// ⭐⭐⭐2026-11-13 春2 真因(两次 dump 才看清): 冷启动翻地 0/40 不是锚点的问题 ——
//   ① 11:43 那次 `{"not_diggable":40}`: 那 40 格是 `surr(16)` 拿的玩家半径 16 内的"干净格",
//      而玩家当时站在 64,15 农舍门口一带, 选出来的格根本不在田里;
//      ⇒ 必须按**田区矩形**取格, 不能按玩家半径。
//   ② 12:17 那次 `{"occupied":40}`: 田里绝大多数格 terrain==='Grass', 而在 Valley 里
//      Grass(TerrainFeature) 就是"被占" —— /till_area 先查 terrainFeatures 再看 Diggable,
//      所以先有草必须先 /clear_ground(锄草), 否则永远 occupied。
//   ⇒ 正确顺序: warp 进田区 → 读田区矩形 → 只挑 !object && !crop && terrain 不是 Grass/HoeDirt
//      && Diggable 的格 → 下锄; 一格都没有就报"田里全是草, 先清草", 不再盲锄 40 格白耗体力。
const FIELD_RECT = { x1: 58, y1: 17, x2: 70, y2: 26 };   // 田区(与老代码的 58-70/17-26 一致)
// ⚠️2026-11-13 实测:`/surroundings?x1..&y1..` 的矩形模式**只回 x/y/passable/diggable**,
//   没有 terrain/object/crop(反编译 HandleSurroundings: terrainFeatures 查不到就整条不发);
//   老代码 `surr(14/16)` 读不到 terrain 也就判不出草/翻地 —— 这就是"田里 107 格草却看不见"的原因。
//   ⇒ 田区一律走 `/passable_rect?location=Farm&x1..`(回 terrain/object/largeTerrain, 实测 130 格一次到位)。
async function fieldTiles() {
  const q = `/passable_rect?location=Farm&x1=${FIELD_RECT.x1}&y1=${FIELD_RECT.y1}&x2=${FIELD_RECT.x2}&y2=${FIELD_RECT.y2}`;
  const r = await get(q).catch(() => null);
  if (!r?.tiles?.length) return null;                        // null = 读不到, 调用方别当"田里全空"
  return r.tiles;
}
// 田里能直接下锄的格: 无物、无作物、没有 Grass/Tree 之类 TerrainFeature、且 Diggable
function tillableFilter(tiles, dg) {
  return (tiles || []).filter(t => !t.object && !t.crop
    && !/Grass|HoeDirt|Tree|Bush|Water|Sea|Floor/i.test(t.terrain || '')
    && (!dg || dg.has(t.x + ',' + t.y)));
}
// 远端读整张 Farm 的 Back 层 Diggable 格, 拿不到就返回 null(调用方退回老逻辑, 别静默当"全可犁")
async function diggableSet() {
  try {
    const r = await get('/tile_props?location=Farm&scan=Diggable&layer=Back');
    const hits = r?.hits;
    if (!Array.isArray(hits) || !hits.length) return null;
    return new Set(hits.map(h => h.x + ',' + h.y));
  } catch { return null; }
}
// 直接跳到"田里确实有活"的锚点; 全都不行就 null(调用方继续用 warpFarmAnchor 的老兜底)
async function warpToDiggableAnchor(seedsLeft) {
  const dg = await diggableSet();
  for (const [x, y] of FARM_ANCHORS) {
    const r = await warp('Farm', x, y).catch(e => ({ failed: true, error: String(e) }));
    if (!r || r.failed) continue;
    await sleep(900);
    const s = await st();
    const here = s?.location?.name === 'Farm' && Math.abs((s.player?.x ?? -9) - x) <= 2 && Math.abs((s.player?.y ?? -9) - y) <= 2;
    if (!here) continue;
    const srF = await surr(16).catch(() => ({ tiles: [] }));
    const dirt = (srF.tiles || []).filter(t => t.terrain === 'HoeDirt').length;
    const cand = (srF.tiles || []).filter(t => !t.object && !t.crop && t.terrain !== 'HoeDirt'
      && !/Water|Sea|Bush|Tree|Floor/i.test(t.terrain || '')
      && (!dg || dg.has(t.x + ',' + t.y)));
    log(`犁地锚点 ${x},${y}: 翻地 ${dirt} 格 / 可犁候选 ${cand.length} 格${dg ? '' : '(读不到 Diggable, 按老口径)'}`);
    if (dirt > 0 || cand.length > 0) return { x, y, dirt, cand: cand.length };
    if (dirt > 0) break;   // 已有翻地就不用再挑锚点(下一段走 expandField)
  }
  return null;
}
// ⭐⭐⭐2026-11-11 主人: 「卡在结算页面了，之前不是会自动跳过结算吗」
//   真凶: newday-trigger(专职"三档处置": ReadyCheck→关 / ShippingMenu→点 OK / SaveGameMenu→等)
//   在 16:36 重启脚本时被一起杀掉, 而 persist.ps1 没守它 → 没人点 OK → 不写盘。
//   反编译证据(Menus.ShippingMenu.update): 结算动画走完才 new SaveGameMenu 真正写盘;
//   /menu_close 把它从 activeClickableMenu 摘掉 = 这一天永远不存档(冬3~冬8 六天没写盘的真凶)。
//   ⇒ 点 okButton, 绝不 /menu_close。这里做第二道保险: newday-trigger 再死一次也不卡结算。
async function clickSettlementIfShown() {
  try {
    const s = await st();
    if (s.activeMenu?.type !== 'ShippingMenu') return false;
    const r = await post('/menu/click', { button: 'ok' }).catch(() => null);
    log('🧾 结算页挂着 → 点 OK(不是 menu_close):', JSON.stringify(r || {}).slice(0, 90));
    return !!r?.ok;
  } catch { return false; }
}

async function playOneDay(day) {
  const sB = await st();
  const dk0 = dayKeyOf(sB);
  // ⭐2026-11-06: 晨间先出床 —— 睡醒人躺在床上, 后续 waterAll/寻路全在床里空磨几十分钟(两次实测)。
  //   ⚠️主持(7842) 严禁 /wakeup(会把角色瞬移); 下床一律用 /warp Farm 64,15(实测能清 isInBed)。
  if (sB.player?.isInBed) {
    // ⭐⭐⭐2026-11-11 20:0x 事故(§112, 夏27 只活了 20 分钟): 换日那一刻 isInBed 会**短暂报 true**,
    //   而 NewDay 同步还在飞(`Synchronizing 'NewDay' task...`)。这时发 warp = 往主线程队列里埋一颗雷:
    //   请求排队不动, 等死锁一解它才执行 → 主持主线程彻底卡死, 一天被翻走
    //   (实录 20:01:54 / 20:03:02 / 20:04:40 三次"晨间在床上, warp"全撞上,
    //    /farm_report 15s 超时、timeOfDay 冻在 720、Day27 全天没人跑过)。
    //   ⇒ 出床前必须先证主线程真活着: /farm_report 通(它碰世界状态, /state 回 200 不算)
    //   **且** timeOfDay 在两次采样之间前进(时钟不动 = 主线程死, 此时任何写操作都是埋雷)。
    // ⭐⭐⭐2026-11-11 20:22 第二次踩(§113, 秋1 被翻走): 上面这两条**还不够** —— 那次
    //   farm_report=200 且时钟 600→610 前进, 闸放行了, warp 出去照样撞
    //   `Synchronizing 'NewDay' task...` 卡死, 秋1 又没人跑。
    //   差在哪: 换日后的存档加载/NewDay 同步是个**几游戏分钟**的过程, 期间时钟会走、/farm_report 会通,
    //   但世界还没"交出来"。两条实测对照:
    //     20:22:05 t=610 warp → 死锁;  20:25:01 t=620 warp → 正常落地并干活。
    //   ⇒ 加第三条硬闸: 换日后必须等时钟走到 **t >= 620**(新的一天从 600 起, 620 = 过了 20 游戏分钟),
    //     外加 sleep 就绪锁里不能有"半满"的等待(部分人已投 Ready = 换日/睡觉流程还在飞)。
    //   宁可晚 2 分钟下床, 也不要再白丢一天。
    let mainAlive = false;
    for (let w = 0; w < 20 && !mainAlive; w++) {
      const alive1 = await worldAlive(7842, 8000);
      const s1 = await st().catch(() => null);
      const t1 = s1?.time?.timeOfDay;
      await sleep(6000);
      const alive2 = alive1 && await worldAlive(7842, 8000);
      const s2 = await st().catch(() => null);
      const t2 = s2?.time?.timeOfDay;
      // ⚠️⚠️2026-11-11 20:40 我自己踩的(20 分钟内就翻车): 原来写 `!isReady && numberReady>0` 覆盖
      //   **所有** check, 结果 `wakeup` 那一档常年是 1/2(鱼鱼的旧票, netReady 从不清, 见 §107) ⇒
      //   这道闸**永久为真** ⇒ 换日后永远不下床, 一天照样废掉。当场实测: Day3 t=700 还卡在 FarmHouse 床上。
      //   ⇒ 只认真正"换日/睡觉还在飞"的那一档: sleep / ready_for_save。
      //     wakeup 是叫醒用的另一条锁, 跟换日无关, 绝不能算进来。
      // ⭐⭐⭐2026-11-12 22:53 Day13 晨间又踩: "只认 sleep/ready_for_save"照样会**永久砖死** ——
      //   宿主睡醒后**人还躺在床上**时, 他自己的 readyToSleep 一直是 true ⇒ sleep 档恒 1/2
      //   (实测 ready_for_save 2/2 ✓ / wakeup 2/2 ✓ / sleep 1/2 ✗), 而"下床"正是这道闸的出口
      //   ⇒ 死循环: 想下床先要 sleep 不满, sleep 不满先要下床。22:53:50 循环等满 4 分钟放弃退出,
      //   主持一直躺到 t=1230(白丢半天)。sleep 这档只在**夜里**有意义(等鱼鱼也睡), 晨间半满纯属正常态。
      //   ⇒ 只留 ready_for_save(2/2 才说明存档真写完); 真卡死仍由 farm_report + 时钟前进 + t>=620 三件守。
      const rs = await fetch('http://localhost:7842/ready_state', { signal: AbortSignal.timeout(6000) })
        .then(r => r.json()).catch(() => null);
      const blocking = (rs?.checks || [])
        .filter(c => c.id === 'ready_for_save' && !c.isReady && (c.numberReady ?? 0) > 0)
        .map(c => `${c.id}:${c.numberReady}/${c.numberRequired}`);
      const lockInFlight = blocking.length > 0;
      mainAlive = alive2 && !lockInFlight
        && typeof t1 === 'number' && typeof t2 === 'number' && t2 > t1
        && t2 >= 620;                                  // ← 换日后 20 游戏分钟的沉降期, 见上
      if (!mainAlive) log(`⏳ 晨间在床上但主线程没验活(farm_report=${alive2} 锁在飞=${lockInFlight ? blocking.join(',') : '无'} 时钟 ${t1}→${t2} 需≥620), 不发 warp, 等 ${(w + 1) * 12}s`);
    }
    if (!mainAlive) { log('⚠️ 主线程 4 分钟未验活(疑似卡在 NewDay 同步), 本轮直接退出, 不发任何写操作'); return null; }
    log('晨间在床上, warp 农场门口出床');
    await warp('Farm', 64, 15).catch(() => { });
    await sleep(2000);
    // 安全点①: 出床后(还没碰任何东西)
    if (stopRequested()) { try { await fishbotSet(false); } catch { } return null; }
  }
  globalThis.__dlS = sB;
  emit('out-of-bed', { loc: sB.location?.name, t: sB.time?.timeOfDay, stamina: Math.round(sB.player?.stamina ?? 0) });
  // 0. 先找木箱(农场→农舍都扫) + 清晨满包先清仓(带上箱子可存非卖品)
  let chest = await findChest(18);
  if (chest) chest.loc = (await st()).location?.name || 'Farm'; // 箱子可能扫在任意地图, 按实际位置记
  if (!chest) {
    await warp('FarmHouse', 9, 10);
    chest = await findChest(10);
    if (chest) chest.loc = 'FarmHouse';
  }
  log('木箱:', chest ? JSON.stringify(chest) : '暂无');
  {
    const s0 = await st();
    if (s0.inventory.filter(i => i.name).length >= (s0.player.maxItems || 12) - 2) {  // 2026-11-06: 原写死10(12格包), 36格包 11格就误判满 → 钓鱼段提前收工(视频验收抓到)
      log('清晨满包, 先清仓再干活');
      await manageInventory(chest);
    }
  }
  // 0.5 无箱则做箱(合成自带防掉落闸; 砍树回农场)
  if (!chest) {
    let s = await st();
    if (invCount(s, 'Wood') < 50 && s.player.stamina > 60) {
      await warpFarmAnchor();
      await chopWood(50, 40);
    }
    s = await st();
    if (invCount(s, 'Wood') >= 50) {
      await craftChest();
      s = await st();
      if (s.inventory.some(i => i.name === 'Chest')) {
        await sel('Chest');
        chest = await placeChestNearHouse();
        if (chest) chest.loc = 'Farm';
      } else {
        chest = await findChest(18);
        if (chest) chest.loc = 'Farm';
      }
    } else {
      log('木头', invCount(s, 'Wood') + '/50, 继续攒');
    }
  }
  // 1. 农活
  // 2026-11-10 节日日: 主持得在 09:00 到场(节日地图是临时图, 过了时间进不去), 农林活容易把时间磨掉,
  //   所以节日当天只浇水不扩田不种地, 其余留给鱼鱼/我陪她去。
  {
    const s0 = await st();
    const fest = festivalToday(s0);
    if (fest) log(`⭐ 今天是节日(${fest}), day-loop 只做浇水, 不再扩田/种地`);
  }
  log('农活落点:', JSON.stringify(await warpFarmAnchor()));
  // ⭐2026-11-05 事故: 换季那一刻旧季作物全枯, 死株占着 HoeDirt 不会消失, 而补种只认空翻地
  //   → 从秋1到秋19 整整十八个游戏日田里一颗都没种上(收入全靠钓鱼), 用户看到"农作物都死了"。
  //   清死株名单只认存档 XML(桥的 /surroundings 不暴露 dead 字段), 详见 lib.clearDeadCrops 注释。
  {
    // ⭐2026-11-07 §77/§79: 换日/读档后背包会冒出一批 ErrorItem(price:0 探 id 的后遗症), 不清就把包占满,
    //   收菜/卖货全线卡死。丢到垃圾箱(30,44)比"丢地上+clear_ground"稳(后者每丢一个又冒一个)。
    const junk = await cleanInventoryJunk().catch(() => 0);
    if (junk) log('开盘清背包垃圾', junk, '件');
    const cleared = await clearDeadCrops().catch(e => { log('清死株异常:', String(e).slice(0, 90)); return 0; });
    if (cleared) ledInc('deadCropsCleared', cleared, '换季清死株');
  }
  // 2026-11-05 收菜合并为 harvestAll: /harvest 本来就能收复生作物(草莓/蓝莓), 只信背包差分不信计数,
  // 收完自动扫 /debris 把多产的掉落走过去捡掉 —— 整段零点击零前台
  {
    const h = await harvestAll(15, 8, true).catch(e => { log('harvestAll 异常:', String(e).slice(0, 90)); return null; });
    if (h) {
      log('收菜完成: 实际入包', h.gained, '件', (h.items || []).map(([n, c]) => `${n}x${c}`).join(',') || '(空)',
        '| 桥计数', h.harvested, '| 补捡掉落', h.picked, '件');
      if (h.gained) ledInc('cropsHarvested', h.gained, 'harvestAll 入包差分');
      else {
        // ⭐2026-11-10 报警器: 熟果还在田里却一件没收到 = 人根本没走到田里(落点被占, 见 warpFarmAnchor)。
        //   没有这句, "收菜完成 0 件" 和"今天本来就没熟"长得一模一样, 静默空转能连着好几天没人发现。
        const frc = (await get('/farm_report').catch(() => null))?.crops;
        if (frc && frc.ready > 0) log(`⚠️ 收菜 0 件但田里还有 ${frc.ready} 株熟果 → 人没到田里, 别信这行"收菜完成"`);
      }
    }
  }
  await checkMail();
  // 2026-11-10: 每天摸一次鸡(主人交代「每天记得摸摸」), 失败不拖累后续流程
  await petAnimals().catch(e => log('摸动物失败:', String(e).slice(0, 80)));
  await petAnimalsIndoor().catch(e => log('摸动物(室内)失败:', String(e).slice(0, 80)));
  // ⭐2026-11-08 §86: host 侧浇水(tool_area/逐格)连日失效(在床/走位坏), BWF water_crops 是唯一可靠路径 → 主用 BWF, host waterAll 只补刀
  // ⭐⭐⭐2026-11-11 22:0x 事故(§116): water_crops 是**按地图 + 按她脚下范围**的 —— 说明原文是
  //   "给本地点所有需要浇水的作物浇水", 只作用于鱼鱼**当前所在地图**能走到的那片。
  //   而 21:18 起她的 fish-day-loop 把她固定在 Mountain(42,11) 钓鱼 ⇒ 主持这边喊 water_crops
  //   永远得到"成功：这里没有需要浇水的作物", 而 farm_report 明明 watered=0/56。
  //   实测对照: 21:04 她在农场(还没被搬走)时浇了 60 株; 21:33 之后每次都是"没有需要浇水的作物"。
  //   ⇒ 修法三层, 缺一层都会静默失败:
  //     ① 浇水段开始前 touch `.bwf-borrow-fish`, 她的 loop 见到就一动不动(否则她 2.5 秒内自己跑回山湖);
  //     ② 多站点轮浇 —— 单次调用只覆盖她身边那片, 还会被"正在切换场景"打断(实测一次 7 株/13 株);
  //     ③ 每轮都用 farm_report.watered 对账, 连续两轮零进展才停(不信 BWF 自己的"成功")。
  //   ⚠️ 只对 7843 发写操作; 她若在床上(换日/已入睡)就整段跳过, 不动她。
  const BORROW = 'D:/StardewAI/.bwf-borrow-fish';
  const WATER_SPOTS = [[64, 15], [50, 18], [50, 12], [56, 12], [58, 18], [53, 15]];  // 覆盖田块 x48-61 y8-19
  const cropsOf = async () => (await get('/farm_report').catch(() => null))?.crops || null;

  // ⭐⭐⭐2026-11-11 22:4x (§117) 先说**为什么不再借鱼鱼的身体**:
  //   两条独立的坏结果, 都是"借身体"这条路给的:
  //     ① 她的 loop 被 fake 让路信号锁死: 主持每 30 秒打一条 "BWF 跳过: 田里已经全浇过了",
  //        而 fish-day-loop 的 bwfBusy() 用 /^HH:MM:SS BWF / 匹配 —— 跳过类日志照样刷新 6 分钟窗口,
  //        她**整天**处于"让路"状态(fall 10 实测: 一整天一条干活日志都没有, 人就杵在农场).
  //     ② 抽干她会力竭: /tool_area 一次 50 swings, 两次就是 100 下浇水; 她体力 269 → **-5.2**
  //        (力竭倒地, 掉钱掉好感). 那是她的体力, 主持不该花.
  //   ⇒ 正解: 7842 自己就有 /tool_area(源码 HandleToolArea 用的是 Game1.player=本机玩家),
  //     主持有 Watering Can(铱壶), warp 到农场浇自己的田, 一滴鱼鱼的体力都不用花, 也不用动她的人.
  //     rect 语义是"当前所在地图按绝对坐标筛 IsWaterTarget", 所以必须先站到 Farm.
  //   实测 22:29-22:33: 7843 版两次调用 5/55 → 55/55(端点本身好用); 现在换成 7842 自己浇.
  const hostWater = async () => {
    try {
      // 逐格判干湿: /surroundings 的 tiles **在浇过时才有 watered=true 这个键**,
      //   干了就**根本没有 watered 键**(源码 HandleSurroundings: `if (flag4) dictionary["watered"]=true;`)。
      //   ⚠️⚠️ 所以判干必须写 `!t.watered`, **绝不能写 `t.watered === false`** ——
      //   后者对"没有这个键"恒为 false, 会把整片干田判成"全浇过了", 静默空转。
      //   (这正是我 §116 记成"批量 tiles 没有 watered 字段"的原因: 我当时看的是干格, 而干格本来就不带键。)
      const dryTiles = async () => {
        const sr = await surr(30).catch(() => null);
        return (sr?.tiles || []).filter(t => t.crop && !t.watered);
      };
      const dry0 = await dryTiles();
      if (!dry0.length) { log('浇水跳过: 田里已经全浇过了'); return true; }

      // 站到农场才有 rect 语义(HandleToolArea 按 currentLocation 判 IsWaterTarget)
      const s0 = await st();
      if ((s0.location?.name) !== 'Farm') {
        const w = await warp('Farm', 64, 15).catch(() => null);
        if ((w?.loc) !== 'Farm') { log('浇水跳过: 走不到农场(现在 ' + (s0.location?.name ?? '?') + ')'); return false; }
      }
      const s1 = await st();
      if (s1.player?.isInBed) { log('浇水跳过: 主持在床上(换日链在跑)'); return false; }
      const can = (s1.inventory || []).find(i => i?.name === 'Watering Can');
      if (!can) { log('浇水跳过: 主持包里没有水壶'); return false; }
      if (can.waterLeft !== undefined && can.waterLeft <= 0) {
        await post('/refill', {}).catch(() => null); await sleep(900);
        log('浇水: 水壶空 → 已 refill');
      }
      await sel('Watering Can').catch(() => null);
      await sleep(500);

      log(`浇水开始: 干格 ${dry0.length} 个`);
      let lastDry = dry0.length, stalls = 0;
      for (let round = 0; round < 4; round++) {
        const dry = round === 0 ? dry0 : await dryTiles();
        if (!dry.length) { log('浇水: 全田浇完'); return true; }
        let res;
        try {
          // ⚠️ 超时必须给足: 服务端队列最长 10 分钟(HandleToolArea 里 Wait(10min)),
          //   给 60s 的 curl 会 HTTP=000 超时但**服务端照跑** —— 我 22:29 就是这么误判成"端点不可用"的,
          //   实际它把田浇完了(5/55 → 55/55)。这里给 11 分钟, 宁可等也不假阴性。
          res = await post('/tool_area', {
            operation: 'water',
            x1: Math.min(...dry.map(t => t.x)), x2: Math.max(...dry.map(t => t.x)),
            y1: Math.min(...dry.map(t => t.y)), y2: Math.max(...dry.map(t => t.y)),
          }, 660000);
        } catch (e) { log('浇水 tool_area 异常:', String(e).slice(0, 90)); break; }
        const left = (await dryTiles()).length;
        log(`浇水 round${round + 1}: ${JSON.stringify({ ok: res?.ok, swings: res?.swings, err: res?.error, missing: (res?.still_missing || []).length, out: res?.out_of_water }).slice(0, 150)} | 还剩干格 ${left}`);
        if (res?.out_of_water) {
          await post('/refill', {}).catch(() => null); await sleep(900);
          log('浇水: 中途水壶空 → refill 后再浇');
          continue;
        }
        if (left === 0) { log('浇水: 全田浇完'); return true; }
        if (left >= lastDry) { if (++stalls >= 2) { log(`浇水: 连续 ${stalls} 轮零进展 → 停手(剩 ${left} 格)`); break; } }
        else stalls = 0;
        lastDry = left;
        await sleep(1000);
      }
      const leftC = (await dryTiles()).length;
      if (leftC > 0) { log(`⚠️ 主持浇水不完整: 还剩 ${leftC} 格干着`); return false; }
      return true;
    } catch (e) { log('主持浇水失败:', String(e).slice(0, 90)); return false; }
  };

  const bwfWater = async () => {
    const fishPost = async (p, b) => fetch('http://localhost:7843' + p, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}),
      signal: AbortSignal.timeout(15000),
    }).then(r => r.json()).catch(() => null);
    const fishState = () => fetch('http://localhost:7843/state', { signal: AbortSignal.timeout(10000) })
      .then(r => r.json()).catch(() => null);
    const crops = async () => (await get('/farm_report').catch(() => null))?.crops || null;
    let movedFish = null;   // { loc, x, y } = 她原来在哪, 浇完送回去
    try {
      const fs0 = await fishState();
      if (!fs0?.worldReady) { log('BWF 跳过: 鱼鱼客户端不在线(浇水只能靠她的 BWF)'); return; }
      if (fs0.player?.isInBed) { log('BWF 跳过: 鱼鱼在床上(换日/已入睡), 不动她'); return; }
      const fr0 = await crops();
      if (fr0 && fr0.total > 0 && fr0.watered >= fr0.total) { log('BWF 跳过: 田里已经全浇过了'); return; }

      // ---- ① 挂"借身体"信号, 她的 loop 从此一动不动 ----
      try { fs.writeFileSync(BORROW, String(process.pid)); } catch { }
      await fishPost('/fishbot', { action: 'off' });        // 先停她的钓鱼, 免得 warp 时正在收线
      await sleep(600);
      const curLoc = fs0.location?.name;
      movedFish = { loc: curLoc, x: Math.round(fs0.player?.x ?? 0), y: Math.round(fs0.player?.y ?? 0) };
      log(`BWF 前置: 借鱼鱼的身体浇水(她在 ${curLoc}), 已挂 ${BORROW.slice(-18)}`);

      const base = 'http://127.0.0.1:18081/mcp';
      const post2 = async (body) => {
        const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', ...(sidHdr || {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(900000) });
        return { sid: r.headers.get('mcp-session-id'), text: await r.text() };
      };
      const r0 = await post2({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'day-loop-water', version: '1.0' } } });
      const sid0 = r0.sid;
      if (sid0) await post2({ jsonrpc: '2.0', method: 'notifications/initialized' });

      // ---- ② 多站点轮浇 ----
      let lastWet = -1, stalls = 0, rounds = 0;
      for (const [sx, sy] of WATER_SPOTS) {
        rounds++;
        await fishPost('/warp', { location: 'Farm', x: sx, y: sy });
        await sleep(2200);
        const fs1 = await fishState();
        if ((fs1?.location?.name) !== 'Farm') {
          log(`BWF: 鱼鱼没站到农场(现在 ${fs1?.location?.name ?? '?'}), 换下一个站点`);
          continue;
        }
        const rr = await post2({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'water_crops', arguments: { max: 60 } } });
        const lines = rr.text.split('\n').filter(l => l.startsWith('data:'));
        const j2 = JSON.parse(lines.length ? lines[lines.length - 1].slice(5) : rr.text);
        const txt = j2.result?.content?.[0]?.text || '';
        const fr = await crops();
        const wet = fr?.watered ?? -1, tot = fr?.total ?? -1;
        log(`BWF 站(${sx},${sy}): ${txt.slice(0, 70)} | 田里 ${wet}/${tot}`);
        if (tot > 0 && wet >= tot) { log('BWF: 全田浇完'); break; }
        if (wet <= lastWet) { stalls++; if (stalls >= 2) { log(`BWF: 连续 ${stalls} 站零进展 → 停手(剩下 ${tot - wet} 株留给明天/手动)`); break; } }
        else stalls = 0;
        lastWet = wet;
        await sleep(1200);
      }
      // ⭐⭐⭐"这里没有需要浇水的作物" 必须与 farm_report 对账, 否则又是静默失败(§116)
      const frC = await crops();
      if (frC && frC.total > 0 && frC.watered < frC.total) {
        log(`⚠️ BWF 浇水不完整: ${frC.watered}/${frC.total}(还剩 ${frC.total - frC.watered} 株干着), 站点用完 ${rounds} 个`);
      }
      // ⭐2026-11-10 收尾: BWF 跑在鱼鱼客户端(18081), 浇水会把她手上换成水壶(她 16:10 实录
      //   rod inHand:false 的真凶), 她的 fishbot 就 cast-blocked → AutoPause 自关. 这里主动换回竿.
      try {
        await fetch('http://localhost:7843/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Iridium Rod' }), signal: AbortSignal.timeout(8000) });
        log('BWF 收尾: 已替鱼鱼把 Iridium Rod 换回手上');
      } catch { }
    } catch (e) { log('BWF water_crops 失败:', String(e).slice(0, 80)); }
    finally {
      // ---- ③ 把她送回原来的地方 + 摘掉信号(顺序不能反: 先送回去再摘, 否则她半路自己跑) ----
      if (movedFish) {
        try {
          await fishPost('/warp', { location: movedFish.loc, x: movedFish.x, y: movedFish.y });
          await sleep(1200);
          await fishPost('/face', { direction: 1 });
          log(`BWF 收尾: 鱼鱼送回 ${movedFish.loc}(${movedFish.x},${movedFish.y})`);
        } catch (e) { log('BWF 送她回去失败(她的 loop 会自己走位):', String(e).slice(0, 60)); }
      }
      try { fs.unlinkSync(BORROW); log('BWF 收尾: 已摘掉借身体信号'); } catch { }
    }
  };
  // ⭐2026-11-10 主人拍板「换季自动买种子」: 田空(crops≤3) + 包里没有当季种子 + 钱>3万 → 按下表自动补货。
  //   id 全部用 crop_seasons 端点核实过的(网传表不可靠的教训见 §87), 价格=游戏标准价(/buy price 缺省会被按 2 倍收)。
  //   数量配比按"回报王优先": 秋=蔓越莓35+南瓜15+玉米10, 夏=蓝莓35+辣椒20, 春=花椰菜20+防风草30。冬不种。
  {
    const sB = await st();
    const frB = (await get('/farm_report').catch(() => null))?.crops;
    const season = sB?.time?.season;
    const SEASON_SHOP = {
      spring: [['(O)474', 'Cauliflower Seeds', 80, 20], ['(O)472', 'Parsnip Seeds', 20, 30]],
      summer: [['(O)481', 'Blueberry Seeds', 80, 35], ['(O)482', 'Pepper Seeds', 40, 20]],
      fall: [['(O)493', 'Cranberry Seeds', 240, 35], ['(O)490', 'Pumpkin Seeds', 100, 15], ['(O)487', 'Corn Seeds', 150, 10]],
      winter: [],
    };
    const want = SEASON_SHOP[season] || [];
    if (want.length) {
      // ⭐⭐2026-11-11 夏1 实录: 原来买种只看 `crops.total <= 3`, 而**换季那一刻死株还占着 HoeDirt**
      //   (frB.total 仍报 93/95) → 买种闸不开 → 后面 replantAll 只翻 4 格新地, 一整天只种 55 株。
      //   现在 crops.total 只数"活作物", 死株不进来, 所以判据要**看得见的空地**: 活作物 + 空翻地。
      //   空地数拿不到(探针失败)就退回旧判据, 宁可按旧逻辑也别乱买。
      const srT = await surr(18).catch(() => null);
      const emptyTilled = srT?.tiles
        ? srT.tiles.filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object).length : null;
      const landFree = emptyTilled === null ? true : ((frB?.total ?? 0) + emptyTilled) <= 6;
      if (landFree && (sB?.player?.money ?? 0) > 30000) {
        // ⭐2026-11-11 事故(春1 我踩的): 旧判据"包里有任意一包当季种子就不买" ——
        //   春1 包里剩着上一季的 Cauliflower Seeds×1, 整个买种闸被这 1 包卡死, 春1 一株没种(田还没翻)。
        //   改成按缺口买: 每个品种按 plan 数量减去包里已有包数, 缺多少买多少。
        for (const [id, nm, price, qty] of want) {
          const owned = (sB.inventory || []).filter(i => i && /seed/i.test(i.name || '') && (i.name || '').includes(nm.split(' ')[0]))
            .reduce((a, i) => a + (i.stack ?? 1), 0);
          const need = qty - owned;
          if (need <= 0) { log(`换季买种子(${season}): ${nm} 已有${owned}包够用, 不买`); continue; }
          log(`换季买种子(${season}): ${nm} 有${owned}包 缺${need}包 → 买(活作物 ${frB?.total ?? '?'} + 空翻地 ${emptyTilled ?? '?'})`);
          const r = await post('/buy', { id, quantity: need, price }).catch(() => null);
          log('买种:', nm, r?.ok ? `x${r.quantity ?? need} 共 ${r.totalCost ?? price * need}g` : JSON.stringify(r).slice(0, 100));
          await sleep(1200);
        }
        }
    } else if (want.length && (sB?.player?.money ?? 0) > 30000) {
      // ⭐2026-11-11 扩展(春6 实录): 收完防风草留下 ~28 块空翻地, 旧闸只在"田几乎全空(≤3株)"时买种,
      //   结果这些空格一直空到换季 —— 收完一茬就该补种下一茬。改成: 田里有空翻地且包里没种子,
      //   就按 plan(封顶=空格数)补买, replantAll 会把新种子种进空翻地。
      const srB = await surr(16).catch(() => ({ tiles: [] }));
      const emptyTilled = (srB.tiles || []).filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object).length;
      if (emptyTilled > 0) {
        log(`空地补种检查(${season}): 空翻地 ${emptyTilled} 格`);
        for (const [id, nm, price, qty] of want) {
          const owned = (sB.inventory || []).filter(i => i && /seed/i.test(i.name || '') && (i.name || '').includes(nm.split(' ')[0]))
            .reduce((a, i) => a + (i.stack ?? 1), 0);
          const need = Math.min(emptyTilled, qty) - owned;
          if (need <= 0) continue;
          log(`空地补种(${season}): ${nm} 有${owned}包 → 买 ${need} 包`);
          const r = await post('/buy', { id, quantity: need, price }).catch(() => null);
          log('买种:', nm, r?.ok ? `x${r.quantity ?? need} 共 ${r.totalCost ?? price * need}g` : JSON.stringify(r).slice(0, 100));
          await sleep(1200);
        }
      }
    }
  }
  let sidHdr = {};
  // ⭐⭐⭐2026-11-11 22:4x (§117) 浇水顺序改为「主持自己浇 → BWF 只兜底」:
  //   原本(§116)是"借鱼鱼的身体", 代价太大且有两个独立故障(详见 hostWater 上方的注释):
  //   她的 loop 被"BWF 跳过"日志锁死整天不动 + 她的体力被抽到 -5.2 力竭。
  //   7842 自己就有 /tool_area(HandleToolArea 用 Game1.player=本机玩家), 主持有铱壶,
  //   站到农场浇自己的田, 不动她一根汗毛。BWF 借身体只在主持这轮没浇完时兜底。
  const watered = await hostWater();
  if (!watered) {
    const fr = await cropsOf();
    if (fr && fr.total - fr.watered > 0) {
      log(`主持浇水没浇完(${fr.watered}/${fr.total}) → 退回 BWF 借身体兜底`);
      await bwfWater();
      sidHdr = {};
    }
  }
  await sleep(1500);
  await replantAll();
  {
    const fr = await cropsOf();
    if (fr && fr.total - fr.watered > 0) {
      log(`补种后仍有干株(${fr.watered}/${fr.total}) → 再浇一轮`);
      const again = await hostWater();
      if (!again) await bwfWater();
    }
  }
  // §121 新季播种: 换季窗(day≤3)补种后仍有空翻地 → 买当季种子+播种+浇水(函数内部判窗, 平日空操作)
  await buySeasonSeedsIfNeeded();
  await tryQuests(); // 邮件任务优先于杂务(有可交付物品)

  // 扩田: 种子还有剩但没地 → 贴着田边翻新格再种; ⚠️受 farm-region.json 区域门控(star 借鉴,
  // 冻结策略不再靠口头规矩而是读配置), M1 完成前 policy=冻结 一律不扩
  {
    const s = await st();
    const seedsLeft = s.inventory.filter(i => SEED_RE.test(i.name)).reduce((a, i) => a + (i.stack ?? 1), 0);
    const region = regionConfig();
    // ⭐2026-11-10: 冬天别扩田 —— 翻出来的空地冬天既种不了(补种闸认 season=winter 不种)也收不到东西,
    //   白耗体力还可能把候选落点占掉。实测 冬1 `扩田候选 19 格, 取 1`。
    const seasonNow = (await st()).time?.season;
    if (seasonNow === 'winter') {
      log('扩田跳过: 冬天不种地(翻出来的空地白白占着)');
    } else if (seedsLeft > 0 && (region.policy === '冻结' || region.expansionDirection === null)) {
      log(`扩田跳过: 区域策略=${region.policy}(${region.note})`);
    } else if (seedsLeft > 0) {
      // ⭐2026-11-11 春1 冷启动(我踩的): 换季把整田 HoeDirt 洗掉 → expandField"贴着旧翻地找候选"
      //   没了锚点, 静默 return 0(现场: 补种喊"无空株可补"、扩田零日志、farm_report 0 株, 春种开不了张)。
      //   且开局 debris(Twig/Stone)铺满旧田, 不能用写死的格子列表 —— 必须就地读图, 只挑无物的干净格。
      //   ⚠️/till_area 只认"当前地图"的绝对坐标 → 必须先 warp 并验证在 Farm(春1 我在海滩误锄 11 格的教训)。
      await warpFarmAnchor();
      const here = (await st()).location?.name;
      if (here !== 'Farm') {
        log(`⚠️ 冷启动没回到农场(人在 ${here}) → 今天先不翻地, 别在别的地图乱锄`);
      } else {
        const dg = await diggableSet();
        const ft = await fieldTiles();                 // 按**田区矩形**读, 不用玩家半径(半径读到的是农舍门口)
        const dirtNow = (ft || []).filter(t => t.terrain === 'HoeDirt');
        if (dirtNow.length) {
          const tilled = await expandField(Math.min(seedsLeft, 10));
          if (tilled > 0) {
            await replantAll();
            // ⭐2026-11-11 §117: 新翻的地只有主持能浇(他的水壶), 先自己浇, 浇不动才借她的身体
            if (!(await hostWater())) await bwfWater();  // 水在播种前就浇完了, 新下的苗当天会干着过夜(白慢一天生长) → 播完补一轮
          }
        } else if (ft === null) {
          // 读不到田区就不下锄: 盲锄曾把体力耗光还没翻出一格
          log('⚠️ 冷启动翻地: 读不到田区矩形(/surroundings?x1.. 无返回) → 今天先不翻地');
        } else {
          // ⭐⭐⭐2026-11-13 春2 真因: 田里 terrain 大多是 Grass(Grass 也是 TerrainFeature)
          //   → /till_area 一律判 occupied。正确顺序 = 先把草锄掉(/clear_ground), 再犁。
          let tiles = tillableFilter(ft, dg)
            .sort((a, b) => (Math.abs(a.x - 62) + Math.abs(a.y - 22)) - (Math.abs(b.x - 62) + Math.abs(b.y - 22)))
            .slice(0, 40).map(t => ({ x: t.x, y: t.y }));
          if (!tiles.length) {
            const grassy = ft.filter(t => /Grass/i.test(t.terrain || '')).length;
            if (grassy > 0) {
              log(`冷启动翻地: 田里可犁格 0, 但 ${grassy} 格是草 → 先 /clear_ground 锄草再犁`);
              // ⚠️/clear_ground 是**一格一个请求**(query ?x=&y=, 反编译 HandleClearGround 只解析单点),
              //   不收 tiles 数组 ⇒ 逐格发, 上限 60 格防一天耗时。
              let cleared = 0;
              for (const t of ft.filter(t => /Grass/i.test(t.terrain || '')).slice(0, 60)) {
                const c = await get(`/clear_ground?x=${t.x}&y=${t.y}`).catch(() => null);
                if (c?.ok) cleared++;
              }
              log(`  锄草: ${cleared} 格`);
              await sleep(1500);
              const ft2 = await fieldTiles();
              tiles = tillableFilter(ft2, dg)
                .sort((a, b) => (Math.abs(a.x - 62) + Math.abs(a.y - 22)) - (Math.abs(b.x - 62) + Math.abs(b.y - 22)))
                .slice(0, 40).map(t => ({ x: t.x, y: t.y }));
            }
          }
          if (!tiles.length) {
            const objs = ft.filter(t => t.object).length;
            log(`冷启动翻地: 田区 ${ft.length} 格里可犁 0 格(有物 ${objs} 格) → 今天不盲锄`);
          } else {
            log(`冷启动翻地: 田区可犁 ${tiles.length} 格, 下锄`);
            const r = await post('/till_area', { tiles }).catch(() => null);
            const skList = r?.skipped || [];
            const skBy = skList.reduce((a, s) => { const k = s.reason || '?'; a[k] = (a[k] || 0) + 1; return a; }, {});
            log('冷启动翻地:', r?.tilled_count ?? '?', '/', tiles.length, '格',
              skList.length ? `(桥跳过 ${skList.length} 格: ${JSON.stringify(skBy)})` : '');
            if ((r?.tilled_count ?? 0) === 0) {
              log('⚠️ 冷启动翻地 0 格 —— skip reason 见上, 今天先不硬锄(别把体力耗在犁不动的格上)');
            } else {
              await replantAll();
              if (!(await hostWater())) await bwfWater();
            }
          }
        }
      }
    }
  }

  // 3. 钓鱼 (体力<15 收工 = 用完再睡不浪费; 背包>=10 清仓)
  // 安全点②: 农活完、钓鱼前
  {
    const sF = await st();
    globalThis.__dlS = sF;
    emit('farm-done', { t: sF.time?.timeOfDay, stamina: Math.round(sF.player?.stamina ?? 0), inv: (sF.inventory || []).filter(i => i?.name).length });
    if (stopRequested()) { try { await fishbotSet(false); } catch { } return null; }
  }
  // ⭐春4 钓鱼升级(2026-11-14 用户「开始」拍板): 雨天改钓山湖(43,10)朝东 —— 春天海滩雨只有小杂鱼30-80g,
  //   山湖雨天=大口黑鲈100g(铱金200g), 且传说鱼就在山湖图(bot钓不动难度110, 只换图不赌点);
  //   (43,10)朝东 是 §83.1 实证过的第二个山湖真钓点(42,11 留给鱼鱼, 同图不同格不打架)。晴天照旧海滩。
  let spotKind = 'beach'; // beach | mountain
  // ⭐春15实测: weather=3=大风天(isRaining/isLightning 全false) —— 游戏真值在布尔字段, int 枚举只分类;
  //   所以雨天判定 = 枚举1 OR isRaining OR isLightning(夏天雷雨枚举可能是3, 布尔不会骗人)
  try { const sw = await st(); if (sw.time?.weather === 1 || sw.time?.isRaining || sw.time?.isLightning) spotKind = 'mountain'; } catch { }
  const SPOT = spotKind === 'mountain' ? { loc: 'Mountain', x: 43, y: 10 } : { loc: 'Beach', x: 44, y: 35 };
  log(`钓点: ${spotKind} ${SPOT.loc}(${SPOT.x},${SPOT.y})` + (spotKind === 'mountain' ? ' (雨天: 湖=黑鲈100g; 传说鱼需手动, bot不赌)' : ''));
  const bw = await warp(SPOT.loc, SPOT.x, SPOT.y);
  log('去钓点:', bw?.failed ? '失败 ' + JSON.stringify(bw).slice(0, 80) : '成功'); // 2026-11-06: 钓鱼段曾被无声跳过, 补日志
  // ⭐2026-11-06: /warp 是"下一 tick 落地", 只查 bw.failed 会在人还没离开农场时就开钓 → 田里抛竿(用户抓现行)
  let onBeach = false;
  for (let i = 0; i < 8; i++) {
    await sleep(1000);
    if ((await st()).location?.name === SPOT.loc) { onBeach = true; break; }
  }
  if (!onBeach && spotKind === 'mountain') {
    // 山湖没落地 → 兜底海滩(雨天海滩傍晚也有鳗鱼85g, 总比整天空转强)
    log('山湖没落地 → 兜底海滩 44,35');
    await warp('Beach', 44, 35);
    for (let i = 0; i < 8; i++) {
      await sleep(1000);
      if ((await st()).location?.name === 'Beach') { onBeach = true; SPOT.loc = 'Beach'; SPOT.x = 44; SPOT.y = 35; break; }
    }
  }
  // ⭐2026-11-07 事故(春20/21 两次): 落地后角色被判到 y=94, 而 Beach 地图只有 104×50 → 站在图外(用户:"掉海里了"),
  //   fishbot 照样报 active 但一条鱼都钓不到。落点越界 = 直接撤回农场并跳过钓鱼段。
  if (onBeach) {
    const sc0 = await st();
    const mw = sc0?.location?.mapWidth ?? 999, mh = sc0?.location?.mapHeight ?? 999;
    if ((sc0?.player?.x ?? 0) >= mw || (sc0?.player?.y ?? 0) >= mh) {
      // ⭐2026-11-08(春24): 越界先重试一次(偶发漂移, 重 warp 同一钓点), 再不行撤退(晴天改山湖42,11, 雨天本就在山湖)
      log(`⚠️ 钓点落点越界 (${sc0.player.x},${sc0.player.y}) 图 ${mw}×${mh} → 重试一次 warp ${SPOT.loc}`);
      await warp(SPOT.loc, SPOT.x, SPOT.y);
      await sleep(2500);
      const sc1 = await st();
      const mw1 = sc1?.location?.mapWidth ?? 999, mh1 = sc1?.location?.mapHeight ?? 999;
      if (sc1?.location?.name === SPOT.loc && (sc1?.player?.x ?? 999) < mw1 && (sc1?.player?.y ?? 999) < mh1) {
        log('重试后落点正常, 继续钓鱼');
      } else {
        log('仍越界/未落地 → 撤回农场', spotKind === 'beach' ? '→ 改山湖(42,11)兜底' : '(雨天山湖也没落地, 放弃钓鱼段)');
        await warp('Farm', 64, 15);
        onBeach = false;
        if (spotKind === 'beach') {
          await warp('Mountain', 42, 11);
          for (let i = 0; i < 8; i++) {
            await sleep(1000);
            if ((await st()).location?.name === 'Mountain') { onBeach = true; break; }
          }
          if (onBeach) log('兜底山湖(42,11)落地, 继续钓鱼(晴天湖=黑鲈100g)');
        }
      }
    }
  }
  if (!onBeach) log('warp 海滩没落地, 跳过钓鱼段(防田里抛竿)');
  // ⭐2026-11-08(冬15-17 夜市): 夜市日 warp Beach 落在 BeachNightMarket 装饰图 → 钓鱼段整天空转
  //   (实测 Day15 全天 0 鱼 0 饵耗、净收入只有 498g)。夜市日改去山湖 (42,11) 朝东钓真鱼。
  if (!onBeach) {
    try {
      const nm = (await st()).location?.name;
      if (nm === 'BeachNightMarket') {
        log('夜市图占了海滩 → 改去山湖 (42,11) 钓鱼');
        await warp('Mountain', 42, 11);
        for (let i = 0; i < 8; i++) {
          await sleep(1000);
          if ((await st()).location?.name === 'Mountain') { onBeach = true; break; }
        }
        if (!onBeach) log('山湖也没落地, 放弃钓鱼段');
      }
    } catch { }
  }
  if (onBeach) {
    // 2026-11-06 坑: 鱼竿名字写死 Bamboo Pole, 实际包里是 Fiberglass Rod → sel 失败举着种子钓一天
    // 2026-11-05 升级: 优先铱鱼竿(能挂饵/浮标), 没有再退回任意竿
    const inv0 = (await st()).inventory;
    const rod = inv0.find(i => /Iridium Rod/i.test(i?.name || '')) || inv0.find(i => /Rod|Pole/i.test(i?.name || ''));
    if (!rod) { log('没有鱼竿, 跳过钓鱼段'); }
    else {
    // ⭐2026-11-07 事故(秋24): 铱竿在手但 rod.baitStack=0 且包里一颗饵都没有 → fishbot 照报 enabled=true
    //   却一整天 0 抛竿(§73 第三型假活), 停滞哨兵每 33 分钟硬重启一次也是空转。
    //   修: 开钓前先看饵, 没有就 /buy 现买(HandleBuy 直接 Create+addItem, 不需要开商店界面)。
    {
      // ⭐春4 升级: 普通饵(咬钩−50%)换 Deluxe Bait(咬钩快+鱼条+12px, 100g/20个) —— id 必须用字符串
      //   '(O)DeluxeBait'((O)905 在本安装是芒果糯米饭, 别用数字id); rod.baitId 才是权威, bait 名字是译文。
      const s1 = await st();
      const r0 = s1.player?.rod || {};
      const bt = r0.baitStack ?? 0;
      const isDeluxe = r0.baitId === '(O)DeluxeBait' || /Deluxe/i.test(r0.bait || '') || /高级鱼饵/.test(r0.bait || '');
      const bagDeluxe = (s1.inventory || []).some(i => /高级鱼饵|Deluxe/i.test(i.name || ''));
      if (bt <= 0 || !isDeluxe) {
        let useId = bagDeluxe ? '(O)DeluxeBait' : null;
        if (!useId) {
          const b = await post('/buy', { id: '(O)DeluxeBait', quantity: 150, price: 100 }).catch(() => null);
          log('补豪华饵:', b?.ok ? `买入 ${b.quantity} 个 (${b.totalCost}g)` : JSON.stringify(b).slice(0, 100));
          useId = b?.ok ? '(O)DeluxeBait' : '(O)685';
          if (!b?.ok) {
            const b2 = await post('/buy', { id: '(O)685', quantity: 600, price: 5 }).catch(() => null);
            log('豪华饵没买到, 退普通饵:', b2?.ok ? `买入 ${b2.quantity} 个` : JSON.stringify(b2).slice(0, 100));
          }
        } else if (bt > 0) {
          log(`换豪华饵(竿上普通饵 x${bt} 摘回包里)`);
        }
        await sel(rod.name);
        await sleep(300);
        const rb = await post('/rod', { action: 'bait', id: useId }).catch(() => null);
        log('挂饵:', rb?.ok ? `${rb.rodInfo?.bait} x${rb.rodInfo?.baitStack}` : JSON.stringify(rb).slice(0, 100));
      }
    }
    // ⭐春4 升级: 拟饵槽保证非空 —— 陷阱浮标(500g, 硬鱼逃逸−33%)是钓难度75+鱼的班底; 铱竿1槽, 装了就跳过
    {
      const s2 = await st();
      const tk = s2.player?.rod?.tackle;
      const tkEmpty = !Array.isArray(tk) || tk.length === 0 || tk.every(t => !t || (typeof t === 'object' && !t.name && !t.id));
      if (tkEmpty) {
        if (!(s2.inventory || []).some(i => /(Trap|Cork) Bobber|浮标/i.test(i.name || ''))) {
          const b = await post('/buy', { id: '(O)694', quantity: 1, price: 500 }).catch(() => null);
          log('补陷阱浮标:', b?.ok ? `买入 (${b.totalCost}g)` : JSON.stringify(b).slice(0, 100));
        }
        await sel(rod.name);
        await sleep(300);
        let rt = await post('/rod', { action: 'tackle', id: '(O)694' }).catch(() => null);
        if (!rt?.ok) rt = await post('/rod', { action: 'tackle', id: '(O)695' }).catch(() => null);
        log('挂拟饵:', rt?.ok ? JSON.stringify(rt.rodInfo?.tackle || rt.rodInfo).slice(0, 90) : JSON.stringify(rt).slice(0, 100));
      }
    }
    await sel(rod.name);
    await post('/face', { direction: 1 });
    await sleep(300);
    await ensureFood();          // ⭐2026-11-11 常驻补食品(和补饵同一个位置, 钓鱼前一次性补齐)
    log('fishbot ON =', await fishbotSet(true));
    let lastReport = '';
    let fishbotKeepalive = 0;
    // ⭐2026-11-06 事故(Day21): 钓到宝箱拿到「高级鱼饵/铱矿石」后 currentItem 变 null, 竿不在手上;
    //   fishbot 依然报 enabled=true、HUD 也写 "Fishbot active!" —— 但一整天 0 抛竿(体力 222 卡 7 小时、0 鱼)。
    //   /state 的 rod.inHand=false 是唯一线索。修复: 每 200s 心跳里顺手校验"手里有竿", 没竿就重选;
    //   再加一道停滞哨兵: 连续 10 次心跳 fishCaught/体力都没动 → fishbot 硬重启(off→on)+重选竿。
    let lastFishCount = (await st()).player?.fishCaught ?? 0;
    let lastStamMark = Math.round((await st()).player?.stamina ?? 0);
    let stallTicks = 0;
    let castStuckTicks = 0;   // 连续观测到"卡在抛竿动画"的心跳数
    let offSpotTicks = 0;     // 连续观测到"人不在钓点"的心跳数
    for (;;) {
      await sleep(20000);
      // 安全点③: 钓鱼心跳(带数, reporter 靠它判停摆)
      {
        const sh = await st();
        globalThis.__dlS = sh;
        emit('fishing', { loc: sh.location?.name, t: sh.time?.timeOfDay, fishCaught: sh.player?.fishCaught, bait: sh.player?.rod?.baitStack, stamina: Math.round(sh.player?.stamina ?? 0), menu: sh.activeMenu?.type || null, fishing: !!sh.player?.fishing?.isFishing, stallTicks });
        if (stopRequested()) { log('收工(fishing 心跳收到 stop)'); try { await fishbotSet(false); } catch { } break; }
        // ⭐⭐⭐2026-11-11 §118 自愈(实拍 22:48-23:00): day-loop 报"去海滩: 成功"并正常钓了 60s 后,
        //   22:49:24 被一发来源不明的 warp 拽回 Farm(64,15), canMove:false + isCasting:true +
        //   isFishing:false, 在农场原地"抛竿"空转 11 分钟 —— 旧心跳只管"关菜单+报数+停滞重启",
        //   唯独没有"人在哪/姿势对不对"这两检, 不会回头。两道闸:
        //   ① 卡抛竿动画: 正常抛竿 1-2s 就进 isFishing; 连续 3 次心跳(≥40s)还是
        //      isCasting && !isFishing && !canMove = 必卡 → /stop 一发即愈(实测清掉)。
        //   ② 人不在钓点(Beach/Mountain 都不是) → /stop + 重 warp 海滩; 连续 3 次回不去 → 放弃钓鱼段,
        //      交给后面正常的收工/睡觉流程, 绝不在错地图抛竿。
        //   ⚠️清仓(manageInventory)会合法地回农场, 但它在本心跳内 await 顺序跑完才轮到下一 tick,
        //     不会与本检查交错; 夜市/越界兜底把人放到 Mountain 也算合法钓点。
        if (sh.player?.canMove === false && sh.player?.fishing?.isCasting && !sh.player?.fishing?.isFishing) {
          if (++castStuckTicks >= 3) {
            log(`⚠️ 卡在抛竿动画 ${castStuckTicks} 次心跳(canMove=false isCasting=true isFishing=false) → /stop 清动画`);
            await post('/stop', {}).catch(() => { });
            await sleep(600);
            castStuckTicks = 0;
          }
        } else castStuckTicks = 0;
        const locNow = sh.location?.name;
        if (locNow !== 'Beach' && locNow !== 'Mountain') {
          log(`⚠️ 钓鱼心跳发现人不在钓点(现在 ${locNow}) → /stop + 重 warp 钓点 ${SPOT.loc}`);
          await post('/stop', {}).catch(() => { });
          await sleep(400);
          await warp(SPOT.loc, SPOT.x, SPOT.y).catch(() => { });
          await sleep(1500);
          const s2 = await st();
          if (s2.location?.name === 'Beach' || s2.location?.name === 'Mountain') offSpotTicks = 0;
          else if (++offSpotTicks >= 3) { log(`连续 ${offSpotTicks} 次回不了钓点 → 放弃钓鱼段`); break; }
        } else offSpotTicks = 0;
      }
      // 2026-11-06: fishbot 弹菜单后会自己罢工(视频验收抓到: 干站 5 小时无横幅) → 每 200s 强制拉回 ON
      if (++fishbotKeepalive % 10 === 0) {
        const sc = await st();
        if (!/Rod|Pole/i.test(sc.player?.currentItem || '')) {
          const r = (sc.inventory || []).find(i => /Iridium Rod/i.test(i?.name || '')) || (sc.inventory || []).find(i => /Rod|Pole/i.test(i?.name || ''));
          if (r) {
            await sel(r.name);
            await post('/face', { direction: 1 });
            await sleep(300);
            log('竿不在手 → 重选', r.name);
          }
        }
        await fishbotSet(true);
      }
      let s = await st();
      // 停滞哨兵: 200s×10=~33 分钟后鱼数和体力都没动 = fishbot 假活, 硬重启一次
      const fc = s.player?.fishCaught ?? 0, sm = Math.round(s.player?.stamina ?? 0);
      if (fc === lastFishCount && sm === lastStamMark) {
        if (++stallTicks >= 10) {
          log('⚠️ 疑似卡钓(10 次心跳 0 鱼 0 体力变化) → fishbot 硬重启');
          await fishbotSet(false).catch(() => { });
          await sleep(1000);
          const invR = (await st()).inventory || [];
          const rr = invR.find(i => /Iridium Rod/i.test(i?.name || '')) || invR.find(i => /Rod|Pole/i.test(i?.name || ''));
          if (rr) await sel(rr.name);
          await post('/face', { direction: 1 });
          await sleep(300);
          await fishbotSet(true).catch(() => { });
          stallTicks = 0;
        }
      } else { stallTicks = 0; lastFishCount = fc; lastStamMark = sm; }
      // ⭐⭐2026-11-11 主人: 「体力见底要么回体力要么吃东西」+「loop 里常驻补食品」。
      //   以前体力<15 直接 break 收工 → 天天 22:10 就换日, 定好的 24:00 那条永远轮不到。
      //   现在体力跌破 EAT_BELOW 就停下来吃(有菜单时不碰, 免得打断钓鱼小游戏), 吃完接着钓。
      if (!s.activeMenu && Math.round(s.player?.stamina ?? 0) < EAT_BELOW) {
        if (foodCount(s.inventory) > 0) {
          await fishbotSet(false).catch(() => { });
          await sleep(500);
          const ate = await eatUp(EAT_UNTIL);
          log('🍞 吃完', ate, '份 → 体力', Math.round((await st()).player?.stamina ?? 0), '继续钓');
          await fishbotSet(true).catch(() => { });
          // ⭐2026-11-12 00:4x (§120): 吃完必须刷新 s —— 收工判定原来还在用**吃前**的快照
          //   (Day18 实拍: 体 9<15 触发吃, 吃到 235, 但收工判定读的还是快照里的 9 → 刚吃完就被提前送回家,
          //    白丢 1610→2400 约 7 游戏小时的钓鱼)。同理跨天判定也依赖 s, 一并修好。
          s = await st();
        } else {
          log('🍞 体力', Math.round(s.player?.stamina ?? 0), '但包里没食品了 → 只能撑到收工');
        }
      }
      // ⭐2026-11-05 事故(主持在床上躺一整天): host-night-guard 的兜底在"体力<20"时就把主持送睡,
      //   而本循环的两个退出条件(时间≥23:00 / 体力<15)在换天后全部重置 —— 时间回到 6xx、体力回满 270,
      //   于是循环永远不退出, 人躺在床上空转一整天(fishbot 钓空气)。跨天必须直接退出钓鱼段。
      if (dayKeyOf(s) !== dk0) {
        log('天已经翻了(Day' + s.time.dayOfMonth + '), 退出钓鱼段(防跨天空转)');
        await fishbotSet(false).catch(() => { });
        // ⭐2026-11-09 事故(冬20 净 0g): 上面这句 return 直接跳出 playOneDay, 把第 4 段"尾清仓"整段跳过,
        //   一整天 60+ 条鱼全烂在背包里(crops 卖不掉、背包 19/12 超格)。跨天退出但清仓必须补跑。
        //   注意跨天后 chest 引用可能失效(农场重载), 清仓会自己走 findChest, 失败也不许抛。
        try {
          const chest2 = (await findChest(18)) || chest;
          if (chest2) { chest2.loc = (await st()).location?.name || chest2.loc || 'Farm'; }
          log('跨天补做尾清仓:', JSON.stringify(await manageInventory(chest2, true)).slice(0, 160));
        } catch (e) { log('跨天补清仓失败(不阻塞换日):', e.message); }
        return s;
      }
      if (s.activeMenu && !/BobberBar/i.test(s.activeMenu.type)) {
        if (s.activeMenu.type === 'ItemGrabMenu') {
          // ⭐⭐⭐2026-11-11 鱼鱼"自动钓鱼失败+它自己打开背包"真因(上手她客户端复现 + ilspycmd 反编译三方实锤):
          //   钓上宝箱时 Fishbot.AcquireTreasure 只做 addItemToInventoryBool; **背包满 = 一件都塞不进 → 物品留在箱里
          //   → 它自己那句 `if(物品数==0) exitThisMenu()` 永不成立 → 宝箱页永远挂着**。
          //   那个页面长得就是背包(物品格 + 自己的 36 格), 所以她看到的是"自动打开背包"; 而 fishbot 状态仍是
          //   enabled=true, 只是 GetFishingState 见 activeMenu!=null 就永远进不了 ReadyToCast → 看着像"fishbot 自己关".
          //   主持不发作 = 他包常清, 一次捡完就关页。⇒ 治本是钓鱼段**永远留 ≥3 空格**(宝箱最多三件, 见下面背包阈值注释)。
          //   关页手法(实测): 点物品格=直接搬进包(不走 heldItem) → 点 okButton → 再 /menu_close。
          const seen = new Set();
          for (let g = 0; g < 8; g++) {
            const m = await post('/menu', {}).catch(() => null);
            const it = m?.items?.[0];
            if (!m?.ok || !it) break;
            await post('/menu/click', { x: 264, y: 164 }).catch(() => null);
            await sleep(700);
            const key = it.name + ':' + it.count;
            if (seen.has(key)) break;      // 点了没反应 = 包满, 别空转
            seen.add(key);
            log('宝箱捡到:', it.name + 'x' + it.count);
          }
          await post('/menu/click', { x: 1116, y: 616 }).catch(() => null);   // okButton
          await sleep(600);
          // ⚠️关页后 /state 可能还报上一帧的 ItemGrabMenu —— 判"关没关"每轮都真读
          for (let k = 0; k < 3; k++) {
            if (!(await st()).activeMenu) break;
            await post('/menu_close', {}).catch(() => null);
            await sleep(600);
          }
          s = await st();
          if (s.activeMenu?.type === 'ItemGrabMenu') { log('宝箱页关不掉(包满) → 先清仓'); await manageInventory(chest); s = await st(); }
        } else {
          log('弹菜单', s.activeMenu.type, '→ 关');
          await post('/menu_close', {});
          await sleep(500);
          await post('/menu_close', {});
          await sleep(300);
          s = await st();
        }
      }
      const report = s.inventory.map(i => i.name + 'x' + (i.stack ?? 1)).join(',');
      // ⭐2026-11-06 巡检误判: 这行只在背包**有变化**时才打 → 空钓几分钟日志一片空白是正常的,
      //   别当成卡死。判存活看 .day-loop.lock 的 mtime(60s 心跳) + /state 的 timeOfDay 在不在走。
      if (report !== lastReport) {
        log('时间', s.time.timeOfDay, '体力', Math.round(s.player.stamina), '|', report);
        lastReport = report;
      }
      const slots = s.inventory.filter(i => i.name).length;
      const cap = s.player.maxItems || 12; // 2026-11-06: 36格联机背包别按 12 格包的阈值喊满
      // ⭐⭐⭐2026-11-11 主人: 「鱼鱼晕倒了, 为什么兜底总是掉, 兜底不应该是个常驻不会取消的程序吗」
      //   晕倒是**两条**独立的死法, 只拦一条不够:
      //   ① 体力 < REST_TARGET(15): fishbot 自己会 AutoPause 开背包不动, 但**人还站着** —— 白天体力见底再干别的
      //      (走去清仓/挥工具) 就是 0 体力干活, 一点就晕。⇒ 体力到线立刻收工, 不在海边多待。
      //   ② 时间 ≥ 24:00(2400/25:00 两档): 游戏里过了 02:00 还**没在床上**必晕, 被扣钱 + 第二天体力减半。
      //      原来只认 2600(26:00) —— 人都已经晕了才"收工", 那 86 体力是回不来的。⇒ 2400 起收工回屋睡。
      //   两条都只信 /state 实时读数(体力是客户端自己算的), 不信 fishbot 的 enabled。
      const lateHour = s.time.timeOfDay >= 2400;
      if (lateHour && s.player.stamina >= REST_TARGET) {
        log('⏰ 时间', s.time.timeOfDay, '过 24:00 → 立刻收工回屋(再熬到 02:00 必晕, 扣钱+次日体力减半)');
        break;
      }
      // ⭐⭐2026-11-11: cap-1 → cap-2。宝箱最少一件、最多三件, 只留 1 格会在第二件时捡不动 → 宝箱页挂死(见上)。
      if (slots >= cap - 2) {
        // ⚠️清仓的几步会/warp 回农场; 回来时**必须重新确认人在海滩**, 否则就在田里抛竿(11-11 15:0x 实拍:
        //   鱼鱼清理完站 Farm 上钓鱼去包里翻鱼)。照抄下面正常收工段的落地校验写法。
        await manageInventory(chest);
        let back = await st();
        if (back.location?.name !== SPOT.loc) {
          const bw2 = await warp(SPOT.loc, SPOT.x, SPOT.y);
          await sleep(1200);
          back = await st();
          if (back.location?.name !== SPOT.loc) {
            log('清仓后回不了钓点(' + (back.location?.name) + ') → 提前收工, 防在田里抛竿');
            break;
          }
          if (bw2?.failed) log('回钓点 warp 报失败但人已在钓点, 继续');
        }
        const slots3 = back.inventory.filter(i => i.name).length;
        if (slots3 >= cap - 2) {
          log('背包', slots3 + '/' + cap + ' 清不动(前台被占/没箱子), 提前收工防丢鱼');
          break;
        }
        const inv2 = back.inventory;
        const rod2 = inv2.find(i => /Iridium Rod/i.test(i?.name || '')) || inv2.find(i => /Rod|Pole/i.test(i?.name || ''));
        if (rod2) await sel(rod2.name);
        await post('/face', { direction: 1 });
        await sleep(300);
        log('fishbot ON =', await fishbotSet(true));
      }
      // ⭐⭐2026-11-09: 2300 → 2600, 与睡觉段 BED_TIME 对齐。原来钓鱼 23:00 收工、但睡觉段又等到
      //   21:00 就上床, 两者错位(凌晨那段白白空转)。现在统一: 钓到 24:00, 直接进睡眠段。
      if (s.time.timeOfDay >= BED_TIME || s.player.stamina < REST_TARGET) {
        log('收工: 时间', s.time.timeOfDay, '体力', Math.round(s.player.stamina));
        break;
      }
    }
    } // else(有鱼竿) 结束
  }

  // 4. 尾清仓 + 睡觉(重试 3 轮)
  // 安全点④⑤: 尾清仓前后各一条(清仓做到一半绝不读 stop)
  if (stopRequested()) { try { await fishbotSet(false); } catch { } return null; }
  log('fishbot OFF =', await fishbotSet(false));
  emit('before-clear', {});
  await manageInventory(chest, true);
  emit('after-clear', {});
  // ⭐2026-11-06: 钓鱼段被跳过时曾 13:40 就上床 → 睡不成又把 ready-check 挂着堵死鱼鱼。
  //   没到 bedtime 绝不睡, 原地等到点。
  // ⭐⭐2026-11-09 改 2100 → 2600: 原来 21:00 就上床, 而鱼鱼常在农场干到很晚。
  //   主持先 Ready 后鱼鱼还在田里 → 鱼鱼一按睡就开 SleepDialog, 两边谁都推不动
  //   (实拍 夏4 01:10 卡「正在等待其他玩家 1/2」)。主人拍板: 熬到 t2600(24:00) 才睡,
  //   体力<15 仍可提前 (那时不睡会直接昏倒, 更糟)。
  for (let i = 0; ; i++) {
    const sW = await st();
    if (dayKeyOf(sW) !== dk0) { log('天已经翻了(别人睡了), 直接进入明日'); return sW; }
    if (sW.time.timeOfDay >= BED_TIME || sW.player.stamina < REST_TARGET) break;
    if (i === 0) log('还早(' + sW.time.timeOfDay + ', 体力' + Math.round(sW.player.stamina) + '), 睡觉段等待到 ' + BED_TIME);
    if (i > 180) { log('等了 3 小时还没到 ' + BED_TIME + '(异常), 强制结束当日不睡'); return null; }
    await sleep(60000);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    emit('sleep-attempt', { attempt });
    // ⭐⭐⭐2026-11-11 跳天事故(Day20 → Day22): 主线程卡在 NewDay 上时, /sleep 是**进不了队列也
    //   取消不了**的 —— 三次重试全超时(18:37:12 / 18:39:18), 等死锁一解, 排队的请求一起执行,
    //   一天被翻走两次, Day21 没人跑过也没单独写盘。
    //   ⇒ 重试前先探主线程: /state 40ms 回 200 不算活, 要探一个碰世界状态的接口。
    //   探不通就**这一轮绝不发 /sleep**(发了就是往队列里埋雷), 原地等主线程回来。
    if (attempt > 0) {
      let alive = false;
      for (let w = 0; w < 10 && !alive; w++) {
        alive = await worldAlive(7842, 8000);
        if (!alive) { log('⏳ 主持主线程还没回来(重试前探活失败), 先不发 /sleep'); await sleep(15000); }
      }
      if (!alive) { log('⚠️ 主线程 150s 未恢复, 放弃本轮 sleep 重试(避免排队请求一起执行翻两天)'); break; }
    }
    log(JSON.stringify(await warp('FarmHouse', 9, 9)));
    const saveBefore = saveMtime();
    // ⭐2026-11-06 存档事故根因: 原来是"小鱼先睡 → 主持后睡"。主持的 sleep ready 会从前一晚挂到第二天,
    //   小鱼一睡就 2/2 直接换日, 主持自己的睡眠/存档流程根本没跑 → 冬3~冬8 连续 6 天没写盘。
    //   正确顺序: 主持先睡(真实睡眠+ready), 再叫小鱼; 换日后必须校验 SaveGameInfo mtime 前进。
    const r = await post('/sleep', {}).catch(e => ({ error: String(e) }));
    log('主持 sleep:', JSON.stringify(r).slice(0, 150));
    await sleep(4000);
    try { await fetch('http://localhost:7843/sleep', { method: 'POST' }); log('已通知小鱼睡'); } catch { }
    for (let i = 0; i < 15; i++) {
      await sleep(4000);
      const s = await st();
      if (dayKeyOf(s) !== dk0) {
        // 换天瞬间还没写盘: 存档是 ShippingMenu 结算动画走完 → SaveGameMenu 才落盘(反编译 ShippingMenu.update).
        // 这里原地等 mtime 前进(最长 75s), 别一看到换天就判"没写盘"(2026-11-05 Day6 误报).
        let saveAfter = saveMtime();
        for (let k = 0; k < 25 && saveAfter <= saveBefore; k++) {
          await clickSettlementIfShown();   // ⭐2026-11-11 结算页没人点 = 永远不写盘
          await sleep(3000); saveAfter = saveMtime();
        }
        const saved = saveAfter > saveBefore;
        log('✓ 换天 Day' + s.time.dayOfMonth, '钱', s.player.money, '体力', Math.round(s.player.stamina),
          saved ? `| ✓ 已存档 ${new Date(saveAfter).toLocaleTimeString('zh-CN')}` : '| ⚠️ 存档没写盘! 本条要查');
        return s;
      }
    }
    log('没睡成, 重试', attempt + 1);
  }
  // ⭐⭐2026-11-11 主人要求「鱼鱼平时不在也要 loop」: 睡不成不许直接退出。
  //   退出后看护在夜里(inNight)根本不会重拉, 下一个进程天亮了再重跑一遍白天 = 整夜空转。
  //   真会堵住换日的只有一种情况: 她客户端**连着但僵住** —— ReadyCheckDialog 不再刷帧, 她那一票永远投不出来。
  //   反编译证据: ReadyCheckDialog.update() 每帧都调 SetLocalReady(true)
  //   (dll-audit/sdv-full/StardewValley.Menus/ReadyCheckDialog.cs:74), 所以正常情况下她**不需要主动去睡**,
  //   "迟迟不换日"就是她那边没在跑帧。只在**她不在床上**时才 cancel 她那一票(在床上说明票是有效的, 别动)。
  //   还换不了日 = 等游戏 26:00 强制倒地换日(约 5 分钟游戏时间), 拿到新的一天就接着跑。
  try {
    const fz = await fetch('http://localhost:7843/state', { signal: AbortSignal.timeout(6000) }).then(r => r.json()).catch(() => null);
    if (fz && fz.player && fz.player.isInBed !== true) {
      const rc = await fetch('http://localhost:7843/cancel_sleep', { method: 'POST', signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null);
      log('🩹 她不在床上却卡着换日 → cancel 她那边僵住的 ready-check:', JSON.stringify(rc || {}).slice(0, 90));
      await sleep(3000);
      await post('/sleep', {}).catch(() => { });
    }
  } catch { }
  const saveGuard = saveMtime();
  for (let i = 0; i < 45; i++) {                 // 最长 3 分钟: 解僵后重睡 / 等 26:00 强制换日
    await sleep(4000);
    const s2 = await st().catch(() => null);
    if (s2 && dayKeyOf(s2) !== dk0) {
      let saveAfter = saveMtime();
      for (let k = 0; k < 25 && saveAfter <= saveGuard; k++) {
        await clickSettlementIfShown();     // ⭐2026-11-11 兜底路径同理
        await sleep(3000); saveAfter = saveMtime();
      }
      log('✓ 换天(兜底路径) Day' + s2.time.dayOfMonth, '钱', s2.player.money,
        saveAfter > saveGuard ? '| ✓ 已存档' : '| ⚠️ 存档没写盘! 本条要查');
      return s2;
    }
  }
  // ⭐睡不成绝不能留主持在床上 —— 挂着的 sleep ready-check 会把鱼鱼的换日/主线程全堵死(两次事故实锤)
  log('3 次没睡成且等不到换日, cancel_sleep 把主持拔下床(防堵鱼鱼), 本日不存档');
  await post('/cancel_sleep', {}).catch(() => { });
  await warp('Farm', 64, 15);
  return null;
}

// ===== 主流程 =====
let s0;
try { s0 = await st(); } catch { console.log('游戏没在跑, 退出'); process.exit(0); }
log('== Day' + s0.time.dayOfMonth, s0.time.timeOfDay, '钱', s0.player.money, '| 前台是星露谷?', await st().then(() => foregroundIsStardew()).catch(() => false));

// ⭐⭐⭐2026-11-11 主人拍板「为什么要三天，直接一直环，非意外不停」:
//   原来写 MAX_DAYS=3(一次运行最多 3 个游戏日自退, 靠 farm-watchdog 补拉) —— 但补拉有禁窗,
//   3 天一到正撞上禁窗就整段没人接(§114 前的下午空转就是这么来的)。
//   ⇒ 现在无限环: 白天玩到点睡, 睡醒接着下一天, 永不因"天数"退出。
//   只有**意外**才停, 各自的出口:
//     · 游戏没了(连续两轮 /state 够不到) → 停环交 watchdog; 游戏回来 watchdog 会再拉(它有 /farm_report 探活, 游戏关了不会空拉)。
//     · playOneDay 返回 null(主线程验活失败 / stopRequested=time-lock / 3 小时没到睡觉点) → 同上。
//     · 当日流程异常但游戏还活着 → **不算意外**: 关 fishbot、睡 5s、继续下一天。
let day = s0.time.dayOfMonth;
let curState = s0;
{
  const rules = memList('rule');
  if (rules.length) log('记忆规矩:', rules.map(r => r.text).join(' / '));
  log('累计账本:', JSON.stringify(ledSnapshot().totals));
}
let deadStreak = 0;   // 连续"游戏不可达"轮数(≥2 = 真没了, 意外 → 停)
for (let d = 0; ; d++) {
  try {
    const money0 = curState.player.money;
    const next = await playOneDay(day);
    if (!next) { log('睡觉失败, 退出'); break; }
    // 日结(star 累计账本借鉴): 净额含花费, 只作参考; 卖/存件数由 sellAndStore 内部入账
    const gain = next.player.money - money0;
    ledInc('daysPlayed', 1, 'Day' + day);
    ledInc('moneyEarned', gain, 'Day' + day + ' 净' + gain + 'g');
    memAdd('event', `Day${day}: 钱${next.player.money}(净${gain}g) 体${Math.round(next.player.stamina)} ${next.location?.name || ''}`);
    log('日结 Day' + day, '净', gain + 'g | 账本', JSON.stringify(ledSnapshot().totals));
    curState = next;
    day = next.time.dayOfMonth;
    deadStreak = 0;
    log('=== 进入 Day' + day + ' ===', compactState(next));
  } catch (e) {
    log('当日流程异常:', e.message);
    try { await fishbotSet(false); } catch { }
    // 意外判据: /state 连续够不到 = 游戏真没了(不是这一天运气差)。
    //   注意别拿单次 fetch 失败下结论 —— 换日/暂停窗口 /state 也会抖, 所以要连探 3 次间隔 5s。
    let reachable = false;
    for (let w = 0; w < 3 && !reachable; w++) {
      reachable = await worldAlive(7842, 8000).catch(() => false);
      if (!reachable) await sleep(5000);
    }
    if (!reachable) {
      if (++deadStreak >= 2) { log(`⚠️ 连续 ${deadStreak} 轮游戏不可达 → 意外停环, 交给 farm-watchdog`); break; }
      log('游戏这轮不可达(第 1 次), 再确认一轮');
    } else deadStreak = 0;
    await sleep(5000);
  }
}
log('day-loop 结束');
clearInterval(heartbeat);
// ⭐2026-11-11 实测: setInterval(tickWrite) 从不清 → 这个进程永远退不掉(僵尸),
//   farm-watchdog 看到进程还在就不拉新实例 → 下午整片空转。硬退。
process.exit(0);
