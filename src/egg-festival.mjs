// egg-festival.mjs — 蛋蛋节（春13）彩蛋清扫 (2026-11-06, 接 /egg_tiles + /walk_to)
// ⚠️ 未实机验证: /egg_tiles 扫的是节日地图 Paths 层的 fest* 图块, 源码没写"这些就是彩蛋";
//    春13 第一次跑先只读(--dry, 默认)核对坐标, 确认是可捡的蛋再用 --go。
// 用法:
//   node egg-festival.mjs            只读: 打印 fest 图块
//   node egg-festival.mjs --go       走过去逐个踩(每个点最多试 2 次)
//   node egg-festival.mjs --port=7842
import { extra } from './lib-extra.mjs';

const argv = process.argv.slice(2);
const port = Number((argv.find(a => a.startsWith('--port=')) || '').split('=')[1] || 7842);
const GO = argv.includes('--go');
const X = extra(port);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const s = await X.state();
if (!s.worldReady || !s.player) { console.error('✗ 世界未就绪'); process.exit(1); }
const fest = await X.raw.get('/festival').catch(() => null);
console.log('当前:', s.location?.name, '| 节日:', fest?.isFestival ? (fest.festivalName || '?') : '无');

const r = await X.eggTiles({ map: '' });
if (r.ok === false) { console.error('✗ /egg_tiles', r.error); process.exit(1); }
const tiles = r.tiles || [];
console.log(`fest 图块 ${r.count} 个 (map=${r.map})`);
if (!tiles.length) {
  console.log('没有 fest 图块: 要么不在节日地图, 要么这一版实现不是彩蛋坐标 —— 春13 现场再核对');
  process.exit(0);
}
const uniq = [...new Map(tiles.map(t => [t.x + ',' + t.y, t])).values()];
console.log(uniq.slice(0, 40).map(t => `(${t.x},${t.y})#${t.tileIndex}`).join(' '));

if (!GO) {
  console.log('\n只读模式。确认上面坐标是地上的彩蛋后, 加 --go 实跑。');
  process.exit(0);
}
if (!fest?.isFestival) {
  console.error('✗ 现在不是节日, --go 拒绝执行(彩蛋只在节日地图里)');
  process.exit(1);
}

// 贪心最近点清扫: 每个点最多试 2 次; 连续 2 个点位移不足 0.5 格就放弃(被挡/不是蛋)
let ok = 0, failed = 0, last = null;
const left = new Set(uniq.map(t => t.x + ',' + t.y));
while (left.size) {
  const cur = (await X.state()).player;
  if (!cur) break;
  const next = [...left].map(k => { const [x, y] = k.split(',').map(Number); return { x, y, d: Math.abs(x - cur.x) + Math.abs(y - cur.y) }; })
    .sort((a, b) => a.d - b.d)[0];
  const res = await X.raw.post('/walk_to', { location: s.location.name, x: next.x, y: next.y }).catch(() => null);
  await sleep(900);
  const p2 = (await X.state()).player;
  const moved = p2 && Math.hypot(p2.x - cur.x, p2.y - cur.y) > 0.5;
  const at = p2 && Math.hypot(p2.x - next.x, p2.y - next.y) < 1.2;
  left.delete(next.x + ',' + next.y);
  if (at) { ok++; console.log(`✓ 到点 (${next.x},${next.y})  剩 ${left.size}`); }
  else if (moved) { failed++; console.log(`… 只走到 (${p2?.x},${p2?.y}) 差 (${next.x},${next.y})  剩 ${left.size}`); }
  else { failed++; console.log(`✗ 走不动 (${next.x},${next.y}) 剩 ${left.size}`); }
  if (res?.ok === false) console.log('   walk_to:', res.error || res.reason || res.raw || '');
  if (failed >= 3 && ok === 0) { console.log('连续走不动, 中止(先核对 fest 图块是不是彩蛋)'); break; }
  last = next;
}
console.log(`\n结束: 到点 ${ok} / 失败 ${failed} / 剩 ${left.size}${last ? ` 最后 (${last.x},${last.y})` : ''}`);
