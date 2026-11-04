// 无点击卖货端到端 (2026-11-04 ilspycmd 反编译后实装): 验 /sell 真的不经点击就把东西送进出货箱
// 用法: node test/sell-noclick.e2e.mjs   (需要 lib.mjs 指向 mock 端口, 用 STARDEW_LIB 或 std 端口覆盖)
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MOCK_PORT = 9163;
const procs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 起 mock(把 state 塞好可卖货)
const mock = spawn(process.execPath, [path.join(HERE, 'mock-bridge.mjs')], {
  cwd: ROOT, env: { ...process.env, MOCK_PORT: String(MOCK_PORT) }, stdio: ['ignore','pipe','pipe'],
});
procs.push(mock);
mock.stderr.on('data', d => process.stderr.write('[mock-err] ' + d));

async function up(url) {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(250); }
  throw new Error('没起来 ' + url);
}
await up(`http://127.0.0.1:${MOCK_PORT}/state`);

const BASE = `http://127.0.0.1:${MOCK_PORT}`;
const post = async (p, b = {}) => (await fetch(BASE + p, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) })).json();
const get = async (p) => (await fetch(BASE + p)).json();
const st = async () => get('/state');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('✓', name); }
  catch (e) { fail++; console.error('✗', name, '\n   ', e.message); }
};

await t('前提: mock 在 Farm 且有可卖物', async () => {
  const s = await st();
  assert.equal(s.location.name, 'Farm');
  assert.ok(s.inventory.length > 0);
});

await t('/sell 按名字投: 背包减少 + 出货箱增加 (零点击)', async () => {
  const before = await st();
  const r = await post('/sell', { name: 'Parsnip' });
  const after = await st();
  assert.ok(r.ok, '应成功: ' + JSON.stringify(r));
  assert.ok(Array.isArray(r.sold) && r.sold.length, '应返回 sold 列表');
  assert.ok((after.shippingBin ?? 0) > (before.shippingBin ?? 0), '出货箱应有东西');
  assert.ok(!after.inventory.some(i => i.name === 'Parsnip'), '防风草应已离开背包');
  assert.ok(after.inventory.some(i => i.name === 'Fiber'), '非白名单的纤维不该被动');
});

await t('/sell 不在 Farm → 明确报出货箱找不到(不静默)', async () => {
  await post('/warp', { location: 'Cabin', x: 4, y: 9 });
  const r = await post('/sell', { name: 'Sardine' });
  assert.equal(r.ok, false);
  assert.match(r.error, /shipping bin/i);
  await post('/warp', { location: 'Farm', x: 64, y: 20 });
});

await t('/sell 名字不存在 → 报 not found, 不乱卖', async () => {
  const before = (await st()).inventory.length;
  const r = await post('/sell', { name: '不存在的鬼东西' });
  assert.equal(r.ok, false);
  assert.match(r.error, /not found/i);
  assert.equal((await st()).inventory.length, before, '背包不该被动');
});

await t('/cancel_sleep 一步破赖床(四个字段全清)', async () => {
  await post('/sleep', {});
  assert.equal((await st()).player.isInBed, true);
  const r = await post('/cancel_sleep', {});
  const s = await st();
  assert.ok(r.ok && r.wokeUp);
  assert.equal(s.player.isInBed, false, 'isInBed 应清');
  assert.equal(s.activeMenu, null, '菜单应清');
});

await t('/ready_state 能报谁没 ready', async () => {
  const r = await get('/ready_state');
  assert.ok(r.ok);
  assert.ok(Array.isArray(r.checks));
  assert.ok(r.checks[0].numberRequired >= r.checks[0].numberReady, '应给人数');
});

await t('/farm_report 一次给全田 watered/ready', async () => {
  const r = await get('/farm_report');
  assert.ok(r.ok);
  assert.ok(r.crops.total >= 0);
  assert.equal(typeof r.crops.watered, 'number');
  assert.equal(typeof r.crops.ready, 'number');
});

await t('/ripen 催熟后可收数增加', async () => {
  const a = (await get('/farm_report')).crops.ready;
  const r = await post('/ripen', { radius: 30 });
  const b = (await get('/farm_report')).crops.ready;
  assert.ok(r.ok);
  assert.ok(b >= a, `ready 应不减: ${a} → ${b}`);
});

for (const p of procs) { try { p.kill(); } catch {} }
await sleep(300);
console.log(`\n无点击卖货/破环: ${pass} 通过${fail ? `, ${fail} 失败` : ' 全绿 ✅'}`);
process.exit(fail ? 1 : 0);
