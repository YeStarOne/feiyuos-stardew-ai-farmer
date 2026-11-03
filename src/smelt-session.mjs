// 科技日·熔炼会话 (2026-11-03): 农舍熔炉批量烧条
// 铁律适配: 机器不随冻结时间走 → 装料后 /resume 放时间走, 收完再 /pause
// 用法: node smelt-session.mjs [目标铁条数] [目标金条数]  默认 12 5
import { get, post, st, warp, go, sel, face, sleep, log } from './lib.mjs';

const WANT_IRON = Number(process.argv[2] || 12);
const WANT_GOLD = Number(process.argv[3] || 5);

async function inv() { return (await st()).inventory || []; }

// 时间推进走作弊/clock(2026-11-03): NagiBridge resume后时间仍冻死(原因未明), 一炉120游戏分→/clock 130分钟+睡5秒
async function flowTime() {
  await post2clock(130);
  await sleep(5000);
  await post('/pause', {});
}
async function post2clock(mins) {
  try { const r = await fetch('http://localhost:7846/clock', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ minutes: mins }) }); return await r.json(); }
  catch { return null; }
}

const FURNACES = [[7, 8], [6, 9], [8, 9], [5, 9]]; // FarmHouse
// 每台炉的站位(站这里正对炉子)
const STAND = { '7,8': [7, 7], '6,9': [6, 8], '8,9': [8, 8], '5,9': [5, 8] };

const count = (nm) => inv().then(list => (list.find(i => i && i.name === nm) || {}).stack || 0);

async function loadAll(oreName) {
  let loaded = 0;
  for (const [fx, fy] of FURNACES) {
    // 已有在烧/已熟的炉子不覆盖(收条优先)
    const mach = await get('/machines');
    const f = (mach.machines || []).find(m => m.name === 'Furnace' && m.x === fx && m.y === fy);
    if (!f || f.status !== 'empty') continue;
    const have = await count(oreName);
    if (have < 5) break;
    const [sx, sy] = STAND[fx + ',' + fy];
    await go(sx, sy).catch(() => null);
    await sleep(700);
    const s = await sel(oreName);
    if (!s || s.ok === false) { log('选不中', oreName); break; }
    await face(2);
    await sleep(400);
    const r = await post('/interact', {}).catch(() => null);
    if (r && r.actionTriggered) { loaded++; log('装料', fx, fy, oreName); }
    await sleep(800);
  }
  return loaded;
}

async function collectAll() {
  let got = 0;
  for (const [fx, fy] of FURNACES) {
    const mach = await get('/machines');
    const f = (mach.machines || []).find(m => m.name === 'Furnace' && m.x === fx && m.y === fy);
    if (!f || f.status === 'empty' || f.status === 'processing') continue;
    const [sx, sy] = STAND[fx + ',' + fy];
    await go(sx, sy).catch(() => null);
    await sleep(700);
    await face(2); // 站位都在炉子上方, 统一朝下(2026-11-03不朝向interact无效)
    await sleep(400);
    const before = (await inv()).map(i => i && i.name).join(',');
    const r = await post('/interact', {}).catch(() => null);
    await sleep(800);
    const after = (await inv()).map(i => i && i.name).join(',');
    if (r && r.actionTriggered && after !== before) { got++; log('收条', fx, fy); }
  }
  return got;
}

async function barsOf(oreName) {
  const bar = oreName === 'Iron Ore' ? 'Iron Bar' : 'Gold Bar';
  return count(bar);
}

(async () => {
  log('== 熔炼会话开始 ==');
  // 确保在家
  let s = await st();
  if (!/FarmHouse/.test(s.location?.name || '')) {
    await warp('FarmHouse', 9, 9);
    await sleep(1500);
  }
  let ironDone = await barsOf('Iron Ore') >= WANT_IRON;
  let goldDone = await barsOf('Gold Ore') >= WANT_GOLD;

  for (let cycle = 0; cycle < 30 && !(ironDone && goldDone); cycle++) {
    let ore = !ironDone ? 'Iron Ore' : 'Gold Ore';
    if (ironDone && !goldDone) ore = 'Gold Ore';
    const n = await loadAll(ore);
    if (n === 0) {
      // 没装上: 可能炉子全在烧/已熟 → 等待或收条
      const anyBusy = (await get('/machines')).machines.some(m => m.name === 'Furnace' && m.status === 'processing');
      const anyDone = (await get('/machines')).machines.some(m => m.name === 'Furnace' && !['empty', 'processing'].includes(m.status));
      if (anyBusy) {
        log('炉子全在烧, 放时间等90s (cycle', cycle, ')');
        await flowTime();
        continue;
      }
      if (anyDone) { await collectAll(); continue; }
      // 没炉可装没炉在烧: 材料不足, 切换矿种
      if (ore === 'Iron Ore' && (await count('Iron Ore')) < 5) { ironDone = true; continue; }
      if (ore === 'Gold Ore' && (await count('Gold Ore')) < 4) { goldDone = true; continue; }
      continue;
    }
    // 装上了 → 放时间烧(120游戏分≈88真实秒)
    log('装了', n, '炉', ore, '→ 放时间烧90s');
    await flowTime();
    await collectAll();
    ironDone = await barsOf('Iron Ore') >= WANT_IRON;
    goldDone = await barsOf('Gold Ore') >= WANT_GOLD;
  }
  await collectAll();
  log('== 熔炼结束 ==', '铁条', await barsOf('Iron Ore'), '金条', await barsOf('Gold Ore'), '余铁矿', await count('Iron Ore'), '余金矿', await count('Gold Ore'), '余煤', await count('Coal'));
  await post('/pause', {});
})().catch(e => { console.error('FATAL', e); post('/pause', {}).catch(() => null); process.exit(1); });
