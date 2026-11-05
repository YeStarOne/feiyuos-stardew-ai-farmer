// world-map v1 (2026-11-05): 全地图数据层 —— 不给鱼鱼"走一格记一格"，直接读整张世界
// ---------------------------------------------------------------------------
// 三个数据源全是桥现成端点(ilspycmd 反编译核实, 见 dll-audit/NagiBridgeRemix.decompiled.cs):
//   /warps                            → EnsureWarpGraph 遍历 Game1.locations 全部 87 张图的 warps(出口+落点)
//   /tile_props?location=X&scan=Action → 任意地图所有层的 Action: LockedDoorWarp 自带"门→室内落点+营业时间"
//   /passable_rect?location=X&x1..    → 任意地图任意矩形可行走格(单次上限 96×96, 实测 ~70ms)
// 所以"完整地图"不需要把人送过去: 邻居地图的骨架、门、可行性都能远程取到。
// 本文件只做数据/渲染, 不决定去哪 —— 交互在 fish-eye.mjs, 地标表在 fish-eye-lib.mjs

const CH = 96;          // /passable_rect 单次上限
const TTL = 10 * 60 * 1000; // 10 分钟缓存: 地图里的建筑/人物会变, 别拿一周前的格子骗她

export function makeWorld({ get, log = () => { } } = {}) {
  let warps = null; let warpsAt = 0;
  const doorCache = new Map(); // loc -> {at, hits, parsed}
  const gridCache = new Map();  // loc -> {at, g}

  async function warpsAll(force = false) {
    if (!force && warps && Date.now() - warpsAt < TTL) return warps;
    const r = await get('/warps', 25000);
    if (r?.ok && r.maps) { warps = r.maps; warpsAt = Date.now(); }
    else log('warps 读不到:', JSON.stringify(r).slice(0, 120));
    return warps;
  }

  // ---------- 门: 从 Action 属性解析 ----------
  // 值形如 `LockedDoorWarp <insX> <insY> <Interior> <open> <close> [npc until]`
  // 例: Town(20,88) `LockedDoorWarp 2 24 HaleyHouse 900 2000` = 艾米丽家门口, 进去落在 HaleyHouse(2,24), 9:00-20:00 开
  function parseAction(h) {
    const v = String(h.value || '');
    let m = v.match(/LockedDoorWarp\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)/i);
    if (m) return { x: h.x, y: h.y, kind: 'door', inside: m[3], ix: +m[1], iy: +m[2], open: +m[4], close: +m[5], raw: v };
    if (/WarpCommunityCenter/i.test(v)) return { x: h.x, y: h.y, kind: 'door', inside: 'CommunityCenter', raw: v };
    if (/EnterSewer/i.test(v)) return { x: h.x, y: h.y, kind: 'door', inside: 'Sewer', raw: v };
    if (/MineElevator/i.test(v)) return { x: h.x, y: h.y, kind: 'elevator', raw: v };
    if (/Mine$/i.test(v) || /Mine\s+\d+/i.test(v)) return { x: h.x, y: h.y, kind: 'mine', raw: v };
    if (/Warp\s+(\d+)\s+(\d+)\s+(\S+)/i.test(v)) {
      const w = v.match(/Warp\s+(\d+)\s+(\d+)\s+(\S+)/i);
      return { x: h.x, y: h.y, kind: 'warp', inside: w[3], ix: +w[1], iy: +w[2], raw: v };
    }
    if (/SkullDoor|Skull/i.test(v)) return { x: h.x, y: h.y, kind: 'door', inside: 'SkullCave', raw: v };
    if (/Bookseller/i.test(v)) return { x: h.x, y: h.y, kind: 'shop', raw: '书摊' };
    if (/IceCreamStand/i.test(v)) return { x: h.x, y: h.y, kind: 'shop', raw: '冰淇淋摊' };
    if (/MasteryRoom|MasteryCave/i.test(v)) return { x: h.x, y: h.y, kind: 'door', inside: 'MasteryCave', raw: v };
    if (/Theater_Doors/i.test(v)) return { x: h.x, y: h.y, kind: 'door', inside: 'MovieTheater', raw: v };
    if (/Carpenter/i.test(v)) return { x: h.x, y: h.y, kind: 'service', raw: '木匠柜台' };
    if (/AnimalShop/i.test(v)) return { x: h.x, y: h.y, kind: 'service', raw: '牧场柜台' };
    if (/Door\s+\w+/i.test(v)) return { x: h.x, y: h.y, kind: 'innerdoor', raw: v };
    if (/^Warp/i.test(v)) return { x: h.x, y: h.y, kind: 'warp', raw: v };
    return null;
  }

  async function doors(loc) {
    const c = doorCache.get(loc);
    if (c && Date.now() - c.at < TTL) return c.parsed;
    const r = await get(`/tile_props?location=${encodeURIComponent(loc)}&scan=Action`, 30000);
    const hits = (r?.ok ? r.hits : []).filter((h) => !/^(Message|Billboard|Garbage|NPCMessage|None)/i.test(String(h.value || '')));
    const parsed = hits.map(parseAction).filter(Boolean);
    doorCache.set(loc, { at: Date.now(), parsed });
    return parsed;
  }

  // ---------- 可行走格 ----------
  // 返回 { w, h, cells: Map<"x,y", '.'|'#'>, at }: 逐块扫到"这一列/行已经到底"为止
  const pickChar = (t) => (t.passable ? '.' : '#');

  async function chunk(loc, x0, y0) {
    const r = await get(`/passable_rect?location=${encodeURIComponent(loc)}&x1=${x0}&y1=${y0}&x2=${x0 + CH - 1}&y2=${y0 + CH - 1}`, 25000);
    return r?.ok && Array.isArray(r.tiles) ? r.tiles : null;
  }

  async function grid(loc) {
    const c = gridCache.get(loc);
    if (c && Date.now() - c.at < TTL) return c.g;
    const cells = new Map();
    let w = 0, h = 0;
    const add = (tiles) => {
      for (const t of tiles) {
        cells.set(`${t.x},${t.y}`, pickChar(t));
        if (t.x + 1 > w) w = t.x + 1;
        if (t.y + 1 > h) h = t.y + 1;
      }
    };
    // 第 0 列(y=0..95): 顺便探宽高
    const t0 = await chunk(loc, 0, 0);
    if (!t0) return null;
    if (!t0.length) return { w: 0, h: 0, cells, at: Date.now() };
    add(t0);
    let cols = 1;
    while (cols < 6 && w >= cols * CH) {           // 这一列扫满了 96 格 → 右边还有
      const t = await chunk(loc, cols * CH, 0);
      if (!t || !t.length) break;
      add(t); cols++;
    }
    let rows = 1;
    while (rows < 6 && h >= rows * CH) {           // 这一行扫满了 96 格 → 下面还有
      const probe = await chunk(loc, 0, rows * CH);
      if (!probe || !probe.length) break;
      add(probe);
      for (let cx = 1; cx < cols; cx++) {
        const t = await chunk(loc, cx * CH, rows * CH);
        if (t && t.length) add(t);
      }
      rows++;
    }
    const g = { w, h, cells, at: Date.now() };
    gridCache.set(loc, { at: g.at, g });
    return g;
  }

  // 只查一格能不能站(用于门口找站位、室内落点校验)
  async function passableAt(loc, x, y) {
    const g = await grid(loc);
    if (!g) return null;
    return g.cells.get(`${x},${y}`) === '.';
  }

  // ---------- 渲染 ----------
  const MARK_ORDER = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function markSet(marks, scale = 1, ox = 0, oy = 0) {
    const m = new Map();
    marks.forEach((p, i) => {
      const k = `${Math.floor((p.x - ox) / scale)},${Math.floor((p.y - oy) / scale)}`;
      if (!m.has(k)) m.set(k, p.ch || MARK_ORDER[i % MARK_ORDER.length]);
    });
    return m;
  }

  // 局部窗口(1:1): 她在哪, 附近什么样
  function renderWindow(g, cx, cy, w = 41, h = 17, marks = []) {
    const x0 = cx - Math.floor((w - 1) / 2), y0 = cy - Math.floor((h - 1) / 2);
    const mk = markSet(marks);
    const rows = [];
    for (let y = y0; y < y0 + h; y++) {
      let line = '';
      for (let x = x0; x < x0 + w; x++) {
        if (x === cx && y === cy) { line += '@'; continue; }
        const k = `${x},${y}`;
        if (mk.has(`${x},${y}`)) { line += mk.get(`${x},${y}`); continue; }
        if (x < 0 || y < 0 || x >= g.w || y >= g.h) { line += ' '; continue; }
        line += g.cells.get(k) ?? '#';
      }
      rows.push(`${String(y).padStart(3)}|${line}`);
    }
    return { text: `x ${x0}..${x0 + w - 1}\n${rows.join('\n')}\n上=北(y小) 下=南(y大) 左=西 右=东`, x0, y0 };
  }

  // 整图缩略: 缩到她都看得下的宽度(默认 64 列)
  function renderWhole(g, marks = [], maxW = 64, maxH = 34) {
    if (!g.w) return '(这张图是空的/读不到)';
    const scale = Math.max(1, Math.ceil(g.w / maxW), Math.ceil(g.h / maxH));
    const mk = markSet(marks, scale);
    const rows = [];
    for (let by = 0; by < Math.ceil(g.h / scale); by++) {
      let line = '';
      for (let bx = 0; bx < Math.ceil(g.w / scale); bx++) {
        if (mk.has(`${bx},${by}`)) { line += mk.get(`${bx},${by}`); continue; }
        let anyWalk = false, allVoid = true;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = bx * scale + dx, y = by * scale + dy;
            if (x >= g.w || y >= g.h) continue;
            allVoid = false;
            if (g.cells.get(`${x},${y}`) === '.') anyWalk = true;
          }
        }
        line += allVoid ? ' ' : (anyWalk ? '.' : '#');
      }
      rows.push(`${String(by * scale).padStart(3)}|${line}`);
    }
    const note = scale > 1 ? `(缩略图: 1 个字= ${scale}×${scale} 格; 坐标见下面的清单)` : '';
    return `${rows.join('\n')}\n${note}上=北 下=南 左=西 右=东`;
  }

  // ---------- 跨图路线(BFS, 用真实 warp 图) ----------
  async function routeHops(from, to, maxHops = 6) {
    const m = await warpsAll();
    if (!m) return null;
    if (from === to) return [from];
    const seen = new Set([from]);
    const q = [[from]];
    while (q.length && q.length < 400) {
      const path = q.shift();
      const last = path[path.length - 1];
      const links = m[last] || [];
      for (const l of links) {
        const nxt = l.targetLocation;
        if (seen.has(nxt)) continue;
        const np = [...path, nxt];
        if (nxt === to) return np;
        if (np.length >= maxHops) continue;
        seen.add(nxt);
        q.push(np);
      }
    }
    return null;
  }

  // 每一步怎么走(取该图里第一条通向下一图的 warp 格)
  async function routeText(from, to) {
    const path = await routeHops(from, to);
    if (!path) return null;
    if (path.length === 1) return `你现在就在${from}`;
    const m = await warpsAll();
    const steps = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const link = (m[a] || []).find((l) => l.targetLocation === b);
      steps.push(link ? `${a} (${link.x},${link.y}) → ${b}` : `${a} → ${b}`);
    }
    return steps.join('  ⇒  ');
  }

  // 当前图有哪些出口(她说"怎么出去"时)
  async function exitsOf(loc) {
    const m = await warpsAll();
    return (m?.[loc] || []).map((l) => ({ x: l.x, y: l.y, to: l.targetLocation, tx: l.targetX, ty: l.targetY }));
  }

  return { warpsAll, doors, grid, passableAt, renderWindow, renderWhole, routeHops, routeText, exitsOf, MARK_ORDER };
}
