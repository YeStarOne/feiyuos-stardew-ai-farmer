// 烧锭自动化 v1.1 (2026-11-03) — 清单#1升级
// v1.1变更: ①炉位不再硬编码(10,9) → 运行时从/machines动态发现FarmHouse全部熔炉
//          ②等出炉改用FeiyuAutoLoad /clock时间推进作弊(NagiBridge /resume后时间仍冻死, 真实轮询永远等不到)
//          ③站位改炉周4邻格自动走位(熔炉阵型可变)
// ✅姿势不变: 投料=站炉邻格+手持矿/煤+面朝炉/interact; 取锭=面朝炉/interact
// 用法: node craft-smelt.mjs [锭数默认1] [物品Copper|Iron|Gold]
import { post, get, st, log, sleep, warp, sel, face, go, faceToward } from './lib.mjs';

const BARS = Number(process.argv[2] || 1); // argv[2]=第一个参数(argv[1]是脚本路径)
const METAL = process.argv[3] || 'Copper';
const ORE_NAME = METAL + ' Ore';
const BAR_NAME = METAL + ' Bar';
const CLOCK = 'http://localhost:7846/clock';

async function clock(mins) {
  try { const r = await fetch(CLOCK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ minutes: mins }) }); return await r.json(); }
  catch { return null; }
}
// 动态发现熔炉(2026-11-03炉阵搬迁: 7,8/6,9/8,9/5,9, 不再写死)
async function getFurnaces(loc = 'FarmHouse') {
  const m = await get('/machines');
  return (m.machines || []).filter(x => x.type === 'Furnace' && x.location === loc);
}
const cnt = (s, n) => { const it = (s.inventory || []).find(i => i && i.name === n); return it ? (it.stack ?? it.count ?? 0) : 0; };

// 走到炉的曼哈顿距离1邻格并面朝炉(4邻格自动尝试)
async function standAt(fx, fy) {
  await warp('FarmHouse', 9, 9).catch(() => null);
  const neighbors = [[fx, fy - 1], [fx, fy + 1], [fx - 1, fy], [fx + 1, fy]];
  for (const [cx, cy] of neighbors) {
    const me = (await st()).player;
    if (Math.abs(me.x - fx) + Math.abs(me.y - fy) === 1) break;
    await go(cx, cy).catch(() => null);
  }
  const me = (await st()).player;
  if (Math.abs(me.x - fx) + Math.abs(me.y - fy) !== 1) return null;
  return faceToward(me.x, me.y, fx, fy);
}
// 站邻格投一份料
async function feed(fx, fy, itemName, dx) {
  await sel(itemName);
  for (let t = 0; t < 3; t++) {
    await face(dx);
    await sleep(250);
    const r = await post('/interact', {});
    const ok = r.ok !== false && r.facingTile && r.facingTile.x === fx && r.facingTile.y === fy;
    log(`投${itemName}:`, JSON.stringify(r).slice(0, 90));
    if (ok) return true;
    dx = await standAt(fx, fy);
    if (!dx) return false;
  }
  return false;
}
// 烧一锭(占用一只空炉); 等待用/clock推进, 一炉120游戏分
async function smeltOne(f) {
  const s0 = await st();
  const need = METAL === 'Gold' ? 4 : 5;
  if (cnt(s0, ORE_NAME) < need || cnt(s0, 'Coal') < 1) { log(`原料不足(${ORE_NAME}x${cnt(s0, ORE_NAME)} 煤x${cnt(s0, 'Coal')})`); return false; }
  let dx = await standAt(f.x, f.y);
  if (!dx) { log('炉子邻格全堵, 跳过', f.x, f.y); return false; }
  log('站位面朝', f.x, f.y);
  if (!await feed(f.x, f.y, ORE_NAME, dx)) return false;
  await sleep(700);
  await feed(f.x, f.y, 'Coal', dx);
  await sleep(700);
  // /clock推进出炉: 每10游戏分一跳, 120分需13跳(留余量)
  for (let i = 0; i < 16; i++) {
    await clock(10);
    await sleep(2500);
    const m = await get('/machines');
    const cur = (m.machines || []).find(x => x.type === 'Furnace' && x.x === f.x && x.y === f.y);
    if (!cur) return false;
    if (cur.status === 'ready' && /Bar/i.test(cur.heldItem || '')) {
      await standAt(f.x, f.y);
      await face(faceToward((await st()).player.x, (await st()).player.y, f.x, f.y));
      await sleep(250);
      const r = await post('/interact', {});
      await sleep(700);
      const s = await st();
      const got = (s.inventory || []).some(it => it && it.name === BAR_NAME);
      log('出炉:', got ? '✓' + BAR_NAME : JSON.stringify(r).slice(0, 80));
      return got;
    }
    if (cur.status === 'empty') return false; // 被别的会话取走了
  }
  log('等待超时'); return false;
}

// 主流程
await warp('FarmHouse', 9, 9).catch(() => null); // /machines只报当前地图(2026-11-03实测), 烧锭必须先回家
await sleep(1500);
const furnaces = await getFurnaces();
if (!furnaces.length) { log('找不到熔炉'); process.exit(1); }
log(`发现熔炉x${furnaces.length}:`, furnaces.map(f => `(${f.x},${f.y})`).join(' '));
let done = 0;
for (let k = 0; k < BARS && k < furnaces.length; k++) {
  const f = furnaces[k];
  if (f.status === 'processing') { log(`炉(${f.x},${f.y})忙, 跳过`); continue; }
  if (f.status !== 'empty') { // ready → 先取上一炉
    const dx = await standAt(f.x, f.y);
    if (dx != null) { await face(dx); await sleep(250); await post('/interact', {}); await sleep(700); }
  }
  if (await smeltOne(f)) done++;
  else break;
}
const s = await st();
const bars = (s.inventory || []).filter(i => i && i.name === BAR_NAME).reduce((a, i) => a + (i.stack ?? i.count ?? 1), 0);
log(`完成${done}, 手持${BAR_NAME}共${bars}`, '时间', s.time.timeOfDay);
