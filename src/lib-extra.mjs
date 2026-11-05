// 端点扩展包 v1 (2026-11-06): 把原先"知道但没接"的 9 个端点做成可复用封装
// 来源: NagiBridge 173 端点全表里挑出的高价值未接项 (见 docs/端点手册.md 附录 A)
//
// 用法:
//   import { HOST, FISH, extra } from './lib-extra.mjs';
//   await HOST.buffs();                 // 当前 buff
//   await FISH.guard(true, 'Galaxy Dagger'); // 只对 farmhand 有效
//   const X = extra(7843);              // 自定义端口
//
// 安全分级(反编译核对):
//   · 只读: buffs / bombs / eggTiles / carpenter / sittable / crawlBed(locate|beds)
//   · 有副作用: guard / sellToShop / claimSwap / crawlBed(sleep)
// ⚠️ /guard 只在 farmhand(7843) 生效, 房主进程会被桥直接拒绝; 且它会换掉手持物(切武器)——
//    钓鱼/浇水进行中不要开。
const PORT_BASE = p => `http://localhost:${p}`;

async function call(port, path, { method = 'GET', body, timeout = 8000 } = {}) {
  const r = await fetch(PORT_BASE(port) + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, status: r.status, raw: t.slice(0, 200) }; }
}

export function extra(port = 7842) {
  const get = (p, timeout) => call(port, p, { timeout });
  const post = (p, body, timeout) => call(port, p, { method: 'POST', body, timeout });
  return {
    port,
    state: () => get('/state'),

    // ---- 只读 ----
    // 当前 buff: {buffs:[{displayName,source,msRemaining,seconds}]}
    buffs: () => get('/buffs'),
    // 本图已放置炸弹: {bombs:[{x,y,bomb_type,bomb_radius,tile}]}
    bombs: () => get('/bombs'),
    // Paths 层 fest* 图块: {map,count,tiles:[{x,y,tileIndex,sheet}]}
    // ⚠️ 实现上扫的是"节日地图的 fest 装饰图块"; 是不是可捡的彩蛋要春13 现场验一次
    eggTiles: (map = '') => get('/egg_tiles' + (map ? `?map=${encodeURIComponent(map)}` : '')),
    // 罗宾建筑目录: {buildings:[{name,cost,materials,size,affordable}],count}
    carpenter: () => get('/carpenter'),
    // 附近可坐: {seats:[{x,y,seatName,face,dist,free}]}
    sittable: (radius = 7) => get(`/sittable?radius=${radius}`),
    // 床位诊断 action=locate|beds|sleep, player=角色名(sleep 用)
    crawlBed: (action = 'locate', player = '') => post('/crawl_bed', { action, ...(player ? { player } : {}) }),

    // ---- 有副作用 ----
    // 自动近战护身(仅 farmhand): on=false 关闭; weapon 可指定武器名
    guard: (on = true, weapon = '') => post('/guard', { on, ...(weapon ? { weapon } : {}) }),
    // 在当前所在商店卖(count 省略=整叠) —— /sell 只认 Farm, 这个认商店
    sellToShop: (name, count) => post('/sell_to_shop', { name, ...(count ? { count } : {}) }),
    // ItemGrabMenu 领取侧用背包物品替换(宝箱满时腾格), replace=物品名/槽位
    claimSwap: (replace) => post('/menu/claim_swap', { replace }),

    raw: { get, post },
  };
}

export const HOST = extra(7842);
export const FISH = extra(7843);
