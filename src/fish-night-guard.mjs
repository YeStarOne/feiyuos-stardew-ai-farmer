// 小肥鱼夜间守卫 v2 (2026-11-04 联机定稿): 睡觉听主持口令, 绝不主动睡
// 原因: 联机睡觉=全队ready-check, farmhand主动睡会让"正在等待其他玩家(1/2)"卡住
// 协议: 主持端在7850发消息(from=肥鱼, 含"睡觉") → 小鱼10秒内 /sleep 入睡
// 平时兜底: 时间>=2130只提醒(桥上发消息催主持收工), 不动角色
import { st, post, sleep, log } from './lib-fish.mjs';

const BRIDGE = 'http://localhost:7850';
let since = 0;
try { since = (await (await fetch(BRIDGE + '/status')).json()).total; } catch { } // 只听新消息
log('🐟小鱼守卫v2启动: 听主持口令睡觉, 不主动睡');

for (;;) {
  try {
    const s = await st();
    if (s && s.worldReady) {
      const t = s.time?.timeOfDay || 0;
      if (t >= 2130 && !s.player?.isInBed) {
        // 只催一次性质: 每天最多发一条(靠timeOfDay窗口+短周期会重发, 用简单节流: 2130-2150区间外不重发)
        log('夜深了(' + t + '), 等主持收工口令...');
      }
    }
    // 听口令
    const ms = await (await fetch(BRIDGE + '/messages?to=' + encodeURIComponent('小肥鱼') + '&since=' + since)).json();
    for (const m of (ms.msgs || [])) {
      since = Math.max(since, m.id);
      if (/睡觉|晚安|收工/.test(m.text || '')) {
        const s2 = await st();
        if (s2.worldReady && !s2.player?.isInBed) {
          log('收到主持口令 → /sleep');
          await post('/sleep', {});
          await sleep(20000);
        }
      }
    }
  } catch { }
  await sleep(10000);
}
