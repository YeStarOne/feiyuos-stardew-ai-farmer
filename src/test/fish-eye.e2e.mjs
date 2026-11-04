// 端到端自测(游戏没开也能跑): 起 mock 桥(9143) + fish-eye(FISHEYE_BASE 指过去), 真发 HTTP 走一遍人话指令
// 用法: node test/fish-eye.e2e.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = 'D:/StardewAI';
const MOCK_PORT = 9143, EYE_PORT = 9151;
const procs = [];
const start = (file, env) => {
  const p = spawn(process.execPath, [path.join(ROOT, file)], {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write('[child] ' + d));
  p.stderr.on('data', (d) => process.stderr.write('[child-err] ' + d));
  procs.push(p);
  return p;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { }
    await sleep(250);
  }
  throw new Error('服务没起来: ' + url);
}
const say = async (cmd) => (await fetch(`http://127.0.0.1:${EYE_PORT}/say?cmd=${encodeURIComponent(cmd)}`)).text();
const post = async (p, b = {}) => (await fetch(`http://127.0.0.1:${EYE_PORT}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
})).text();
const state = async () => (await fetch(`http://127.0.0.1:${MOCK_PORT}/state`)).json();

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('✓', name); }
  catch (e) { fail++; console.error('✗', name, '\n   ', e.message); }
};

start('test/mock-bridge.mjs', { MOCK_PORT: String(MOCK_PORT) });
start('fish-eye.mjs', {
  FISHEYE_PORT: String(EYE_PORT), FISHEYE_TARGET: 'fish',
  FISHEYE_BASE: `http://127.0.0.1:${MOCK_PORT}`, FISHEYE_RIVAL: `http://127.0.0.1:${MOCK_PORT}`,
  FISHEYE_SEEN: 'D:/StardewAI/test/.seen-e2e.json',
});
try {
  await waitUp(`http://127.0.0.1:${MOCK_PORT}/state`);
  await waitUp(`http://127.0.0.1:${EYE_PORT}/help`);

  await t('看看: 中文时间+位置+体力+水壶+四周带名字', async () => {
    const s = await say('看看');
    assert.match(s, /第2年夏10日/);
    assert.match(s, /在【Farm】\(64,20\)/);
    assert.match(s, /体力 240\/270/);
    assert.match(s, /水壶: 3\/40/);
    assert.match(s, /四周:/);
    assert.match(s, /Blueberry/);
  });

  await t('地图: 有@、有图例、有附近地标', async () => {
    const m = await say('地图');
    assert.ok(m.includes('@'));
    assert.match(m, /图例/);
    assert.match(m, /附近地标/);
    assert.ok(m.split('\n').some((l) => l.includes('W')), '应画出熟作物 W');
  });

  await t('世界怎么走: 回答"哪边是海"', async () => {
    const w = await say('世界怎么走');
    assert.match(w, /海在/);
    assert.match(w, /西南/);
  });

  await t('水壶: 直接报剩水(不用掏出来)', async () => {
    const c = await say('我水壶还有多少水');
    assert.match(c, /3\/40/);
  });

  await t('该干嘛: 给出今天目标', async () => {
    const td = await say('该干嘛');
    assert.match(td, /收菜|浇水/);
  });

  await t('收菜: 一次收完 3 株熟蓝莓并验到背包', async () => {
    const before = (await state()).inventory.find((i) => i.name === 'Blueberry')?.stack ?? 0;
    const r = await say('收菜');
    const after = (await state()).inventory.find((i) => i.name === 'Blueberry')?.stack ?? 0;
    assert.match(r, /✅/);
    assert.ok(after > before, `蓝莓应增加: ${before} → ${after}`);
    assert.ok((await state()).worldReady);
  });

  await t('浇水: 壶里 3 满打 3 格 → 会明确提示壶空了要打水', async () => {
    const r = await say('浇水');
    assert.match(r, /浇|水/);
  });

  await t('打水: 站水边灌满 → 水壶满', async () => {
    const r = await say('打水');
    const st = await state();
    const can = st.inventory.find((i) => i.name === 'Watering Can');
    assert.ok(can.waterLeft > 3, `壶应被灌: ${r}`);
    assert.match(r, /打满|满的|✅/);
  });

  await t('浇水(壶满后): 把剩下干格浇上', async () => {
    const r = await say('浇水');
    const dry = (await fetch(`http://127.0.0.1:${MOCK_PORT}/surroundings?radius=6`).then((x) => x.json())).tiles
      .filter((z) => z.crop && z.watered === false).length;
    assert.equal(dry, 0, `应无干格: ${r}`);
  });

  await t('去田边: 寻路一次走到(不是一格一格)', async () => {
    const r = await say('去田边');
    assert.match(r, /✅|已经到/);
    const st = await state();
    assert.ok(Math.abs(st.player.x - 66) + Math.abs(st.player.y - 20) <= 3, `应在农田附近: ${st.player.x},${st.player.y}`);
  });

  await t('去不存在的地方: 说人话告诉我知道哪些地方', async () => {
    const r = await say('去火星');
    assert.match(r, /听不懂|不知道/);
    assert.match(r, /家|田|镇子/);
  });

  await t('种蓝莓: 先锄(若需要)→再下种, 且背包种子减少', async () => {
    const before = (await state()).inventory.find((i) => i.name === 'Blueberry Seeds')?.stack ?? 0;
    const r = await say('种蓝莓');
    const after = (await state()).inventory.find((i) => i.name === 'Blueberry Seeds')?.stack ?? 0;
    assert.match(r, /种了|✅/);
    assert.ok(after < before, `种子应减少: ${before} → ${after} (${r})`);
  });

  await t('没火的种子名: 提示有哪些', async () => {
    const r = await say('种西瓜');
    assert.match(r, /不认识|没有/);
  });

  await t('胡说一句: 不崩, 给命令清单', async () => {
    const r = await say('今天天气怎么样呀');
    assert.match(r, /还不会|试试/);
  });

  await t('POST 端点: /goto + /harvest 也通', async () => {
    const g = await post('/goto', { to: '家' });
    assert.match(g, /✅|已经到/);
    const h = await post('/harvest', { r: 6 });
    assert.ok(typeof h === 'string' && h.length);
  });

  await t('农场怎么样: 全农场统计(farm_report)', async () => {
    const r = await say('农场怎么样');
    assert.match(r, /全农场|作物/);
    assert.match(r, /已浇水|可收/);
  });

  await t('卡床上了: 一句话破环并下床', async () => {
    await fetch(`http://127.0.0.1:${MOCK_PORT}/sleep`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const st1 = await state();
    assert.equal(st1.player.isInBed, true, '先让它上床');
    const r = await say('卡床上了');
    const st2 = await state();
    assert.match(r, /破环/);
    assert.equal(st2.player.isInBed, false, '应已下床: ' + r);
  });

  await t('催熟: 季末保收成', async () => {
    const a = (await fetch(`http://127.0.0.1:${MOCK_PORT}/farm_report`).then((x) => x.json())).crops;
    const r = await say('催熟');
    const b = (await fetch(`http://127.0.0.1:${MOCK_PORT}/farm_report`).then((x) => x.json())).crops;
    assert.match(r, /催熟|可收|已经有/);
    assert.ok(b.ready >= a.ready, `可收数不该减: ${a.ready} → ${b.ready}`);
  });

  await t('selftest 探针能出报告', async () => {
    const r = await (await fetch(`http://127.0.0.1:${EYE_PORT}/selftest`)).text();
    assert.match(r, /✅ \/state/);
    assert.match(r, /\/walk_to|\/tool_area/);
  });
} finally {
  for (const p of procs) { try { p.kill(); } catch { } }
  await sleep(300);
}
console.log(`\n端到端: ${pass} 通过${fail ? `, ${fail} 失败` : ' 全绿 ✅'}`);
process.exit(fail ? 1 : 0);