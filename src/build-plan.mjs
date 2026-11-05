// build-plan.mjs — 罗宾建筑规划 (2026-11-06, 接 /carpenter)
// 用法:
//   node build-plan.mjs                 全部建筑: 价格/材料/够不够
//   node build-plan.mjs Coop            只看某个(模糊匹配 name)
//   node build-plan.mjs --port=7843     看鱼鱼号
// 说明: /carpenter 的 materials 只给 itemId+amount, 这里补一张常见建材 ID→名字表。
import { extra } from './lib-extra.mjs';

const argv = process.argv.slice(2);
const portArg = argv.find(a => a.startsWith('--port='));
const want = argv.filter(a => !a.startsWith('--'))[0] || '';
const X = extra(portArg ? Number(portArg.split('=')[1]) : 7842);

const NAMES = {
  '(O)388': '木头', '(O)390': '石头', '(O)709': '硬木', '(O)334': '铜锭', '(O)335': '铁锭',
  '(O)336': '金锭', '(O)337': '铱锭', '(O)338': '精炼石英', '(O)787': '电池组', '(O)428': '布',
  '(O)92': '树液', '(O)430': '松露油', '(O)335': '铁锭',
};
const nm = id => NAMES[id] ? `${NAMES[id]}(${id})` : id;

const [r, s] = await Promise.all([X.carpenter(), X.state()]);
if (r.ok === false) { console.error('✗', r.error); process.exit(1); }
const money = s.player?.money ?? 0;
const inv = new Map((s.inventory || []).map(i => [i.name, (i.stack ?? 1)]));

const list = (r.buildings || []).filter(b => !want || new RegExp(want, 'i').test(b.name));
console.log(`罗宾建筑 ${r.count} 项, 现在买得起 ${r.affordable} 项 | 现金 ${money}g\n`);
for (const b of list) {
  const mats = (b.materials || []).map(m => {
    // 材料 id 没有名字, 只能靠背包反查同 id 的数量(背包里没这件就显示 0/需求)
    const have = (s.inventory || []).filter(i => i.itemId === m.id || i.id === m.id).reduce((a, i) => a + (i.stack ?? 1), 0);
    return `${nm(m.id)} ${have}/${m.amount}`;
  }).join('  ');
  const sz = b.size && Object.keys(b.size).length ? `${b.size.X ?? b.size.Width ?? '?'}x${b.size.Y ?? b.size.Height ?? '?'}` : '';
  const gap = b.cost > money ? ` 还差 ${b.cost - money}g` : '';
  console.log(`${b.affordable ? '✅' : '⬜'} ${b.name.padEnd(16)} ${String(b.cost).padStart(7)}g  ${sz.padEnd(6)} ${mats}${gap}`);
}
