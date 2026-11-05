// 全自主日循环 v3 (2026-10-28)
// 政策(用户拍板): 只卖 鱼+农作物+垃圾(lib.isSellable 白名单); 其余存木箱/留背包 绝不卖
//                 体力用到 <15 才收工(用完再睡不浪费); 物理点击有前台互锁(用户可能玩别的游戏)
// 流程/天: 一键收+右键补收 → 信箱 → 浇水 → 通用补种 → 扩田 → 攒木做箱 → 白名单卖货/存箱
//          → 海滩钓鱼(fishbot) → 23:00 或体力<15 收工 → 尾清仓 → 回家睡觉
// 一次运行最多连玩 3 天; 锁文件防并发(cron 每15分钟会再拉起, 靠锁避免双实例打架)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import {
  st, warp, sel, useOn, waterAll, log, invCount, sleep, post, get, surr,
  fishbotSet, foregroundIsStardew,
  isSellable, shouldStore, harvestAll, sellAndStore,
  findChest, storeToChest, craftChest, placeChestNearHouse,
  chopWood, expandField, clearDeadCrops,
  compactState, ledInc, ledSnapshot, memAdd, memList, regionConfig
} from './lib.mjs';

// 收工体力目标(star rest 借鉴: 阈值收口成常量, 调整不用翻流程) — 政策仍是"用完再睡不浪费"
const REST_TARGET = 15;

// ⭐2026-11-06 存档事故: /sleep 返回 ok 不等于写盘。每次睡完必须看 SaveGameInfo 的 mtime 有没有前进,
//   否则会像冬3~冬8 那样"天天换日、一次没存"(存档停在冬2 10:19, 重读丢了 6 天)。
const SAVE_INFO = 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo';
const saveMtime = () => { try { return fs.statSync(SAVE_INFO).mtimeMs; } catch { return 0; } };

// ===== 锁文件: 防止 cron 重复拉起多实例 =====
const LOCK = 'D:/StardewAI/.day-loop.lock';
try {
  const age = Date.now() - fs.statSync(LOCK).mtimeMs;
  if (age < 10 * 60 * 1000) {
    console.log('已有 day-loop 实例在跑(锁龄', Math.round(age / 1000), 's), 退出');
    process.exit(0);
  }
} catch { /* 无锁, 继续 */ }
// ⭐双保险(2026-11-06): 锁文件曾被外部误删 → 巡检+手动各拉一个实例, 两个实例抢一个角色
//   (症状: 一边在海滩开 fishbot 一边在田里浇水 = "田里抛竿/拿鱼竿浇水")。进程级再查一次。
try {
  const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File D:/StardewAI/get-dayloop-pids.ps1', { encoding: 'utf8', timeout: 15000 });
  const others = out.split(/\s+/).map(Number).filter(pid => pid && pid !== process.pid);
  if (others.length) { console.log('发现其他 day-loop 进程', others, ', 退出(防两实例抢角色)'); process.exit(0); }
} catch { /* 进程查询失败则退回锁文件兜底 */ }
fs.writeFileSync(LOCK, process.pid + ' ' + new Date().toISOString());
const heartbeat = setInterval(() => { try { fs.utimesSync(LOCK, new Date(), new Date()); } catch { } }, 60000);
process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch { } });

const SEED_RE = /Seeds$|Starter$|Shoot$/i;

async function checkMail() {
  // 查信箱: 对 (68,16) 互动, 有信逐封关掉(自动接任务)
  log('查信箱...');
  await warp('Farm', 67, 16);
  await post('/face', { direction: 1 });
  await sleep(150);
  const mail0 = await get('/mail').catch(() => null);
  if (!mail0?.has_mail) { log('无信件'); return; }
  log('有信:', (mail0.unread || []).map(u => u.title).join(', '));
  await post('/interact', {});
  await sleep(1200);
  // 逐封关闭 (LetterViewerMenu: 关一封弹下一封)
  for (let i = 0; i < 8; i++) {
    const s = await st();
    if (s.activeMenu?.type !== 'LetterViewerMenu') break;
    const m = await get('/menu').catch(() => null);
    log('读信:', m?.letterTitle || '(无标题)');
    await post('/menu_close', {});
    await sleep(900);
  }
  const s = await st();
  if (s.activeMenu) { await post('/menu_close', {}); await sleep(400); }
  log('信件处理完');
}

// 白名单清仓(实现已抽到 lib.sellAndStore, 手动/巡检也能随时调)
async function manageInventory(chest, force = false) {
  const s = await st();
  if (!force && s.inventory.filter(i => i.name).length < 10) return 0;
  log('fishbot OFF =', await fishbotSet(false));
  return sellAndStore(chest, force);
}

// 补种: 背包里所有种子通用, 种到空翻地
async function replantAll() {
  for (;;) {
    const s = await st();
    const seed = s.inventory.find(i => SEED_RE.test(i.name) && (i.stack ?? 1) > 0);
    if (!seed) break;
    await sel(seed.name);
    const cur = (await surr(14)).tiles.filter(t => t.terrain === 'HoeDirt' && !t.crop && !t.object);
    if (!cur.length) break;
    let planted = 0;
    for (const t of cur.slice(0, seed.stack ?? 1)) {
      const r = await useOn(t.x, t.y);
      if (r.ok) planted++;
      await sleep(220);
    }
    log('种', seed.name, planted, '株');
    if (!planted) break;
  }
}

// ===== 邮件任务(用户拍板: 有邮件优先做任务) =====
// quest 101 = 乔迪要花椰菜(/gift 交付, NPC 必须在当前地图)
// 排程经验(10-29): 乔迪早晨 8-11 点在家(JoshHouse), 下午会出门 → tryQuests 在清晨跑正好
async function tryQuests() {
  let s = await st();
  if (!(s.inventory.find(i => i.name === 'Cauliflower'))) return;
  log('任务: 有花椰菜 → 送给乔迪(先试她家, 再试镇上)');
  await post('/warp_into', { location: 'JoshHouse' });
  await sleep(2500);
  let r = await post('/gift', { target: 'Jodi', item: 'Cauliflower' }).catch(() => null);
  log('gift Jodi@home →', JSON.stringify(r).slice(0, 100));
  if (!r?.ok) {
    const w = await warp('Town', 50, 57);
    if (!w.failed) {
      r = await post('/gift', { target: 'Jodi', item: 'Cauliflower' }).catch(() => null);
      log('gift Jodi@Town →', JSON.stringify(r).slice(0, 100));
    }
  }
}

// ===== 单日流程 =====
async function playOneDay(day) {
  // ⭐2026-11-06: 晨间先出床 —— 睡醒人躺在床上, 后续 waterAll/寻路全在床里空磨几十分钟(两次实测)。
  //   ⚠️主持(7842) 严禁 /wakeup(会把角色瞬移); 下床一律用 /warp Farm 64,15(实测能清 isInBed)。
  if ((await st()).player?.isInBed) {
    log('晨间在床上, warp 农场门口出床');
    await warp('Farm', 64, 15).catch(() => { });
    await sleep(2000);
  }
  // 0. 先找木箱(农场→农舍都扫) + 清晨满包先清仓(带上箱子可存非卖品)
  let chest = await findChest(18);
  if (chest) chest.loc = (await st()).location?.name || 'Farm'; // 箱子可能扫在任意地图, 按实际位置记
  if (!chest) {
    await warp('FarmHouse', 9, 10);
    chest = await findChest(10);
    if (chest) chest.loc = 'FarmHouse';
  }
  log('木箱:', chest ? JSON.stringify(chest) : '暂无');
  {
    const s0 = await st();
    if (s0.inventory.filter(i => i.name).length >= (s0.player.maxItems || 12) - 2) {  // 2026-11-06: 原写死10(12格包), 36格包 11格就误判满 → 钓鱼段提前收工(视频验收抓到)
      log('清晨满包, 先清仓再干活');
      await manageInventory(chest);
    }
  }
  // 0.5 无箱则做箱(合成自带防掉落闸; 砍树回农场)
  if (!chest) {
    let s = await st();
    if (invCount(s, 'Wood') < 50 && s.player.stamina > 60) {
      await warp('Farm', 65, 21);
      await chopWood(50, 40);
    }
    s = await st();
    if (invCount(s, 'Wood') >= 50) {
      await craftChest();
      s = await st();
      if (s.inventory.some(i => i.name === 'Chest')) {
        await sel('Chest');
        chest = await placeChestNearHouse();
        if (chest) chest.loc = 'Farm';
      } else {
        chest = await findChest(18);
        if (chest) chest.loc = 'Farm';
      }
    } else {
      log('木头', invCount(s, 'Wood') + '/50, 继续攒');
    }
  }
  // 1. 农活
  log(JSON.stringify(await warp('Farm', 65, 21)));
  // ⭐2026-11-05 事故: 换季那一刻旧季作物全枯, 死株占着 HoeDirt 不会消失, 而补种只认空翻地
  //   → 从秋1到秋19 整整十八个游戏日田里一颗都没种上(收入全靠钓鱼), 用户看到"农作物都死了"。
  //   清死株名单只认存档 XML(桥的 /surroundings 不暴露 dead 字段), 详见 lib.clearDeadCrops 注释。
  {
    const cleared = await clearDeadCrops().catch(e => { log('清死株异常:', String(e).slice(0, 90)); return 0; });
    if (cleared) ledInc('deadCropsCleared', cleared, '换季清死株');
  }
  // 2026-11-05 收菜合并为 harvestAll: /harvest 本来就能收复生作物(草莓/蓝莓), 只信背包差分不信计数,
  // 收完自动扫 /debris 把多产的掉落走过去捡掉 —— 整段零点击零前台
  {
    const h = await harvestAll(15, 8, true).catch(e => { log('harvestAll 异常:', String(e).slice(0, 90)); return null; });
    if (h) {
      log('收菜完成: 实际入包', h.gained, '件', (h.items || []).map(([n, c]) => `${n}x${c}`).join(',') || '(空)',
        '| 桥计数', h.harvested, '| 补捡掉落', h.picked, '件');
      if (h.gained) ledInc('cropsHarvested', h.gained, 'harvestAll 入包差分');
    }
  }
  await checkMail();
  await waterAll(14);
  await replantAll();
  await waterAll(14); // 新种的苗当天也要浇到(补一轮)
  await tryQuests(); // 邮件任务优先于杂务(有可交付物品时)

  // 扩田: 种子还有剩但没地 → 贴着田边翻新格再种; ⚠️受 farm-region.json 区域门控(star 借鉴,
  // 冻结策略不再靠口头规矩而是读配置), M1 完成前 policy=冻结 一律不扩
  {
    const s = await st();
    const seedsLeft = s.inventory.filter(i => SEED_RE.test(i.name)).reduce((a, i) => a + (i.stack ?? 1), 0);
    const region = regionConfig();
    if (seedsLeft > 0 && (region.policy === '冻结' || region.expansionDirection === null)) {
      log(`扩田跳过: 区域策略=${region.policy}(${region.note})`);
    } else if (seedsLeft > 0) {
      const tilled = await expandField(Math.min(seedsLeft, 10));
      if (tilled > 0) await replantAll();
    }
  }

  // 3. 钓鱼 (体力<15 收工 = 用完再睡不浪费; 背包>=10 清仓)
  const bw = await warp('Beach', 44, 35);
  log('去海滩:', bw?.failed ? '失败 ' + JSON.stringify(bw).slice(0, 80) : '成功'); // 2026-11-06: 钓鱼段曾被无声跳过, 补日志
  // ⭐2026-11-06: /warp 是"下一 tick 落地", 只查 bw.failed 会在人还没离开农场时就开钓 → 田里抛竿(用户抓现行)
  let onBeach = false;
  for (let i = 0; i < 8; i++) {
    await sleep(1000);
    if ((await st()).location?.name === 'Beach') { onBeach = true; break; }
  }
  if (!onBeach) log('warp 海滩没落地, 跳过钓鱼段(防田里抛竿)');
  if (onBeach) {
    // 2026-11-06 坑: 鱼竿名字写死 Bamboo Pole, 实际包里是 Fiberglass Rod → sel 失败举着种子钓一天
    // 2026-11-05 升级: 优先铱鱼竿(能挂饵/浮标), 没有再退回任意竿
    const inv0 = (await st()).inventory;
    const rod = inv0.find(i => /Iridium Rod/i.test(i?.name || '')) || inv0.find(i => /Rod|Pole/i.test(i?.name || ''));
    if (!rod) { log('没有鱼竿, 跳过钓鱼段'); }
    else {
    await sel(rod.name);
    await post('/face', { direction: 1 });
    await sleep(300);
    log('fishbot ON =', await fishbotSet(true));
    let lastReport = '';
    let fishbotKeepalive = 0;
    // ⭐2026-11-06 事故(Day21): 钓到宝箱拿到「高级鱼饵/铱矿石」后 currentItem 变 null, 竿不在手上;
    //   fishbot 依然报 enabled=true、HUD 也写 "Fishbot active!" —— 但一整天 0 抛竿(体力 222 卡 7 小时、0 鱼)。
    //   /state 的 rod.inHand=false 是唯一线索。修复: 每 200s 心跳里顺手校验"手里有竿", 没竿就重选;
    //   再加一道停滞哨兵: 连续 10 次心跳 fishCaught/体力都没动 → fishbot 硬重启(off→on)+重选竿。
    let lastFishCount = (await st()).player?.fishCaught ?? 0;
    let lastStamMark = Math.round((await st()).player?.stamina ?? 0);
    let stallTicks = 0;
    for (;;) {
      await sleep(20000);
      // 2026-11-06: fishbot 弹菜单后会自己罢工(视频验收抓到: 干站 5 小时无横幅) → 每 200s 强制拉回 ON
      if (++fishbotKeepalive % 10 === 0) {
        const sc = await st();
        if (!/Rod|Pole/i.test(sc.player?.currentItem || '')) {
          const r = (sc.inventory || []).find(i => /Iridium Rod/i.test(i?.name || '')) || (sc.inventory || []).find(i => /Rod|Pole/i.test(i?.name || ''));
          if (r) {
            await sel(r.name);
            await post('/face', { direction: 1 });
            await sleep(300);
            log('竿不在手 → 重选', r.name);
          }
        }
        await fishbotSet(true);
      }
      let s = await st();
      // 停滞哨兵: 200s×10=~33 分钟后鱼数和体力都没动 = fishbot 假活, 硬重启一次
      const fc = s.player?.fishCaught ?? 0, sm = Math.round(s.player?.stamina ?? 0);
      if (fc === lastFishCount && sm === lastStamMark) {
        if (++stallTicks >= 10) {
          log('⚠️ 疑似卡钓(10 次心跳 0 鱼 0 体力变化) → fishbot 硬重启');
          await fishbotSet(false).catch(() => { });
          await sleep(1000);
          const invR = (await st()).inventory || [];
          const rr = invR.find(i => /Iridium Rod/i.test(i?.name || '')) || invR.find(i => /Rod|Pole/i.test(i?.name || ''));
          if (rr) await sel(rr.name);
          await post('/face', { direction: 1 });
          await sleep(300);
          await fishbotSet(true).catch(() => { });
          stallTicks = 0;
        }
      } else { stallTicks = 0; lastFishCount = fc; lastStamMark = sm; }
      // ⭐2026-11-05 事故(主持在床上躺一整天): host-night-guard 的兜底在"体力<20"时就把主持送睡,
      //   而本循环的两个退出条件(时间≥23:00 / 体力<15)在换天后全部重置 —— 时间回到 6xx、体力回满 270,
      //   于是循环永远不退出, 人躺在床上空转一整天(fishbot 钓空气)。跨天必须直接退出钓鱼段。
      if (s.time.dayOfMonth !== day) {
        log('天已经翻了(Day' + s.time.dayOfMonth + '), 退出钓鱼段(防跨天空转)');
        await fishbotSet(false).catch(() => { });
        return s;
      }
      if (s.activeMenu && !/BobberBar/i.test(s.activeMenu.type)) {
        if (s.activeMenu.type === 'ItemGrabMenu') {
          const before = s.inventory.length;
          await post('/menu/click', { x: 265, y: 160 }).catch(() => null); // 宝箱先捡
          await sleep(800);
          const s2 = await st();
          if (s2.inventory.length > before) log('宝箱捡到:', s2.inventory[s2.inventory.length - 1]?.name);
          s = s2;
        }
        log('弹菜单', s.activeMenu.type, '→ 关');
        await post('/menu_close', {});
        await sleep(500);
        await post('/menu_close', {});
        await sleep(300);
        s = await st();
      }
      const report = s.inventory.map(i => i.name + 'x' + (i.stack ?? 1)).join(',');
      // ⭐2026-11-06 巡检误判: 这行只在背包**有变化**时才打 → 空钓几分钟日志一片空白是正常的,
      //   别当成卡死。判存活看 .day-loop.lock 的 mtime(60s 心跳) + /state 的 timeOfDay 在不在走。
      if (report !== lastReport) {
        log('时间', s.time.timeOfDay, '体力', Math.round(s.player.stamina), '|', report);
        lastReport = report;
      }
      const slots = s.inventory.filter(i => i.name).length;
      const cap = s.player.maxItems || 12; // 2026-11-06: 36格联机背包别按 12 格包的阈值喊满
      if (slots >= cap - 1) {
        await manageInventory(chest);
        const s3 = await st();
        const slots3 = s3.inventory.filter(i => i.name).length;
        if (slots3 >= cap - 1) {
          log('背包', slots3 + '/12 清不动(前台被占/没箱子), 提前收工防丢鱼');
          break;
        }
        const bw2 = await warp('Beach', 44, 35);
        if (!bw2.failed) {
          const inv2 = (await st()).inventory;
          const rod2 = inv2.find(i => /Iridium Rod/i.test(i?.name || '')) || inv2.find(i => /Rod|Pole/i.test(i?.name || ''));
          if (rod2) await sel(rod2.name);
          await post('/face', { direction: 1 });
          await sleep(300);
          log('fishbot ON =', await fishbotSet(true));
        }
      }
      if (s.time.timeOfDay >= 2300 || s.player.stamina < REST_TARGET) {
        log('收工: 时间', s.time.timeOfDay, '体力', Math.round(s.player.stamina));
        break;
      }
    }
    } // else(有鱼竿) 结束
  }

  // 4. 尾清仓 + 睡觉(重试 3 轮)
  log('fishbot OFF =', await fishbotSet(false));
  await manageInventory(chest, true);
  // ⭐2026-11-06: 钓鱼段被跳过时曾 13:40 就上床 → 睡不成又把 ready-check 挂着堵死鱼鱼。
  //   没到 bedtime(21:00/体力<15)绝不睡, 原地等到点。
  for (let i = 0; ; i++) {
    const sW = await st();
    if (sW.time.dayOfMonth > day) { log('天已经翻了(别人睡了), 直接进入明日'); return sW; }
    if (sW.time.timeOfDay >= 2100 || sW.player.stamina < REST_TARGET) break;
    if (i === 0) log('还早(' + sW.time.timeOfDay + ', 体力' + Math.round(sW.player.stamina) + '), 睡觉段等待到 21:00');
    if (i > 60) { log('等了一小时还没到晚上(异常), 强制结束当日不睡'); return null; }
    await sleep(60000);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    log(JSON.stringify(await warp('FarmHouse', 9, 9)));
    const saveBefore = saveMtime();
    // ⭐2026-11-06 存档事故根因: 原来是"小鱼先睡 → 主持后睡"。主持的 sleep ready 会从前一晚挂到第二天,
    //   小鱼一睡就 2/2 直接换日, 主持自己的睡眠/存档流程根本没跑 → 冬3~冬8 连续 6 天没写盘。
    //   正确顺序: 主持先睡(真实睡眠+ready), 再叫小鱼; 换日后必须校验 SaveGameInfo mtime 前进。
    const r = await post('/sleep', {}).catch(e => ({ error: String(e) }));
    log('主持 sleep:', JSON.stringify(r).slice(0, 150));
    await sleep(4000);
    try { await fetch('http://localhost:7843/sleep', { method: 'POST' }); log('已通知小鱼睡'); } catch { }
    for (let i = 0; i < 15; i++) {
      await sleep(4000);
      const s = await st();
      if (s.time.dayOfMonth > day) {
        // 换天瞬间还没写盘: 存档是 ShippingMenu 结算动画走完 → SaveGameMenu 才落盘(反编译 ShippingMenu.update).
        // 这里原地等 mtime 前进(最长 75s), 别一看到换天就判"没写盘"(2026-11-05 Day6 误报).
        let saveAfter = saveMtime();
        for (let k = 0; k < 25 && saveAfter <= saveBefore; k++) { await sleep(3000); saveAfter = saveMtime(); }
        const saved = saveAfter > saveBefore;
        log('✓ 换天 Day' + s.time.dayOfMonth, '钱', s.player.money, '体力', Math.round(s.player.stamina),
          saved ? `| ✓ 已存档 ${new Date(saveAfter).toLocaleTimeString('zh-CN')}` : '| ⚠️ 存档没写盘! 本条要查');
        return s;
      }
    }
    log('没睡成, 重试', attempt + 1);
  }
  // ⭐睡不成绝不能留主持在床上 —— 挂着的 sleep ready-check 会把鱼鱼的换日/主线程全堵死(两次事故实锤)
  log('3 次没睡成, cancel_sleep 把主持拔下床(防堵鱼鱼), 本日不存档');
  await post('/cancel_sleep', {}).catch(() => { });
  await warp('Farm', 64, 15);
  return null;
}

// ===== 主流程 =====
let s0;
try { s0 = await st(); } catch { console.log('游戏没在跑, 退出'); process.exit(0); }
log('== Day' + s0.time.dayOfMonth, s0.time.timeOfDay, '钱', s0.player.money, '| 前台是星露谷?', await st().then(() => foregroundIsStardew()).catch(() => false));

const MAX_DAYS = 3;
let day = s0.time.dayOfMonth;
let curState = s0;
{
  const rules = memList('rule');
  if (rules.length) log('记忆规矩:', rules.map(r => r.text).join(' / '));
  log('累计账本:', JSON.stringify(ledSnapshot().totals));
}
for (let d = 0; d < MAX_DAYS; d++) {
  try {
    const money0 = curState.player.money;
    const next = await playOneDay(day);
    if (!next) { log('睡觉失败, 退出'); break; }
    // 日结(star 累计账本借鉴): 净额含花费, 只作参考; 卖/存件数由 sellAndStore 内部入账
    const gain = next.player.money - money0;
    ledInc('daysPlayed', 1, 'Day' + day);
    ledInc('moneyEarned', gain, 'Day' + day + ' 净' + gain + 'g');
    memAdd('event', `Day${day}: 钱${next.player.money}(净${gain}g) 体${Math.round(next.player.stamina)} ${next.location?.name || ''}`);
    log('日结 Day' + day, '净', gain + 'g | 账本', JSON.stringify(ledSnapshot().totals));
    curState = next;
    day = next.time.dayOfMonth;
    log('=== 进入 Day' + day + ' ===', compactState(next));
  } catch (e) {
    log('当日流程异常:', e.message);
    try { await fishbotSet(false); } catch { }
    await sleep(5000);
  }
}
log('day-loop 结束');
clearInterval(heartbeat);
