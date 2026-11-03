// 常驻挖矿监工: spawn mine-session, 退出就复活, 单进程不死 (2026-10-31)
import { spawn, execSync } from 'node:child_process';

// 单实例互锁(2026-11-03 用户拍板"新进程启动自动杀老进程"): 按命令行精确杀旧 mine-* node(不碰网关等其他node), 再写锁
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
const LOCK = 'D:/StardewAI/mine-forever.lock';
try {
  const out = execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -match 'mine-(forever|session)\\.mjs' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output $_.ProcessId }"`,
    { encoding: 'utf8', timeout: 20000 });
  const killed = out.split('\n').map(s => s.trim()).filter(Boolean);
  console.log('互锁: 杀掉旧进程', killed.join(',') || '(无)');
} catch (e) { console.log('互锁杀进程失败: ' + e.message); }
try { if (existsSync(LOCK)) unlinkSync(LOCK); } catch {}
writeFileSync(LOCK, String(process.pid));
process.on('exit', () => { try { unlinkSync(LOCK); } catch {} });

import { openSync } from 'node:fs';
import fs from 'node:fs';

const LOG = 'D:/StardewAI/mine-session.log';
const log = (m) => { try { fs.appendFileSync(LOG, m + '\n'); } catch { } };

let round = 0;
while (true) { round++; // 2026-11-04: 60轮上限会静默退役, 改常驻
  try { execSync('curl -s -X POST -H "Content-Type: application/json" -d {} http://localhost:7842/heal', { timeout: 10000 }); } catch { }
  log(`=== forever round ${round} ${new Date().toTimeString().slice(0, 8)} ===`);
  const t0 = Date.now();
  try {
    await new Promise((resolve) => {
      const out = openSync('D:/StardewAI/mine-session.log', 'a');
      const p = spawn('node', ['mine-session.mjs', '119', '80', '2130'], { cwd: 'D:/StardewAI', stdio: ['ignore', out, out] });
      p.on('exit', (code) => { log(`round ${round} exit code=${code} ran=${Math.round((Date.now() - t0) / 1000)}s`); resolve(); });
      p.on('error', (e) => { log('spawn error: ' + e.message); resolve(); });
    });
  } catch (e) { log('loop error: ' + e.message); }
  await new Promise((r) => setTimeout(r, 8000));
}
log('forever: 退出(不应发生)');
