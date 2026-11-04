// day-activator v1.0 (2026-11-06): 星露谷每次换日自动"激活"鱼鱼的会话一次
// 原理: 每 30s 轮询 7843/state 的 dayOfMonth, 翻新 → 组装当日简报 → 留言板 7850/send (from 肥鱼 to 小肥鱼)
//       她的贴身管家 fish-concierge 会把留言送进她的会话 —— 这就是"激活"。
// 简报内容: 日期/天气/运气/熟了什么(farm_report)/今日任务清单。
// 附带: 启动时若世界就绪也发一次(=今天的激活); 每天只发一次; 游戏没开就静默等。
// 常驻: node day-activator.mjs (日志 day-activator.log)
import fs from 'node:fs';

const BRIDGE = 'http://localhost:7843';
const BOARD = 'http://localhost:7850';
const LOG = 'D:/StardewAI/day-activator.log';
const log = (...a) => { const l = `[${new Date().toISOString().slice(5, 19)}] ${a.join(' ')}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };

const WEATHER = { 0: '晴☀️', 1: '雨🌧️(不用浇水!)', 2: '雷暴⛈️(别出门挨劈)', 3: '风🍂', 5: '雪❄️', 7: '绿雨🍀' };
let lastDay = -1;

const j = async (url, opt) => (await fetch(url, { signal: AbortSignal.timeout(15000), ...opt })).json();

async function brief() {
  const s = await j(BRIDGE + '/state').catch(() => null);
  if (!s?.worldReady) return;
  const t = s.time, p = s.player;
  if (t.dayOfMonth === lastDay) return;   // 今天已激活
  const firstRun = lastDay === -1;
  lastDay = t.dayOfMonth;
  const wx = WEATHER[t.weather] || '?';
  const luck = Number(p.dailyLuck);
  const luckText = luck >= 0.07 ? '很好🌟(可下矿/钓宝)' : luck >= 0.02 ? '不错👍' : luck > -0.02 ? '平平' : '偏差⚠️(别赌运气)';
  let readyText = '';
  try {
    const f = await j(BRIDGE + '/farm_report');
    const ready = f?.crops?.ready ?? 0;
    readyText = ready > 0 ? `田里有 ${ready} 株熟了, 说"收菜"收掉再 /sell 卖掉` : '田里暂时没有熟的';
  } catch { }
  const msg = { from: '肥鱼', to: '小肥鱼', text: [
    `🌅 激活: ${t.season === 'spring' ? '春' : t.season === 'summer' ? '夏' : t.season === 'fall' ? '秋' : '冬'}${t.dayOfMonth}日 第${t.weather !== undefined ? '' : ''}${wx} | 运气${luckText}`,
    readyText,
    '今日任务: ①浇苗(雨天跳过) ②熟了就收+卖(只准用 lib-fish 封装, 不碰 /sell 按钮) ③17:00 前自由活动/逛镇子 ④21:30 回屋, 睡觉卡住等 1 分钟会自动解(FishWaker)。',
    firstRun ? '(激活装置上线, 今天先补发一次)' : '',
    '有不懂的随时板上问我。——肥鱼(自动激活装置)',
  ].filter(Boolean).join('\n') };
  const r = await j(BOARD + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
  log(`Day${t.dayOfMonth} 激活已发 → id ${r.id ?? JSON.stringify(r).slice(0, 60)}`);
}

log('day-activator 启动, 每 30s 盯换日');
setInterval(brief, 30000).unref?.();
brief();
setInterval(() => { }, 1 << 30); // keep alive
