// fish-eye v1.0 (2026-11-04): 小鱼的"人话"游戏助手 —— 她一句话, 服务器翻译成动作
// 背景: 鱼鱼反馈 ①方位0-3要心算 ②周围一圈不带名字 ③移动一格一格 ④没地图 ⑤收/种一格一格 ⑥水壶要掏出来看
// 方案: 不装 mod。桥里已经有 /walk_to(寻路) /harvest /tool_area(批量浇/锄) /surroundings(带object/terrain/crop)
//       缺的只是"翻译层"。本服务 :7851 只读状态 + 发批量动作, 全程 HTTP, 零物理点击 → 不触发前台互锁。
// 用法:
//   GET  /say?cmd=看看            任意一句人话, 返回一段人话
//   POST /say {text:"收菜"}       同上
//   GET  /see  /map  /world  /todo  /watercan
//   POST /goto {to:"家"}  /harvest {r:12}  /water {}  /till {}  /plant {seed:"蓝莓"}
//   GET  /selftest                 探针: 逐个试高级端点, 报告哪些可用(游戏在跑时用)
// 安全: 只收菜/浇水/锄地/播种/走路/打水 —— 绝不卖货、绝不动背包整理、绝不物理点击
// 常驻: node fish-eye.mjs      (D:/StardewAI/fish-eye.log)
import http from 'node:http';
import fs from 'node:fs';
import {
  seeText, renderMap, ringText, tileDesc, canText, clockOf, seasonCN,
  findLandmark, homeOf, WORLD, LEGEND, parseCmd, resolveSeed, seedCN, todoList, dir8,
  arrivalText, weatherText, luckText, packText,
  placesInMap, placeLine, mapCN, MAP_CN, AREA_ALIAS, hoursText, openNow,
} from './fish-eye-lib.mjs';
import { makeWorld } from './world-map.mjs';

const PORT = Number(process.env.FISHEYE_PORT || 7851);
const TARGET = process.env.FISHEYE_TARGET || 'fish'; // 默认操作小鱼的角色
const BRIDGE = { fish: 'http://localhost:7843', host: 'http://localhost:7842' };
// FISHEYE_BASE / FISHEYE_RIVAL 可覆盖(自测时指到 mock 桥, 不碰真游戏)
const BASE = process.env.FISHEYE_BASE || BRIDGE[TARGET] || BRIDGE.fish;
const RIVAL = TARGET === 'fish' ? 'host' : 'fish'; // 另一个人(用于报"对方在哪/在不在睡")
const RIVAL_BASE = process.env.FISHEYE_RIVAL || BRIDGE[RIVAL];
const LOG_PATH = 'D:/StardewAI/fish-eye.log';
const SEEN_PATH = process.env.FISHEYE_SEEN || 'D:/StardewAI/fish-eye-seen.json';

// (旧 primeMap 已删: /map 没有 tiles, 整图走 /passable_rect)
const log = (...a) => {
  const line = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG_PATH, line + '\n'); } catch { }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

// ---------- 桥调用(带超时, 绝不让她等死) ----------
async function api(base, path, opts = {}, timeout = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(base + path, { ...opts, signal: ctl.signal });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { ok: false, raw: text.slice(0, 300) }; }
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally { clearTimeout(timer); }
}
const get = (p, to) => api(BASE, p, {}, to);
const post = (p, b = {}, to) => api(BASE, p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
}, to);
const rivalGet = (p) => api(RIVAL_BASE, p, {}, 8000);

async function state() { return get('/state'); }
async function surr(r = 8) { return get(`/surroundings?radius=${r}`); }

// ⭐2026-11-05 全地图数据层: /warps 全图传送表 + /tile_props 任意图的门/营业时间 + /passable_rect 任意图可行走格
//   → "地图 镇子"/"地图 裁缝铺" 不用把她送过去就能画整张图, 跨图路线也能算出来
const world = makeWorld({ get, log });

// ---------- 地图缓存: 走过的地方记住, 越走越全 ----------
let seenCache = {}; // { locationName: { "x,y": tile } }
try { seenCache = JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8')); } catch { }
let seenDirty = false;
function remember(loc, tiles) {
  if (!loc || !tiles?.length) return;
  const m = (seenCache[loc] ||= {});
  for (const t of tiles) m[`${t.x},${t.y}`] = t;
  seenDirty = true;
}
setInterval(() => {
  if (!seenDirty) return;
  seenDirty = false;
  try { fs.writeFileSync(SEEN_PATH, JSON.stringify(seenCache)); } catch { }
}, 5000).unref();

const tilesOf = (loc) => Object.entries(seenCache[loc] || {}).map(([k, t]) => ({ ...t, x: +k.split(',')[0], y: +k.split(',')[1] }));

// 每次读状态顺手把周围并进地图缓存(带作物/水/机器的细信息)
// ⚠️2026-11-05 更正: /map 只回 location{width,height}/warps/npcs/buildings, **没有 tiles** ——
//   整图骨架改用 world-map 的 /passable_rect; 这里的 seenCache 只做"细信息覆盖"(作物/水/机器)
async function stateAndTiles(r = 10) {
  let [s, sr] = await Promise.all([state(), surr(r)]);
  const loc = s?.location?.name || s?.location;
  if (sr?.tiles) remember(loc, sr.tiles);
  return { s, tiles: sr?.tiles || [], loc };
}

// ---------- 人话输出 ----------
const fail = (msg) => `❌ ${msg}`;
const ok = (msg) => `✅ ${msg}`;

function helpText(who) {
  return `我是你的游戏助手(远程/脚本都行), 你说人话我来干:

看:
  看看 / 状态            现在几点、在哪、体力、手上、水壶、四周有什么
  地图                    以你为中心画一张图 + 附近地标
  地图 镇子 / 地图 裁缝铺  画那一整张图(不在那边也能看), 标出所有门和营业时间
  世界怎么走              整张世界地图的路: 哪个出口通哪、裁缝和商店都在哪
  水壶还有多少水          壶里剩多少, 不用掏出来看
  该干嘛                  给你个目标(没目标时看这个)
  农场怎么样              全农场一次统计: 多少株/浇了多少/多少能收

干:
  收菜                    一次把周围的熟作物全收进包
  浇水                    把周围干着的作物一次浇完(壶空了会自己说你得去打水)
  打水                    在水边装满水壶
  锄地                    把身边一片空地锄出来(整块, 不东一口西一口)
  种蓝莓 / 种番茄 ...     先除草→锄地→才下种, 整块种在一起
  去裁缝铺 / 去镇上 / 回家  一句话直接送到(店能直接送进店里)
  出去                    在屋里/店里时, 一句话给你送出门
  裁缝铺在哪              告诉你在哪张图、门在几号、几时开门

修:
  卡床上了                两人都躺床上天亮不了时, 一句话破环下床(不用重开游戏)
  催熟                    季末最后一天保收成: 把没熟的强行催熟(仅季末用)

规矩(我照这个执行, 你放心):
  · 不卖你的东西; 不整理你背包; 不动你的收藏
  · 收/浇/锄/种 全是整块批量, 不会把你一个人留在田里
  · 21:30 之后会劝你回家(守卫到点会自动让你上床)`;
}

// ---------- 动作: 走路(同图寻路 / 跨图直传 / 进屋用 warp_building) ----------
// ⭐2026-11-05 全量地标后: 商店能直接落到店里的"门口落点"(LockedDoorWarp 给的那格),
//   自家的 Cabin 两间同名, 只能靠 /warp_building 的农场建筑坐标进屋, 否则会进错屋。
async function waitLoc(loc, secs = 8) {
  for (let i = 0; i < Math.ceil(secs / 1.2); i++) {
    await sleep(1200);
    const s = await state();
    if ((s?.location?.name || s?.location) === loc) return s;
    if (s?.activeMenu) await post('/menu_close', {});
  }
  return null;
}

// 门口站位: 门格本身是实心的, 找门下方/四周最近能站的格
async function nearestStand(loc, x, y, maxR = 4) {
  const g = await world.grid(loc);
  if (!g || !g.w) return null;
  if (g.cells.get(`${x},${y}`) === '.') return [x, y];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (g.cells.get(`${x + dx},${y + dy}`) === '.') return [x + dx, y + dy];
      }
    }
  }
  return null;
}

async function goto(to) {
  const lm = findLandmark(to, TARGET);
  if (!lm) {
    const names = ['小鱼的家', '农田', '出货箱', '温室', '镇中心', '皮埃尔杂货店', '艾米丽家(裁缝)', '铁匠铺', '博物馆', '酒吧', '罗宾木匠铺', '玛妮牧场', '威利鱼店', '矿洞', '海滩', '森林'];
    return fail(`我听不懂"${to}"。常用的: ${names.join(' / ')}\n(想知道某个地方在哪, 直接问"XX在哪"; 想看整张图说"地图 镇子")`);
  }
  const s0 = await state();
  const curLoc = s0?.location?.name || s0?.location;
  const px = s0?.player?.x, py = s0?.player?.y;
  const shut = lm.door?.hours && openNow(lm.door.hours, s0?.time?.timeOfDay) === false;
  const shutNote = shut ? `\n⚠️ 现在${hoursText(lm.door.hours)}已经关门了 —— 我把你送进去, 但柜台可能不营业` : '';
  // 目标站位: 地标坐标本身可能是门/作物/柜台(站不住), 取最近能站的格
  let stand = lm.stand ? lm.stand : [lm.x, lm.y];
  if (!lm.building) {
    const st = await nearestStand(lm.loc, lm.x, lm.y);
    if (st) stand = st;
  }

  if (curLoc === lm.loc && Math.abs(px - lm.x) + Math.abs(py - lm.y) <= 2) {
    return ok(`你已经到【${lm.name}】了 (${px},${py})`);
  }

  // ① 同图: 交给桥自己的寻路 /walk_to(它一次走整段)
  if (curLoc === lm.loc) {
    const r = await post('/walk_to', { x: stand[0], y: stand[1] }, 60000);
    if (r?.ok !== false && !r?.error) {
      const s = await state();
      const reached = s?.player && Math.abs(s.player.x - stand[0]) + Math.abs(s.player.y - stand[1]) <= 3;
      if (reached) return ok(`走到${arrivalText(s, lm.name)}`);
      return `⚠️ 往【${lm.name}】走了, 但现在在 (${s?.player?.x},${s?.player?.y}) — ${r?.note || r?.reason || '离得还远, 再喊一次'}`;
    }
    log('walk_to 不可用, 回退 warp:', JSON.stringify(r).slice(0, 120));
  }

  // ② 农场建筑(小屋/温室/农舍): 同名建筑只能按坐标进, 这是唯一不会进错的方法
  if (lm.building) {
    const r = await post('/warp_building', { bx: lm.building.bx, by: lm.building.by, x: -1, y: -1 }, 30000);
    const s = await waitLoc(lm.loc, 8);
    if (s) {
      remember(lm.loc, (await surr(10))?.tiles);
      return ok(arrivalText(s, lm.name)) + shutNote;
    }
    log('warp_building 失败, 改走 warp:', JSON.stringify(r).slice(0, 120));
  }

  // ③ 室内落点直传(商店/矿洞/社区中心等, 坐标来自门里的 LockedDoorWarp)
  if (lm.loc !== curLoc) {
    const r = await post('/warp', { location: lm.loc, x: stand[0], y: stand[1] }, 30000);
    const s = await waitLoc(lm.loc, 8);
    if (s) {
      remember(lm.loc, (await surr(10))?.tiles);
      const route = await world.routeHops(curLoc, lm.loc);
      return ok(arrivalText(s, lm.name)) + shutNote
        + (route && route.length > 2 ? `\n(路线本来是: ${route.map(mapCN).join(' → ')})` : '');
    }
    log('室内直传没成, 走门口兜底:', JSON.stringify(r).slice(0, 140));

    // ④ 兜底: 先到门外, 让她自己迈一步(有些室内落点站不住/门要钥匙)
    if (lm.door) {
      const stl = await nearestStand(lm.door.loc, lm.door.x, lm.door.y + 1)
        || await nearestStand(lm.door.loc, lm.door.x, lm.door.y);
      if (stl) {
        await post('/warp', { location: lm.door.loc, x: stl[0], y: stl[1] }, 30000);
        const s2 = await waitLoc(lm.door.loc, 6);
        if (s2) {
          return `⚠️ 送到【${lm.name}】门外了 (${stl[0]},${stl[1]})。门在${dir8(lm.door.x - stl[0], lm.door.y - stl[1])}边(${lm.door.x},${lm.door.y}) — 往上走一步(或者说"进去")就能进。${shutNote}`;
        }
      }
    }
    return fail(`没走到【${lm.name}】(${mapCN(lm.loc)} ${lm.x},${lm.y})。可能门锁着/还没解锁, 或者这格站不住。`);
  }

  // ⑤ 同图但不在目标(且 walk_to 不可用): 直接改坐标
  const r = await post('/warp', { location: lm.loc, x: stand[0], y: stand[1] }, 30000);
  const s = await state();
  return r?.ok === false && r?.skipped_warp
    ? fail(`【${lm.name}】那格站不住(${stand[0]},${stand[1]}), 旁边能站: ${(r.standable_near || []).map((q) => `(${q.x},${q.y})`).join(' ')} — 再喊一次我挪过去`)
    : ok(arrivalText(s, lm.name));
}

// ---------- 出去: 从屋里/店里送到门外 ----------
async function leave() {
  const s = await state();
  const loc = s?.location?.name || s?.location;
  if (!loc || !s?.player) return fail('读不到状态(游戏没开?)');
  const OUT = new Set(['Farm', 'Town', 'Beach', 'Forest', 'Mountain', 'BusStop', 'Backwoods', 'Railroad', 'Desert', 'Woods', 'Mine', 'SkullCave', 'Tunnel']);
  const ex = (await world.exitsOf(loc)) || [];
  if (!ex.length) return fail(`【${mapCN(loc)}】这张图没有出口传送点(可能是特殊地图), 说"去农场"/"去镇子"我直接送你。`);
  const pick = ex.find((e) => OUT.has(e.to)) || ex[0];
  const r = await post('/warp', { location: pick.to, x: pick.tx, y: pick.ty }, 30000);
  if (r?.ok === false) {
    // 落点站不住就退到目的地中心
    await post('/warp', { location: pick.to, x: -1, y: -1 }, 30000);
  }
  const s2 = await waitLoc(pick.to, 8);
  if (s2) return ok(`出来了 — ${arrivalText(s2, mapCN(pick.to))}\n(从【${mapCN(loc)}】(${pick.x},${pick.y})的出口出来的)`);
  return fail(`出不去。可以试着说"去农场"/"去镇子", 我直接送你。`);
}

// ---------- 全农场统计(/farm_report 一次扫所有地图) ----------
// 反编译证据: HandleFarmReport 遍历 ResolveLocations("") 汇总 crops{total,watered,ready,byLocation}
// + animals + machines —— 不用再扫半径10 猜全田(以前就因此误报"30株没浇水")
async function farmOverview() {
  const r = await post('/farm_report', {}, 25000);
  if (!r?.ok) return fail('农场统计读不到: ' + (r?.error || '桥没回'));
  const c = r.crops || {};
  const lines = [
    `${seasonCN(r.season)}${r.dayOfMonth}日(第${r.year}年) 全农场:`,
    `  作物 ${c.total ?? 0} 株 — 已浇水 ${c.watered ?? 0}, 可收 ${c.ready ?? 0}${(c.total ?? 0) > (c.watered ?? 0) ? `, 还差 ${(c.total ?? 0) - (c.watered ?? 0)} 株没浇` : ''}`,
  ];
  const byLoc = (c.byLocation || []).filter((x) => x && (x.total ?? 0) > 0);
  if (byLoc.length) {
    lines.push('  分地图: ' + byLoc.map((x) => `${x.location || x.name} ${x.total}株(湿${x.watered}/熟${x.ready})`).join(' | '));
  }
  if (r.animals?.total) lines.push(`  动物 ${r.animals.total} 只`);
  if (r.machines?.total) {
    const ready = (r.machines.machines || []).filter((m) => m?.readyForHarvest || m?.ready).length;
    lines.push(`  机器 ${r.machines.total} 台${ready ? `, ${ready} 台出成品了` : ''}`);
  }
  const crops = c.total ?? 0;
  if (crops && !(c.ready ?? 0) && (c.watered ?? 0) === crops) lines.push('  → 全部浇过水了, 安心等熟');
  if ((c.ready ?? 0) > 0) lines.push('  → 有熟的! 说"收菜"我就去收');
  return lines.join(NL);
}

// ---------- 动作: 收割(HTTP /harvest, 无点击) ----------
async function harvest(r = 10) {
  const before = invMap((await state())?.inventory);
  let total = 0, rounds = 0, cropName = '';
  for (; rounds < 8; rounds++) {
    const sr = await surr(r);
    const loc = (await state())?.location?.name;
    if (sr?.tiles) remember(loc, sr.tiles);
    const ripe = (sr?.tiles || []).filter((t) => t.crop && (t.harvestable === true || Number(t.cropPhase) >= 4));
    if (!ripe.length) break;
    cropName = cropName || ripe[0].cropName || '';
    // 站到成熟作物旁边再喊 /harvest(它对面前/相邻格生效), 然后整批收
    const seedLike = ((await state())?.inventory || []).find((i) => /Seeds$|Starter$/.test(i.name || ''));
    if (seedLike) await post('/select', { name: seedLike.name }); // 手里别拿工具, 防误触
    const rr = await post('/harvest', {}, 20000);
    const got = Number(rr?.harvested ?? 0);
    total += got;
    log(`harvest round${rounds}: 成熟${ripe.length} → 收到${got}`);
    if (!got) {
      // 也许 /harvest 只认面前一格: 挪到第一株旁边再来一刀
      const t = ripe[0];
      await post('/walk_to', { x: t.x, y: t.y + 1 }, 25000);
      const r2 = await post('/harvest', {}, 20000);
      total += Number(r2?.harvested ?? 0);
      if (!Number(r2?.harvested ?? 0)) break;
    }
  }
  const after = invMap((await state())?.inventory);
  const gained = diffInv(before, after);
  const detail = gained.length ? gained.map(([n, c]) => `${n}×${c}`).join(', ') : '背包没变化';
  if (!total && !gained.length) return '周围没有熟的作物(熟的才收得起来, 生长期再等等)';
  return ok(`收了 ${cropName ? seedCN(cropName) || cropName : '作物'}: ${total || gained.reduce((a, [, c]) => a + c, 0)} 格 → ${detail}`);
}

// ---------- 动作: 浇水(批量 /tool_area ops=water, 回退逐格) ----------
async function water(r = 12) {
  const s0 = await state();
  const can = (s0?.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
  if (can && Number(can.waterLeft) === 0) {
    return fail('水壶是空的。先站到水边(池塘/河边)说"打水", 我帮你灌满再浇。');
  }
  const sr0 = await surr(r);
  const loc = s0?.location?.name;
  if (sr0?.tiles) remember(loc, sr0.tiles);
  const dry = (sr0?.tiles || []).filter((t) => t.crop && t.watered === false);
  if (!dry.length) return '周围作物都浇过水了, 不用再浇(再浇是浪费)';
  // 批量: /tool_area ops=water 一次浇一片
  const x1 = Math.min(...dry.map((t) => t.x)), x2 = Math.max(...dry.map((t) => t.x));
  const y1 = Math.min(...dry.map((t) => t.y)), y2 = Math.max(...dry.map((t) => t.y));
  const batch = await post('/tool_area', { operation: 'water', x1, y1, x2, y2 }, 120000);
  log('tool_area water:', JSON.stringify(batch).slice(0, 200));
  let left = 0, asked = false;
  const sr1 = await surr(r);
  if (sr1?.tiles) {
    remember(loc, sr1.tiles);
    left = sr1.tiles.filter((t) => t.crop && t.watered === false).length;
    asked = true;
  }
  if (asked && left === 0) return ok(`浇完了: ${dry.length} 格干土全浇上 (${canText(await state())})`);
  // 回退: 逐格(站四邻, 面朝, /use)
  let done = 0;
  for (const t of dry) {
    if (!(await standNear(t.x, t.y))) continue;
    const c = await state();
    const cc = (c?.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
    if (cc && Number(cc.waterLeft) <= 0) { await post('/refill', {}); await sleep(800); }
    await post('/select', { name: 'Watering Can' });
    await faceToward(t.x, t.y);
    const rr = await post('/use', {});
    if (rr?.tile && rr.tile.x === t.x && rr.tile.y === t.y) done++;
    await sleep(180);
  }
  const sr2 = await surr(r);
  if (sr2?.tiles) remember(loc, sr2.tiles);
  const stillDry = (sr2?.tiles || []).filter((t) => t.crop && t.watered === false).length;
  if (stillDry > 0) return `⚠️ 浇了 ${done} 格, 还有 ${stillDry} 格没浇上。可能壶空了: 现在是 ${canText(await state())} — 说"打水"我灌满再来。`;
  return ok(`浇完了: 逐格浇了 ${done} 格, 现在全湿了`);
}

// ---------- 动作: 打水 ----------
async function refill() {
  const s0 = await state();
  const can = (s0?.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
  if (can && Number(can.waterLeft) > 0 && Number(can.waterLeft) >= Number(can.waterMax || 40) - 1) {
    return ok(`水壶已经是满的: ${canText(s0)}`);
  }
  await post('/select', { name: 'Watering Can' });
  // 找最近的水格, 站到它旁边 /use
  const sr = await surr(14);
  remember(s0?.location?.name, sr?.tiles);
  const waterTiles = (sr?.tiles || []).filter((t) => t.water_fishable || /water|sea|pond/i.test(String(t.terrain || '')));
  if (!waterTiles.length) {
    const r0 = await post('/refill', {}); // 桥自己找水(refill 会自己处理)
    await sleep(1000);
    const s1 = await state();
    return /refill/i.test(String(r0?.error || '')) || r0?.ok === false
      ? fail(`附近看不到水, 桥也没找到。先去池塘/河边(说"去海滩"或农场南边), 到水边再说"打水"。现在: ${canText(s1)}`)
      : ok(`打满水了: ${canText(s1)}`);
  }
  let done = false;
  for (const w of waterTiles.slice(0, 6)) {
    if (!(await standNear(w.x, w.y))) continue;
    await post('/select', { name: 'Watering Can' });
    await faceToward(w.x, w.y);
    await post('/use', {});
    await sleep(700);
    const s = await state();
    const c = (s?.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
    if (c && Number(c.waterLeft) >= Number(c.waterMax || 40) - 1) { done = true; break; }
  }
  let s2 = await state();
  if (!done) {
    // 站不到水格/方向对不上 → 退到桥自己的 /refill(它内部自己找最近的水)
    const r0 = await post('/refill', {});
    await sleep(900);
    s2 = await state();
    const c = (s2?.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
    if (c && Number(c.waterLeft) >= Number(c.waterMax || 40) - 1) done = true;
    else log('refill 回退未成:', JSON.stringify(r0).slice(0, 120));
  }
  return done ? ok(`打满水了: ${canText(s2)}`) : `⚠️ 打水没成, 现在 ${canText(s2)}。附近可能没水, 先去池塘/河边(比如"去海滩")再喊"打水"。`;
}

// ---------- 动作: 锄地(批量 /tool_area ops=till) ----------
async function till(r = 6) {
  const s0 = await state();
  const p = s0?.player;
  if (!p) return fail('读不到玩家状态');
  if (Number(p.stamina) < 15) return fail(`体力只剩 ${Math.round(p.stamina)}, 别锄了, 回家休息`);
  const sr = await surr(r);
  const loc = s0?.location?.name;
  if (sr?.tiles) remember(loc, sr.tiles);
  const cands = (sr?.tiles || []).filter((t) =>
    t.passable && !t.crop && !t.object && !/HoeDirt/i.test(String(t.terrain || ''))
    && !/water|sea|pond/i.test(String(t.terrain || '')) && !t.isStone && !t.isWeeds && !t.isTwig);
  if (!cands.length) return '身边没有能锄的空地(要没有石头/杂草/物体的干净格)';
  // 铁律⑧: 整块锄, 不东一口西一口 → 取这批候选的包围盒
  const x1 = Math.min(...cands.map((t) => t.x)), x2 = Math.max(...cands.map((t) => t.x));
  const y1 = Math.min(...cands.map((t) => t.y)), y2 = Math.max(...cands.map((t) => t.y));
  const before = cands.length;
  const batch = await post('/tool_area', { operation: 'till', x1, y1, x2, y2 }, 120000);
  log('tool_area till:', JSON.stringify(batch).slice(0, 200));
  const sr2 = await surr(r);
  if (sr2?.tiles) remember(loc, sr2.tiles);
  const tilled = (sr2?.tiles || []).filter((t) => /HoeDirt/i.test(String(t.terrain || ''))).length;
  if (batch?.ok === false && !tilled) {
    return fail(`锄地没成: ${batch?.error || batch?.reason || '桥拒绝'}。告诉我, 我换法子。`);
  }
  return ok(`锄好了: 这块地(包围盒 ${x2 - x1 + 1}×${y2 - y1 + 1})现在是锄过的土 ${tilled} 格, 可以直接下种`);
}

// ---------- 动作: 播种(铁律⑧: 清场→锄地→才下种, 整块) ----------
async function plant(seedWord, r = 6) {
  const seedName = resolveSeed(seedWord) || (String(seedWord).endsWith('Seeds') ? seedWord : null);
  if (!seedName) return fail(`"${seedWord}"这个种子名我不认识。试: 蓝莓/番茄/辣椒/甜瓜/土豆/防风草/南瓜/玉米/草莓`);
  const s0 = await state();
  const have = (s0?.inventory || []).find((i) => i.name === seedName);
  if (!have) {
    const bag = (s0?.inventory || []).filter((i) => /Seeds$|Starter$|Tuber$|Shoot$/.test(i.name || '')).map((i) => i.name);
    return fail(`背包里没有【${seedCN(seedName)}】种子。你现在有的种子: ${bag.length ? bag.map(seedCN).join(' / ') : '一个都没有'}。想要种子跟我说, 我送过去。`);
  }
  const want = Number(have.stack ?? 1);
  // ① 找可种的土: 已有的锄过的土(优先, 整块) → 不够再锄
  let sr = await surr(r);
  let loc = s0?.location?.name;
  if (sr?.tiles) remember(loc, sr.tiles);
  const dirt = (sr?.tiles || []).filter((t) => /HoeDirt/i.test(String(t.terrain || '')) && !t.crop && !t.object);
  if (!dirt.length) {
    log('没有现成的锄过的土 → 先锄一块');
    const t = await till(r);
    log(t);
    sr = await surr(r);
    if (sr?.tiles) remember(loc, sr.tiles);
  }
  let spots = (sr?.tiles || []).filter((t) => /HoeDirt/i.test(String(t.terrain || '')) && !t.crop && !t.object);
  if (!spots.length) return fail('没找到能下种的空地。先站到田边(说"去田边"), 或者让我"锄地"先锄一块。');
  // 铁律: 整块 → 按行排序, 只取连续一片
  spots.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const x1 = Math.min(...spots.map((t) => t.x)), x2 = Math.max(...spots.map((t) => t.x));
  const y1 = Math.min(...spots.map((t) => t.y)), y2 = Math.max(...spots.map((t) => t.y));
  spots = spots.filter((t) => t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2).slice(0, want);
  let planted = 0;
  const fails = [];
  for (const t of spots) {
    const st = await state();
    const bag = (st?.inventory || []).find((i) => i.name === seedName);
    if (!bag) break;
    if (!(await standNear(t.x, t.y))) { fails.push(`${t.x},${t.y} 站不过去`); continue; }
    await post('/select', { name: seedName });
    await faceToward(t.x, t.y);
    const rr = await post('/use', {});
    await sleep(320);
    const sr3 = await surr(4);
    const after = (sr3?.tiles || []).find((z) => z.x === t.x && z.y === t.y);
    if (after?.crop) planted++;
    else fails.push(`${t.x},${t.y} ${rr?.error || '没种上'}`);
  }
  const st2 = await state();
  const left = (st2?.inventory || []).find((i) => i.name === seedName)?.stack ?? 0;
  const msg = `种了 ${planted} 格【${seedCN(seedName)}】, 背包还剩 ${left} 颗种子`;
  if (fails.length) return `⚠️ ${msg}。有 ${fails.length} 格没成: ${fails.slice(0, 3).join('; ')}\n(还站得住的话再喊一次, 我接着种)`;
  return ok(msg + ` — 记得浇水(说"浇水")`);
}

// ---------- 赖床死循环破环(cancel_sleep 原子四步) ----------
async function breakLoop() {
  const before = await state();
  // 桥不通时必须明说, 不能假装"破环完成"(否则她以为下床了其实啥也没发生)
  if (!before?.player) {
    return fail(`桥 ${BASE} 不通(${before?.error || '没回包'}) — 游戏没开/掉线了, 破不了环。先重连游戏再说。`);
  }
  const diag = await post('/ready_state', {}).catch(() => null);
  const c = (diag?.checks || [])[0];
  const diagTxt = c ? `${c.kind} ${c.numberReady}/${c.numberRequired} state=${c.state}` : '读不到 ready 详情';
  const r1 = await post('/cancel_sleep', {});
  const rival = await api(RIVAL_BASE, '/cancel_sleep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 8000).catch(() => null);
  await sleep(1200);
  const after = await state();
  if (r1?.ok === false) return fail('破环失败: ' + (r1.error || '桥拒绝'));
  if (after?.player?.isInBed) {
    return `⚠️ 取消睡眠回包了但你还躺床上。诊断: ${diagTxt} — 试试说"回家"再"卡床上了"。`;
  }
  return ok(`破环完成: 之前(${before?.player?.isInBed ? '在床上' : '不在床'}) → 现在(${after?.player?.isInBed ? '还在床' : '已下床'})`
    + NL + `  诊断: ${diagTxt}${rival?.ok ? NL + '  两端都已取消睡眠' : NL + '  ⚠️ 另一个人那边没响应'}`);
}

// ---------- 催熟(季末保收成专用) ----------
async function ripen(r = 30) {
  const rep = await post('/farm_report', {}, 20000);
  const readyBefore = rep?.crops?.ready ?? 0;
  const totalBefore = rep?.crops?.total ?? 0;
  const res = await post('/ripen', { radius: Math.min(Math.max(Number(r) || 30, 1), 50) }, 30000);
  if (!res?.ok) return fail('催熟失败: ' + (res?.error || '桥没回'));
  const rep2 = await post('/farm_report', {}, 20000);
  const readyAfter = rep2?.crops?.ready ?? 0;
  return ok(`催熟了 ${res.ripened ?? 0} 株 — 可收数 ${readyBefore} → ${readyAfter} (全田 ${totalBefore} 株)`
    + (readyAfter ? NL + '  现在说"收菜"就能一次收完' : NL + '  (可收数还是0, 检查半径/作物是否已全熟)'));
}

// ---------- 小工具 ----------
function invMap(inv) {
  const m = {};
  for (const i of inv || []) if (i?.name) m[i.name] = (m[i.name] || 0) + (i.stack ?? 1);
  return m;
}
function diffInv(a, b) {
  const out = [];
  for (const k in b) if ((b[k] || 0) > (a[k] || 0)) out.push([k, b[k] - (a[k] || 0)]);
  return out;
}
async function faceToward(tx, ty) {
  const s = await state();
  const p = s?.player;
  if (!p) return;
  const dx = tx - p.x, dy = ty - p.y;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  await post('/face', { direction: dir });
}
async function standNear(tx, ty) {
  for (const [cx, cy] of [[tx, ty + 1], [tx, ty - 1], [tx + 1, ty], [tx - 1, ty]]) {
    const r = await post('/walk_to', { x: cx, y: cy }, 20000).catch(() => null);
    if (r?.ok === false && r?.error) continue;
    const s = await state();
    if (s?.player && Math.abs(s.player.x - cx) + Math.abs(s.player.y - cy) <= 1) return true;
  }
  const s = await state();
  return s?.player && Math.abs(s.player.x - tx) + Math.abs(s.player.y - ty) === 1;
}

// ---------- 地图/世界 ----------
// ⭐2026-11-05 完整地图: 三档
//   ①"地图"           = 你身边的 41×17 实图(作物/石头/水都画) + 附近地标 + 一句世界方位
//   ②"地图 <地点>"     = 那一整张图(缩略), 标出所有门/柜台/出口和营业时间 —— 不在那边也能看
//   ③"世界怎么走"      = 全世界出口图(哪个门通哪)
function LANDMARKS_FOR(who) {
  return (globalThis.__LM_ALL || []).filter((l) => !l.who || l.who === who);
}

// 一张图里要标的点: 本身在这图里的地标 + "门开在这张图"的店(用门的坐标)
function marksForMap(loc, who) {
  const out = [];
  const seen = new Set();
  for (const l of LANDMARKS_FOR(who)) {
    const m = l.loc === loc ? { l, x: l.x, y: l.y, here: true }
      : (l.door && l.door.loc === loc && l.cat !== 'spot' ? { l, x: l.door.x, y: l.door.y, here: false } : null);
    if (!m) continue;
    const k = `${m.x},${m.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

function locFromWord(word, who) {
  if (!word) return null;
  const lm = findLandmark(word, who);
  if (lm) return { loc: lm.loc, lm };
  if (AREA_ALIAS[word]) return { loc: AREA_ALIAS[word], lm: null };
  const byCN = Object.entries(MAP_CN).find(([, cn]) => cn === word);
  if (byCN) return { loc: byCN[0], lm: null };
  if (MAP_CN[word]) return { loc: word, lm: null };
  return null;
}

async function mapText(who = TARGET, word = '') {
  const s = await state();
  if (!s?.player) return fail('读不到状态(游戏没开或桥断了)');
  const curLoc = s?.location?.name || s?.location;

  if (!word) {
    // ① 身边实图: 骨架用 /passable_rect 整图扫(完整!), 再把走过的格子换成更细的作物/水/机器标记
    const { s: s2, tiles, loc } = await stateAndTiles(12);
    const p = s2?.player || s.player;
    const g0 = await world.grid(loc);
    // 按离她远近编号, 保证"图上的数字"和"下面的列表"是同一个号
    const mk = marksForMap(loc, who)
      .map((q) => ({ ...q, d: Math.abs(q.x - p.x) + Math.abs(q.y - p.y) }))
      .sort((a, b) => a.d - b.d);
    const lmMarks = mk.map((m, i) => ({ l: m.l, x: m.x, y: m.y, mark: world.MARK_ORDER[i % world.MARK_ORDER.length] }));
    let m;
    if (g0?.w) {
      const cells = new Map(g0.cells);
      for (const [k, t] of Object.entries(seenCache[loc] || {})) cells.set(k, tileDesc(t).char);
      const g = { w: g0.w, h: g0.h, cells };
      const renderMarks = lmMarks.map((x) => ({ x: x.x, y: x.y, ch: x.mark }));
      // 小图(室内/商店)整张贴出来最清楚; 大地图只开她身边 41×17 的窗口
      m = (g.w <= 45 && g.h <= 34)
        ? world.renderWhole(g, [...renderMarks, { x: p.x, y: p.y, ch: '@' }], 64, 40)
        : world.renderWindow(g, p.x, p.y, 41, 17, renderMarks).text;
    } else {
      // 特殊图(矿山内部等)读不到可行走格 → 退回"走过的格子"老办法
      const seen = new Map(Object.entries(seenCache[loc] || {}).map(([k, t]) => [k, { ...t, x: +k.split(',')[0], y: +k.split(',')[1] }]));
      m = renderMap(seen, p.x, p.y, 41, 17, lmMarks);
    }
    const near = mk.slice(0, 6)
      .map((q, i) => `${world.MARK_ORDER[i]} ${q.l.name}${q.here ? '' : '(门)'} (${q.x},${q.y}) ${dir8(q.x - p.x, q.y - p.y)} ${q.d}格`);
    const tips = `${NL}【${mapCN(loc)}】里的地标:${NL}  ${near.join(NL + '  ') || '(这张图没标地标)'}`
      + `${NL}(说"去${mk[0]?.l.name || '家'}"我直接送你; 想看整张图说"地图 ${mapCN(loc)}", 想看全世界说"世界怎么走")`;
    return `${m}${NL}${LEGEND}${tips}`;
  }

  // ② 任意一张图
  const hit = locFromWord(word, who);
  let loc = hit?.loc;
  if (!loc) {
    const all = await world.warpsAll();
    if (all && all[word]) loc = word;
  }
  if (!loc) return fail(`不知道"${word}"。可以说: 地图 镇子 / 地图 山里 / 地图 裁缝铺 / 地图 矿洞 / 地图 我家`);
  const g = await world.grid(loc);
  if (!g || !g.w) {
    // Cabin/棚屋这类 instanced 室内拿不到整图 → 只有人就在里面时, 用她走过记下的格子画个近景
    const seenNow = seenCache[loc] || {};
    if (curLoc !== loc || !Object.keys(seenNow).length) {
      const lm = hit?.lm;
      return fail(`【${mapCN(loc)}】是室内小图, 只有你人在里面时才能画(现在你在${mapCN(curLoc)})。`
        + (lm ? `${NL}${placeLine(lm, s?.time?.timeOfDay)}${NL}说"去${lm.name}"我直接把你送进去。` : ''));
    }
    const seen = new Map(Object.entries(seenNow).map(([k, t]) => [k, { ...t, x: +k.split(',')[0], y: +k.split(',')[1] }]));
    const lmMk = marksForMap(loc, who).map((m, i) => ({ ...m.l, x: m.x, y: m.y, mark: world.MARK_ORDER[i % world.MARK_ORDER.length] }));
    return renderMap(seen, s.player.x, s.player.y, 41, 17, lmMk) + NL + LEGEND;
  }
  const mk = marksForMap(loc, who);
  const render = mk.map((m, i) => ({ x: m.x, y: m.y, ch: world.MARK_ORDER[i % world.MARK_ORDER.length] }));
  const p = s.player;
  const body = world.renderWhole(g, render);
  const pNow = s?.time?.timeOfDay;
  const lines = [`【${mapCN(loc)}】 ${loc}  ${g.w}×${g.h}${curLoc === loc ? `  你在(${p.x},${p.y})` : ''}`];
  if (hit?.lm) lines.push(`★ ${placeLine(hit.lm, pNow)}`);
  const list = mk.slice(0, 26).map((m, i) => {
    const tag = m.here ? '' : '的门';
    const h = m.l.door?.hours && !m.here ? ' ' + hoursText(m.l.door.hours) : '';
    const sn = m.l.cat === 'spot' ? ' (柜台)' : '';
    return `  ${world.MARK_ORDER[i % world.MARK_ORDER.length]} ${m.l.name}${tag}${sn} (${m.x},${m.y})${h}`;
  });
  if (list.length) lines.push('地标:', ...list);
  if (curLoc !== loc) {
    const viaDoor = hit?.lm?.door && hit.lm.door.loc !== loc ? hit.lm.door.loc : null;
    if (viaDoor && curLoc === viaDoor) {
      lines.push(`怎么去: 你已经在${mapCN(viaDoor)}了, 门在(${hit.lm.door.x},${hit.lm.door.y}) — 说"去${hit.lm.name}"我直接把你送进去`);
    } else {
      const route = await world.routeText(curLoc, viaDoor || loc);
      if (route) lines.push(`怎么去: ${route}`);
      if (viaDoor) lines.push(`  到${mapCN(viaDoor)}后门在(${hit.lm.door.x},${hit.lm.door.y}) — 说"去${hit.lm.name}"我直接把你送进去`);
      else if (hit?.lm?.building) lines.push(`  说"去${hit.lm.name}"我直接送你进屋`);
      else if (!route) lines.push(`  说"去${mapCN(loc)}"我直接把你送过去`);
    }
  } else if (hit?.lm) {
    lines.push(`说"去${hit.lm.name}"我直接送你过去`);
  }
  return body + NL + lines.join(NL) + NL + LEGEND;
}

// ---------- 指令分发 ----------
async function dispatch(cmd) {
  const c = String(cmd || '').trim();
  const p = parseCmd(c);
  log('收到:', c, '→', p.op, p.to || p.seed || '');
  switch (p.op) {
    case 'help': return helpText(TARGET);
    case 'world': return WORLD;
    case 'map': return mapText(TARGET, p.to || '');
    case 'leave': return leave();
    case 'watercan': { const s = await state(); return `水壶: ${canText(s)}\n(${clockOf(s?.time?.timeOfDay)} ${seasonCN(s?.time?.season)}${s?.time?.dayOfMonth}日 在${s?.location?.name})`; }
    case 'see': { const { s, tiles } = await stateAndTiles(6); return seeText(s, tiles); }
    case 'todo': { const { s, tiles } = await stateAndTiles(12); return '今天可以这样:\n· ' + todoList(s, tiles).join('\n· '); }
    case 'harvest': return harvest(10);
    case 'water': return water(12);
    case 'refill': return refill();
    case 'till': return till(6);
    case 'plant': return plant(p.seed || p.raw, 6);
    case 'goto': return goto(p.to);
    case 'sleep': {
      await post('/sleep', {});
      return ok('叫你去睡了(如果没在床上, 走到床边说"回家")—— 守卫 21:30 也会自动让你上床');
    }
    case 'farm': return farmOverview();
    case 'breakloop': return breakLoop();
    case 'ripen': {
      // 季末保收成专用: /ripen 调的是游戏自己的 crop.growCompletely()
      const f = await post('/farm_report', {}).catch(() => null);
      if (f?.crops?.ready > 0) return `已经有 ${f.crops.ready} 株熟的, 先说"收菜"收掉再催熟更稳`;
      return ripen(30);
    }
    default:
      return fail(`这句我还不会: "${c}"\n试试这些: 看看 / 地图 / 地图 镇子 / 世界怎么走 / 水壶还有多少水 / 该干嘛 / 收菜 / 浇水 / 打水 / 锄地 / 种蓝莓 / 去裁缝铺 / 回家 / 出去 / 帮助`);
  }
}

// ---------- 探针: 游戏在跑时用, 一次问清哪些高级端点可用 ----------
async function selftest() {
  const report = [];
  const add = (n, v) => report.push(`${v ? '✅' : '❌'} ${n}${typeof v === 'string' ? ' — ' + v : ''}`);
  const s = await state();
  if (!s?.player) return `❌ 桥 ${BASE} 不通(${JSON.stringify(s).slice(0, 120)})\n游戏没开或桥没起。`;
  add('/state', `世界就绪 在${s.location?.name}(${s.player.x},${s.player.y}) ${clockOf(s.time?.timeOfDay)}`);
  const sr = await surr(4);
  add('/surroundings', sr?.tiles ? `${sr.tiles.length} 格, 含 terrain/object/crop/watered 字段` : false);
  const w = await post('/walk_to', { x: s.player.x, y: s.player.y + 1 }, 20000);
  add('/walk_to 寻路', w?.ok === false ? false : (w?.walk_started !== undefined || w?.ok ? `回包 ${JSON.stringify(w).slice(0, 80)}` : `回包 ${JSON.stringify(w).slice(0, 80)}`));
  const h = await post('/harvest', {}, 20000);
  add('/harvest 批量收割', h?.ok === false ? false : `回包 ${JSON.stringify(h).slice(0, 80)}`);
  const ta = await post('/tool_area', { operation: 'till', x1: -1, y1: -1, x2: -1, y2: -1 }, 20000);
  add('/tool_area 批量锄/浇', ta?.ok === false ? false : `回包 ${JSON.stringify(ta).slice(0, 100)}`);
  const rv = await rivalGet('/state');
  add(`另一个人桥 ${RIVAL_BASE}`, rv?.player ? `在${rv.location?.name} 时间${clockOf(rv.time?.timeOfDay)}` : false);
  return report.join('\n');
}

// ---------- HTTP ----------
const LM_ALL = await import('./fish-eye-lib.mjs').then((m) => m.LANDMARKS);
globalThis.__LM_ALL = LM_ALL;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, text, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(text);
  };
  const json = (o) => send(200, JSON.stringify(o), 'application/json; charset=utf-8');
  try {
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/help')) return send(200, helpText(TARGET));
    if (u.pathname === '/selftest') return send(200, await selftest());
    if (u.pathname === '/state') { const s = await state(); return json(s); }
    if (u.pathname === '/see') return send(200, await dispatch('看看'));
    if (u.pathname === '/map') return send(200, await dispatch('地图 ' + (u.searchParams.get('loc') || '')));
    if (u.pathname === '/world') return send(200, WORLD);
    if (u.pathname === '/todo') return send(200, await dispatch('该干嘛'));
    if (u.pathname === '/watercan') return send(200, await dispatch('水壶还有多少水'));
    if (u.pathname === '/farm') return send(200, await farmOverview());
    if (u.pathname === '/breakloop') return send(200, await breakLoop());
    if (u.pathname === '/ripen') return send(200, await ripen(30));
    if (u.pathname === '/say') {
      let cmd = u.searchParams.get('cmd');
      if (req.method === 'POST') {
        let body = '';
        for await (const c of req) body += c;
        try { const b = JSON.parse(body || '{}'); cmd = b.text ?? b.cmd ?? cmd; } catch { cmd = body || cmd; }
      }
      return send(200, await dispatch(cmd || '帮助'));
    }
    // 显式动作端点(给脚本/其他 AI 调)
    if (req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      let b = {}; try { b = JSON.parse(body || '{}'); } catch { }
      if (u.pathname === '/goto') return send(200, await goto(b.to));
      if (u.pathname === '/harvest') return send(200, await harvest(Number(b.r) || 10));
      if (u.pathname === '/water') return send(200, await water(Number(b.r) || 12));
      if (u.pathname === '/till') return send(200, await till(Number(b.r) || 6));
      if (u.pathname === '/plant') return send(200, await plant(b.seed, Number(b.r) || 6));
      if (u.pathname === '/refill') return send(200, await refill());
      if (u.pathname === '/ripen') return send(200, await ripen(Number(b.r) || 30));
      if (u.pathname === '/breakloop') return send(200, await breakLoop());
    }
    return send(404, '不知道这个接口。GET / 看说明书');
  } catch (e) {
    log('ERR', u.pathname, String(e?.stack || e).slice(0, 400));
    send(500, '❌ 我内部出错了: ' + String(e?.message || e));
  }
});

server.listen(PORT, () => {
  log(`🐟 fish-eye 上线 :${PORT}  目标角色=${TARGET}(${BASE})  另一个人=${BRIDGE[RIVAL]}`);
  log(`   地标 ${LM_ALL.length} 个, 地图缓存 ${Object.keys(seenCache).length} 张图`);
});