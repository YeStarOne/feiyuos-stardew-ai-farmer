// CheatBridge v1.1 部署守望器(一次性): 轮询到秋20晨间窗口→杀两端→swap dll→relaunch→验收
import { execSync, spawn } from 'node:child_process';
const log = (...a) => { const l = `[${new Date().toTimeString().slice(0, 8)}] ${a.join(' ')}`; console.log(l); };

const st = (port) => fetch(`http://localhost:${port}/state`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null);
const cheat = (port, body) => fetch(`http://127.0.0.1:${port}/cheat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }).then(r => r.json()).catch(e => ({ _err: String(e).slice(0, 60) }));
const sh = (cmd) => { try { return String(execSync(cmd, { encoding: 'utf8', timeout: 60000 })); } catch (e) { return String(e.stdout || e.message || e); } };

// 1. 等窗口: 秋20 t<=800 (干净翻日后, 回滚损失最小)
log('守望启动: 等秋20 晨间窗口 (t<=800), 最长40分钟');
let fired = false;
for (let i = 0; i < 480; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const h = await st(7842);
  if (!h) { log('7842 探测失败, 继续'); continue; }
  const day = (h.time || {}).dayOfMonth, t = (h.time || {}).timeOfDay;
  if (day === 20 && t >= 600 && t <= 800) { log(`窗口命中: 秋${day} t=${t} → 开始部署舞步`); fired = true; break; }
  if (i % 12 === 0) log(`等待中: 秋${day} t=${t}`);
  // 超过 t=800 视为错过本日窗口, 继续等下一天(最多40分钟)
}
if (!fired) { log('40分钟未命中窗口(可能翻日挂起), 退出待人工'); process.exit(1); }

// 2. 杀 day-loop
log('杀 day-loop:', sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/get-dayloop-pids.ps1').trim());
log('taskkill:', sh(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='node.exe'\\" | Where-Object { $_.CommandLine -match '(?<![-\\w])day-loop\\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"`).trim());

// 3. 杀主持端 (_kill-host.ps1 = 杀 V1.6.15 目录的 SMAPI)
log('_kill-host:', sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/_kill-host.ps1').trim().slice(0, 200));
await new Promise(r => setTimeout(r, 3000));
// 4. 确认两端死透; 鱼鱼端(V1.6.15-fish)若还活着单独补杀
for (let i = 0; i < 10; i++) {
  const h2 = await st(7842), f2 = await st(7843);
  if (!h2 && !f2) break;
  if (f2) {
    log('鱼鱼端还活着 → 按路径补杀');
    log(sh(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='StardewModdingAPI.exe'\\" | Where-Object { $_.ExecutablePath -like '*V1.6.15-fish*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"`).trim());
    log(sh(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='Stardew Valley.exe'\\" | Where-Object { $_.ExecutablePath -like '*V1.6.15-fish*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"`).trim());
  }
  if (h2) log('主持端还活 → 再补 _kill-host:', sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/_kill-host.ps1').trim().slice(0, 120));
  await new Promise(r => setTimeout(r, 3000));
}
log('两端进程已死, 开始 swap dll');

// 5. swap 两处
log('host swap:', sh('cp -f D:/StardewAI/_mod-staging/cheatbridge-1.1.0/CheatBridge.dll D:/StardewAI/_mod-staging/cheatbridge-1.1.0/manifest.json "G:/量化系统安装包/V1.6.15/Mods/CheatBridge/"').trim());
log('fish swap:', sh('mkdir -p "G:/量化系统安装包/V1.6.15-fish/Mods/CheatBridge" && cp -f D:/StardewAI/_mod-staging/cheatbridge-1.1.0-fish/CheatBridge.dll D:/StardewAI/_mod-staging/cheatbridge-1.1.0-fish/manifest.json "G:/量化系统安装包/V1.6.15-fish/Mods/CheatBridge/"').trim());

// 6. relaunch 主持
log('_relaunch-host:', sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/_relaunch-host.ps1').trim().slice(0, 150));
// 7. relaunch 鱼鱼
log('restart-fish:', sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/restart-fish.ps1').trim().slice(0, 150));

// 8. 等两端 worldReady
let hostOk = false, fishOk = false;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const h = await st(7842), f = await st(7843);
  if (h && !hostOk) { hostOk = true; log(`主持回连: 秋${(h.time || {}).dayOfMonth} t=${(h.time || {}).timeOfDay} worldReady=${h.worldReady}`); }
  if (f && !fishOk) { fishOk = true; log(`鱼鱼回连: t=${(f.time || {}).timeOfDay} worldReady=${f.worldReady}`); }
  if (hostOk && fishOk && (h.worldReady !== false) && (f.worldReady !== false)) break;
}
log(`回连状态: host=${hostOk} fish=${fishOk}`);

// 9. 开 festival.auto (两端) + 验收
for (const [port, who] of [[7845, 'host'], [7846, 'fish']]) {
  for (let i = 0; i < 20; i++) {
    const r = await cheat(port, { op: 'status' });
    if (r && r.ok) {
      log(`${who} /cheat@${port} 验收: isMaster=${r.data?.isMaster} port=${r.data?.port}`);
      const a = await cheat(port, { op: 'festival.auto', enable: true });
      log(`${who} festival.auto: ${JSON.stringify(a.data || a)}`);
      break;
    }
    await new Promise(r2 => setTimeout(r2, 5000));
    if (i === 19) log(`${who} /cheat@${port} 20次未通!`);
  }
}

// 10. 等 day-loop 自补 (90s), 没补就手补
log('等看护自补 day-loop 90s…');
let loopBack = false;
for (let i = 0; i < 18; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const out = sh('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/get-dayloop-pids.ps1').trim();
  if (out) { loopBack = true; log('day-loop 已自补 pid=' + out.split('\n')[0]); break; }
}
if (!loopBack) {
  log('看护没补 → 手工补 (stdout重定向)');
  sh(`powershell -NoProfile -Command "Start-Process -WindowStyle Hidden cmd -ArgumentList '/c node D:/StardewAI/day-loop.mjs >> D:/StardewAI/day-loop.log 2>&1'"`);
  log('手工 spawn 已发');
}
log('=== 部署舞步完成 ===');
process.exit(0);
