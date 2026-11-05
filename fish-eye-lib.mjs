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
// ⭐2026-11-05 全量地标表: 坐标全是反编译/实测得来的, 不再"猜"
//   · 商店的 x,y = 店里的落点(从门的 LockedDoorWarp 里读到的, 一进门就站这儿)
//     door = 外面那扇门的位置+营业时间(同一份数据), door.loc 是门所在的地图
//   · 家的 building = 农场建筑左上角, 交给 /warp_building 精准进屋(两间 Cabin 同名, 只能靠坐标分辨)
//   · cat: home 家 / field 农活 / shop 商店 / service 服务 / gate 通道 / place 景点 / npc 住家
export const LANDMARKS = [
  // ==================== 家 ====================
  { name: '小鱼的家', alias: ['家', '回家', '我的家', '我的小屋', '小屋', '我的床', '床', '睡觉的地方', '回屋', '自己家'], who: 'fish',
    loc: 'Cabin', x: 9, y: 8, building: { bx: 50, by: 14 }, door: { loc: 'Farm', x: 52, y: 15 }, cat: 'home', mark: 'H',
    note: '床在(9,8); 门口在农场(52,15)' },
  { name: '家', alias: ['家', '回家', '我的床', '睡觉的地方', '床', '回屋'], who: 'host',
    loc: 'FarmHouse', x: 9, y: 9, building: { bx: 59, by: 12 }, door: { loc: 'Farm', x: 64, y: 14 }, cat: 'home', mark: 'H' },
  { name: '农舍门口', alias: ['门口', '出门', '农场门口'], loc: 'Farm', x: 64, y: 15, cat: 'home', mark: 'H' },
  { name: '屋里柜子', alias: ['柜子', '木箱'], who: 'host', loc: 'FarmHouse', x: 3, y: 11, cat: 'home' },
  // ==================== 农场 ====================
  { name: '农田', alias: ['田', '田边', '菜地', '田里', '农场', '地里'], loc: 'Farm', x: 66, y: 20, cat: 'field', mark: 'F' },
  { name: '出货箱', alias: ['杂货箱', '卖东西的地方', '卖东西', '出货'], loc: 'Farm', x: 72, y: 14, stand: [72, 15], cat: 'service', mark: 'B' },
  { name: '温室', alias: ['大棚', '玻璃房'], loc: 'Greenhouse', x: 10, y: 24, building: { bx: 25, by: 10 }, door: { loc: 'Farm', x: 28, y: 15 }, cat: 'field', mark: 'G' },
  { name: '农场南门', alias: ['南边', '农场南边', '去森林', '森林入口'], loc: 'Farm', x: 40, y: 64, cat: 'gate', mark: 'E', note: '走出去是森林' },
  { name: '农场北门', alias: ['北边', '农场北边', '后山', '上山'], loc: 'Farm', x: 40, y: 1, cat: 'gate', mark: 'E', note: '走出去是后山/山里' },
  { name: '农场东门', alias: ['东边', '农场东边', '去公交站'], loc: 'Farm', x: 79, y: 16, cat: 'gate', mark: 'E', note: '走出去是公交站' },
  // ==================== 镇子 ====================
  { name: '镇中心', alias: ['镇上', '镇子', '广场', '村里', '去镇上', '镇中心广场'], loc: 'Town', x: 50, y: 57, cat: 'place', mark: 'D' },
  { name: '皮埃尔的杂货店', alias: ['杂货店', '种子店', '皮埃尔', '买种子', '种子', '肥料', '背包', '小卖部'], loc: 'SeedShop', x: 6, y: 29,
    door: { loc: 'Town', x: 43, y: 56, hours: [900, 2100] }, cat: 'shop', mark: 'S', note: '柜台(5,18): 卖种子/肥料, 还能升级背包; 店里有阳光房(32,3)' },
  { name: '哈维诊所', alias: ['诊所', '医院', '医生', '哈维', '看病', '买药'], loc: 'Hospital', x: 10, y: 19,
    door: { loc: 'Town', x: 36, y: 55, hours: [900, 1500] }, cat: 'shop', mark: 'S', note: '柜台(6,16): 卖药和能量补剂' },
  { name: '星之果实酒吧', alias: ['酒吧', '酒馆', '格斯', '吃饭', '买酒', '餐厅'], loc: 'Saloon', x: 14, y: 24,
    door: { loc: 'Town', x: 45, y: 70, hours: [1200, 2400] }, cat: 'shop', mark: 'S', note: '柜台(10,19): 买吃的/配方; 中午12点才开门' },
  { name: '铁匠铺', alias: ['铁匠', '克林特', '升级工具', '敲晶石', '砸矿', '买矿石'], loc: 'Blacksmith', x: 5, y: 19,
    door: { loc: 'Town', x: 94, y: 81, hours: [900, 1600] }, cat: 'shop', mark: 'S', note: '柜台(3,14): 升级工具/砸晶石/买煤和矿石' },
  { name: '博物馆', alias: ['图书馆', '博物馆', '冈瑟', '捐东西', '捐献', '图书'], loc: 'ArchaeologyHouse', x: 3, y: 14,
    door: { loc: 'Town', x: 101, y: 89, hours: [800, 1800] }, cat: 'shop', mark: 'S', note: '冈瑟(3,9)/捐赠箱(6,9): 交矿物和古物' },
  { name: '艾米丽家(裁缝)', alias: ['裁缝铺', '裁缝', '艾米丽', '艾米丽家', '做衣服', '缝纫机', '改衣服', '布料'], loc: 'HaleyHouse', x: 2, y: 24,
    door: { loc: 'Town', x: 20, y: 88, hours: [900, 2000] }, cat: 'service', mark: 'S', note: '裁缝机在(12,23): 拿布料+衣服/物件去改; 海莉和艾米丽住这儿' },
  { name: '山姆家', alias: ['山姆', '山姆家', '文森特'], loc: 'SamHouse', x: 4, y: 23,
    door: { loc: 'Town', x: 10, y: 85, hours: [900, 2000] }, cat: 'npc' },
  { name: '亚历克斯家', alias: ['亚历克斯', '阿历克斯', '乔希家'], loc: 'JoshHouse', x: 9, y: 24,
    door: { loc: 'Town', x: 57, y: 63, hours: [800, 2000] }, cat: 'npc' },
  { name: '镇长家', alias: ['镇长', '刘易斯', '刘易斯家', '领奖'], loc: 'ManorHouse', x: 4, y: 11,
    door: { loc: 'Town', x: 58, y: 85, hours: [830, 2200] }, cat: 'service', note: '领奖机(1,5): 交任务奖励; 失物招领(4,5)' },
  { name: '潘妮家', alias: ['潘妮', '拖车', '潘姆'], loc: 'Trailer', x: 12, y: 9,
    door: { loc: 'Town', x: 72, y: 68, hours: [900, 2000] }, cat: 'npc' },
  { name: 'Joja超市', alias: ['joja', 'Joja', '乔家', '超市', '乔佳超市'], loc: 'JojaMart', x: 13, y: 29,
    door: { loc: 'Town', x: 95, y: 50, hours: [900, 2300] }, cat: 'shop', note: '柜台(10,24); 里面还能办Joja会员' },
  { name: '社区中心', alias: ['社区', '献祭', '收集包', '社区中心'], loc: 'CommunityCenter', x: 32, y: 23,
    door: { loc: 'Town', x: 53, y: 19 }, cat: 'service', note: '交收集包的地方; 门在镇子北边(53,19)' },
  { name: '下水道', alias: ['下水道', '科罗布斯', '小黑'], loc: 'Sewer', x: 16, y: 11,
    door: { loc: 'Town', x: 34, y: 95 }, cat: 'shop', note: '入口在镇子南边井盖(34,95); 科罗布斯卖东西(需先拿生锈钥匙)' },
  { name: '镇子南门(海滩)', alias: ['海滩入口', '去海滩', '南门'], loc: 'Town', x: 54, y: 108, cat: 'gate', mark: 'E', note: '走出去是海滩' },
  { name: '镇子西门(公交站)', alias: ['镇子西门', '去公交站'], loc: 'Town', x: 1, y: 54, cat: 'gate', mark: 'E', note: '走出去是公交站' },
  { name: '镇子北门(山里)', alias: ['镇子北门', '去山里'], loc: 'Town', x: 80, y: 1, cat: 'gate', mark: 'E', note: '走出去是山里' },
  { name: '镇子西南(森林)', alias: ['镇子西南门', '去森林'], loc: 'Town', x: 1, y: 90, cat: 'gate', mark: 'E', note: '走出去是森林' },
  // ==================== 山里 ====================
  { name: '山里', alias: ['山', '山区', '山脚', '去山里'], loc: 'Mountain', x: 30, y: 30, cat: 'place', mark: 'D' },
  { name: '罗宾木匠铺', alias: ['木匠', '木匠铺', '罗宾', '建房子', '升级房子', '买家具', '造建筑'], loc: 'ScienceHouse', x: 6, y: 24,
    door: { loc: 'Mountain', x: 12, y: 25, hours: [900, 2000] }, cat: 'shop', note: '柜台(8,19): 建建筑/升级房子/买家具; 隔壁门(8,20)是玛鲁房间' },
  { name: '探险家公会', alias: ['公会', '探险家', '马龙', '买武器', '打怪', '冒险者公会'], loc: 'AdventureGuild', x: 6, y: 19,
    door: { loc: 'Mountain', x: 76, y: 8, hours: [1400, 2600] }, cat: 'shop', note: '下午2点才开门; 卖武器/戒指, 还能找回死掉丢的东西' },
  { name: '矿洞', alias: ['矿洞', '矿井', '下矿', '矿洞口', 'mine'], loc: 'Mine', x: 18, y: 13,
    door: { loc: 'Mountain', x: 54, y: 4 }, cat: 'place', mark: 'M', note: '电梯在(17,3); 越往下越危险, 记得带吃的' },
  { name: '莱纳斯帐篷', alias: ['莱纳斯', '帐篷', '流浪汉'], loc: 'Tent', x: 2, y: 5,
    door: { loc: 'Mountain', x: 29, y: 6 }, cat: 'npc' },
  { name: '温泉', alias: ['温泉', '浴场', '泡澡', '回体力', '澡堂'], loc: 'BathHouse_Entry', x: 5, y: 9,
    door: { loc: 'Railroad', x: 10, y: 56 }, cat: 'service', note: '泡温泉能免费回体力(男女更衣室各一边)' },
  { name: '山顶', alias: ['山顶', 'summit'], loc: 'Summit', x: 10, y: 29, door: { loc: 'Railroad', x: 33, y: 0 }, cat: 'place' },
  // ==================== 森林 ====================
  { name: '森林', alias: ['森林', '林子', '南森林', '去森林'], loc: 'Forest', x: 56, y: 82, cat: 'place', mark: 'D' },
  { name: '玛妮牧场', alias: ['牧场', '玛妮', '买动物', '买鸡', '买牛', '买干草', '动物店'], loc: 'AnimalShop', x: 13, y: 19,
    door: { loc: 'Forest', x: 90, y: 15, hours: [900, 1800] }, cat: 'shop', note: '柜台(12,15): 买动物/干草/挤奶器' },
  { name: '巫师塔', alias: ['巫师', '法师', '巫师塔', '魔法', 'rasmodius'], loc: 'WizardHouse', x: 8, y: 24,
    door: { loc: 'Forest', x: 5, y: 26, hours: [600, 2300] }, cat: 'service', note: '魔法书(2,13): 后期能改名字/买魔法建筑' },
  { name: '莉亚家', alias: ['莉亚', '莉亚家', '雕塑'], loc: 'LeahHouse', x: 7, y: 9,
    door: { loc: 'Forest', x: 104, y: 32, hours: [1000, 1800] }, cat: 'npc' },
  { name: '秘密森林', alias: ['秘密森林', '深林', '老林', '硬木'], loc: 'Woods', x: 59, y: 15, door: { loc: 'Forest', x: 0, y: 7 }, cat: 'place', note: '里面有大树桩(硬木)和 Old Master 雕像; 入口在森林最西边' },
  { name: '专精洞', alias: ['专精', '专精洞', '大师'], loc: 'MasteryCave', x: 5, y: 8, door: { loc: 'Forest', x: 101, y: 72 }, cat: 'service', note: '五项技能全满后解锁' },
  // ==================== 海滩 ====================
  { name: '海滩', alias: ['海边', '沙滩', '海', '去海边'], loc: 'Beach', x: 44, y: 35, cat: 'place', mark: 'D' },
  { name: '威利鱼店', alias: ['鱼店', '威利', '买鱼竿', '买鱼饵', '卖鱼'], loc: 'FishShop', x: 5, y: 9,
    door: { loc: 'Beach', x: 30, y: 33, hours: [900, 1700] }, cat: 'shop', note: '柜台(5,5): 卖鱼竿/鱼饵/蟹笼; 船坞(4,3)通鱼市场' },
  { name: '艾利欧特家', alias: ['艾利欧特', '作家', '海边小屋'], loc: 'ElliottHouse', x: 3, y: 9,
    door: { loc: 'Beach', x: 49, y: 10, hours: [1000, 1800] }, cat: 'npc' },
  // ==================== 公交站/后山/铁路/沙漠 ====================
  { name: '公交站', alias: ['车站', '公交站', 'bus', '巴士站'], loc: 'BusStop', x: 42, y: 23, cat: 'place', mark: 'D' },
  { name: '去沙漠的巴士', alias: ['巴士', '去沙漠', '沙漠巴士'], loc: 'BusStop', x: 22, y: 8, cat: 'gate', note: '巴士修好后能去沙漠(要买票)' },
  { name: '后山', alias: ['后山', '后山小路'], loc: 'Backwoods', x: 14, y: 39, cat: 'place' },
  { name: '隧道', alias: ['隧道', '地下通道'], loc: 'Tunnel', x: 39, y: 9, door: { loc: 'Backwoods', x: 22, y: 30 }, cat: 'place' },
  { name: '铁路', alias: ['铁路', '火车站'], loc: 'Railroad', x: 29, y: 60, cat: 'place' },
  { name: '沙漠', alias: ['沙漠', '沙地', '绿洲'], loc: 'Desert', x: 18, y: 27, cat: 'place', mark: 'D' },
  { name: '桑迪家', alias: ['桑迪', '绿洲商店', '沙漠商店'], loc: 'SandyHouse', x: 4, y: 9,
    door: { loc: 'Desert', x: 6, y: 51, hours: [900, 2350] }, cat: 'shop', note: '沙漠的种子店(桑迪看店)' },
  { name: '骷髅洞', alias: ['骷髅洞', '沙漠矿洞', '骷髅钥匙'], loc: 'SkullCave', x: 7, y: 8,
    door: { loc: 'Desert', x: 8, y: 5 }, cat: 'place' },
  // ==================== 店内柜台(进店后直接走过去) ====================
  { name: '皮埃尔柜台', alias: ['买种子的地方', '杂货柜台'], loc: 'SeedShop', x: 5, y: 18, cat: 'spot' },
  { name: '裁缝机', alias: ['缝纫机', '改衣服的地方'], loc: 'HaleyHouse', x: 13, y: 23, cat: 'spot' },
  { name: '铁匠柜台', alias: ['砸晶石的地方', '升级工具的地方'], loc: 'Blacksmith', x: 3, y: 14, cat: 'spot' },
  { name: '酒吧柜台', alias: ['点菜', '买吃的地方'], loc: 'Saloon', x: 10, y: 19, cat: 'spot' },
  { name: '诊所柜台', alias: ['买药的地方'], loc: 'Hospital', x: 6, y: 16, cat: 'spot' },
  { name: '博物馆柜台', alias: ['捐东西的地方', '冈瑟柜台'], loc: 'ArchaeologyHouse', x: 3, y: 9, cat: 'spot' },
  { name: '木匠柜台', alias: ['建房子的地方'], loc: 'ScienceHouse', x: 8, y: 19, cat: 'spot' },
  { name: '牧场柜台', alias: ['买动物的柜台'], loc: 'AnimalShop', x: 12, y: 15, cat: 'spot' },
  { name: '鱼店柜台', alias: ['买鱼竿的地方'], loc: 'FishShop', x: 5, y: 5, cat: 'spot' },
  { name: 'Joja柜台', alias: ['joja买东西'], loc: 'JojaMart', x: 10, y: 24, cat: 'spot' },
  { name: '巫师魔法书', alias: ['魔法书', '巫师书'], loc: 'WizardHouse', x: 2, y: 13, cat: 'spot' },
];

// 地图英文名 → 人话(她问"地图 XX"时, XX 可能是地图也可能是地标)
export const MAP_CN = {
  Farm: '农场', FarmHouse: '农舍', Cabin: '小屋', Greenhouse: '温室', Cellar: '地窖',
  Town: '镇子', Beach: '海滩', Forest: '森林', Mountain: '山里', BusStop: '公交站',
  Backwoods: '后山', Railroad: '铁路', Desert: '沙漠', Woods: '秘密森林', Tunnel: '隧道',
  Mine: '矿洞', SkullCave: '骷髅洞', Sewer: '下水道', CommunityCenter: '社区中心',
  SeedShop: '皮埃尔杂货店', Blacksmith: '铁匠铺', Hospital: '诊所', Saloon: '酒吧',
  ArchaeologyHouse: '博物馆', HaleyHouse: '艾米丽家', SamHouse: '山姆家', JoshHouse: '亚历克斯家',
  ManorHouse: '镇长家', Trailer: '潘妮家', JojaMart: 'Joja超市', ScienceHouse: '木匠铺',
  AdventureGuild: '探险家公会', AnimalShop: '玛妮牧场', WizardHouse: '巫师塔', LeahHouse: '莉亚家',
  FishShop: '威利鱼店', ElliottHouse: '艾利欧特家', SandyHouse: '桑迪家', Tent: '莱纳斯帐篷',
  BathHouse_Entry: '温泉', Summit: '山顶', MasteryCave: '专精洞', MovieTheater: '电影院',
  BoatTunnel: '船坞', Sunroom: '阳光房', Quarry: '采石场', HatShop: '帽子店',
};
export const mapCN = (loc) => MAP_CN[loc] || loc || '?';

export function findLandmark(word, who = 'fish') {
  if (!word) return null;
  const w = String(word).trim();
  const hit = (l) => l.name === w || (l.alias || []).includes(w);
  // 模糊: 名字更长的优先(不然"裁缝"会先撞上"裁缝机")
  const fuzzyHit = (l) => (l.alias || []).some((a) => w.includes(a)) || w.includes(l.name);
  const own = LANDMARKS.filter((l) => !l.who || l.who === who);
  const others = LANDMARKS.filter((l) => l.who && l.who !== who);
  for (const pool of [own, others]) {
    const me = pool.find(hit);
    if (me) return me;
  }
  const cands = [...own, ...others].filter(fuzzyHit);
  if (cands.length) {
    // 同分时取 alias 命中最长的那个(更具体)
    const score = (l) => Math.max(...(l.alias || []).filter((a) => w.includes(a)).map((a) => a.length), l.name.length);
    return cands.sort((a, b) => score(b) - score(a))[0];
  }
  return null;
}
export const homeOf = (who) => findLandmark('家', who);

// ============ 营业时间 ============
export function hoursText(h) {
  if (!h || !h.length) return '';
  const t = (v) => `${Math.floor(v / 100)}:${String(v % 100).padStart(2, '0')}`;
  const close = h[1] >= 2400 ? '24:00' : (h[1] > 2400 ? `${Math.floor((h[1] - 2400) / 100)}:${String((h[1] - 2400) % 100).padStart(2, '0')}(次日)` : t(h[1]));
  return `${t(h[0])}-${close}`;
}
export function openNow(h, timeOfDay) {
  if (!h || !h.length) return null;
  let t = Number(timeOfDay || 0);
  if (t < 600) t += 2400; // 凌晨算前一天营业时间(酒吧 12:00-24:00)
  const [o, c] = h;
  if (c >= 2400) return t >= o || t < (c - 2400);
  return t >= o && t < c;
}

// 一张图里的地标(按类别排序, 给"地图 XX"列表用)
export function placesInMap(loc, who = 'fish') {
  const order = { home: 0, gate: 1, field: 2, shop: 3, service: 4, place: 5, npc: 6, spot: 7 };
  const list = LANDMARKS.filter((l) => l.loc === loc && (!l.who || l.who === who));
  return list.sort((a, b) => (order[a.cat] ?? 9) - (order[b.cat] ?? 9) || a.name.localeCompare(b.name));
}
// 地标的一句话介绍(含门的位置/营业时间)
export function placeLine(l, timeOfDay) {
  const bits = [];
  if (l.door) {
    const h = hoursText(l.door.hours);
    const open = openNow(l.door.hours, timeOfDay);
    bits.push(`门在${mapCN(l.door.loc)}(${l.door.x},${l.door.y})${h ? ` 营业${h}${open === false ? ' ⚠️现在关着' : ''}` : ''}`);
  }
  if (l.note) bits.push(l.note);
  return `${l.name} (${l.loc} ${l.x},${l.y})${bits.length ? ' — ' + bits.join('; ') : ''}`;
}

// ============ 世界方位(她的"哪边是海"用这张表) ============
export const WORLD = `世界怎么走(整张地图的路, 全是从游戏传送表读出来的):
  农场: 西/东? → 东边(80,16)出去=公交站; 南边(40,65)=森林; 北边(40,0)=后山
  公交站: 东边(44,23)出去=镇子; 巴士(22,8)=沙漠(修好巴士才能坐)
  镇子: 西边(0,54)=公交站; 北边(80,0)=山里; 南边(54,108)=海滩; 西南(0,90)=森林
  山里: 南边(15,41)=镇子; 北边(9,0)=铁路; 西边(0,13)=后山; (54,4)=矿洞
  森林: 东边(120,25)=镇子; 北边(68,0)=农场; 最西边(0,7)=秘密森林
  海滩: 北边(39,0)=镇子
  一句话: 家在北, 田在南, 箱在东; 海在最南(海滩), 矿在北边山里, 裁缝/商店都在镇子`;

// ============ 点名的别名(直接说地图/区域名也能认) ============
export const AREA_ALIAS = {
  农场: 'Farm', 农舍: 'FarmHouse', 家里: 'FarmHouse', 温室: 'Greenhouse',
  镇子: 'Town', 镇上: 'Town', 村子: 'Town', 小镇: 'Town',
  海滩: 'Beach', 海边: 'Beach', 沙滩: 'Beach',
  森林: 'Forest', 林子: 'Forest',
  山里: 'Mountain', 山区: 'Mountain', 山上: 'Mountain',
  公交站: 'BusStop', 车站: 'BusStop',
  后山: 'Backwoods', 铁路: 'Railroad', 火车站: 'Railroad',
  沙漠: 'Desert', 秘密森林: 'Woods', 下水道: 'Sewer', 矿洞: 'Mine', 矿井: 'Mine',
};

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
  // ⭐2026-11-05 地图带地点: "地图 镇上"/"地图 裁缝铺"/"裁缝铺在哪" 都要能答
  const mp = c.match(/^(?:地图|画个图|看看地图)\s*(.*)$/);
  if (mp) return { op: 'map', to: mp[1].trim() };
  if (/^(?:出去|怎么出去|出去怎么走|带我出去|离开这里)$/.test(c)) return { op: 'leave' };
  const whereQ = c.match(/^(?:怎么去|怎么走到|怎样去|去哪里是|在哪|哪儿是)\s*(.+)$/);
  if (whereQ) return { op: 'goto', to: whereQ[1].trim() };
  const whereS = c.match(/^([^\s,，。]+?)(在哪|在哪里|怎么走|怎么去|在什么地方)$/);
  if (whereS) return { op: 'goto', to: whereS[1] };
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