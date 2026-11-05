// 主持夜间守卫 v2 (2026-11-04 ilspycmd 反编译后升级)
// v1→v2 新增: ①赖床死循环自动破解(/ready_state 诊断 + /cancel_sleep 原子破环)
//             ②不只在23:30查 —— 一旦"两人都在床但天数不前进"超时立即破环
// 背景: 春2一晚跳夏2(31株作物全灭)、夏6→9(3天)都是这坑; 当时靠手工 menu_close×2 + warp 下床
// 反编译证据(HandleCancelSleep 源码): 一个端点就做完 isInBed=false + 关ReadyCheckDialog
//   + 清activeClickableMenu + dialogueUp=false —— 正是我们手工拼的四步
import { st, post, sleep, log } from './lib.mjs';
import { st as stF, post as postF } from './lib-fish.mjs';
import fs from 'node:fs';

// 2026-11-05 存档校验: /sleep 的 ok 只代表上床+置 ready. 唯一可信的写盘证据是 SaveGameInfo 的 mtime.
// (冬3~冬8 六天没写盘的真凶已定位: newday-trigger 换日时把 ShippingMenu 当死锁菜单 /menu_close 掉了,
//  而存档正是 ShippingMenu 结算动画走完后 new SaveGameMenu() 做的 —— 这里只负责核对, 处置在触发器里.)
const SAVE_INFO = 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo';
const saveMtime = () => { try { return fs.statSync(SAVE_INFO).mtimeMs; } catch { return 0; } };

const STALL_MS = 4 * 60 * 1000; // 两人都在床且超4分钟天数没动 = 赖床死循环
log('🛏 主持夜间守卫 v3 启动 (2330/体力20, 赖床自动破环, 存档 mtime 校验)');

let lastDay = -1;
let stallSince = 0;   // "两人都在床但天数没动"的起始时刻
let breakouts = 0;    // 本日内连续破环次数(防手抖无限破)
// ⭐2026-11-06 修基线误报: 原写法每轮末尾都刷新 lastSaveMtime, 而 /sleep 分支会先 sleep(30s) ——
//   这 30s 里换日+写盘可能已经发生, 于是基线被刷成"写盘之后", 下一轮再拿它比 → 永远等不到前进,
//   每晚必打一条假的「⚠️ 90s 内没写盘」。改成只记录"已经验收通过的那次 mtime": 换日时要求
//   当前 mtime > 它就算数, 与采样时机无关。
let verifiedSaveMtime = saveMtime(); // 最后一次"确认属于某一天"的写盘时间

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

      // 换天: 先确认真的写盘, 再快照 + 清零破环计数
      if (lastDay !== -1 && day !== lastDay) {
        const before = verifiedSaveMtime;
        log('✓ 新一天 Day' + day, '钱', s.player.money);
        breakouts = 0; stallSince = 0;
        // 等写盘(最多90s): 结算菜单走完动画才 new SaveGameMenu 写盘, 触发器会在换日时点 OK
        // 判据 = 当前 mtime 比"上次验收过的写盘"新 (不依赖本轮采样在写盘前还是后)
        let after = saveMtime();
        for (let i = 0; i < 18 && after <= before; i++) { await sleep(5000); after = saveMtime(); }
        const written = after > before;
        if (written) verifiedSaveMtime = after;
        log(written ? `✓ 已存档 ${new Date(after).toLocaleTimeString('zh-CN')}`
                    : '⚠️ 90s 内没写盘! 先查 newday-trigger 是不是又 /menu_close 掉了 ShippingMenu');
        if (written) {
          try {
            const { execSync } = await import('node:child_process');
            execSync('node D:/StardewAI/save-snapshot.mjs auto-day', { cwd: 'D:/StardewAI' });
            log('📦 存档快照完成');
          } catch (e) { log('快照失败', String(e).slice(0, 60)); }
        }
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
        // 顺序不能反(2026-11-06 教训): 主持先 /sleep, 4s 后再叫小鱼.
        // 小鱼先睡会 2/2 直接换日, 主持自己的 NewDay 流程不跑.
        await post('/sleep', {});
        await sleep(4000);
        try {
          const f = await stF();
          if (f?.worldReady && !f.player.isInBed) { await postF('/sleep', {}); log('已通知小鱼睡'); }
        } catch { }
        await sleep(30000);
      }
    }
  } catch { }
  await sleep(15000);
}