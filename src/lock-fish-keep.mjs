// 锁时期间的双人钓鱼看护 v1 (2026-11-06, 用户: "两个号继续钓会鱼, 我等一下回来过活动")
// 前提: 时间已用 /pause 冻住(冬25 17:30), day-loop 已停。
// 职责: 每 20s 巡检 7842/7843 —— 关挡路菜单、不在海滩就回去、竿不在手就重选、fishbot 关了再开;
//       鱼鱼包快满 → 回家卖便宜鱼再回来(只卖鱼/海草)。
// 退出: time-lock.flag 消失(用户解锁) → 自己退出, 把角色交还给 day-loop / 用户。
import fs from 'node:fs';

const FLAG = 'D:/StardewAI/time-lock.flag';
const SPOT = { loc: 'Beach', x: 44, y: 35 };
const LOG = 'D:/StardewAI/lock-fish-keep.log';
const log = (...a) => {
  const line = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch { }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = (port) => {
  const base = `http://localhost:${port}`;
  const jj = async (url, opt = {}) => {
    const r = await fetch(base + url, {
      ...opt,
      headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
      signal: AbortSignal.timeout(6000),
    });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return { raw: t.slice(0, 100), status: r.status }; }
  };
  return {
    state: () => jj('/state'),
    post: (p, b = {}) => jj(p, { method: 'POST', body: JSON.stringify(b) }),
    get: (p) => jj(p),
  };
};
const HOST = api(7842), FISH = api(7843);

const SELL_CHEAP = ['Sardine', 'Herring', 'Red Mullet', 'Seaweed', 'Albacore', 'Halibut', 'Sea Cucumber'];

// ⭐2026-11-06 实测新增两道保险(冬25 挂机时抓到的):
//  A. 鱼饵耗尽 → fishbot 报 enabled=true 但完全不动(host 卡了 24 分钟、体力满/0 抛竿)。鱼竿饵用完必须补。
//  B. 假活哨兵: 同一个号连续 6 次巡检(2 分钟) fishCaught 没涨, 且不在起竿界面 → 硬重启 fishbot + 重选竿。
const lastFish = new Map(), stallCnt = new Map();
async function baitGuard(label, A) {
  const r = await A.post('/rod', { action: 'show' }).catch(() => null);
  const ri = r?.rodInfo;
  if (!ri || !ri.canBait) return;
  if ((ri.baitStack ?? 0) > 0) return;
  if ((ri.baitInBag ?? 0) > 0) {
    const a = await A.post('/rod', { action: 'bait' }).catch(() => null);
    log(label, '挂了背包里的鱼饵 →', JSON.stringify(a).slice(0, 80));
    return;
  }
  // 背包里也没饵: 补一包(锁时挂机没人买, 直接 /give; 100 个饵≈500g)
  const g = await A.post('/give', { id: '(O)685', count: 100 }).catch(() => null);
  await sleep(800);
  const a = await A.post('/rod', { action: 'bait' }).catch(() => null);
  log(label, '⚠️ 鱼饵耗尽 → 补 100 个并挂上', JSON.stringify(g).slice(0, 60), JSON.stringify(a).slice(0, 60));
}

async function keep(label, A, { allowSell }) {
  const s = await A.state().catch(() => null);
  if (!s?.worldReady || !s.player) return;
  const p = s.player, t = s.time;
  if (p.isInBed) return;
  // 菜单: 只关非钓鱼 UI 的(背包/宝箱), BobberBar 是起竿界面不能关
  if (s.activeMenu && !/BobberBar/i.test(s.activeMenu.type)) {
    await A.post('/menu_close', {}).catch(() => null);
    await sleep(300);
    await A.post('/menu_close', {}).catch(() => null);
    log(label, '关菜单', s.activeMenu.type);
    return;
  }
  // 包快满(锁时期间没有 day-loop 兜底): 卖掉便宜鱼腾格子
  const inv = s.inventory || [];
  const free = (p.maxItems || 36) - inv.length;
  if (allowSell && free <= 2) {
    log(label, '包快满 free=', free, '→ 回农场卖鱼');
    await A.post('/fishbot', { action: 'off' }).catch(() => null);
    await A.post('/warp', { location: 'Farm', x: 72, y: 15 }).catch(() => null);
    await sleep(1500);
    for (const nm of SELL_CHEAP) {
      if (!inv.some(i => i.name === nm)) continue;
      const r = await A.post('/sell', { name: nm }).catch(() => null);
      if (r?.ok) log(label, '卖', nm, JSON.stringify(r.sold || r).slice(0, 80));
      await sleep(300);
    }
    await A.post('/warp', { location: SPOT.loc, x: SPOT.x, y: SPOT.y }).catch(() => null);
    await sleep(1500);
  }
  // 不在钓点就回去
  if (s.location?.name !== SPOT.loc) {
    await A.post('/warp', { location: SPOT.loc, x: SPOT.x, y: SPOT.y }).catch(() => null);
    log(label, '回海滩', s.location?.name, '→', SPOT.loc);
    await sleep(1500);
    return;
  }
  // 竿不在手 → 重选(优先铱竿)
  if (!/Rod|Pole/i.test(p.currentItem || '')) {
    const rod = inv.find(i => /Iridium Rod/i.test(i?.name || '')) || inv.find(i => /Rod|Pole/i.test(i?.name || ''));
    if (rod) {
      await A.post('/select', { name: rod.name }).catch(() => null);
      await A.post('/face', { direction: 1 }).catch(() => null);
      log(label, '重选竿', rod.name);
      await sleep(400);
    }
  }
  // ⭐2026-11-06 用户要求"记得回体力": 锁定期间没人管, 体力钓干会晕倒。
  //   低于 90 就吃背包里最好的食物(避开咖啡这种只回 3 点的), 吃到 220 以上;
  //   吃完 /select 手里会变成食物, 所以必须再把竿拿回来。
  if ((p.stamina ?? 270) < 90) {
    // 2026-11-06 接 /buffs: 记录当前 buff 余量(判断"是真饿还是 buff 掉了", 也避免重复吃同类)
    const bf = await A.get('/buffs').catch(() => null);
    const bl = (bf?.buffs || []).map(b => `${b.displayName || b.id} ${Math.round((b.msRemaining || 0) / 60000)}min`).join(', ');
    if (bl) log(label, '当前buff:', bl);
    for (let k = 0; k < 5; k++) {
      const cs = await A.state().catch(() => null);
      if (!cs?.player || cs.player.stamina >= 220) break;
      if (/BobberBar/.test(cs.activeMenu?.type || '')) { await sleep(1500); continue; }
      const eds = (cs.inventory || []).filter(i => i.edibleValue >= 25 && !/Coffee/i.test(i.name));
      if (!eds.length) { log(label, '⚠️ 体力低但没食物了'); break; }
      eds.sort((a, b) => b.edibleValue - a.edibleValue);
      await A.post('/select', { name: eds[0].name }).catch(() => null);
      await sleep(300);
      const r = await A.post('/eat', {}).catch(() => null);
      log(label, '回体力吃', eds[0].name, '→', JSON.stringify(r).slice(0, 80));
      await sleep(2200);
    }
    const inv2 = (await A.state()).inventory || [];
    const rod2 = inv2.find(i => /Iridium Rod/i.test(i?.name || '')) || inv2.find(i => /Rod|Pole/i.test(i?.name || ''));
    if (rod2) await A.post('/select', { name: rod2.name }).catch(() => null);
    await A.post('/face', { direction: 1 }).catch(() => null);
    await sleep(300);
  }
  // 鱼饵: 空了就挂/补(不然 fishbot enabled 也一动不动)
  await baitGuard(label, A).catch(() => null);
  // fishbot OFF 就开(用 action, 绝不用裸 POST)
  const fb = await A.post('/fishbot', { action: 'status' }).catch(() => null);
  if (fb && fb.enabled === false) {
    const r = await A.post('/fishbot', { action: 'on' }).catch(() => null);
    log(label, 'fishbot 重开 →', JSON.stringify(r).slice(0, 60), '体力', Math.round(p.stamina));
  }
  // 假活哨兵: 2 分钟没鱼 + 不在起竿 → 硬重启一轮
  const now = (await A.state().catch(() => null))?.player?.fishCaught ?? null;
  if (now != null) {
    const prev = lastFish.get(label);
    if (prev === now) {
      const c = (stallCnt.get(label) || 0) + 1;
      stallCnt.set(label, c);
      if (c >= 6) {
        stallCnt.set(label, 0);
        log(label, '⚠️ 疑似假活(2 分钟 0 鱼) → fishbot 硬重启');
        await A.post('/fishbot', { action: 'off' }).catch(() => null);
        await sleep(800);
        const inv3 = (await A.state().catch(() => null))?.inventory || [];
        const rod3 = inv3.find(i => /Iridium Rod/i.test(i?.name || '')) || inv3.find(i => /Rod|Pole/i.test(i?.name || ''));
        if (rod3) await A.post('/select', { name: rod3.name }).catch(() => null);
        await baitGuard(label, A).catch(() => null);
        await A.post('/face', { direction: 1 }).catch(() => null);
        await A.post('/fishbot', { action: 'on' }).catch(() => null);
      }
    } else { lastFish.set(label, now); stallCnt.set(label, 0); }
  }
}

log('🐟 锁时双人钓鱼看护启动 (host 7842 + fish 7843; 解锁后自动退出)');
for (;;) {
  if (!fs.existsSync(FLAG)) { log('time-lock.flag 已删 → 解锁, 看护退出'); process.exit(0); }
  for (const [label, A, opt] of [['host', HOST, { allowSell: true }], ['fish', FISH, { allowSell: true }]]) {
    try { await keep(label, A, opt); } catch (e) { log(label, 'err', String(e).slice(0, 80)); }
  }
  await sleep(20000);
}
