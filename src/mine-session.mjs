import { spawnSync } from 'node:child_process';
// 挖矿+战斗会话 v0.4 (2026-10-31): v0.3 + 木剑自动战斗(用户点名要打怪)
// 战术: 视野内有怪 → 切剑, 走到1格外→面朝→挥击, 直到死; 清完怪继续挖矿
// 下楼: 踩梯=go()走上去(入口梯10,4已实测踩上有效), 电梯POST只reset不传送
import { get, post, st, surr, log, sleep, warp, go, sel, face, faceToward, standAdj, invSnapshot, snapshotGain, compactState } from './lib.mjs';

const args = process.argv.slice(2);
const TARGET_LEVEL = parseInt(args[0] || '39');
const STOP_STAMINA = parseInt(args[1] || '80');
const STOP_TIME = parseInt(args[2] || '2130');
const oreRe = /Copper Ore|Iron Ore|Coal|Quartz|Amethyst|Topaz|Emerald|Ruby|Jade|Diamond|Geode|Frozen Geode|Fire Quartz/i;
let totalLevels = 0;
let oresMined = 0;
let heals = 0;

async function invOres() {
  const s = await st();
  return s.inventory.filter(i => i.name && oreRe.test(i.name)).map(i => i.name + 'x' + (i.stack ?? 1)).join(',');
}

// 战斗: 打死视野内所有怪
async function fightAll() {
  let giveUp = 0;
  for (let round = 0; round < 8; round++) {
    const sr = await surr(12);
    const mons = sr.monsters || [];
    if (!mons.length) return true;
    const m = mons[0];
    // 石头蟹闭壳免疫剑击 → 用镐掀翻(2镐内死); 其他怪用剑
    const weapon = /Crab/i.test(m.name) ? 'Pickaxe' : 'Galaxy Dagger'; // 2026-11-03 换装银河匕首(攻27-43, /buy 100g)
    await sel(weapon);
    // 走到目标附近(1-2格)
    const near = [[m.x, m.y + 1], [m.x, m.y - 1], [m.x + 1, m.y], [m.x - 1, m.y], [m.x, m.y + 2], [m.x + 2, m.y]];
    let stood = false;
    for (const [cx, cy] of near) { if (await go(cx, cy)) { stood = true; break; } }
    if (!stood) {
      giveUp++;
      if (giveUp >= 1) { return false; }
      await sleep(800); continue;
    }
    let anyHit = false;
    for (let hit = 0; hit < 8; hit++) {
      const c = await st();
      const cur = (await surr(12)).monsters.find(z => z.name === m.name);
      if (!cur) break;
      await face(faceToward(c.player.x, c.player.y, cur.x, cur.y));
      await sleep(100);
      await post('/use', {});
      anyHit = true;
      await sleep(450);
    }
    if (!anyHit) { log('挥击全空', m.name); await sleep(500); continue; }
    const left = (await surr(12)).monsters.filter(z => z.name === m.name).length;
    log('打', m.name, left ? '还剩' : '✓死', 'HP记录', m.health);
    await sleep(300);
  }
  return (await surr(12)).monsters.length === 0;
}


// FeiyuAutoLoad作弊口(7846): enterMine任意层+给物品+一击碎岩(2026-11-03用户授权)
async function mineTp(level) {
  const r = await post2('http://localhost:7846/mine_tp', { level });
  await sleep(1200);
  const sc = await st();
  return sc.location && sc.location.name === 'UndergroundMine' + level ? sc : null;
}
async function post2(url, body) {
  try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch { return null; }
}

// 自卫+主动进攻(2026-11-01): 4格内见怪就迎击; 伤害统计(用户要求数字化: 打了多少/挨了多少)
let dmgDealt = 0, dmgTaken = 0;
async function defendNear(s) {
  let dist0 = {}, farN = 0;
  await sel('Galaxy Dagger');
  let hp0 = (await st()).player.health;
  for (let hit = 0; hit < 10; hit++) {
    const sr = await surr(10);
    const mons = sr.monsters || [];
    if (!mons.length) break;
    const c = await st();
    const d = mons.map(m => ({ m, d: Math.hypot(m.x - c.player.x, m.y - c.player.y) })).sort((a, b) => a.d - b.d)[0];
    if (d.d > 4.5) break; // 拉开距离就停手(4格内主动进攻, 不等挨打)
    // 隔石挥空检测(2026-10-31 用户报"隔着矿物打怪无限循环"): 连续4刀怪物距离没缩短→被石头挡刀, 放弃这只
    const key = Math.round(d.m.x / 2) + ',' + Math.round(d.m.y / 2);
    if (dist0.key !== key) { dist0.key = key; dist0.n = 0; dist0.d0 = d.d; }
    // 2026-11-01 逼近输出; 2026-11-03 用户"对着空气挥刀": 匕首判定~1格, 贴不上就绝不空挥(空挥=怪不掉血不仇恨)
    if (d.d > 1.4) {
      const step = [[d.m.x, d.m.y + 1], [d.m.x, d.m.y - 1], [d.m.x + 1, d.m.y], [d.m.x - 1, d.m.y], [d.m.x, d.m.y + 2], [d.m.x + 2, d.m.y]]
        .find(([cx, cy]) => { const t = sr.tiles.find(z => z.x === cx && z.y === cy); return t && t.passable; });
      if (step) { await go(step[0], step[1]); }
    }
    const c2 = await st();
    const cur2 = (await surr(6)).monsters.find(z => z.name === d.m.name);
    if (!cur2) continue;
    const dd = Math.hypot(cur2.x - c2.player.x, cur2.y - c2.player.y);
    if (dd > 1.6) { if (++farN >= 2) return 'far'; continue; } // 逼近失败2次→'far', 让外层落回挖矿(防空转, 2026-11-03 15层空转3秒20轮实锤)
    const mh0 = cur2.health ?? null;
    await face(faceToward(c2.player.x, c2.player.y, cur2.x, cur2.y));
    await sleep(60);
    await post('/use', {});
    await sleep(300);
    dist0.n++;
    // 伤害差分: 怪血降=我方输出; 玩家血降=我方挨打
    const after = (await surr(6)).monsters.find(z => z.name === d.m.name);
    if (mh0 != null) dmgDealt += (after ? (mh0 - (after.health ?? 0)) : mh0); // 怪消失=补刀致死, 记满剩血
    const hp1 = c2.player.health;
    if (hp1 < hp0) { dmgTaken += hp0 - hp1; hp0 = hp1; }
    if (dist0.n % 3 === 0) log('伤害统计', '输出' + dmgDealt, '挨打' + dmgTaken);
    if (dist0.n >= 3 && d.d >= dist0.d0 - 0.4) break; // 打不着(隔石/空挥), 快速挪位
    if (dist0.n >= 8) break;
  }
  const hpEnd = (await st()).player.health;
  if (hpEnd < hp0) dmgTaken += hp0 - hpEnd;
  if (dmgDealt || dmgTaken) log('战斗小结', '输出' + dmgDealt, '挨打' + dmgTaken);
  dmgDealt = 0; dmgTaken = 0;
  // 还剩贴脸怪=没打完(隔石挡刀/挥空), 返回stuck让外层挪位/突围
  const cEnd = await st();
  return (await surr(8)).monsters.some(m => Math.hypot(m.x - cEnd.player.x, m.y - cEnd.player.y) <= 2.5) ? 'stuck' : 'done';
}

async function clearFloor() {
  const deadTiles = new Set();
  let rockBreaks = 0, deadAdds = 0;
  for (let round = 0; round < 60; round++) {
    const s = await st();
    // 2026-11-03 用户"锁血": /heal免费, 每轮没满血就补满(原来<40才救急)
    if (s.player.health < s.player.maxHealth - 2) {
      await post('/heal', {});
      continue;
    }
    if (s.player.stamina < STOP_STAMINA) {
      // 2026-11-04: 体力闸改为吃面包(heal只回血不回体力, 原逻辑会空转)
      await sel('Bread');
      const er = await post('/eat', {});
      log('🍞 补体力', Math.round(s.player.stamina), JSON.stringify(er).slice(0, 60));
      await sleep(800);
      continue;
    }
    if (s.player.health < 40) {
      await post('/heal', {});
      await sleep(400);
      continue;
    }
    if (s.time.timeOfDay >= STOP_TIME) return 'time';
    if (round % 5 === 0) {
      // 不再发/resume: 会解开锁时间作弊(2026-11-03); 失焦卡死由弹窗Esc兜底+Unstick自愈
      const mm = await get('/menu').catch(() => null); // 卡死弹窗兜底(Leave/Do类Esc可关)
      // nofocus:true = 不调 SetForegroundWindow(2026-11-05 反编译实锤: Escape 分支只走游戏内
      // receiveKeyPress(27), 不发 keybd_event) → 这一下不再抢用户前台
      if (mm && mm.open && mm.type === 'DialogueBox') { await post('/key', { key: 'Escape', nofocus: true }); log('心跳: Esc关卡死弹窗(纯后台)'); await sleep(600); }
      log('清层心跳 r' + round, compactState(s));
    }
    // 自卫+主动进攻(2026-11-01 用户"挨打就要反击"): 4格内看见怪就打, 不等贴脸
    if ((s.player && Math.hypot(0, 0) === 0)) {
      const sr0 = await surr(10);
      const near = (sr0.monsters || []).filter(m => Math.hypot(m.x - s.player.x, m.y - s.player.y) <= 4.0);
      if (near.length) {
        const dr = await defendNear(s);
        if (dr === 'stuck') {
          // 打不着(隔石): 挪开4格内可走格; 无处可挪→不continue, 落回挖矿(挖开围困)
          const sr1 = await surr(10);
          const esc = sr1.tiles.filter(t => t.passable && Math.hypot(t.x - s.player.x, t.y - s.player.y) > 2.5)
            .sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y));
          let moved = false;
          for (const f of esc.slice(0, 3)) {
            const r = await post('/move', { x: f.x, y: f.y }).catch(() => null);
            if (r && r.ok !== false) { log('打不着怪→挪位', f.x, f.y); await sleep(900); moved = true; break; }
          }
          if (moved) continue;
          log('被围死, 转入挖矿突围');
        } else if (dr === 'far') {
          // 够不着的怪(2.5~4格卡地形): 不管它, 落回挖矿(否则空转死循环)
        } else continue;
      }
    }
    const lad = await get('/ladder');
    if (lad.ladderSpawned && lad.ladder) return 'ladder';
    if (lad.shaft) return 'shaft';
    const sr = await surr(10);
    const rocks = sr.tiles.filter(t => (t.object === 'Stone' || t.isStone || /Node|Barrel/i.test(t.object || ''))
      && !deadTiles.has(t.x + ',' + t.y));
    // 冲刺模式(2026-11-03 用户"两晚才15层要介入"): 下楼优先于清层——最近石头优先不绕路; 每敲12块没出梯→换区域再敲(梯子=概率掉落, 集中敲一小片最省时间)
    rocks.sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y));
    if (!rocks.length || (rockBreaks > 0 && rockBreaks % 12 === 0)) {
      // 2026-11-03 用户"能一下扫描到没梯子吗": 别拿半径10当全层——先同层warp换区(绕地形墙), 再30格复扫, 全空才算清完
      let wide = await surr(30).catch(() => null);
      if (!wide) { await sleep(1500); wide = await surr(30).catch(() => null); } // 失败重试一次(桥限流)
      const wideRocks = (wide && wide.tiles) ? wide.tiles.filter(t => (t.object === 'Stone' || t.isStone) && !deadTiles.has(t.x + ',' + t.y)) : [];
      if (wideRocks.length) {
        const tgt = wideRocks.sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y)).slice(-3)
          .find(t => { const n = wide.tiles.find(z => z.x === t.x && z.y === t.y + 1); return n && n.passable; });
        const spot = tgt ? { x: tgt.x, y: tgt.y + 1 } : wide.tiles.filter(t => t.passable).sort((a, b) => Math.hypot(b.x - s.player.x, b.y - s.player.y) - Math.hypot(a.x - s.player.x, a.y - s.player.y))[0];
        if (spot) {
          const w = await warp(s.location.name || ('UndergroundMine' + startFloor), spot.x, spot.y, { tries: 1, polls: 2, wait: 700 }).catch(() => null);
          if (w && !w.failed) { log('同层warp换区→', spot.x, spot.y, '(远处有石' + wideRocks.length + ')'); continue; }
          // 桥拒warp(楼层超解锁记录): mine_tp重进同层=重生成布局, 石头刷新到出生点旁(2026-11-04 45层空转死循环修)
          const curLv = parseInt((s.location?.name || '').replace(/[^0-9]/g, '')) || startFloor;
          const tp5 = await mineTp(curLv);
          if (tp5) { log('⚡warp被拒→重进同层重生成', curLv); await post('/pause', {}); continue; }
        }
      }
      const far = sr.tiles.filter(t => t.passable && (Math.abs(t.x - s.player.x) > 3 || Math.abs(t.y - s.player.y) > 3));
      if (far.length && rocks.length === 0 ? false : true) {
        let moved = false;
        for (const f of far.slice(0, 4)) {
          const r = await post('/move', { x: f.x, y: f.y }).catch(() => null);
          if (r && r.ok !== false) { moved = true; await sleep(900); break; }
        }
        if (!moved && !rocks.length) break;
        if (rocks.length) continue;
      } else if (!rocks.length) break;
      if (!rocks.length) continue;
    }
    const rock = rocks[0];
    const before = invSnapshot(await st());
    const r = await standAdj(rock.x, rock.y);
    if (!r) {
      // 够不着(被地形围死): 拉黑否则下一轮又选同一块→原地死转(2026-11-01用户实测卡273秒案)
      deadTiles.add(rock.x + ',' + rock.y);
      log('石头够不着拉黑', rock.x, rock.y);
      // 废层判定(2026-11-03 用户"15层一直怼墙"): 拉黑10块=这层地形全是高台够不着, 立刻放弃别磨
      if (++deadAdds >= 10) return 'deadfloor';
      continue;
    }
    const c = await st();
    await sel('Pickaxe');
    await face(faceToward(c.player.x, c.player.y, rock.x, rock.y));
    await sleep(120);
    // 铜节点硬皮(用户实测2镐敲不碎): 连击至消失(最多8镐), 须连续2次确认消失才break(防动画未落地误判)
    let goneStreak = 0, hits = 0;
    for (; hits < 8; hits++) {
      await post('/use', {});
      await sleep(380);
      const chk = (await surr(4)).tiles.find(t => t.x === rock.x && t.y === rock.y);
      if (!chk || !chk.object) { goneStreak++; if (goneStreak >= 2) break; }
      else goneStreak = 0;
    }
    const after = (await surr(8)).tiles.find(t => t.x === rock.x && t.y === rock.y);
    if (after && after.object) {
      if (hits >= 8) deadTiles.add(rock.x + ',' + rock.y); // 8镐还打不动才算假石头
      else { log('石头中途够不着, 重试', rock.x, rock.y); deadTiles.delete(rock.x + ',' + rock.y); }
    }
    if (!after || !after.object) {
      oresMined += Math.max(0, snapshotGain(before, invSnapshot(await st())));
      rockBreaks++;
      await go(rock.x, rock.y).catch(() => null);
      await sleep(250);
    }
  }
  return 'cleared';
}

async function descend(kind) {
  const lad = await get('/ladder');
  const target = kind === 'shaft' ? (lad.shaft || lad.ladder) : (lad.ladder || lad.shaft);
  if (!target) return false;
  // ✅定稿(10-31实测): 梯子格passable=false, pathfinder拒走; 唯一触发=站邻格面朝梯子 /interact
  let adj = await standAdj(target.x, target.y);
  // 梯子被石头围死时清障再试(最多2轮, 2026-11-01卡4层stuckladder死循环修)
  for (let t = 0; t < 2 && !adj; t++) {
    const sr = await surr(10);
    const near = sr.tiles.filter(t2 => (t2.object === 'Stone' || t2.isStone)
      && Math.abs(t2.x - target.x) + Math.abs(t2.y - target.y) <= 2
      && !deadTiles.has(t2.x + ',' + t2.y));
    if (!near.length) break;
    log('梯子被围, 清障', near.slice(0, 3).map(r0 => r0.x + ',' + r0.y).join(' '));
    await sel('Pickaxe');
    for (const r0 of near.slice(0, 3)) {
      const sa = await standAdj(r0.x, r0.y);
      if (!sa) continue;
      const c = await st();
      await face(faceToward(c.player.x, c.player.y, r0.x, r0.y));
      await sleep(120);
      for (let h = 0; h < 5; h++) { await post('/use', {}); await sleep(380); }
      await sleep(300);
    }
    adj = await standAdj(target.x, target.y);
  }
  if (!adj) { log('够不着梯子(清障后仍不行)', JSON.stringify(target)); await sleep(300); return false; }
  const c = await st();
  await face(faceToward(c.player.x, c.player.y, target.x, target.y));
  await sleep(150);
  await post('/interact', {});
  await sleep(2500);
  return true;
}

const s0 = await st();
// 每日运气播报(用户要求: 起床先看占卜 → /state 直接给 dailyLuck, 不用开电视)
log(`📺 每日运气 ${s0.player.dailyLuck >= 0.05 ? '★★精灵非常开心(黄金日!)' : s0.player.dailyLuck >= 0.02 ? '✓不错' : s0.player.dailyLuck <= -0.05 ? '✗很灰(该种田别下洞)' : '○平平'}`, s0.player.dailyLuck);
await post('/resume', {}); // 铁律⑦: 会话启动自动恢复(暂停端点传false无效, 必须用/resume)
log('== 挖矿+战斗 v0.7 开始 ==', compactState(s0), '| 目标层', TARGET_LEVEL);
// 清单#1联动: 出门下矿前顺手烧锭(原料够一锭就烧, 不占额外窗口)
if (s0.location && /FarmHouse/.test(s0.location.name || '')) {
  const cnt = (n) => { const it = (s0.inventory || []).find(i => i && i.name === n); return it ? (it.stack ?? it.count ?? 0) : 0; };
  if (cnt('Copper Ore') >= 5 && cnt('Coal') >= 1) {
    log('原料够, 下矿前烧锭');
    spawnSync('node', ['craft-smelt.mjs', '1'], { cwd: 'D:/StardewAI', stdio: 'inherit' });
  }
}
// 深夜自动睡觉存档(forever 常驻的关键): 21:00后 或 凌晨 → 睡到天亮再挖
if (s0.time.timeOfDay >= 2100 || s0.time.timeOfDay < 600) {
  log('深夜', s0.time.timeOfDay, '→ 先睡觉存档');
  console.log(JSON.stringify(await warp('FarmHouse', 9, 9)));
  const day0 = (await st()).time.dayOfMonth;
  await post('/sleep', {});
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const s = await st();
    if (s.time.dayOfMonth !== day0) { log('✓ 新一天 Day' + s.time.dayOfMonth, '钱', s.player.money); break; }
  }
}
// 电梯=直达最深层(矿层就是独立地图, maxFloor由到达历史解锁); 落点回退链
let ev = null;
for (let i = 0; i < 3 && !ev; i++) { ev = await get('/mine/elevator').catch(() => null); if (!ev) await sleep(1500); }
// 电梯读数决定起点, 读失败重试3次仍失败→宁可用上次已知值也不从1层爬
const maxFloor = ev && ev.maxFloor > 1 ? ev.maxFloor : 15; // 已解锁15(2026-11-03), 瞎兜底1=从1层爬14层的惨案
// 从最深层往下找第一个"真落地"的层(高層warp会假成功, 落点验证必须过)
// 2026-11-02 用户"磨蹭太久被动传送回家": 入口总预算90s, 超时=退回1层开工; 桥拒绝(rejected)→立刻换下一层不重试
let startFloor = 1, entered = null;
// 作弊快道(2026-11-03): mine_tp无视落点站不站得住, 一次直达
const tp = await mineTp(maxFloor);
if (tp) { entered = { tp: true }; startFloor = maxFloor; log('⚡作弊直达层', startFloor); }
const entryDeadline = Date.now() + 90000;
const ENTRY_POINTS = [[5, 5], [5, 6], [4, 5], [6, 5], [12, 6], [10, 5]];
for (let f = maxFloor; f >= 1 && !entered; f--) { // ≤电梯解锁maxFloor的层warp真落地(矿10验证); 超解锁范围桥会拒
  for (const [ex, ey] of ENTRY_POINTS) {
    if (Date.now() > entryDeadline) break;
    const e2 = await warp('UndergroundMine' + f, ex, ey, { tries: 1, polls: 3, wait: 800 }).catch(() => null);
    const sc = await st();
    if (e2 && !e2.failed && ('UndergroundMine' + f) === (sc.location?.name || '')) {
      entered = e2; startFloor = f;
      break;
    }
    if (e2 && e2.rejected) break; // 该层被桥拒(落点全站不住)→换下一层
  }
  if (Date.now() > entryDeadline) { log('入口预算90s用尽→1层开工'); break; }
}
log('电梯直达层', startFloor);
console.log(JSON.stringify(entered));
// 2026-11-03 用户授权"锁定时间小作弊": /pause只冻时钟不冻世界(§二十九反编译实锤), 一天能下无限层; 跳天洗层前/resume恢复
await post('/pause', {});
log('⏱ 已锁时间(挖矿继续, 时钟停)');
await sleep(600);
let why = 'levels';
let napCount = 0;
for (let level = startFloor; level <= TARGET_LEVEL; level++) {
  const r = await clearFloor();
  if (r === 'exhausted' || r === 'time') { why = r; break; }
  if (r === 'deadfloor') {
    log('废层→作弊下到层' + (level + 1));
    const tp4 = await mineTp(level + 1);
    if (tp4) { level = level; why = 'deadfloor'; await post('/pause', {}); continue; }
    await post('/resume', {});
    console.log(JSON.stringify(await warp('FarmHouse', 9, 9)));
    const dayD = (await st()).time.dayOfMonth;
    await post('/sleep', {});
    for (let i = 0; i < 40; i++) { await sleep(4000); if ((await st()).time.dayOfMonth !== dayD) { log('✓ 跳天 Day' + (await st()).time.dayOfMonth); break; } }
    why = 'deadfloor'; break;
  }
  log(`第${level}层清完(${r}) 矿物: ${await invOres()}`);
  if (r === 'cleared') {
    const lad = await get('/ladder');
    const wideChk = await surr(30).catch(() => null);
    const anyRock = (wideChk && wideChk.tiles) ? wideChk.tiles.filter(t => (t.object === 'Stone' || t.isStone)) : []; // 主循环无黑名单, 只看全层还有没有石头
    if (anyRock.length) {
      // 清完但全层还有石=剩余的全是死角货 → 直接重进本层重生成(enterMine刷新布局, 2026-11-04 warp落地轮询超时实证)
      const sNow = await st();
      // 同层重生成无效(enterMine布局确定性, 死角永远死角, 2026-11-04 99次实证) → 直接下一层
      log('⚡死角货' + anyRock.length + '→作弊下一层', level + 1);
      const tp6 = await mineTp(level + 1);
      if (tp6) { await post('/pause', {}); continue; } // continue自带level++正好指到新层
      await sleep(3000); level--; continue;
    }
    if (!lad.ladderSpawned) {
      // 2026-11-03作弊流: 没梯子=这层榨干了, mine_tp直接下到没去过的层, 不用跳天
      const nxt = level + 1;
      const tp2 = await mineTp(nxt);
      if (tp2) { log('⚡无梯→作弊下到层', nxt); await post('/pause', {}); continue; } // continue自带level++正好指到nxt
      await post('/resume', {});
      napCount++;
      if (napCount > 5) { why = 'noladder'; break; }
      log('石头清完但没梯子→睡觉刷新矿层(第' + napCount + '次)');
      await warp('FarmHouse', 3, 11).catch(() => null);
      const day0 = (await st()).time.dayOfMonth;
      await post('/sleep', {});
      for (let i = 0; i < 40; i++) { await sleep(4000); const s2 = await st(); if (s2.time.dayOfMonth !== day0) { log('✓ 跳到 Day' + s2.time.dayOfMonth); break; } }
      let reentered = false;
      for (let f = startFloor; f >= 1 && !reentered; f--) { // 2026-11-03 用户指出: 跳天重进也直达电梯最高层, 不再从5层磨
        for (const [ex, ey] of [[5, 5], [5, 6], [4, 5], [6, 5], [10, 5], [12, 6], [11, 6], [16, 10], [20, 20]]) {
          const e2 = await warp('UndergroundMine' + f, ex, ey).catch(() => null);
          await sleep(500);
          const sc = await st();
          if (e2 && !e2.failed && /UndergroundMine/.test(sc.location?.name || '')) {
            startFloor = f; reentered = true; break;
          }
        }
      }
      if (!reentered) { log('睡觉后重进矿失败, 撤出'); why = 'noladder'; break; }
      await post('/pause', {}); // 跳天重进后补锁时间
      level = startFloor - 1; // for循环++后回到startFloor同层重清
      continue;
    }
  }
  const descended = await descend(r === 'shaft' ? 'shaft' : 'ladder');
  if (!descended) {
    // 2026-11-03 用户"目标实现不了要介入": 梯子被地形围死(清障无效)=当天死局, 清完层不重生——立刻睡觉跳天洗楼层, 不再无限重进
    log('梯子被围死→作弊下到层' + (level + 1));
    const tp3 = await mineTp(level + 1);
    if (tp3) { level = level; why = 'stuckladder'; await post('/pause', {}); continue; }
    await post('/resume', {});
    console.log(JSON.stringify(await warp('FarmHouse', 9, 9)));
    const day0 = (await st()).time.dayOfMonth;
    await post('/sleep', {});
    for (let i = 0; i < 40; i++) {
      await sleep(4000);
      const s2 = await st();
      if (s2.time.dayOfMonth !== day0) { log('✓ 跳天成功 Day' + s2.time.dayOfMonth); break; }
    }
    why = 'stuckladder'; break;
  }
  const s = await st();
  const lvl = (await get('/ladder')).level;
  if (!/Mine/i.test(s.location?.name || '')) { log('意外离开矿洞:', s.location?.name); break; }
  totalLevels = lvl;
  await post('/pause', {}); // 换层后桥时间锁会失效→补锁(2026-11-03实测: 14层冻着15层就走了)
  log('→ 到达层', lvl, compactState(s));
}
log(`== 撤出(${why}) 层数${totalLevels} 矿物: ${await invOres()} ==`);
await post('/resume', {}); // 恢复时钟(锁时间作弊收尾)
await go(10, 4).catch(() => null);
await sleep(1500);
let s = await st();
if (!/FarmHouse/.test(s.location?.name || '')) {
  console.log(JSON.stringify(await warp('FarmHouse', 9, 9)));
  s = await st();
  if (!/FarmHouse/.test(s.location?.name || '')) { await warp('Farm', 64, 15); await warp('FarmHouse', 9, 9); }
}
s = await st();
log('结束:', compactState(s), '| 矿物:', await invOres());
