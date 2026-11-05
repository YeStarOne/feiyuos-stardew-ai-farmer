// 小鱼夜间守卫 v3 (2026-11-05): 回归无条件自动睡(v2的"听口令"导致她熬夜中暑晕倒进诊所, 医疗费+多次晕倒掉钱)
// 规则: worldReady && 没在床 && (时间>=2130 或 体力<25) → /sleep(在床等ready-check无害, 总比晕倒强)
import { st, post, sleep, log } from './lib-fish.mjs';
log('🐟小鱼守卫v3启动: 21:30/体力25 自动睡');
let lastDay = -1;
for (;;) {
  try {
    const s = await st();
    if (s && s.worldReady && s.player) {
      const t = s.time?.timeOfDay || 0;
      if (lastDay !== -1 && s.time.dayOfMonth !== lastDay) log('✓ 新一天 Day' + s.time.dayOfMonth);
      lastDay = s.time.dayOfMonth;
      if (!s.player.isInBed && (t >= 2130 || (s.player.stamina ?? 270) < 25)) {
        log('兜底触发: 时间' + t + ' 体' + Math.round(s.player.stamina) + ' → /sleep');
        await post('/sleep', {});
        await sleep(25000);
      }
    }
  } catch { }
  await sleep(20000);
}
