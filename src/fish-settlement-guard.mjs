// 鱼鱼每日结算看门狗 v1 (2026-11-06, 用户要求)
// 背景: farmhand 端的 ShippingMenu(每日收入面板)必须自己点 OK, 否则她的客户端卡在结算页,
//       换日/加载再也推不动(主持侧有 newday-trigger 自动点, 鱼鱼侧没有一直管)。
// 做法: 常驻, 每 2s 读 7843 /state; 看到 ShippingMenu(或结算子菜单) → POST /settlement_confirm,
//       一直点到菜单消失(最多 8 次, 每次 1.5s)。
// 安全: 只碰 7843; 只认结算类菜单, 其他菜单(背包/升级/ready)一律不碰 —— 那些归 newday-trigger。
// ⚠️ /settlement_confirm 必须带 {} body, 空 body 会 411。
import fs from 'node:fs';

const FISH = 'http://localhost:7843';
const LOG = 'D:/StardewAI/fish-settlement.log';
const log = (...a) => {
  const line = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch { }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jj = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }, signal: AbortSignal.timeout(6000) });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 120), status: r.status }; }
};
const readState = async () => {
  try { const s = await jj(FISH + '/state'); return s?.worldReady ? s : null; } catch { return null; }
};

// 结算类菜单: 1.6 的 ShippingMenu 里逐页翻; 老版本也可能直接出子菜单
const isSettlement = (m) => !!m && (/ShippingMenu/i.test(m.type || '') || /shipping/i.test(m.submenu || '') || /settlement/i.test(m.questionKind || ''));

let lastDayKey = '', doneToday = 0;
log('💰 鱼鱼结算看门狗启动 (只认 ShippingMenu, 每 2s 巡检)');

for (;;) {
  try {
    const s = await readState();
    if (s) {
      const key = `${s.time.year}|${s.time.season}|${s.time.dayOfMonth}`;
      if (key !== lastDayKey) { lastDayKey = key; doneToday = 0; log(`新一天 ${s.time.season} ${s.time.dayOfMonth} t=${s.time.timeOfDay}`); }
      if (isSettlement(s.activeMenu)) {
        let closed = 0;
        for (let i = 0; i < 8; i++) {
          const cur = await readState();
          if (!isSettlement(cur?.activeMenu)) break;
          const r = await jj(FISH + '/settlement_confirm', { method: 'POST', body: '{}' }).catch(e => ({ error: String(e).slice(0, 80) }));
          closed++;
          log(`结算点击 #${closed} →`, JSON.stringify(r).slice(0, 110));
          await sleep(1500);
        }
        const after = await readState();
        doneToday += closed;
        log(`结算处理完: 点了 ${closed} 次, 现在菜单=${after?.activeMenu?.type || '-'} t=${after?.time?.timeOfDay}`);
      }
    }
  } catch (e) { log('err', String(e).slice(0, 90)); }
  await sleep(2000);
}
