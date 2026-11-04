// 端到端自测(游戏没开也能跑): 日常动作链 100% 纯后台 —— 全程不许出现任何物理点击端点
// 覆盖: harvestAll(/harvest + 背包差分 + /debris 补捡) 与 sellAllWhitelisted(/sell 无点击)
// 用法: node test/background-no-click.e2e.mjs
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // D:/StardewAI
const MOCK_PORT = 9144;

// lib.mjs 在 import 时读 env —— 必须在动态 import 之前设好
process.env.STARDEW_BASE = `http://127.0.0.1:${MOCK_PORT}`;
process.env.STARDEW_JOURNAL = '0';
process.env.STARDEW_LEDGER = path.join(ROOT, 'test', '.tmp-ledger.json');
try { fs.unlinkSync(process.env.STARDEW_LEDGER); } catch { }

const procs = [];
const mock = spawn(process.execPath, [path.join(ROOT, 'test', 'mock-bridge.mjs')], {
  cwd: ROOT, env: { ...process.env, MOCK_PORT: String(MOCK_PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
mock.stdout.on('data', () => { });
mock.stderr.on('data', d => console.error('[mock-err]', String(d).trim().slice(0, 200)));
procs.push(mock);

const j = async (p, opt) => (await fetch(`http://127.0.0.1:${MOCK_PORT}${p}`, opt)).json();

// 等 mock 就绪
for (let i = 0; ; i++) {
  try { const s = await j('/state'); if (s?.worldReady) break; } catch { }
  if (i > 50) { console.error('mock 没起来'); process.exit(1); }
  await new Promise(r => setTimeout(r, 100));
}

// mock 起来了才 import lib(模块级 BASE 读 env)
const lib = await import(pathToFileURL(path.join(ROOT, 'lib.mjs')).href);

let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };

try {
  // ---------- A. harvestAll: /harvest + 背包差分 + /debris 补捡 ----------
  console.log('A. harvestAll —— 复生作物计数为 0 也要收得到, 掉落要走过去捡');
  const h = await lib.harvestAll(15, 8, true);
  // 3 蓝莓(复生,计数不加)×1 + 1 甜瓜(一次性,计数+1) = 包里 4 件; 掉落 4 格×2 = 8 件补捡
  assert.equal(h.harvested, 1, `harvested 计数只含一次性作物(实得 ${h.harvested})`);
  assert.equal(h.gained, 12, `背包差分应=12(4 直接收 + 8 补捡), 实得 ${h.gained}`);
  assert.equal(h.picked, 8, `补捡应=8, 实得 ${h.picked}`);
  const it = Object.fromEntries(h.items);
  assert.equal(it.Blueberry, 9, `蓝莓应 3+6=9, 实得 ${it.Blueberry}`);
  assert.equal(it.Melon, 3, `甜瓜应 1+2=3, 实得 ${it.Melon}`);
  ok('复生作物 harvested=1(不含蓝莓) 但背包实收 12 件 → 不再被计数骗');
  const dLeft = await j('/debris');
  assert.equal((dLeft.debris || []).length, 0, '扫完地上应该没有掉落了');
  ok('/debris 扫完清空');
  // 复生作物还在田里(没被毁), 只是进入复生期
  const sr = await j('/surroundings?radius=15');
  const blueberryLeft = (sr.tiles || []).filter(t => t.cropName === 'Blueberry').length;
  assert.equal(blueberryLeft, 3, '复生作物必须还活着(3 株蓝莓不许被毁)');
  ok('复生作物 3 株蓝莓仍在田里(没被 destroyCrop)');

  // ---------- B. sellAllWhitelisted: /sell 无点击 ----------
  console.log('B. sellAllWhitelisted —— /sell 直接塞出货箱, 零点击零前台');
  const s0 = await j('/state');
  const sellables = ['Parsnip', 'Sardine', 'Blueberry', 'Melon'];
  const expect = sellables.reduce((a, n) => {
    const it = s0.inventory.find(i => i.name === n);
    return a + (it ? (it.stack ?? 1) : 0);
  }, 0);
  const sold = await lib.sellAllWhitelisted(true);
  assert.equal(sold, expect, `应卖出 ${expect} 件, 实得 ${sold}`);
  ok(`卖出 ${sold} 件(Parsnip/Sardine/Blueberry/Melon)`);
  const s1 = await j('/state');
  assert.ok(s1.inventory.some(i => i.name === 'Fiber'), '非白名单 Fiber 绝不能被卖');
  assert.ok(s1.inventory.some(i => i.name === 'Blueberry Seeds'), '种子绝不能被卖');
  assert.ok(!s1.inventory.some(i => sellables.includes(i.name)), '白名单内应卖空');
  ok('白名单边界正确: Fiber/种子留着, 可卖清空');

  // ---------- C. 全程零物理点击 ----------
  console.log('C. 全程请求回放 —— 不许出现任何碰鼠标/抢前台的端点');
  const c = await j('/__calls');
  const banned = ['/click_tile', '/click', '/drag', '/focus', '/key', '/menu/click'];
  const hits = (c.calls || []).filter(l => banned.some(b => l.includes(' ' + b + ' ') || l.includes(' ' + b + '?')));
  assert.equal(hits.length, 0, `出现被禁端点: ${hits.slice(0, 3).join(' | ')}`);
  ok(`共 ${c.calls.length} 个请求, 0 个物理点击/抢前台端点`);

  console.log(`\n全部 ${pass} 组断言通过 ✅ (harvestAll 差分+补捡 / sellAllWhitelisted / 零点击回放)`);
} finally {
  for (const p of procs) { try { p.kill(); } catch { } }
  try { fs.unlinkSync(process.env.STARDEW_LEDGER); } catch { }
}
