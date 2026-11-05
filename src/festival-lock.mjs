// 节日锁时: 冻结游戏时间, 让用户从容过节(冬星宴 冬25 17:00 之后)
// 用法: node D:/StardewAI/festival-lock.mjs        → 锁时间
//       node D:/StardewAI/festival-lock.mjs off    → 解锁
// 纪律(铁律⑤): /pause /resume 必须成对; 锁时期间写 time-lock.flag, 让换日触发器的卡死哨兵豁免。
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { st, post, sel, fishbotSet, log } from './lib.mjs';

const LOCK_FLAG = 'D:/StardewAI/time-lock.flag';
const off = process.argv[2] === 'off';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const st2 = async (port) => {
  try { const r = await fetch(`http://localhost:${port}/state`, { signal: AbortSignal.timeout(5000) }); return await r.json(); } catch { return null; }
};
const menuClose = async (port) => {
  await fetch(`http://localhost:${port}/menu_close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
};
const dayloopPids = () => {
  try {
    const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/get-dayloop-pids.ps1', { encoding: 'utf8', timeout: 15000 });
    return out.split(/\s+/).map(Number).filter(Boolean);
  } catch { return []; }
};

const s = await st();
log('当前', s.location?.name, s.player?.x, s.player?.y, 't=', s.time?.timeOfDay, 'day=', s.time?.dayOfMonth, '菜单=', s.activeMenu?.type || null);

if (off) {
  const r = await post('/resume', {}).catch(e => ({ error: String(e) }));
  log('resume →', JSON.stringify(r).slice(0, 120));
  try { fs.unlinkSync(LOCK_FLAG); log('已删 time-lock.flag'); } catch { log('time-lock.flag 本来就不在'); }
  // 恢复 day-loop(用户玩完, 主持继续干活)
  try {
    execSync('powershell -NoProfile -Command "Start-Process -FilePath \'cmd.exe\' -ArgumentList \'/c node D:\\StardewAI\\day-loop.mjs >> D:\\StardewAI\\day-loop-live.log 2>&1\' -WorkingDirectory \'D:\\StardewAI\' -WindowStyle Hidden"', { timeout: 20000 });
    log('day-loop 已重新拉起(锁文件会自动接管)');
  } catch (e) { log('day-loop 拉起失败', String(e).slice(0, 100)); }
  log('done: 时间已恢复流动');
  process.exit(0);
}

// 1) 关双方菜单
for (const port of [7842, 7843]) { await menuClose(port); await sleep(400); }

// 2) 先停自动进程: day-loop 会每 200s 重开 fishbot / 乱跑, 锁时期间必须停
const pids = dayloopPids();
for (const pid of pids) {
  try { execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, { timeout: 15000 }); log('已停 day-loop PID', pid); }
  catch (e) { log('停 day-loop 失败', pid, String(e).slice(0, 60)); }
}
await sleep(1000);
try { fs.unlinkSync('D:/StardewAI/.day-loop.lock'); } catch { }

// 3) 停主持 fishbot + 换回斧头(防它自己接着动)
try { log('fishbot off =', await fishbotSet(false)); } catch (e) { log('fishbotSet 失败', String(e).slice(0, 80)); }
await sel('Axe').catch(() => null);

// 4) 鱼鱼侧也停 fishbot(她的 keeper 会在 30s 内自己退出)
await fetch('http://localhost:7843/fishbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'off' }) }).catch(() => null);

// 5) 写 flag(卡死哨兵豁免) + 冻结时间
fs.writeFileSync(LOCK_FLAG, new Date().toISOString() + ' festival-lock\n');
const r = await post('/pause', {});
log('pause →', JSON.stringify(r).slice(0, 120));

const t0 = (await st()).time?.timeOfDay;
await sleep(3000);
const t1 = (await st()).time?.timeOfDay;
log(t0 === t1 ? `✅ 时间已冻结在 ${t1}` : `⚠️ 时间仍在走 ${t0} → ${t1}, 需要复查`);
log('提示: 过节结束后跑 node D:/StardewAI/festival-lock.mjs off 解锁(会自动恢复 day-loop)');
