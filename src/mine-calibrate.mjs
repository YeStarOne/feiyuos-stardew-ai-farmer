// 矿洞镐子校准: 直用 vs 行为学框选, 全程回查验证 (autonomous test)
import { get, post, surr, sel, sleep, warp, go, useOn } from './lib.mjs';

const log = (...a) => console.log(new Date().toTimeString().slice(0,8), ...a);

function rocksIn(sr) {
  return sr.tiles.filter(t => t.isStone || (t.object && t.object.isStone)).map(t => `${t.x},${t.y}`);
}

async function mineTeleport(floor = 1) {
  const r = await warp('UndergroundMine1', 5, 5);
  log('进矿 warp:', JSON.stringify(r).slice(0, 120));
  await sleep(1500);
}

async function main() {
  await mineTeleport();
  let sr = await surr(6);
  let rocks = rocksIn(sr);
  log('位置:', sr.location?.name ?? sr.location, '半径6石块数:', rocks.length, rocks.slice(0,8).join(' '));

  // ===== A. 直用镐 (/use on faced-adjacent rock) =====
  if (rocks.length) {
    const [rx, ry] = rocks[0].split(',').map(Number);
    log('A. 直用镐打', rocks[0]);
    await sel('Pickaxe');
    // 站到石头邻格
    const adj = await go(rx + 1, ry).catch(() => null);
    log('  邻格移动:', adj ? JSON.stringify(adj).slice(0,80) : 'fail(路径阻挡)');
    sr = await surr(6);
    if (!rocksIn(sr).includes(rocks[0])) { log('  站位后石头不在了? 重取'); rocks = rocksIn(sr); }
    const before = rocksIn(sr).length;
    await sel('Pickaxe');
    const u = await useOn(rx, ry);
    await sleep(1200);
    sr = await surr(6);
    const after = rocksIn(sr).length;
    log('  useOn:', JSON.stringify(u).slice(0,80), '| 石块', before, '->', after, after < before ? '✅真砸' : '❌假ok(anim没完成)');
  } else {
    log('A. 半径6没石头, 换层再看');
  }

  // ===== B. 行为学框选(镐左键模式) =====
  try {
    const { default: bs } = await import('./behavior.mjs').catch(() => ({}));
    log('B. behavior.mjs 存在:', !!bs);
  } catch { log('B. 无behavior.mjs, 检查behavior-bridge'); }
  // behavior bridge 直接调 7845
  sr = await surr(8);
  rocks = rocksIn(sr);
  if (rocks.length >= 2) {
    const xs = rocks.map(r => +r.split(',')[0]), ys = rocks.map(r => +r.split(',')[1]);
    await sel('Pickaxe');
    const r = await fetch('http://localhost:7845/behaviorSelect', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys), button: 'left' }) }).then(r => r.json()).catch(e => ({ err: String(e) }));
    log('B. behaviorSelect:', JSON.stringify(r).slice(0,120));
    await sleep(4000);
    sr = await surr(8);
    const after = rocksIn(sr).length;
    log('B. 框选后石块剩:', after, '/', rocks.length, after < rocks.length ? '✅行为学砸得动' : '❌也没用');
  } else {
    log('B. 石头不足2个, 跳过框选测试');
  }

  // ===== C. 电梯接口参数探测 =====
  for (const ep of ['/mine/elevator', '/mine/elevator?floors', '/minecarts']) {
    const r = await get(ep).catch(e => ({ err: String(e) }));
    log('C.', ep, '->', JSON.stringify(r).slice(0, 140));
  }

  // ===== D. 回家 =====
  const home = await post('/warp', { location: 'FarmHouse', x: 9, y: 9 });
  log('D. 回家:', JSON.stringify(home).slice(0, 80));
  const s = await get('/state');
  log('D. 现在:', s.location?.name, '时间', s.time?.timeOfDay, '体力', s.player?.stamina);
}
main().catch(e => { console.error('TEST FAIL', e); post('/warp', { location: 'FarmHouse', x: 9, y: 9 }); });
