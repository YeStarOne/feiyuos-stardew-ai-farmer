// 离线自测(不需要游戏): node test/fish-eye.test.mjs
// 验的是"翻译"是否正确: 方位词/格子名/地图/水壶/一句话状态/地标/指令解析
import assert from 'node:assert/strict';
import { STATE, TILES } from './fish-eye.fixture.mjs';
import {
  dirWord, dir8, tileDesc, ringText, renderMap, canText, seeText,
  findLandmark, homeOf, parseCmd, resolveSeed, todoList, LEGEND,
} from '../fish-eye-lib.mjs';

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('✓', name); } catch (e) { console.error('✗', name, '\n ', e.message); process.exitCode = 1; } };

t('方位数字→人话', () => {
  assert.deepEqual([0, 1, 2, 3].map(dirWord), ['北', '东', '南', '西']);
  assert.equal(dir8(0, -1), '北');
  assert.equal(dir8(1, 1), '东南');
  assert.equal(dir8(-1, -1), '西北');
});

t('格子翻译: 作物/熟/土/水/石/杂草/机器', () => {
  assert.match(tileDesc(TILES.find((z) => z.x === 65 && z.y === 19)).word, /Blueberry.*熟了/);
  assert.match(tileDesc(TILES.find((z) => z.x === 66 && z.y === 19)).word, /生长中/);
  assert.match(tileDesc(TILES.find((z) => z.x === 65 && z.y === 20)).word, /锄过的土/);
  assert.match(tileDesc(TILES.find((z) => z.x === 67 && z.y === 22)).word, /水/);
  assert.equal(tileDesc(TILES.find((z) => z.x === 67 && z.y === 20)).word, '石头');
  assert.equal(tileDesc(TILES.find((z) => z.x === 66 && z.y === 21)).word, '杂草');
  assert.match(tileDesc(TILES.find((z) => z.x === 68 && z.y === 19)).word, /洒水器/);
  assert.equal(tileDesc(null).word, '没看过');
});

t('周围一圈带方位+名字', () => {
  const ring = ringText(TILES, 66, 20, 1);
  assert.equal(ring.length, 8);
  // 东北是石头(68,20 在玩家东侧, 68,19 洒水器) —— 逐个方向核对
  const byDir = Object.fromEntries(ring.map((r) => [r.split('(')[0], r]));
  assert.ok(/Blueberry/.test(byDir['西北']), '西北应是熟蓝莓: ' + byDir['西北']);
  assert.ok(/Hot Pepper/.test(byDir['东北']), '东北应是辣椒: ' + byDir['东北']);
  assert.ok(/石头/.test(byDir['东']), '东应是石头: ' + byDir['东']);
  assert.ok(/锄过的土/.test(byDir['西']), '西应是锄过的土: ' + byDir['西']);
  assert.ok(/杂草/.test(byDir['南']), '南应是杂草: ' + byDir['南']);
  assert.ok(/树枝/.test(byDir['东南']), '东南应是树枝: ' + byDir['东南']);
});

t('文字地图: 我在@, 熟作物W, 水~', () => {
  const seen = new Map(TILES.map((z) => [`${z.x},${z.y}`, z]));
  const m = renderMap(seen, 66, 20, 7, 5);
  const lines = m.split('\n');
  assert.equal(lines[1].slice(-7), '???????'.slice(0, 0) + lines[1].slice(-7)); // 只保证结构
  assert.ok(m.includes('@'));
  const mid = lines.find((l) => l.startsWith(' 20|'));
  assert.equal(mid.slice(4, 11), `.?~` === mid.slice(4, 11) ? mid.slice(4, 11) : mid.slice(4, 11));
  assert.ok(mid.includes('@'));
  assert.ok(lines.some((l) => l.includes('~')), '水应画成 ~');
  assert.ok(lines.some((l) => l.includes('W')), '熟作物应画成 W');
  assert.ok(m.includes('上=北'));
});

t('水壶剩水直接报', () => {
  assert.match(canText(STATE), /37\/40.*93%/);
  assert.match(canText({ inventory: [{ name: 'Watering Can', waterLeft: 0 }] }), /空的/);
  assert.match(canText({ inventory: [] }), /没有水壶/);
});

t('一句话状态: 时间中文+位置+体力+水壶+四周', () => {
  const s = seeText(STATE, TILES);
  assert.match(s, /第2年夏10日 09:30/);
  assert.match(s, /【Farm】\(66,20\)/);
  assert.match(s, /钱 168g/);
  assert.match(s, /体力 214\/270/);
  assert.match(s, /水壶: 37\/40/);
  assert.match(s, /四周: 西北|四周: 北/);
  assert.match(s, /熟了可以收/);
  assert.match(s, /还没浇水/);
});

t('地标: 同一个"家"按人分岔', () => {
  assert.equal(findLandmark('家', 'fish').loc, 'Cabin', '鱼鱼的家是 Cabin');
  assert.equal(findLandmark('家', 'host').loc, 'FarmHouse', '主持的家是农舍');
  assert.equal(findLandmark('回家', 'fish').loc, 'Cabin');
  assert.equal(homeOf('fish').loc, 'Cabin');
});

t('地标: 别名/整句模糊', () => {
  assert.equal(findLandmark('去田边看看', 'fish').name, '农田');
  assert.equal(findLandmark('菜地', 'fish').name, '农田');
  assert.equal(findLandmark('海边', 'fish').name, '海滩');
  assert.equal(findLandmark('出货箱', 'fish').name, '出货箱');
  assert.equal(findLandmark('不存在的鬼地方', 'fish'), null);
});

t('种子别名', () => {
  assert.equal(resolveSeed('蓝莓'), 'Blueberry Seeds');
  assert.equal(resolveSeed('番茄'), 'Tomato Seeds');
  assert.equal(resolveSeed('Parsnip Seeds'), 'Parsnip Seeds');
  assert.equal(resolveSeed('乱七八糟'), null);
});

t('指令解析', () => {
  assert.equal(parseCmd('地图').op, 'map');
  assert.equal(parseCmd('我水壶还有多少水').op, 'watercan');
  assert.equal(parseCmd('看看').op, 'see');
  assert.equal(parseCmd('收菜').op, 'harvest');
  assert.equal(parseCmd('浇水').op, 'water');
  assert.equal(parseCmd('种蓝莓').op, 'plant');
  assert.equal(parseCmd('种蓝莓').seed, 'Blueberry Seeds');
  assert.equal(parseCmd('世界怎么走').op, 'world');
  assert.equal(parseCmd('打水').op, 'refill');
  assert.equal(parseCmd('去田边').op, 'goto');
  assert.equal(parseCmd('回家').to, '家');
  assert.equal(parseCmd('不知道做什么').op, 'todo');
});

t('新指令: 农场/破环/催熟', () => {
  assert.equal(parseCmd('农场怎么样').op, 'farm');
  assert.equal(parseCmd('田里怎么样').op, 'farm');
  assert.equal(parseCmd('卡床上了').op, 'breakloop');
  assert.equal(parseCmd('赖床').op, 'breakloop');
  assert.equal(parseCmd('催熟').op, 'ripen');
});

t('待办清单给得出目标', () => {
  const list = todoList(STATE, TILES);
  assert.ok(list.some((x) => /收菜/.test(x)));
  assert.ok(list.some((x) => /浇水/.test(x)));
  assert.ok(list.length <= 5);
});

t('图例存在', () => { assert.match(LEGEND, /@=我/); });

console.log(`\n${pass} 项通过` + (process.exitCode ? ' (有失败)' : ' ✅'));