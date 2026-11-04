// 游戏窗口录屏 (2026-11-05): 给 AI 回看角色运动是否合理用
// 用法: node record-game.mjs host|fish 12 out.mp4
//   host = 主持窗口(7842), fish = 鱼鱼窗口(7843); 时长秒, 默认12; 输出默认 D:/StardewAI/clip-<who>-<ts>.mp4
// 原理: PowerShell 拿窗口矩形(按 PID) → ffmpeg gdigrab 区域抓屏(不抢前台, 纯读屏幕像素)
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const who = process.argv[2] || 'host';
const secs = Number(process.argv[3] || 12);
const out = process.argv[4] || `D:/StardewAI/clip-${who}-${Date.now()}.mp4`;

const ps = `Add-Type 'using System;using System.Runtime.InteropServices;public class W2{[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out R r);public struct R{public int L,T,Ri,B;}}'
[W2]::SetProcessDPIAware() | Out-Null
Get-Process StardewModdingAPI -ErrorAction SilentlyContinue | ForEach-Object {
  $r=New-Object W2+R; [W2]::GetWindowRect($_.MainWindowHandle,[ref]$r) | Out-Null
  $t=$_.MainWindowTitle
  $kind = if ($t.Contains('[farmhand]')) {'fish'} elseif ($t.Contains('[main player]')) {'host'} else {'?'}
  Write-Output "$kind $($r.L) $($r.T) $($r.Ri-$r.L) $($r.B-$r.T)"
}`;
const lines = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);
const hit = lines.find(l => l.startsWith(who + ' '));
if (!hit) { console.error('找不到窗口:', who, '| 有:', lines.join(' / ')); process.exit(1); }
const [, x, y, w0, h0] = hit.split(/\s+/).map(Number);
const w = w0 - (w0 % 2), h = h0 - (h0 % 2); // yuv420p 要求偶数宽高
console.log(`录制 ${who} 窗口 (${x},${y}) ${w}x${h} ${secs}s → ${out}`);

const ff = spawn('ffmpeg', [
  '-f', 'gdigrab', '-framerate', '12',
  '-offset_x', String(x), '-offset_y', String(y), '-video_size', `${w}x${h}`,
  '-t', String(secs), '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-y', out,
], { stdio: ['ignore', 'ignore', 'pipe'] });
let err = '';
ff.stderr.on('data', d => { err += d; });
ff.on('close', c => {
  if (c === 0) console.log('OK', out);
  else { console.error('ffmpeg 失败:\n' + err.split('\n').slice(-8).join('\n')); process.exit(1); }
});
