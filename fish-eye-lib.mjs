// fish-eye-lib v1.1 (2026-11-04): 小鱼"人话"翻译层 —— 纯函数部分(可离线单测)
// 设计依据: 小肥鱼反馈 ①方位0-3要心算 ②周围一圈不带名字(草/石/水靠猜) ③移动一格一格
//          ④没地图记不住哪边是海 ⑤收/种只能一格一格 ⑥水壶剩水要掏出来看
// 本文件只做"数字→人话"的翻译, 不碰网络; 网络在 fish-eye.mjs
// 字段来源: NagiBridgeRemix /surroundings (DLL 扒出: passable,object,objId,isStone,isWeeds,
//   isTwig,bigCraftable,terrain,resource,crop{fruitCount,fruitName,cropPhase,cropName,
//   cropScythe,cropRegrow,forageCrop},moss,watered,fert, harvestable(顶层), diggable,
//   water_fishable, chest_open) 和 /state (time{season,dayOfMonth,timeOfDay,year}, player{money,
//   stamina,maxStamina,x,y,isInBed}, location{name}, inventory[{name,stack,waterLeft}])

// ============ 方位: 数字 0-3 → 人话 ============
// 桥的约定: 0=上(北) 1=右(东) 2=下(南) 3=左(西)
export const DIR8_NAMES = {
  '0,-1': '北', '1,-1': '东北', '1,0': '东', '1,1': '东南',
  '0,1': '南', '-1,1': '西南', '-1,0': '西', '-1,-1': '西北',
};
export const dir8 = (dx, dy) => DIR8_NAMES[`${Math.sign(dx)},${Math.sign(dy)}`] || '原地';
export const dirWord = (d) => ['北', '东', '南', '西'][d] ?? `(${d})`;
const sgn = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ============ 格子 → 人话 ============
const WATER_RE = /water|sea|pond|ocean|lake|river|bath/i;

export function isWater(t) {
  if (!t) return false;
  if (t.isWater === true || t.waterTile === true || t.water === true) return true;
  return WATER_RE.test(String(t.terrain || ''));
}

// 返回 {char, word, pass} —— char 供文字地图用, word 给 /see 用
export function tileDesc(t) {
  if (!t) return { char: '?', word: '没看过', pass: null };
  // 作物优先(格子上可能同时有 watered/terrain)
  if (t.crop || t.cropName) {
    const name = t.cropName || String(t.crop).replace(/^Crop:\s*/, '') || '作物';
    const phase = Number(t.cropPhase);
    const ready = t.harvestable === true || (Number.isFinite(phase) && phase >= 4);
    const wet = t.watered === true ? ' 已浇水' : (t.watered === false ? ' 还没浇水' : '');
    const stage = Number.isFinite(phase) ? ` 第${phase + 1}阶段` : '';
    return {
      char: ready ? 'W' : 'w',
      word: `${name}${ready ? ' ✅熟了可以收' : ` 生长中${stage}`}${wet}`,
      pass: false,
    };
  }
  const obj = String(t.object || '');
  if (isWater(t)) return { char: '~', word: t.water_fishable ? '水(能钓鱼)' : '水', pass: false };
  if (/Sprinkler/i.test(obj)) return { char: 'S', word: `洒水器${/Quality|优质/i.test(obj) ? '(优质)' : ''}`, pass: false };
  if (/Chest/i.test(obj) || /ShippingBin/i.test(obj)) return { char: 'B', word: /ShippingBin/i.test(obj) ? '出货箱' : '箱子', pass: false };
  if (/Furnace|Keg|Preserves|Mayonnaise|Cheese|Loom|Oil Maker|Crystalarium|Recycling|Cask|Dehydrator/i.test(obj))
    return { char: 'M', word: `机器:${obj}`, pass: false };
  if (/Tree|Bush/i.test(t.terrain || '') || /Tree/i.test(obj)) {
    return { char: 'T', word: /FruitTree/i.test(obj || t.terrain || '') ? '果树' : '树', pass: false };
  }
  if (t.isWeeds) return { char: '*', word: '杂草', pass: !!t.passable };
  if (t.isStone || /Stone|Boulder|Node/i.test(obj)) return { char: 'o', word: '石头', pass: false };
  if (t.isTwig) return { char: '*', word: '树枝', pass: true };
  if (/HoeDirt/i.test(t.terrain || '')) {
    return { char: '=', word: t.watered ? '锄过的土 已浇水' : '锄过的土(干的,能种)', pass: true };
  }
  if (obj) return { char: '#', word: obj, pass: !!t.passable };
  if (/Grass/i.test(t.terrain || '')) return { char: '.', word: '草地', pass: true };
  if (t.passable) return { char: '.', word: '空地', pass: true };
  return { char: '#', word: t.terrain || '走不过去', pass: false };
}

export const LEGEND = '图例: @=我 .=能走 ==锄过的土 w/W=作物(熟) *=杂草/树枝 o=石头 T=树 ~=水 S=洒水器 B=箱子/出货箱 M=机器 #=障碍 ?=没走过(没数据) 上北下南';

// ============ 周围一圈: 带名字的 8 邻 ============
export function ringText(tiles, px, py, radius = 1) {
  const at = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  const out = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const t = at.get(`${px + dx},${py + dy}`);
      if (!t) continue;
      const d = tileDesc(t);
      out.push(`${dir8(dx, dy)}(${sgn(dx)},${sgn(dy)}): ${d.word}`);
    }
  }
  return out;
}

// ============ 文字地图 ============
// seen: Map<"x,y",tile>  (fish-eye 会把每次 /surroundings 的结果并进缓存, 走得越多图越全)
export function renderMap(seen, px, py, w = 41, h = 17, landmarks = []) {
  const halfW = Math.floor((w - 1) / 2), halfH = Math.floor((h - 1) / 2);
  const x0 = px - halfW, y0 = py - halfH;
  const lm = new Map();
  for (const l of landmarks) {
    if (l.x >= x0 && l.x < x0 + w && l.y >= y0 && l.y < y0 + h && !(l.x === px && l.y === py)) {
      if (!lm.has(`${l.x},${l.y}`)) lm.set(`${l.x},${l.y}`, l.mark || 'D');
    }
  }
  const rows = [];
  for (let y = y0; y < y0 + h; y++) {
    let line = '';
    for (let x = x0; x < x0 + w; x++) {
      if (x === px && y === py) { line += '@'; continue; }
      const k = `${x},${y}`;
      if (lm.has(k)) { line += lm.get(k); continue; }
      const t = seen.get(k);
      line += t ? tileDesc(t).char : '?';
    }
    rows.push(`${String(y).padStart(3)}|${line}`);
  }
  return `地图 x ${x0}..${x0 + w - 1}, 我在@(${px},${py})\n${rows.join('\n')}\n上=北(y小) 下=南(y大)`;
}

// ============ 水壶 ============
export const CAN_CAP = 40; // 铜壶以上更高, 桥会给 waterMax 就用它
export function canText(s) {
  const can = (s.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
  if (!can) return '背包里没有水壶';
  const left = can.waterLeft;
  if (left === undefined || left === null) return '水壶状态读不到(老桥没这字段)';
  const cap = Number(can.waterMax) > 0 ? Number(can.waterMax) : CAN_CAP;
  const pct = Math.round((left / cap) * 100);
  const warn = left <= 0 ? ' ⚠️空的, 要去水边打水' : left < cap * 0.25 ? ' ⚠️快空了' : '';
  return `${left}/${cap} (${pct}%)${warn}`;
}

// ============ 一句话状态 ============
const SEASON_CN = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };
export const seasonCN = (s) => SEASON_CN[s] || s || '?';

export function clockOf(timeOfDay) {
  const hm = Number(timeOfDay || 0);
  const hh = Math.floor(hm / 100), mm = hm % 100;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ============ 天气/运气/背包满提醒 (2026-11-05 鱼鱼四愿望) ============
// state.time.weather: 0晴 1雨 2雷 3落叶风 5雪 7绿雨 (反编译 NagiBridge /state 实锤)
const WEATHER_CN = { 0: '晴☀️', 1: '雨🌧️', 2: '雷暴⛈️', 3: '风🍂', 5: '雪❄️', 7: '绿雨🍀' };
export function weatherText(t) {
  if (!t || t.weather === undefined) return '?';
  return WEATHER_CN[t.weather] || `未知(${t.weather})`;
}
export function luckText(dailyLuck) {
  const v = Number(dailyLuck);
  if (Number.isNaN(v)) return '?';
  if (v >= 0.07) return '很好🌟(适合下矿/钓宝)';
  if (v >= 0.02) return '不错👍';
  if (v > -0.02) return '平平';
  if (v > -0.07) return '偏差⚠️(别赌运气)';
  return '很差⚠️(今天别下矿/开箱)';
}
// 背包容量用真实 maxItems(联机36格), 满了提前喊, 别让她白跑
export function packText(s) {
  const cap = s?.player?.maxItems || 12;
  const slots = (s?.inventory || []).filter((i) => i.name).length;
  const warn = slots >= cap ? ` ⚠️满了! 先清仓/存箱`
    : slots >= cap - 2 ? ` ⚠️快满了(只剩${cap - slots}格)` : '';
  return `${slots}/${cap}${warn}`;
}
// 到达播报: 到了哪 + 旁边有谁 + 背包提醒 (「去镇上」到站讲一句)
export function arrivalText(s, lmName) {
  if (!s?.player) return '';
  const lines = [`到【${lmName}】了 (${s.player.x},${s.player.y})`];
  const npcs = s.npcs || [];
  lines.push(npcs.length ? '旁边有: ' + npcs.slice(0, 6).map((n) => n.name || n).join('、') : '旁边没有村民');
  const others = s.otherPlayers || [];
  if (others.length) lines.push('队友: ' + others.map((o) => `${o.name}(${o.location})`).join('、'));
  const pack = packText(s);
  if (pack.includes('⚠️')) lines.push('⚠️ 背包' + pack);
  return lines.join('\n');
}

export function seeText(s, tiles) {
  if (!s || !s.player) return '读不到游戏状态(游戏没开或桥断了)';
  const t = s.time || {};
  const p = s.player;
  const when = `${t.year ? `第${t.year}年` : ''}${seasonCN(t.season)}${t.dayOfMonth}日 ${clockOf(t.timeOfDay)}`;
  const where = s.location?.name || s.location || '?';
  const hand = s.activeMenu?.type ? `⚠️开着菜单:${s.activeMenu.type}(先关)` : (s.heldItem?.name || s.heldItem || '空手');
  const lines = [
    `${when} ${weatherText(t)} | 运气${luckText(p.dailyLuck)} | 在【${where}】(${p.x},${p.y}) | 钱 ${p.money}g | 体力 ${Math.round(p.stamina)}/${p.maxStamina || 270} | 背包 ${packText(s)}`,
    `手持: ${hand} | 水壶: ${canText(s)}`,
  ];
  if (p.isInBed) lines.push('⚠️ 你在床上(等大家睡觉/ready check)');
  if (tiles?.length) {
    const ring = ringText(tiles, p.x, p.y, 1);
    if (ring.length) lines.push('四周: ' + ring.join(' ; '));
    const crops = tiles.filter((z) => z.crop);
    if (crops.length) {
      const readyNames = {};
      for (const z of crops) {
        if (z.harvestable === true || Number(z.cropPhase) >= 4) {
          const n = z.cropName || '?';
          readyNames[n] = (readyNames[n] || 0) + 1;
        }
      }
      const dry = crops.filter((z) => z.watered === false).length;
      const readyStr = Object.entries(readyNames).map(([n, c]) => `${seedCN(n)}x${c}`).join(',');
      lines.push(`附近作物 ${crops.length}格${readyStr ? ` | 今天熟了: ${readyStr} (说"收菜"就收)` : ' | 暂时没有熟的'}${dry ? ` | ${dry}格没浇水` : ''}`);
    }
  }
  return lines.join('\n');
}

// ============ 地标表 ============
// who: 'host'=主持(i), 'fish'=小鱼(她) —— 同一个名字在她那边是不同的地方, 必须先按 who 选
// verified: 'script'=历史脚本实测坐标 / 'guess'=推定(到不了会自动就近)
export const LANDMARKS = [
  // --- 两个人各自的家 ---
  { name: '家', alias: ['家里', '回家', '我的床', '睡觉的地方', '床'], loc: 'Cabin', x: 4, y: 9, who: 'fish', verified: 'script', mark: 'D' },
  { name: '家', alias: ['家里', '回家', '我的床', '睡觉的地方', '床'], loc: 'FarmHouse', x: 9, y: 9, who: 'host', verified: 'script', mark: 'D' },
  { name: '农舍门口', alias: ['门口', '出门'], loc: 'Farm', x: 64, y: 15, verified: 'script', mark: 'D' },
  { name: '屋里柜子', alias: ['柜子', '木箱'], loc: 'FarmHouse', x: 3, y: 11, who: 'host', verified: 'script' },
  // --- 农场 ---
  { name: '农田', alias: ['田', '田边', '菜地', '田里'], loc: 'Farm', x: 66, y: 20, who: 'host', verified: 'script', mark: 'F' },
  { name: '出货箱', alias: ['杂货箱', '卖东西的地方', '卖东西'], loc: 'Farm', x: 72, y: 14, stand: [72, 15], who: 'host', verified: 'script', mark: 'B' },
  { name: '农场南边', alias: ['南边空地'], loc: 'Farm', x: 60, y: 24, verified: 'script' },
  { name: '农场北边', alias: ['北边'], loc: 'Farm', x: 64, y: 12, verified: 'guess' },
  { name: '农场西南角', alias: ['西南'], loc: 'Farm', x: 52, y: 28, verified: 'guess' },
  // --- 镇子/海滩/山 ---
  { name: '镇子', alias: ['镇上', '广场', '村里'], loc: 'Town', x: 50, y: 57, verified: 'script', mark: 'D' },
  { name: '海滩', alias: ['海边', '沙滩', '海'], loc: 'Beach', x: 44, y: 35, verified: 'script', mark: 'D' },
  { name: '公交站', alias: ['车站', 'bus'], loc: 'BusStop', x: 20, y: 12, verified: 'guess', mark: 'D' },
  { name: '山里', alias: ['山', '矿洞', '矿洞口', '矿井'], loc: 'Mountain', x: 30, y: 20, verified: 'guess', mark: 'D' },
  { name: '森林', alias: ['南森林', '林子'], loc: 'Forest', x: 56, y: 82, verified: 'guess', mark: 'D' },
];

export function findLandmark(word, who = 'fish') {
  if (!word) return null;
  const w = String(word).trim();
  const hit = (l) => l.name === w || (l.alias || []).includes(w);
  const fuzzy = (l) => w.includes(l.name) || (l.alias || []).some((a) => w.includes(a));
  // ① 名字/别名精确命中, 且属于我 → 直接采纳
  const own = LANDMARKS.filter((l) => !l.who || l.who === who);
  const me = own.find(hit);
  if (me) return me;
  // ② 模糊命中(研究"去田边看看"这种整句), 也先看自己那份
  const meF = own.find(fuzzy);
  if (meF) return meF;
  // ③ 别人独有的地名(比如小鱼说"出货箱"其实也只有农场上那一个) → 用它, 但标不是自己家
  return LANDMARKS.find(hit) || LANDMARKS.find(fuzzy) || null;
}
export const homeOf = (who) => findLandmark('家', who);

// ============ 世界方位(她的"哪边是海"用这张表) ============
export const WORLD = `世界怎么走(以农场为中心):
  家(农舍)在农场北边, 出门往南 = 农田; 出货箱在农舍东边
  农场往西 → 公交站; 从公交站往北 → 山里(矿洞), 往东北 → 镇子
  镇子往西南 = 海滩(海在世界最西南角)
  农场往南 → 森林(秘密森林在更西南)
  一句话: 家在正北, 田在正南, 箱在正东, 海在西南, 矿在北边山里`;

// ============ 种子别名 ============
export const SEEDS = {
  防风草: 'Parsnip Seeds', 土豆: 'Potato Seeds', 大蒜: 'Garlic Seeds', 花椰菜: 'Cauliflower Seeds',
  甜瓜: 'Melon Seeds', 蜜瓜: 'Melon Seeds', 番茄: 'Tomato Seeds', 蓝莓: 'Blueberry Seeds',
  辣椒: 'Hot Pepper Seeds', 草莓: 'Strawberry Seeds', 南瓜: 'Pumpkin Seeds', 玉米: 'Corn Seeds',
  小麦: 'Wheat Seeds', 大米: 'Rice Shoot', 啤酒花: 'Hops Starter', 葡萄: 'Grape Starter',
  蔓越莓: 'Cranberry Seeds', 茄子: 'Eggplant Seeds', 洋蓟: 'Artichoke Seeds', 芋头: 'Taro Tuber',
  杨桃: 'Starfruit Seeds', 咖啡: 'Coffee Bean', 向日葵: 'Sunflower Seeds', 郁金香: 'Tulip Bulb',
  萝卜: 'Radish Seeds', 红叶卷心菜: 'Red Cabbage Seeds', 苋菜: 'Amaranth Seeds', 芜菁: 'Bok Choy Seeds',
  山药: 'Yam Seeds', 仙人掌: 'Cactus Seeds',
};
export function resolveSeed(word) {
  if (!word) return null;
  const w = String(word).trim();
  if (/Seeds$|Starter$|Tuber$|Shoot$|Bean$/i.test(w)) return w;
  for (const [k, v] of Object.entries(SEEDS)) if (w.includes(k)) return v;
  return null;
}
export function seedCN(seedName) {
  for (const [k, v] of Object.entries(SEEDS)) if (v === seedName) return k;
  return String(seedName).replace(/\s*Seeds$/i, '');
}

// ============ 指令解析(她说一句话, 翻译成动作) ============
// 顺序很重要: 先具体后笼统
export function parseCmd(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return { op: 'help' };
  if (/帮助|怎么用|help|命令/.test(c)) return { op: 'help' };
  if (/世界|哪边是海|怎么走|方位/.test(c)) return { op: 'world' };
  if (/农场怎么样|全农场|田里怎么样|多少株|浇了多少/.test(c)) return { op: 'farm' };
  if (/卡床|赖床|起不来|没天亮|睡过头|天亮不了/.test(c)) return { op: 'breakloop' };
  if (/催熟|强行熟|直接熟/.test(c)) return { op: 'ripen' };
  if (/地图|画个图/.test(c)) return { op: 'map' };
  if (/水壶|还有多少水|剩多少水/.test(c)) return { op: 'watercan' };
  if (/^(看看|状态|我在哪|情况)|看看周围|怎么回事/.test(c)) return { op: 'see' };
  if (/该干嘛|干嘛|不知道做什么|做什么好|无聊/.test(c)) return { op: 'todo' };
  if (/^(收|收割|收菜|摘)/.test(c)) return { op: 'harvest' };
  if (/浇/.test(c)) return { op: 'water' };
  if (/打水|装水|补水/.test(c)) return { op: 'refill' };
  if (/锄地|翻地|锄一下/.test(c)) return { op: 'till' };
  const plant = c.match(/种\s*([^\s,，。]+)/);
  if (plant) return { op: 'plant', raw: plant[1], seed: resolveSeed(plant[1]) || null };
  const go = c.match(/^(?:去|到|回|走到|带我去)\s*([^\s,，。]*)/);
  if (go) return { op: 'goto', to: go[1] };
  if (/睡|上床/.test(c)) return { op: 'sleep' };
  return { op: 'unknown', raw: c };
}

// ============ 建议清单(她不知道干嘛时) ============
export function todoList(s, tiles) {
  const out = [];
  const p = s.player || {};
  const t = s.time || {};
  const hm = Number(t.timeOfDay || 0);
  const crops = (tiles || []).filter((z) => z.crop);
  const ready = crops.filter((z) => z.harvestable === true || Number(z.cropPhase) >= 4).length;
  const dry = crops.filter((z) => z.crop && z.watered === false).length;
  const can = (s.inventory || []).find((i) => /Watering Can/i.test(i.name || ''));
  const slots = (s.inventory || []).filter((i) => i.name).length;
  if (ready) out.push(`收菜: 附近有 ${ready} 格熟了 → 说"收菜", 我一次帮你收`);
  if (dry) out.push(`浇水: ${dry} 格还干着 → 说"浇水"`);
  if (can && can.waterLeft <= 5) out.push('打水: 水壶快空了 → 站到水边, 说"打水"');
  if (hm >= 2100) out.push('回家: 21:30 后回自己小屋(守卫会自动让你上床)');
  if (p.stamina < 60) out.push(`体力只剩 ${Math.round(p.stamina)}, 别跑远/别下矿`);
  if (slots >= 11) out.push('背包快满了(11-12格): 别捡东西了, 先回家存箱');
  out.push('想认识人: 说"去镇子"逛一圈, 看到村民可以送礼');
  out.push('没别的事就去农场西南角捡野果(做收集包用), 或者回来跟我说说话');
  return out.slice(0, 5);
}