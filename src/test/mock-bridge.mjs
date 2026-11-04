// mock 桥: 让 fish-eye 在游戏没开时也能端到端自测(端口 9143, 不碰 7842/7843)
// 模拟: /state /surroundings /walk_to /harvest /tool_area /select /face /use /refill /sleep /menu_close /warp
// 世界: Farm 5x5 田块 + 水塘; 有 3 株熟蓝莓、2 株生长期辣椒、1 坨干土、1 块干锄过土
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 9143);

function mkWorld() {
  const tiles = new Map();
  const put = (x, y, extra = {}) => tiles.set(`${x},${y}`, { x, y, passable: true, terrain: 'Grass', object: null, ...extra });
  for (let y = 15; y <= 24; y++) for (let x = 55; x <= 74; x++) put(x, y);
  // 田: x 62..68, y 19..21 锄过
  for (let y = 19; y <= 21; y++) for (let x = 62; x <= 68; x++) put(x, y, { terrain: 'HoeDirt', watered: true });
  // 作物
  put(63, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Blueberry', cropPhase: 4, harvestable: true });
  put(64, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Blueberry', cropPhase: 4, harvestable: true });
  put(65, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Blueberry', cropPhase: 4, harvestable: true });
  put(66, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Hot Pepper', cropPhase: 2, harvestable: false });
  put(67, 19, { terrain: 'HoeDirt', watered: false, crop: true, cropName: 'Hot Pepper', cropPhase: 2, harvestable: false });
  // 水塘
  for (let x = 70; x <= 72; x++) for (let y = 22; y <= 24; y++) put(x, y, { terrain: 'Water', water_fishable: true, passable: false });
  return tiles;
}

const world = mkWorld();
const state = {
  ok: true, worldReady: true,
  location: { name: 'Farm' },
  player: { name: '蓝色小肥鱼', money: 281, stamina: 240, maxStamina: 270, health: 100, maxHealth: 110, x: 64, y: 20, isInBed: false },
  time: { year: 2, season: 'summer', dayOfMonth: 10, timeOfDay: 1020 },
  inventory: [
    { name: 'Axe', stack: 1 }, { name: 'Watering Can', stack: 1, waterLeft: 3, waterMax: 40 },
    { name: 'Hoe', stack: 1 }, { name: 'Scythe', stack: 1 },
    { name: 'Blueberry Seeds', stack: 6 },
    { name: 'Parsnip', stack: 5, value: 35 },      // 可卖农作物(白名单内)
    { name: 'Sardine', stack: 2, value: 40 },      // 可卖鱼(白名单内)
    { name: 'Fiber', stack: 12 },                  // 不该卖(非白名单)
  ],
  heldItem: { name: 'Blueberry Seeds' }, activeMenu: null,
};
const calls = [];

function surroundings(radius) {
  const p = state.player;
  const out = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const t = world.get(`${p.x + dx},${p.y + dy}`);
    if (t) out.push(t);
  }
  return out;
}
function walkTo(x, y) {
  const t = world.get(`${x},${y}`);
  if (!t) return { ok: false, error: `(${x},${y}) 越界` };
  if (!t.passable) return { ok: false, error: `(${x},${y}) 站不住` };
  state.player.x = x; state.player.y = y;
  state.time.timeOfDay = Math.min(2550, state.time.timeOfDay + 10);
  return { ok: true, walk_started: true, arrived: { x, y } };
}
const pick = (name) => state.inventory.find((i) => i.name === name);
const addItem = (name, n) => {
  const it = pick(name);
  if (it) it.stack = (it.stack ?? 1) + n;
  else if (state.inventory.filter((i) => i.name).length < 12) state.inventory.push({ name, stack: n });
};

const routes = {
  '/state': () => state,
  '/status': () => ({ ok: true, worldReady: true }),
  '/surroundings': (b, q) => ({ ok: true, tiles: surroundings(Number(q.radius || 7)) }),
  // 整图: 桥原生的 /map 会给全图 tiles(真实存在, 见 DLL 模板 ok/location/x/y/w/h/tiles)
  '/map': () => {
    const tiles = [...world.values()];
    const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
    return { ok: true, location: state.location.name, x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, tiles };
  },
  '/select': (b) => { state.heldItem = { name: b.name }; const it = pick(b.name); return it ? { ok: true, selected: b.name } : { ok: false, error: `Item '${b.name}' not found` }; },
  '/face': (b) => ({ ok: true, facing: b.direction }),
  '/walk_to': (b) => walkTo(Number(b.x), Number(b.y)),
  '/warp': (b) => { state.location = { name: b.location }; state.player.x = Number(b.x); state.player.y = Number(b.y); return { ok: true }; },
  '/menu_close': () => { state.activeMenu = null; return { ok: true }; },
  '/harvest': () => {
    const p = state.player;
    let n = 0;
    for (const t of surroundings(2)) {
      if (t.crop && (t.harvestable === true || t.cropPhase >= 4)) {
        n++;
        addItem(t.cropName, 3);
        t.crop = false; t.cropName = null; t.harvestable = false; t.cropPhase = 0;
      }
    }
    void p;
    return { ok: true, harvested: n };
  },
  // 真桥: GetParam<string>(p,"operation"), 只认 water|till; 不认 ops(b.ops 会被当 undefined 拒掉)
  '/tool_area': (b) => {
    if (!['water', 'till'].includes(b.operation)) {
      return { ok: false, error: "operation must be 'water' or 'till'" };
    }
    if (b.operation === 'water') {
      let n = 0;
      for (const t of world.values()) {
        if (t.x >= b.x1 && t.x <= b.x2 && t.y >= b.y1 && t.y <= b.y2 && t.crop && t.watered === false) {
          const can = pick('Watering Can');
          if (can && (can.waterLeft ?? 0) <= 0) break;
          if (can) can.waterLeft = Math.max(0, (can.waterLeft ?? 0) - 1);
          t.watered = true; n++;
        }
      }
      return { ok: true, op: 'water', watered: n };
    }
    if (b.operation === 'till') {
      let n = 0;
      for (const t of world.values()) {
        if (t.x >= b.x1 && t.x <= b.x2 && t.y >= b.y1 && t.y <= b.y2 && !t.crop && !t.object && t.passable
          && !/HoeDirt/i.test(t.terrain) && !/Water/i.test(t.terrain)) { t.terrain = 'HoeDirt'; t.watered = false; n++; }
      }
      return { ok: true, op: 'till', tilled: n };
    }
    return { ok: false, error: 'unreachable' };
  },
  '/use': () => {
    const p = state.player;
    const dir = state.facing ?? 2;
    const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    const t = world.get(`${p.x + dx},${p.y + dy}`);
    if (!t) return { ok: false, error: 'no tile' };
    const held = state.heldItem?.name;
    if (/Watering Can/.test(held || '')) {
      if (/Water/i.test(t.terrain)) { const c = pick('Watering Can'); if (c) c.waterLeft = c.waterMax || 40; return { ok: true, tile: { x: t.x, y: t.y }, refilled: true }; }
      if (!t.crop) return { ok: false, error: 'No tilled soil here' };
      if (t.watered) return { ok: false, error: 'Already watered' };
      const can = pick('Watering Can');
      if ((can?.waterLeft ?? 0) <= 0) return { ok: false, error: 'watering can empty' };
      can.waterLeft--; t.watered = true;
      return { ok: true, tile: { x: t.x, y: t.y } };
    }
    if (/Seeds/.test(held || '')) {
      if (!/HoeDirt/.test(t.terrain)) return { ok: false, error: 'Cannot use here' };
      if (t.crop) return { ok: false, error: 'Already planted' };
      const seed = pick(held);
      if (!seed) return { ok: false, error: "No usable item" };
      seed.stack--; if (seed.stack <= 0) state.inventory = state.inventory.filter((i) => i !== seed);
      t.crop = true; t.cropName = held.replace(/\s*Seeds$/, ''); t.cropPhase = 0; t.harvestable = false;
      return { ok: true, tile: { x: t.x, y: t.y }, planted: true };
    }
    return { ok: true, tile: { x: t.x, y: t.y } };
  },
  // 真桥 HandleSell: 必须在 Farm, 把物品从背包塞进出货箱(不经点击); all:true 会跳过名字过滤
  '/sell': (b) => {
    if (state.location?.name !== 'Farm') return { ok: false, error: 'No shipping bin found (must be on Farm)' };
    const sold = [];
    for (let i = state.inventory.length - 1; i >= 0; i--) {
      const it = state.inventory[i];
      if (!it?.name) continue;
      const match = b.all ? (!/Seeds|Axe|Hoe|Watering Can|Scythe|Pickaxe/.test(it.name)) : (it.name === b.name);
      if (!match) continue;
      sold.push({ item: it.name, count: it.stack ?? 1, price: (it.value ?? 10) * (it.stack ?? 1) });
      state.shippingBin = (state.shippingBin ?? 0) + (it.stack ?? 1);
      state.inventory.splice(i, 1);
    }
    return sold.length ? { ok: true, sold, totalItems: sold.length }
                      : { ok: false, error: "Item '" + b.name + "' not found in inventory" };
  },
  // 真桥 HandleCancelSleep: 四步原子破环
  '/cancel_sleep': () => {
    state.player.isInBed = false; state.activeMenu = null; state.dialogueUp = false;
    return { ok: true, action: 'cancelled', wokeUp: true };
  },
  '/ready_state': () => ({ ok: true, isMaster: true, player: state.player.name,
    checks: [{ id: 1, kind: 'ServerReadyCheck', state: 'Locking', numberReady: 1, numberRequired: 2, isReady: false }] }),
  // 真桥 HandleRipen: crop.growCompletely()
  '/ripen': (b, q) => {
    let n = 0;
    for (const t of world.values()) if (t.crop && !t.harvestable) { t.harvestable = true; t.cropPhase = 4; n++; }
    return { ok: true, ripened: n };
  },
  // 真桥 HandleFarmReport: 全农场统一统计
  '/farm_report': () => {
    const crops = [...world.values()].filter((t) => t.crop);
    return { ok: true, season: state.time.season, dayOfMonth: state.time.dayOfMonth, year: state.time.year,
      crops: { total: crops.length, watered: crops.filter((t) => t.watered).length,
               ready: crops.filter((t) => t.harvestable).length, byLocation: [] },
      animals: { total: 0, animals: [] }, machines: { total: 0, machines: [] } };
  },
  '/refill': () => { const c = pick('Watering Can'); if (c) c.waterLeft = 40; return { ok: true, waterLeft: 40 }; },
  '/sleep': () => { state.player.isInBed = true; return { ok: true, inBed: true }; },
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  let b = {}; try { b = JSON.parse(body || '{}'); } catch { }
  const q = Object.fromEntries(u.searchParams.entries());
  const fn = routes[u.pathname];
  calls.push(`${req.method} ${u.pathname} ${body.slice(0, 60)}`);
  res.writeHead(fn ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
  if (!fn) { res.end(JSON.stringify({ ok: false, error: 'unknown ' + u.pathname })); return; }
  try { res.end(JSON.stringify(fn(b, q))); }
  catch (e) { res.end(JSON.stringify({ ok: false, error: 'mock: ' + e.message })); } // 一条坏请求不许弄死整个 mock
});

server.listen(PORT, '127.0.0.1', () => console.log('mock bridge on ' + PORT));
export { state, world, calls };