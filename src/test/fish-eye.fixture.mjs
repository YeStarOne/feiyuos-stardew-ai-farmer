// fixture: 假 /state 与 /surroundings (字段名照 NagiBridgeRemix DLL 实扒, 保证与真桥同构)
// 场景: 夏季第10日 09:30, 主持站在主田边(66,20), 四周有: 蓝莓熟/辣椒生长/锄过的土/干土/洒水器/石头/杂草/水
export const STATE = {
  worldReady: true,
  location: { name: 'Farm', x: 66, y: 20 },
  player: {
    name: '肥鱼', money: 168, stamina: 214, maxStamina: 270, health: 100, maxHealth: 110,
    x: 66, y: 20, isInBed: false, facingDirection: 2,
  },
  time: { year: 2, season: 'summer', dayOfMonth: 10, timeOfDay: 930 },
  inventory: [
    { name: 'Axe', stack: 1, waterLeft: null },
    { name: 'Watering Can', stack: 1, waterLeft: 37 },
    { name: 'Hoe', stack: 1 },
    { name: 'Pickaxe', stack: 1 },
    { name: 'Scythe', stack: 1 },
    { name: 'Blueberry Seeds', stack: 8 },
    { name: 'Hot Pepper', stack: 3, value: 40 },
    { name: 'Geode', stack: 1 },
  ],
  heldItem: { name: 'Blueberry Seeds' },
  activeMenu: null,
};

// (66,20) 周围 5x5, y 向北递减
const T = (x, y, extra) => ({ x, y, passable: true, terrain: 'Grass', object: null, ...extra });
export const TILES = [
  T(64, 18), T(65, 18), T(66, 18), T(67, 18), T(68, 18),
  // y=19 北侧一排: 西北=熟蓝莓 / 北=蓝莓苗 / 东北=没浇水的辣椒 / 洒水器
  T(64, 19), T(65, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Blueberry', cropPhase: 4, harvestable: true }),
  T(66, 19, { terrain: 'HoeDirt', watered: true, crop: true, cropName: 'Blueberry', cropPhase: 2, harvestable: false }),
  T(67, 19, { terrain: 'HoeDirt', watered: false, crop: true, cropName: 'Hot Pepper', cropPhase: 3, harvestable: false }),
  T(68, 19, { object: 'Sprinkler (Quality)' }),
  // y=20 本行: 西=干土 / 我(66,20) / 东=石头
  T(64, 20), T(65, 20, { terrain: 'HoeDirt', watered: false }),
  T(67, 20, { object: 'Stone', isStone: true, passable: false }),
  T(68, 20),
  // y=21 南侧: 西南=甜瓜苗 / 南=杂草 / 东南=树枝
  T(64, 21), T(65, 21, { terrain: 'HoeDirt', watered: false, crop: true, cropName: 'Melon', cropPhase: 1 }),
  T(66, 21, { isWeeds: true, passable: true }),
  T(67, 21, { isTwig: true }),
  T(68, 21),
  // 水塘在东南更远两格
  T(64, 22), T(65, 22), T(66, 22), T(67, 22, { terrain: 'Water', water_fishable: true, passable: false }), T(68, 22),
];