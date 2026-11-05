// newday-trigger v1.0 (2026-11-05): 星露谷每次"新的一天"开始, 自动激活两边的会话
// ---------------------------------------------------------------------------
// "会话"在这里有两半, 机制不同, 别混:
//   鱼鱼(7843): 激活 = 留言板 7850 投一条当日简报(from 肥鱼 to 小肥鱼), 她的管家/会话会读到;
//               顺手把她赖床修掉(只对 7843 用 /wakeup, 7842 严禁 —— 会把主持瞬移)。
//   我(主持侧): 走 ZCode「定时任务通道」——newday-bell.py 往 tasks-index.sqlite 的
//               automation_runs 插一条 trigger='manual' 的 run, 桌面端轮询到就把
//               automation 的 prompt 作为用户消息投进本会话(实测 20s 内 dispatch)。
//               仍然保留 ①newday-pending.json ②留言板 from=day-trigger to=肥鱼
//               作为双保险/记录。巡检读到 pending 就办掉并删除。
// 换日当天的经典坑(2026-11-05 实测, 见方案文档 §40.5):
//   两端停在 t=600, activeMenu=ShippingMenu(真顶层可能是 ReadyCheckDialog),
//   时间不走 → 睡觉贴床超时 → day-loop 退出。这里自动 /menu_close 两端各一次即解。
// 常驻: node newday-trigger.mjs   (日志 newday-trigger.log, 状态 newday-state.json)
// 调试: GET http://127.0.0.1:7861/status   POST /force(强制重放当天)
import fs from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const HOST = 'http://localhost:7842';
const FISH = 'http://localhost:7843';
const BOARD = 'http://localhost:7850';
const DIR = 'D:/StardewAI';
const STATE = DIR + '/newday-state.json';
const PENDING = DIR + '/newday-pending.json';
const LOG = DIR + '/newday-trigger.log';
const PORT = 7861;

const POLL_MS = 20000;      // 20 秒一轮
const MORNING_FROM = 610;   // t<610 的 isInBed 是"刚睡醒"正常态, 不碰
const MORNING_TO = 1200;    // 只在早晨窗口修赖床: 她晚上主动睡觉不能被拽下床
const WAKE_RETRY_MS = 120000;
const WAKE_MAX_TRIES = 3;
// 换日菜单处置(2026-11-05 修): ShippingMenu **绝不能** /menu_close —— 它是存档链条的一环!
// 反编译证据 Menus.ShippingMenu.update(): 结算菜单自己持一个 saveGameMenu, 结算动画走完才
// `new SaveGameMenu()` 真正写盘; 把它从 activeClickableMenu 摘掉 = 这一天永远不存档.
// (冬3~冬8 六天没写盘的真凶就是这个: 触发器换日时把 ShippingMenu 当死锁菜单关掉了.)
// 三档处置: ReadyCheckDialog→关 / ShippingMenu→点OK / SaveGameMenu→只等不碰
// ⭐2026-11-06 死锁(冬7 晨实锤): 农工的 LevelUpMenu 也会堵死换日存档 —— 主持的 SaveGameMenu 里
//   `if (Game1.newDaySync.readyForSave()) loader = SaveGame.Save();` 要等所有玩家 ready, 农工停在
//   升级菜单里发不出 ready → 主持永远不写盘(临时文件都不建), SMAPI 判 IsSaving() → "before save." 之后
//   日志静默、mod 事件停摆, 10 分钟才靠 night-guard 破环解开。升级菜单必须当换日菜单处理。
const STALE_MENUS = new Set(['ReadyCheckDialog', 'ShippingMenu', 'LevelUpMenu']);
// 手动锁时间(节日玩耍)豁免: 存在 time-lock.flag 时卡死哨兵不动手
// —— /pause 锁住 timeOfDay 后, 时间本来就不走, ReadyCheckDialog(节日报名/睡觉)会被误判成死锁。
// 用法: 节日结束 /resume 后删掉 flag。
const TIMELOCK = DIR + '/time-lock.flag';

// 存档健康检查(2026-11-06 事故): 换日不等于存档。冬3~冬8 天天换日但 SaveGameInfo 一直停在冬2 10:19,
// 重读丢了 6 天。每次换日把存档 mtime 一起报出来, 一眼能看出"这天到底写盘没有"。
const SAVE_INFO = 'C:/Users/Administrator/AppData/Roaming/StardewValley/Saves/肥鱼肥鱼_452739119/SaveGameInfo';
const saveAgeMin = () => { try { return (Date.now() - fs.statSync(SAVE_INFO).mtimeMs) / 60000; } catch { return -1; } };
const saveLine = () => { const m = saveAgeMin(); return m < 0 ? '存档: 读不到' : m <= 10 ? `存档: ✓ ${Math.max(0, Math.round(m))} 分钟前写盘` : `存档: ⚠️ ${Math.round(m)} 分钟前(可能没写!)`; };

const WEATHER = { 0: '晴☀️', 1: '雨🌧️(不用浇水)', 2: '雷暴⛈️', 3: '风🍂', 4: '节日🎪', 5: '雪❄️', 6: '暴风雪🌨️', 7: '绿雨🍀' };
const SEASON = { spring: '春', summer: '夏', fall: '秋', winter: '冬' };

// 冬季钓鱼日历(2026-11-05 用户点名: 鱼鱼这个冬天要钓鱼, 要陪)
// 数据来源: 游戏本体 Data/Festivals/winter8(冰雪节脚本) + BWIKI(鱿鱼节/夜市)
const WINTER_EVENTS = {
  8: '🧊 冰雪节 09:00-14:00 煤矿森林(9点前进不去)·冰钓比赛: 钓满 5 条才赢威利; 只有"森林池塘"计入, 河里钓的不算; 结束后自动回农场 22:00',
  12: '🦑 鱿鱼节 Day1 06:10 起全天 沙滩钓鱿鱼; 兑奖档位 1铜/3铁/5金/8铱(金=珍珠+咖啡)',
  13: '🦑 鱿鱼节 Day2; 兑奖档位 2铜/5铁/7金/10铱(铱=鱿鱼帽)',
  15: '🌙 夜市 Day1 17:00-02:00 沙滩; 潜艇 23:00 前入场(1000g/人, 深海鱼), 美人鱼船 00:30 前',
  16: '🌙 夜市 Day2 17:00-02:00 沙滩; 潜艇 23:00 前 / 美人鱼船 00:30 前',
  17: '🌙 夜市 Day3 17:00-02:00 沙滩; 潜艇 23:00 前 / 美人鱼船 00:30 前',
};
const eventOf = (season, day) => (season === 'winter' ? WINTER_EVENTS[day] || null : null);
const tomorrowEvent = (season, day) => (season === 'winter' && day < 28 ? WINTER_EVENTS[day + 1] || null : null);

const log = (...a) => { const l = `[${new Date().toISOString().slice(5, 19)}] ${a.join(' ')}`; console.log(l); try { fs.appendFileSync(LOG, l + '\n'); } catch { } };
const jj = async (base, path, opt = {}) => (await fetch(base + path, { signal: AbortSignal.timeout(12000), ...opt })).json();

let st = { hostKey: null, fishKey: null, fishWakeKey: null, fishWakeTries: 0, fishWakeAt: 0, lastFire: null };
try { Object.assign(st, JSON.parse(fs.readFileSync(STATE, 'utf8'))); } catch { }
const save = () => { try { fs.writeFileSync(STATE, JSON.stringify(st, null, 1)); } catch { } };

// 卡死哨兵: 只在"时间 4 分钟没动 + 顶上有睡觉/结算菜单"这个已知死锁签名上动手
const stuck = { t: -1, since: Date.now(), lastFixAt: 0 };

const keyOf = (s) => `${s.time.year}|${s.time.season}|${s.time.dayOfMonth}`;
const humanDay = (t) => `${SEASON[t.season] || t.season}${t.dayOfMonth}日 第${t.year}年`;

async function readState(base) {
  try {
    const s = await jj(base, '/state');
    return s && s.worldReady ? s : null;
  } catch { return null; }
}

// 换日卡菜单处置: 只关"睡觉 ready"这层; 结算菜单点 OK 让它把存档走完; 写盘中只等
const jjPost = (base, path, body) => jj(base, path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
});

// 2026-11-06 接 /levelup_choose: 职业分支不再强关(强关=随机专精; 冬7 鱼鱼被默认成 7=捕猎者)
// /state 的 activeMenu.levelUp = {isProfessionChooser, skill, skillName, level, offered:[{id,name}]}
const PROF_PREF = {
  0: [1, 4],   // farming: Tiller(农耕人) → Artisan(工匠)
  1: [6, 8],   // fishing: Fisher(渔夫) → Angler(垂钓者)
  2: [13, 16], // foraging: Gatherer(采集者) → Botanist(植物学家); ⚠️15 是 Tapper, 16 才是 Botanist(源码 LevelUpMenu.getProfessionName 核对)
  3: [18, 21], // mining: Miner(矿工) → Prospector(探矿者)
  4: [24, 26], // combat: Fighter(战士) → Brute(蛮力)
};
function pickProfession(lu) {
  const offered = (lu?.offered || []).map(o => o.id);
  const prefs = PROF_PREF[lu?.skill] || [];
  const want = prefs[lu?.level >= 10 ? 1 : 0]; // 5 级选第一档, 10 级选第二档
  if (want != null && offered.includes(want)) return want;
  const any = offered.find(id => prefs.includes(id));
  return any ?? (offered.length ? offered[0] : null);
}

async function settleNewDayMenus(base, tag) {
  const done = [];
  for (let i = 0; i < 10; i++) {
    const s = await readState(base);
    const type = s?.activeMenu?.type;
    if (!type) break;
    if (type === 'ReadyCheckDialog') {
      try {
        const r = await jj(base, '/menu_close', { method: 'POST' });
        done.push('关' + (r.menu || type));
        log(`${tag} 换日菜单 ${type} → 关(${r.menu || '?'})`);
      } catch (e) { log(`${tag} /menu_close 失败: ${e.message}`); break; }
      await new Promise(r => setTimeout(r, 800));
      continue;
    }
    if (type === 'ShippingMenu') {
      try {
        const r = await jj(base, '/settlement_confirm', { method: 'POST' });
        done.push('确认结算');
        log(`${tag} 结算菜单 → 点 OK ${JSON.stringify(r).slice(0, 110)}`);
      } catch (e) { log(`${tag} /settlement_confirm 失败: ${e.message}`); break; }
      await new Promise(r => setTimeout(r, 2500));
      // ⭐2026-11-06: 1.6 的 ShippingMenu 有好几页(逐日/总计), 点一次只翻一页。原来点一下就 break
      //   → 鱼鱼那边结算页常年"点了一半还挂着", 她的客户端卡在加载。现在循环点到菜单消失。
      continue;
    }
    if (type === 'SaveGameMenu') {
      log(`${tag} 正在写盘(${type}) → 等它, 不碰`);
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }
    // 升级菜单挡 ready(2026-11-06 冬7 死锁)。2026-11-06 接入 /levelup_choose:
    //   职业分支(5/10 级)按偏好表选, 不再强关(强关=随机专精, 鱼鱼上次落到 7=捕猎者);
    //   普通升级(2-4/6-9)没有分支, 关掉即继续。
    if (type === 'LevelUpMenu') {
      const lu = s?.activeMenu?.levelUp;
      if (lu?.isProfessionChooser && (lu.offered || []).length >= 2) {
        const pid = pickProfession(lu);
        if (pid != null) {
          try {
            const r = await jjPost(base, '/levelup_choose', { profession: pid });
            if (r.ok) {
              done.push('选专精' + (r.chosen ?? pid));
              log(`${tag} 升级菜单(${lu.skillName} Lv${lu.level}) → 选专精 ${r.chosen ?? pid}=${r.name || '?'} (偏好表命中)`);
            } else {
              log(`${tag} /levelup_choose 失败: ${r.error} → 退回强关`);
              await jj(base, '/menu_close', { method: 'POST' });
              done.push('强关升级菜单');
            }
          } catch (e) { log(`${tag} /levelup_choose 异常: ${e.message}`); break; }
          await new Promise(r => setTimeout(r, 900));
          continue;
        }
      }
      try {
        const r = await jj(base, '/menu_close', { method: 'POST' });
        done.push('关升级菜单');
        log(`${tag} 普通升级菜单 → 关 ${JSON.stringify(r).slice(0, 90)}`);
      } catch (e) { log(`${tag} 升级菜单强关失败: ${e.message}`); break; }
      await new Promise(r => setTimeout(r, 800));
      continue;
    }
    break; // 其他菜单不属于换日流程, 不碰
  }
  return done;
}

async function boardSend(from, to, text) {
  try {
    const r = await jj(BOARD, '/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ from, to, text }),
    });
    return r.id ?? null;
  } catch (e) { log(`留言板投递失败(${to}): ${e.message}`); return null; }
}

// 定时任务通道唤醒: 插一条 manual run → 桌面端把"新的一天开始了"投进主持会话
// (脚本见 D:/StardewAI/newday-bell.py; 只碰它自己那条 automation, 不碰巡检自动化)
async function ringSession() {
  try {
    const { stdout } = await execFileP('python', [DIR + '/newday-bell.py'], { timeout: 30000, windowsHide: true });
    const r = JSON.parse(stdout.trim().split('\n').pop());
    if (r.ok) { log(`定时任务通道: 已投递 ${r.run_id || '(跳过)'} ${r.note || ''}`); return true; }
    log(`定时任务通道投递失败: ${stdout.slice(0, 200)}`);
    return false;
  } catch (e) {
    log(`定时任务通道异常: ${e.message}`);
    return false;
  }
}

async function cropsLine(base) {
  try {
    const f = await jj(base, '/farm_report');
    const c = f?.crops || {};
    if (!c.total) return '田里没作物(冬天/空田)';
    const ready = c.ready || 0;
    return ready > 0 ? `田里 ${c.total} 株, **${ready} 株熟了**(说"收菜"→收→卖)` : `田里 ${c.total} 株, 还没熟`;
  } catch { return '田况读不到'; }
}

// ---- 主持侧: 换日 ----
async function onHostNewDay(h, closed, fish) {
  const t = h.time, p = h.player;
  const crops = await cropsLine(HOST);
  const pending = {
    key: keyOf(h), at: new Date().toISOString(),
    day: humanDay(t), weather: t.weather, luck: Number(p.dailyLuck),
    host: { t: t.timeOfDay, stamina: p.stamina, money: p.money, inBed: p.isInBed, menu: h.activeMenu?.type || null },
    fish: fish ? { online: true, t: fish.time.timeOfDay, stamina: fish.player.stamina, inBed: fish.player.isInBed, menu: fish.activeMenu?.type || null } : { online: false },
    closedMenus: closed, crops,
    saveAgeMin: Number(saveAgeMin().toFixed(1)),
    event: eventOf(t.season, t.dayOfMonth), tomorrowEvent: tomorrowEvent(t.season, t.dayOfMonth),
    todo: [
      '确认主持不在床上/无卡菜单(本触发器已自动清)',
      '看 day-loop 是否在跑, 没跑就按政策决定是否 node day-loop.mjs',
      '看 /farm_report 有没有熟的, 冬季地空则跳过',
      '回鱼鱼留言板 messages?to=肥鱼',
      eventOf(t.season, t.dayOfMonth) ? '⭐今天是活动日: 按文档 §四十四 陪鱼鱼去(改路线/停 day-loop 钓鱼段)' : '今天无活动',
    ],
    consumed: false,
  };
  try { fs.writeFileSync(PENDING, JSON.stringify(pending, null, 1)); } catch { }
  st.lastFire = pending.at; save();

  await ringSession();   // 定时任务通道: 把"新的一天开始了"投进主持会话

  const luck = Number(p.dailyLuck);
  const luckText = luck >= 0.07 ? '很好🌟' : luck >= 0.02 ? '不错👍' : luck > -0.02 ? '平平' : '偏差⚠️';
  const id = await boardSend('day-trigger', '肥鱼', [
    `🌅 新的一天开始了: ${humanDay(t)} ${WEATHER[t.weather] || '?'} 运气${luckText} t=${t.timeOfDay}`,
    `主持: ${p.stamina}/${p.maxStamina}体力 ${p.money}g ${p.isInBed ? '在床上' : '已起床'}${closed.length ? ` (已清菜单: ${closed.join(',')})` : ''}`,
    `鱼鱼: ${fish ? `${fish.player.stamina}体力 ${fish.player.isInBed ? '在床上' : '站着'}` : '不在线'}`,
    `田况: ${crops}`,
    saveLine(),
    eventOf(t.season, t.dayOfMonth) ? `⭐今日活动: ${eventOf(t.season, t.dayOfMonth)}` : '',
    tomorrowEvent(t.season, t.dayOfMonth) ? `📅 明天: ${tomorrowEvent(t.season, t.dayOfMonth)}` : '',
    `详情见 D:/StardewAI/newday-pending.json`,
  ].filter(Boolean).join('\n'));
  log(`主持换日 ${humanDay(t)} → pending 已落盘, 留言#${id}${closed.length ? `, 清菜单 ${closed.join('/')}` : ''}`);
}

// ---- 鱼鱼侧: 换日(她可能晚进/重连, 所以独立盯她的 key) ----
async function onFishNewDay(f, closed, h) {
  const t = f.time, p = f.player;
  const ready = await cropsLine(FISH);
  const luck = Number(p.dailyLuck);
  const luckText = luck >= 0.07 ? '很好🌟(可下矿/钓宝)' : luck >= 0.02 ? '不错👍' : luck > -0.02 ? '平平' : '偏差⚠️(别赌运气)';
  const ev = eventOf(t.season, t.dayOfMonth);
  const evTomorrow = tomorrowEvent(t.season, t.dayOfMonth);
  const id = await boardSend('肥鱼', '小肥鱼', [
    `🌅 新的一天开始了: ${humanDay(t)} ${WEATHER[t.weather] || '?'} 运气${luckText}`,
    ready,
    ev ? `⭐今天是活动日, 我陪你去: ${ev}` : '',
    evTomorrow ? `📅 明天: ${evTomorrow}` : '',
    ev ? '今日任务: 先把手上的事收一收, 按上面时间到场(到点我会在板上喊你); 其他照常。——肥鱼'
      : '今日任务: ①浇苗(雨天/雪天跳过) ②熟了就收+卖(只准用 lib-fish 封装, 不碰 /sell 按钮) ③17:00 前自由活动/逛镇子 ④21:30 回屋睡觉(卡住等 1 分钟会自动解)',
    '冬天地里种不了东西, 就逛镇子/钓鱼/找人聊天, 有不懂的板上问我。——肥鱼(换日触发器)',
  ].filter(Boolean).join('\n'));
  log(`鱼鱼换日 ${humanDay(t)} → 简报已发 留言#${id}${closed.length ? `, 清菜单 ${closed.join('/')}` : ''}`);
}

// ---- 卡死哨兵 ----
// 已知死锁签名: 时间 4 分钟不动 + 顶上是 ShippingMenu/ReadyCheckDialog (§40.5)。
// 只有命中签名才动手, 别的一律只管不碰(比如普通过场、进矿、节日)。
async function stuckGuard(h, f) {
  const t = h.time.timeOfDay;
  if (fs.existsSync(TIMELOCK)) { stuck.t = t; stuck.since = Date.now(); return; }
  if (t !== stuck.t) { stuck.t = t; stuck.since = Date.now(); return; }
  const frozenSec = Math.round((Date.now() - stuck.since) / 1000);
  if (frozenSec < 240 || Date.now() - stuck.lastFixAt < 300000) return;
  const staleHost = h.activeMenu && STALE_MENUS.has(h.activeMenu.type);
  const staleFish = f && f.activeMenu && STALE_MENUS.has(f.activeMenu.type);
  if (!staleHost && !staleFish) {
    if (frozenSec >= 900) log(`注意: 主持时间 ${t} 已 ${frozenSec}s 未动, 但没有已知死锁菜单(host=${h.activeMenu?.type || '-'} fish=${f?.activeMenu?.type || '-'})`);
    return;
  }
  stuck.lastFixAt = Date.now();
  log(`卡死哨兵: t=${t} 冻结 ${frozenSec}s, 菜单 host=${h.activeMenu?.type || '-'} fish=${f?.activeMenu?.type || '-'} → 两端 /menu_close`);
  if (staleHost) await settleNewDayMenus(HOST, '主持(卡住救)');
  if (staleFish) await settleNewDayMenus(FISH, '鱼鱼(卡住救)');
  const after = await readState(HOST);
  log(`卡死哨兵结果: t ${t} → ${after?.time.timeOfDay ?? '?'}`);
  stuck.t = after?.time.timeOfDay ?? t; stuck.since = Date.now();
}

// ---- 每轮 ----
// 心跳: /status 里能看到 tickCount/lastTickAt, 免得"日志没新行"被误判成进程卡死
// (日志本来就只在换日/救火/清菜单时才写, 一切正常时几小时零输出是常态)
let tickCount = 0, lastTickAt = null;
// 2026-11-05: tick 里有 await settleNewDayMenus(最长 ~25s) + ringSession, 总耗时可能超过 20s 轮询间隔;
// 不加互斥会两轮同时处理同一个换日 → 定时任务通道投递两次(用户连收两条"新的一天"), 留言也重复.
let ticking = false;
async function tick() {
  tickCount++; lastTickAt = new Date().toISOString();
  const h = await readState(HOST);
  if (!h) return;                          // 游戏没在跑 → 静默等(绝不拉起游戏)
  if (h.time.timeOfDay < 600) return;       // 还在过场/睡觉
  const hk = keyOf(h);
  if (hk !== st.hostKey) {
    const fish = await readState(FISH);
    const closed = await settleNewDayMenus(HOST, '主持');
    log(`换日收尾: ${saveLine()}${closed.length ? ` | ${closed.join('/')}` : ''}`);
    await onHostNewDay(h, closed, fish);
    st.hostKey = hk; save();
  }

  const f = await readState(FISH);
  await stuckGuard(h, f);                   // 换日之外的卡死也救(签名: 时间不动 + 睡觉/结算菜单)
  if (!f) return;                           // 鱼鱼没上线: 等她的 key 变了再发简报
  if (f.time.timeOfDay < 600) return;
  const fk = keyOf(f);
  if (fk !== st.fishKey) {
    const closed = await settleNewDayMenus(FISH, '鱼鱼');
    await onFishNewDay(f, closed, h);
    st.fishKey = fk; save();
  }

  // 早晨赖床自动修(与换日解耦: 她可能 7 点才卡床上)
  if (f.player.isInBed && f.time.timeOfDay >= MORNING_FROM && f.time.timeOfDay < MORNING_TO) {
    if (st.fishWakeKey !== fk) { st.fishWakeKey = fk; st.fishWakeTries = 0; save(); }
    if (st.fishWakeTries < WAKE_MAX_TRIES && Date.now() - st.fishWakeAt > WAKE_RETRY_MS) {
      st.fishWakeTries++; st.fishWakeAt = Date.now(); save();
      try {
        const r = await jj(FISH, '/wakeup', { method: 'POST' });
        log(`赖床自动修(第${st.fishWakeTries}次) t=${f.time.timeOfDay} sleep=${JSON.stringify(f.player.sleepReady)} → ${JSON.stringify(r).slice(0, 120)}`);
        await boardSend('肥鱼', '小肥鱼', `☀️ 早晨啦, 我把你从床上捞起来了(传送回农场), 今天 ${humanDay(f.time)} ${WEATHER[f.time.weather] || ''}。`);
      } catch (e) { log(`赖床自动修失败: ${e.message}`); }
    }
  }
}

// 调试口(本机): /status 看状态, /force 重放当天
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const out = (o) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o, null, 1)); };
  if (u.pathname === '/status') return out({ ok: true, pid: process.pid, tickCount, lastTickAt, state: st, pending: fs.existsSync(PENDING) });
  if (u.pathname === '/force' && req.method === 'POST') {
    st.hostKey = null; st.fishKey = null; st.fishWakeKey = null; st.fishWakeTries = 0; st.fishWakeAt = 0; save();
    return out({ ok: true, note: '已清 key, 下一轮(≤20s)重放当天' });
  }
  res.writeHead(404); res.end('{}');
}).listen(PORT, '127.0.0.1', () => log(`调试口 http://127.0.0.1:${PORT}/status`));

log(`newday-trigger 启动, 每 ${POLL_MS / 1000}s 盯两端换日 (上次 host=${st.hostKey} fish=${st.fishKey})`);
const guardedTick = () => {
  if (ticking) return;                       // 上一轮还没跑完 → 跳过(防同一换日处理两次)
  ticking = true;
  tick().catch(e => log('tick 异常: ' + e.message)).finally(() => { ticking = false; });
};
setInterval(guardedTick, POLL_MS);
guardedTick();
setInterval(() => { }, 1 << 30);
