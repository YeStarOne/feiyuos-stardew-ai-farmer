// xp.mjs — 端点扩展包 CLI (2026-11-06)
// 用法:
//   node xp.mjs buffers...  见下
//   node xp.mjs buffs                [--port=7842|7843]
//   node xp.mjs bombs
//   node xp.mjs eggs [map]           (map 省略=当前图; 例: eggs spring13)
//   node xp.mjs sittable [radius]
//   node xp.mjs carpenter            (罗宾建筑目录 + 差多少钱/料)
//   node xp.mjs beds [player]        (联机床位诊断)
//   node xp.mjs guard on|off [weapon]
//   node xp.mjs sell <name> [count]  ⚠️有副作用
//   node xp.mjs swap <replace>       ⚠️有副作用(需 ItemGrabMenu 开着)
//   node xp.mjs all                  只读四件套一次跑完
// 通用参数: --port=7843  --force(锁时期间也允许副作用命令)
import fs from 'node:fs';
import { extra } from './lib-extra.mjs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find(a => a.startsWith(`--${n}=`) || a === `--${n}`);
  if (!hit) return d;
  const v = hit.includes('=') ? hit.split('=')[1] : true;
  return v;
};
const port = Number(flag('port', 7842));
const X = extra(port);
const force = !!flag('force', false);
const LOCK = 'D:/StardewAI/time-lock.flag';
const mutating = new Set(['guard', 'sell', 'swap']);
const pos = argv.filter(a => !a.startsWith('--'));
const [cmd, ...args] = pos;

function die(msg) { console.error('✗', msg); process.exit(1); }
function out(label, obj) {
  console.log(`— ${label} @${port}`);
  console.log(JSON.stringify(obj, null, 1));
}
function guardMutating() {
  if (mutating.has(cmd) && fs.existsSync(LOCK) && !force) {
    die(`当前 time-lock.flag 在位(锁时挂机中), 拒绝执行有副作用的 /${cmd}; 确要执行加 --force`);
  }
}

const fmt = {
  buffs(r) {
    const list = r.buffs || [];
    if (!list.length) return '（没有 buff）';
    return list.map(b => `${b.displayName || b.id} ← ${b.source || '?'} 剩 ${Math.max(0, Math.round((b.msRemaining ?? (b.seconds ?? 0) * 1000) / 1000))}s`).join('\n');
  },
  bombs(r) {
    const list = r.bombs || [];
    if (!list.length) return `（${r.location || '当前图'} 没有已放置炸弹）`;
    return list.map(b => `${b.bomb_type} @(${b.x},${b.y}) 半径${b.bomb_radius}`).join('\n');
  },
  eggs(r) {
    if (r.ok === false) return `✗ ${r.error || '失败'}`;
    const list = r.tiles || [];
    if (!list.length) return `（${r.map} 没有 fest 图块）`;
    return `map=${r.map} count=${r.count}\n` + list.slice(0, 40).map(t => `(${t.x},${t.y}) ${t.sheet}#${t.tileIndex}`).join('\n') +
      (list.length > 40 ? `\n… 还有 ${list.length - 40} 个` : '');
  },
  sittable(r) {
    const list = r.seats || r.sittable || [];
    if (!list.length) return '（附近没有可坐的）';
    const me = r.me ? `我在(${r.me.x},${r.me.y})${r.me.sitting ? ' 正坐着' : ''} 半径${r.radius}` : '';
    return (me ? me + '\n' : '') + list.slice(0, 10).map(s =>
      `${s.name || s.seatName || '座椅'} @(${s.x},${s.y}) 朝${s.direction} 距${Number(s.dist).toFixed(1)} 空位${s.free}/${s.capacity}${s.blocked ? ' 被挡' : ''}`
    ).join('\n');
  },
  carpenter(r) {
    const list = r.buildings || [];
    if (!list.length) return JSON.stringify(r);
    return `共 ${r.count} 项, 买得起 ${r.affordable} 项` + '\n' + list.map(b => {
      const mats = Array.isArray(b.materials) ? b.materials.map(m => `${m.id}x${m.amount ?? m.count}`).join(' ') : '';
      return `${b.affordable ? '✅' : '⬜'} ${b.name} ${b.cost ?? '?'}g ${mats}`;
    }).join('\n');
  },
};

(async () => {
  if (!cmd) die('用法: node xp.mjs buffs|bombs|eggs|sittable|carpenter|beds|guard|sell|swap|all');

  if (cmd === 'all') {
    for (const [k, fn] of [['buffs', () => X.buffs()], ['bombs', () => X.bombs()], ['sittable', () => X.sittable(7)], ['carpenter', () => X.carpenter()]]) {
      try { const r = await fn(); console.log(`\n== ${k} ==\n` + (fmt[k] ? fmt[k](r) : JSON.stringify(r, null, 1))); }
      catch (e) { console.log(`\n== ${k} == 失败: ${e.message}`); }
    }
    return;
  }

  guardMutating();
  let r;
  switch (cmd) {
    case 'buffs': r = await X.buffs(); console.log(fmt.buffs(r)); break;
    case 'bombs': r = await X.bombs(); console.log(fmt.bombs(r)); break;
    case 'eggs': r = await X.eggTiles(args[0] || ''); console.log(fmt.eggs(r)); break;
    case 'sittable': r = await X.sittable(Number(args[0] || 7)); console.log(fmt.sittable(r)); break;
    case 'carpenter': r = await X.carpenter(); console.log(fmt.carpenter(r)); break;
    case 'beds': r = await X.crawlBed('locate', args[0] || ''); out('crawl_bed', r); break;
    case 'guard': {
      if (!['on', 'off'].includes(args[0])) die('guard on|off [weapon]');
      r = await X.guard(args[0] === 'on', args[1] || '');
      out('guard ' + args[0], r); break;
    }
    case 'sell': {
      if (!args[0]) die('sell <name> [count]');
      r = await X.sellToShop(args[0], args[1] ? Number(args[1]) : undefined);
      out('sell_to_shop', r); break;
    }
    case 'swap': {
      if (!args[0]) die('swap <replace>');
      r = await X.claimSwap(args[0]);
      out('claim_swap', r); break;
    }
    default: die('未知命令: ' + cmd);
  }
  if (r && r.ok === false && r.error) process.exitCode = 2;
})().catch(e => die(e.message));
