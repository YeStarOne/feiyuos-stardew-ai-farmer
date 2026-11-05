// 小鱼自动钓鱼 keeper v1 (2026-11-05 用户要求)
// ---------------------------------------------------------------------------
// 用户原话: "用鱼鱼的号也去钓鱼, 直到冰雪节锁时间我让鱼鱼上线"
// 做法: 站在主持同款海滩钓点 Beach(44,35), 选竿朝右, 开 Fishbot mod (桥 /fishbot),
//       每 200s 补一次 ON (fishbot 弹菜单后会自己罢工, day-loop 同款坑),
//       每 5 分钟重选一次竿 (防切错道具), 掉出钓点就 warp 回来.
// 停手条件: ①冬8 及以后(冰雪节用户自己带她玩) ②不在床上且体力 < 20(交给 fish-night-guard 睡)
// 只操作 7843(鱼鱼), 绝不碰 7842.
import fs from 'node:fs';
import { st, post, sleep, warp, sel, isSellable, log as _log } from './lib-fish.mjs';

const SPOT = { loc: 'Beach', x: 44, y: 35 };
const OUT = 'D:/StardewAI/fish-fishbot.log';
const log = (...a) => {
  const line = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { }
};

let lastDay = -1, lastRodAt = 0, lastOnAt = 0, lastWarpAt = 0, lastSellAt = 0, lastMenuCloseAt = 0, casts = 0;
log('🎣 小鱼自动钓鱼 keeper 启动 (Beach 44,35; 冬8 自动停)');

for (;;) {
  try {
    const s = await st();
    if (s?.worldReady && s.player) {
      const t = s.time.timeOfDay, p = s.player;
      if (lastDay !== -1 && s.time.dayOfMonth !== lastDay) log(`新一天 ${s.time.season} ${s.time.dayOfMonth} 体力 ${Math.round(p.stamina)}`);
      lastDay = s.time.dayOfMonth;

      // ⭐2026-11-06 冬7 死锁: 农工的升级菜单会挡住换日存档(主持的 SaveGameMenu 等所有玩家 ready),
      //   必须当场关掉, 不能留到第二天早上。关掉时游戏会自动落到某个专精。
      // GameMenu 同理: 客户端留着背包菜单不动 = 干站一天(14:13 实测 672s 没抛竿, 体力一点不掉)。
      const menu = s.activeMenu?.type;
      if ((menu === 'LevelUpMenu' || menu === 'GameMenu') && Date.now() - lastMenuCloseAt > 60000) {
        lastMenuCloseAt = Date.now();
        const r = await post('/menu_close', {}).catch(e => ({ error: String(e) }));
        log(`菜单 ${menu} 挡钓鱼 → 关`, JSON.stringify(r).slice(0, 80));
        await sleep(1000);
      }

      // 2026-11-06: 原来的"冬8 自动停"是一次性节日约定, 已过期(现在冬24, 用户要求继续钓鱼)。
      // 新停手条件: 节日锁时(time-lock.flag 存在) → 收工, 交还给主人/鱼鱼本人。
      if (fs.existsSync('D:/StardewAI/time-lock.flag')) {
        log('时间已锁(time-lock.flag) —— 节日模式, 自动钓鱼收工');
        await post('/fishbot', { action: 'off' }).catch(() => null);
        process.exit(0);
      }

      const atSpot = s.location?.name === SPOT.loc;
      const stamina = p.stamina ?? 270;
      if (!p.isInBed && t < 2100 && stamina >= 20) {
        // 背包快满就回农场卖鱼(政策: 只卖 鱼+作物+垃圾; /sell 必须人在 Farm 才认得出货箱)
        const inv = (s.inventory || []).filter(i => i && i.name);
        const free = (p.maxItems ?? 36) - inv.length;
        if (free <= 3 && Date.now() - lastSellAt > 180000) {
          lastSellAt = Date.now();
          const sellables = inv.filter(i => isSellable(i.name));
          if (sellables.length) {
            log(`背包快满 free=${free} → 回农场卖 ${sellables.length} 种`);
            await post('/fishbot', { action: 'off' }).catch(() => null);
            await warp('Farm', 64, 15);
            await sleep(1500);
            if ((await st()).location?.name === 'Farm') {
              let sold = 0;
              for (const it of sellables) {
                const r = await post('/sell', { name: it.name, count: it.stack ?? 1 }).catch(() => null);
                if (r?.ok) sold += (r.totalItems || 0);
                else log('卖失败', it.name, JSON.stringify(r).slice(0, 60));
              }
              log('卖货完成', sold, '件');
            } else log('回农场没落地, 本次不卖');
            await warp(SPOT.loc, SPOT.x, SPOT.y);
            await sleep(1200);
          } else log(`背包满但没有可卖物 free=${free} (全是工具/留着的东西)`);
        }
        if (!atSpot) {
          if (Date.now() - lastWarpAt > 60000) {
            lastWarpAt = Date.now();
            const r = await warp(SPOT.loc, SPOT.x, SPOT.y).catch(e => ({ error: String(e) }));
            log('去海滩:', JSON.stringify(r).slice(0, 90));
          }
        } else {
          if (Date.now() - lastRodAt > 300000) {
            lastRodAt = Date.now();
            // 2026-11-06: 原来取"包里第一把竿" → 她包里有竹竿(槽5)和铱竿(槽7), 会选中竹竿。
            //   优先铱竿, 没有再退回任意竿。
            const rod = (s.inventory || []).find(i => /Iridium Rod/i.test(i?.name || '')) || (s.inventory || []).find(i => /Rod|Pole/i.test(i?.name || ''));
            if (rod) { await sel(rod.name).catch(() => null); log('换竿', rod.name); }
            else log('背包里没鱼竿!');
            await post('/face', { direction: 1 }).catch(() => null);
          }
          if (Date.now() - lastOnAt > 200000) {
            lastOnAt = Date.now();
            const r = await post('/fishbot', { action: 'on' }).catch(e => ({ error: String(e) }));
            log('fishbot:', JSON.stringify(r).slice(0, 70), '体力', Math.round(stamina));
          }
        }
      } else if (!p.isInBed && (t >= 2100 || stamina < 20)) {
        // 收工交给 fish-night-guard(21:30/体力25), 这里只提示一次
        if (Date.now() - lastOnAt > 600000) {
          lastOnAt = Date.now();
          log(`收工时段 t=${t} 体力 ${Math.round(stamina)} —— 关 fishbot, 等守卫睡`);
          await post('/fishbot', { action: 'off' }).catch(() => null);
        }
      }
    }
  } catch (e) { log('err', String(e).slice(0, 90)); }
  await sleep(30000);
}
