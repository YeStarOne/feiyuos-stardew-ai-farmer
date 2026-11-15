// fish-loop-switch.mjs —— 鱼鱼的「自由活动 / 自动钓鱼」一键开关 (2026-11-12 主人拍板)
//
// 背景: 她要自己跑脚本(下矿/战斗/乱逛)时, fish-day-loop 每 0.x 秒就把她拽回钓点
//   (它的逻辑就是「离开钓点 → 立刻 warp 回 Mountain 42,11」)。以前她得自己翻进程列表
//   找 PID、kill、再想办法起回来 —— 一天忘三次, 忘一次就被拽一整天。
//
// 服务: 127.0.0.1:7851  (7850 是留言板, 不混在一起)
// API:
//   POST /fishloop {"on":true|false}      → 开/关她的日循环, 回 {ok, loop:'on'|'off', pid?}
//   GET  /fishloop                        → 当前状态 {ok, loop, pid, since}
//   别名叫 /loop, 两个都认
//
// 语义:
//   off → 杀掉 D:/StardewAI/fish-day-loop.mjs 那个 node 进程(按**精确脚本名**匹配,
//         绝不用子串 —— 曾把主持的 day-loop 顶死), 清掉它的单实例锁 .fish-day-loop.lock
//   on  → 无窗拉起(主人硬规矩: 本机所有控制台进程一律无窗), 等 3 秒确认 PID, 回 pid
//   ⚠️ 关掉之后 persist.ps1 有可能会在下一轮(120秒)把它拉回来 —— 所以 off 会写一个
//      .fish-loop.hold 文件(persist 不认这个文件, 但我们的 on/off 都看它; 真正挡
//      persist 的是: off 之后 persist 若拉起来, 我们的 GET 会如实报 loop:'on' 且
//      managed:false, 让她知道"被守护进程拉回来了, 要再关一次")
//      → 2026-11-12 决定: off 期间**主动删掉 persist 对它的期望**做不到(表是硬编码),
//        所以走「重复守卫」: 开关自己起一个 30 秒的看护, off 期间发现 fish-day-loop
//        被拉起来就再杀一次(bounded: 4 小时内有效, .fish-loop.hold 里的截止时间)
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { execFileSync, execFile, spawn } from 'node:child_process';

const PORT = Number(process.env.FISH_LOOP_SWITCH_PORT || 7851);
const FE_PORT = Number(process.env.FISHEYE_PORT || 7853);
// 2026-11-14 用户: 人话助手(fish-eye)自 11-12 起被本服务抢占 7851 而无家可归("装死"真凶)。
//   对接方案: fish-eye 迁 7853, 本服务对它做反向代理(隧道 47851→7851 不变, 她地址不换), 看护顺带代养。
const ROOT = 'D:/StardewAI';
const SCRIPT = 'fish-day-loop.mjs';
const LOCK = `${ROOT}/.fish-day-loop.lock`;
const HOLD = `${ROOT}/.fish-loop.hold`;   // 内容 = 截止 ISO 时间; 存在即"别让它跑"
const STATE = 'D:/StardewAI/fish-loop-switch.state.json';
const HOLD_MAX_MS = 4 * 3600 * 1000;      // 自由活动最长 4 小时, 到点自动交还给钓鱼

const nowISO = () => new Date().toISOString();
const log = (...a) => { const s = `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${a.join(' ')}`; console.log(s); try { fs.appendFileSync(`${ROOT}/fish-loop-switch.log`, s + '\n'); } catch { } };

// 按命令行精确匹配脚本名(不是子串!) —— 子串匹配会把 fish-mine-session 之类误杀
// 用 PowerShell 列进程。⚠️2026-11-12 14:4x 实锤: execFileSync **默认会弹窗** ——
//   本进程是 DETACHED_PROCESS 起的(没有控制台), 子 powershell 要新控制台, Win11 交给
//   Windows Terminal => 左上角每 30 秒闪一个"管理员: Windows PowerShell"抢焦点。
//   凡是本文件起控制台程序, 一律带 windowsHide: true (等价 CREATE_NO_WINDOW)。
function listLoopPids() {
  // ⚠️2026-11-12 坑: 用数组 join('') 拼 PowerShell 会把语句粘成 `$ErrorActionPreference='SilentlyContinue'Get-CimInstance...`
  //   → ParserError → catch 返回 [] → 状态永远报 loop:'off'(**假绿**, 会让她以为已关/已开)。
  //   现在: ①语句之间强制分号 ②解析失败返回 null(不是 []), 上层必须区分"真的没有"和"读不到"。
  const ps = [
    `$ErrorActionPreference='SilentlyContinue';`,
    `$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'";`,
    `$p | Where-Object { $_.CommandLine -match '(?<![\\w.-])fish-day-loop\\.mjs(\\s|$|")' } | ForEach-Object { $_.ProcessId };`,
  ].join(' ');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    return out.split(/\s+/).map(s => Number(s)).filter(n => Number.isInteger(n) && n > 0);
  } catch (e) { log('listLoopPids 失败:', String(e.message).slice(0, 100)); return null; }
}

function killPids(pids) {
  const killed = [];
  for (const pid of (pids || [])) {
    try { execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', timeout: 10000, windowsHide: true }); killed.push(pid); }
    catch { /* 已经死了 */ }
  }
  return killed;
}

function clearLock() { try { fs.unlinkSync(LOCK); } catch { } }

function holding() {
  try {
    const raw = fs.readFileSync(HOLD, 'utf8').trim();
    const t = Date.parse(raw);
    if (Number.isFinite(t) && t > Date.now()) return { on: true, until: raw };
    // 过期/坏值 → 自动清掉, 交还给钓鱼
    try { fs.unlinkSync(HOLD); } catch { }
    log('hold 到期, 自动解除');
    return { on: false };
  } catch { return { on: false }; }
}

function setHold(ms) {
  const until = new Date(Date.now() + ms).toISOString();
  try { fs.writeFileSync(HOLD, until); } catch (e) { log('写 hold 失败:', e.message); }
  return until;
}

function releaseHold() { try { fs.unlinkSync(HOLD); } catch { } }

// 起不来时把 fish-day-loop.log 的末几行带回去 —— 真因几乎总在那几行里, 但开关以前只报
// 「起了但 7 秒内没看到进程」, 谁看都只能猜。
// 2026-11-12 实例: 14:30 手动冻时间的 time-lock.flag 没删 ⇒ loop 一启动就自退
// 「? time-lock.flag 存在(节日锁时) → 收工退出」; 鱼鱼 15:16 连开两次都失败, 她以为是自己环境坏了。
// ⚠️ 日志里混着 UTF-8/GBK 两种行, 这里只做 best-effort 剪尾巴, 不要拿去当权威解析。
function loopLogTail(n = 5) {
  try {
    const lines = fs.readFileSync(`${ROOT}/fish-day-loop.log`, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => l.replace(/^\d{2}:\d{2}:\d{2}\s*/, '').slice(0, 120));
  } catch (e) { return [`(读 fish-day-loop.log 失败: ${e.message})`]; }
}

function startLoop() {
  // 主人硬规矩: 无窗(本机所有控制台进程一律无窗)。
  // ⚠️2026-11-12 四个坑全踩了一遍, 结论写在下面, 别再试第五种写法:
  //   ① execFileSync/spawnSync 等 powershell 退出 → 父 shell 不退(子进程常驻) → ETIMEDOUT,
  //      而进程其实起来了 ⇒ 谎报失败。
  //   ② 把带引号+重定向的整行塞进 -Command → 多层转义(cmd /c + PS 字符串 + JS 模板)吃掉引号 →
  //      命令根本没执行。
  //   ③ spawn(powershell, {detached:true}) → 实测没起来。
  //   ④ spawn('cmd.exe', ['/c', 'start /b ...']) → 也没起来(start 是内建命令, 参数拆分方式不对)。
  //   ✅ 定案: execFile(powershell, [...]) **异步带回调** —— 和手工已验成功的命令行逐字一致,
  //      只是不等它退出(回调留给用户进程生命周期, 我们只轮询 PID 确认)。
  const psScript = [
    `$psi=New-Object System.Diagnostics.ProcessStartInfo`,
    `$psi.FileName='cmd.exe'`,
    `$psi.Arguments='/c start /b "" node "${ROOT}/${SCRIPT}" >> "${ROOT}/fish-day-loop.log" 2>&1'`,
    `$psi.WorkingDirectory='${ROOT}'`,
    `$psi.UseShellExecute=$false`,
    `$psi.CreateNoWindow=$true`,
    `[System.Diagnostics.Process]::Start($psi) | Out-Null`,
  ].join('; ');
  try {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { cwd: ROOT, windowsHide: true, timeout: 60000 }, (err) => {
        if (err && err.killed) log('startLoop: powershell 60 秒未退出(通常无害, 子进程已拉起)');
      });
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 160) }; }
  return { ok: true };
}

const sleepMs = ms => new Promise(r => setTimeout(r, ms));

// 关 fishbot(7843). 只发这一个动作, 不碰她的身体; 失败不阻塞 off(报告里如实带 error)
// ⚠️2026-11-12 14:1x 实修(「为什么按了按钮还在自动钓鱼」): 杀脚本 ≠ 停钓鱼 ——
//   fishbot 是游戏内 mod, taskkill 不会关它, 脚本一死鱼竿还在自动抛。按钮语义必须是
//   "真的不钓了" ⇒ off 顺手把 fishbot 关掉。
async function fishbotOff() {
  try {
    // ⚠️必须用 localhost 不能用 127.0.0.1: 桥是 HttpListener, Host 头不是 localhost 直接 400
    //   (2026-11-12 实测: 127.0.0.1 收到的是 "Bad Request - Invalid Hostname" 的 HTML)
    const r = await fetch('http://localhost:7843/fishbot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'off' }), signal: AbortSignal.timeout(8000),
    });
    return await r.json();
  } catch (e) { return { error: String(e.message || e).slice(0, 100) }; }
}

async function loopOff(reason = 'manual') {
  releaseHold();                 // 先清 hold, 免得看护跟我们抢
  const pids = listLoopPids();
  if (pids === null) { log(`loop OFF by ${reason}: 读不到进程表, 不知道在不在跑 —— 拒绝谎报`); return { ok: false, loop: 'unknown', error: 'cannot enumerate node processes' }; }
  const killed = killPids(pids);
  clearLock();
  await sleepMs(1200);
  const still = listLoopPids();
  if (still.length) { killPids(still); clearLock(); }
  const until = setHold(HOLD_MAX_MS);
  const fishbot = await fishbotOff();
  log(`loop OFF by ${reason}: killed=[${killed}] still=[${still}] hold-until=${until} fishbot=${JSON.stringify(fishbot)}`);
  return { ok: true, loop: 'off', killed, holdUntil: until, fishbot };
}

async function loopOn(reason = 'manual') {
  releaseHold();
  const pre = listLoopPids();
  if (pre === null) { log(`loop ON by ${reason}: 读不到进程表, 拒绝启动(防起第二个实例)`); return { ok: false, loop: 'unknown', error: 'cannot enumerate node processes' }; }
  if (pre.length) {
    const pid = pre[0];
    log(`loop ON by ${reason}: 已在跑 pid=${pid}`);
    return { ok: true, loop: 'on', pid, already: true };
  }
  clearLock();
  const r = startLoop();
  if (!r.ok) { log(`loop ON by ${reason}: 启动失败 ${r.error}`); return { ok: false, loop: 'off', error: r.error }; }
  for (let i = 0; i < 14; i++) {
    await sleepMs(700);
    const pids = listLoopPids();
    if (pids && pids.length) { log(`loop ON by ${reason}: pid=${pids[0]}`); return { ok: true, loop: 'on', pid: pids[0] }; }
  }
  const tail = loopLogTail(5);
  log(`loop ON by ${reason}: 起了但 7 秒内没看到进程 | 日志尾: ${tail.join(' ⏎ ')}`);
  return { ok: false, loop: 'off', error: 'process not visible after 7s', logTail: tail };
}

function status() {
  const pids = listLoopPids();
  const h = holding();
  if (pids === null) return { ok: false, loop: 'unknown', error: 'cannot enumerate node processes', hold: h.on ? h.until : null };
  return {
    ok: true,
    loop: pids.length ? 'on' : 'off',
    pid: pids[0] ?? null,
    pids,
    hold: h.on ? h.until : null,
    note: h.on && pids.length ? 'hold 在但 loop 也在跑 = 被守护进程拉回来了, 要再关一次' : undefined,
  };
}

// ---- 看护: hold 期间每 30 秒查一次, 被 persist 拉起来就再杀 ----
// bounded: hold 到期自动退出(不超过 4 小时), 绝不无限驻留
async function guardian() {
  for (;;) {
    await sleepMs(30000);
    const h = holding();
    if (!h.on) { log('看护: hold 没了, 退出'); return; }
    const pids = listLoopPids();
    if (pids && pids.length) {
      killPids(pids); clearLock();
      // 被杀的那一轮可能已经把 fishbot 打开了(旧版 loop 启动就开) → 一起关掉
      const fb = await fishbotOff();
      log(`看护: 发现 loop 被拉回来 pids=[${pids}], 已再杀 (hold 到 ${h.until}) fishbot=${JSON.stringify(fb)}`);
    }
  }
}
let guardianRunning = false;

// ---- fish-eye(人话助手)反向代理 + 代养看护 ----
const FE_RE = /^\/(say|see|map|world|todo|watercan|goto|harvest|water|till|plant|selftest)\b/;
function feProxy(req, res) {
  const p = http.request({ host: '127.0.0.1', port: FE_PORT, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  p.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'fish-eye(7853) 不在线, 30秒内自动拉起, 稍后再试' }));
  });
  req.pipe(p);
}
async function feKeeper() {
  for (;;) {
    await sleepMs(30000);
    const alive = await new Promise((resolve) => {
      const s = net.createConnection({ host: '127.0.0.1', port: FE_PORT, timeout: 1500 }, () => { s.destroy(); resolve(true); });
      s.on('error', () => resolve(false));
      s.on('timeout', () => { s.destroy(); resolve(false); });
    });
    if (alive) continue;
    try {
      const c = spawn(process.execPath, [`${ROOT}/fish-eye.mjs`], { env: { ...process.env, FISHEYE_PORT: String(FE_PORT) }, detached: true, stdio: 'ignore' });
      c.unref();
      log(`看护: fish-eye(${FE_PORT}) 不在线 → 已拉起 pid ${c.pid}`);
    } catch (e) { log('看护: fish-eye 拉起失败', e.message); }
  }
}
feKeeper();

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

  if (FE_RE.test(u.pathname)) return feProxy(req, res);

  if (u.pathname === '/fishloop' || u.pathname === '/loop') {
    if (req.method === 'GET') return send(200, status());
    if (req.method !== 'POST') return send(405, { ok: false, error: 'use GET or POST' });
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const j = body ? JSON.parse(body) : {};
        // 也接受 {"action":"on"|"off"} / {"loop":"on"} 三种写法, 少一类格式错误
        const raw = j.on ?? j.action ?? j.loop;
        if (raw === undefined || raw === null) return send(400, { ok: false, error: 'need {"on":true|false}' });
        const want = raw === true || /^(on|true|1|start)$/i.test(String(raw));
        const r = want ? await loopOn('api') : await loopOff('api');
        if (!want && !guardianRunning) { guardianRunning = true; guardian().finally(() => { guardianRunning = false; }); }
        send(200, r);
      } catch (e) { send(400, { ok: false, error: String(e.message).slice(0, 160) }); }
    });
    return;
  }
  if (u.pathname === '/status') { return send(200, status()); }
  send(404, { ok: false });
}).listen(PORT, '127.0.0.1', () => log(`fish-loop-switch listening 127.0.0.1:${PORT}  (POST /fishloop {"on":true|false})`));
