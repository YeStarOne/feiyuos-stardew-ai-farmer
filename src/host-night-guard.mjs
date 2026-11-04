// 主持夜间守卫 v2 (2026-11-04 ilspycmd 反编译后升级)
// v1→v2 新增: ①赖床死循环自动破解(/ready_state 诊断 + /cancel_sleep 原子破环)
//             ②不只在23:30查 —— 一旦"两人都在床但天数不前进"超时立即破环
// 背景: 春2一晚跳夏2(31株作物全灭)、夏6→9(3天)都是这坑; 当时靠手工 menu_close×2 + warp 下床
// 反编译证据(HandleCancelSleep 源码): 一个端点就做完 isInBed=false + 关ReadyCheckDialog
//   + 清activeClickableMenu + dialogueUp=false —— 正是我们手工拼的四步
import { st, post, sleep, log } from './lib.mjs';
import { st as stF, post as postF } from './lib-fish.mjs';

const STALL_MS = 4 * 60 * 1000; // 两人都在床且超4分钟天数没动 = 赖床死循环
log('🛏 主持夜间守卫 v2 启动 (2330/体力20, 赖床自动破环)');

let lastDay = -1;
let stallSince = 0;   // "两人都在床但天数没动"的起始时刻
let breakouts = 0;    // 本日内连续破环次数(防手抖无限破)

async function diagnose() {
  const r = await post('/ready_state', {}).catch(() => null);
  if (!r?.ok) return 'ready_state 读不到';
  const c = (r.checks || [])[0];
  return c ? `${c.kind} ${c.numberReady}/${c.numberRequired} state=${c.state} lock=${c.activeLockId}` : '无 check';
}

// 破环: 两端 cancel_sleep(等价我们手工四步) + 兜底 menu_close + 挪下床
async function breakBedLoop(reason) {
  breakouts++;
  log(`🚨 检测到赖床死循环(${reason}) 第${breakouts}次破环`);
  log('   诊断:', await diagnose());
  await post('/cancel_sleep', {});
  try { await postF('/cancel_sleep', {}); } catch { }
  await sleep(1200);
  const s = await st();
  if (s?.activeMenu) { await post('/menu_close', {}); await sleep(500); }
  if ((await st())?.player?.isInBed) {
    await post('/warp', { location: 'FarmHouse', x: 9, y: 10 }).catch(() => null);
    await sleep(800);
  }
  const s2 = await st();
  log('   破环结果: 在床', s2?.player?.isInBed, '菜单', s2?.activeMenu?.type || 'none');
  stallSince = 0;
}

for (;;) {
  try {
    const s = await st();
    if (s && s.worldReady && s.player) {
      const t = s.time?.timeOfDay || 0;
      const day = s.time.dayOfMonth;

      // 换天: 自动快照 + 清零破环计数
      if (lastDay !== -1 && day !== lastDay) {
        log('✓ 新一天 Day' + day, '钱', s.player.money);
        breakouts = 0; stallSince = 0;
        try {
          const { execSync } = await import('node:child_process');
          execSync('node D:/StardewAI/save-snapshot.mjs auto-day', { cwd: 'D:/StardewAI' });
          log('📦 存档快照完成');
        } catch (e) { log('快照失败', String(e).slice(0, 60)); }
      }
      lastDay = day;

      // ---- 赖床死循环检测 ----
      let fishInBed = false, fishReady = false;
      try {
        const f = await stF();
        fishInBed = !!f?.player?.isInBed;
        fishReady = !!f?.worldReady;
        if (f?.activeMenu?.type && /SaveGameMenu|ReadyCheck/i.test(f.activeMenu.type)) fishInBed = true;
      } catch { }

      const bothWaiting = s.player.isInBed && (fishInBed || !fishReady);
      if (bothWaiting) {
        if (!stallSince) { stallSince = Date.now(); log('⏳ 两人都在床, 开始计赖床时间'); }
        else if (Date.now() - stallSince > STALL_MS && breakouts < 3) {
          await breakBedLoop('两人在床超4分钟');
          continue;
        }
      } else {
        stallSince = 0;
      }

      // ---- 正常到点睡觉 ----
      if (!s.player.isInBed && (t >= 2330 || (s.player.stamina ?? 270) < 20)) {
        log('兜底触发: 时间' + t + ' 体' + Math.round(s.player.stamina));
        try {
          const f = await stF();
          if (f?.worldReady && !f.player.isInBed) { await postF('/sleep', {}); log('已叫小鱼先睡'); }
        } catch { }
        await sleep(5000);
        await post('/sleep', {});
        await sleep(30000);
      }
    }
  } catch { }
  await sleep(15000);
}