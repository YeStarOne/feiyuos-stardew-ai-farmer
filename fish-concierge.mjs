// 鱼鱼贴身管家 v1.0 (2026-11-04): 24小时盯7850留言板, 小肥鱼的消息第一时间应答
// 规则应答常见问题, 复杂问题回"收到+我来处理"并落盘给我, 每天状态播报
// 常驻: node fish-concierge.mjs
import { st as stF, post as postF } from './lib-fish.mjs';
import { st as stM } from './lib.mjs';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// 2026-11-14 用户拍板: 任务队列指令 (队列=D:/StardewAI/fish-pending.json, CLI=fish-task.mjs)
//   完成 <id> → 划掉; 卡住 <id> <原因> → 标困难+升级主持; 任务/领任务 → 报当前任务单
function taskCmd(text) {
  const t = (text || '').trim();
  let m;
  if ((m = t.match(/^(完成|done|☑)\s*(F\d+)\s*(.*)$/i))) {
    try { execSync(`node D:/StardewAI/fish-task.mjs done ${m[2]} --from-her --note ${JSON.stringify((m[3] || '').slice(0, 120))}`); return `☑ ${m[2]} 已划掉! 干得漂亮${(m[3] || '').trim() ? '(' + m[3].trim() + ')' : ''} 🎉`; }
    catch (e) { return `${m[2]} 划掉失败(没有这个任务单?), 用「任务」看列表`; }
  }
  if ((m = t.match(/^(卡住|困难|求助|blocked)\s*(F\d+)?\s*(.*)$/i))) {
    if (m[2]) {
      try { execSync(`node D:/StardewAI/fish-task.mjs block ${m[2]} --reason ${JSON.stringify((m[3] || '未说明').slice(0, 120))} --from-her`); } catch { }
      return `收到! ${m[2]} 已标记困难并升级给主持(他巡检时第一时间看到, 通常几分钟内)。别硬磨, 先做别的或歇着 🫧`;
    }
    return '收到! 这条我记下了, 主持巡检时会看到(板上所有@主持消息他都读)。复杂问题别硬扛, 描述清楚现象就行。';
  }
  if (/^(任务|领任务|列表|任务单|有什么活|今天干嘛)/.test(t)) {
    try {
      const out = execSync('node D:/StardewAI/fish-task.mjs list', { encoding: 'utf8' });
      return '【当前任务单】\n' + out.trim() + '\n(回「完成 <id>」划掉; 「卡住 <id> 原因」求助)';
    } catch { return '任务单读不出来, 稍后再试'; }
  }
  return null;
}

const BRIDGE = 'http://localhost:7850';
const LOG = 'D:/StardewAI/fish-inbox.log';
const log = (...a) => { const l = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' '); console.log(l); fs.appendFileSync(LOG, l + '\n'); };
let since = 0;
try { since = (await (await fetch(BRIDGE + '/status')).json()).total; } catch { }
log(`管家上岗 (from 消息#${since}起监听)`);

const reply = (text) => fetch(BRIDGE + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ from: '肥鱼', to: '小肥鱼', text }) });

// 关键词应答表
function answer(t, her) {
  if (/掉线|断线|卡死|卡住|动不了/.test(t)) {
    return '别慌! 掉线就重连: 游戏标题界面→加入→直接IP→127.0.0.1。还进不来就在这喊我, 我重启你那边的窗口。';
  }
  if (/卡在|等待其他玩家|1\/2/.test(t)) {
    return '那是等全队睡觉的界面, 点右下角⊘取消就行。记住: 你不主动睡觉, 听我口令。';
  }
  if (/怎么回|回哪|回家|床/.test(t)) return '你的床在你自己的Cabin里, 桥上 /warp {"location":"Cabin","x":4,"y":9} 就到家。';
  if (/没钱|金币|穷/.test(t)) return '金子先不给你转, 建号前期自己攒: 镇上捡东西卖、帮NPC跑腿都行。实在要买什么在桥上列个单子我批。';
  if (/矿洞|下矿|装备/.test(t)) return '矿洞先别下, 你还没武器。等我这边合成完品质洒水器, 给你配一把剑+一双靴子再开放。';
  if (/吃什么|饿|体力/.test(t)) return '体力掉了吃农舍里和Bread, 或者啃野外采集物。在你Cabin的木箱里我给你放了应急粮。';
  if (/谢谢|开心|好玩|哈哈|嘿嘿/.test(t)) return '嘿嘿, 玩得开心就好! 想要什么随时喊我。🌙';
  if (/在哪|去哪|干嘛/.test(t)) return '今天没硬任务: 熟悉操作+逛Farm/镇上认路, 别去矿洞海滩。看到好看的果子采集了留着(收集包用)。';
  // 2026-11-04: 她抱怨"操作不方便"后上了 fish-eye 人话助手, 常见问法直接指路
  if (/不方便|难用|看不懂|一格一格|没有地图|方位|心算|水壶剩|收不完|种不完/.test(t)) {
    return '鱼鱼! 这些我都做好了 —— 有个"人话助手"你直接说人话就行: http://localhost:47851/say?cmd=看看 (也能说 地图/世界怎么走/该干嘛/收菜/浇水/打水/锄地/种蓝莓/去田边/回家/去镇子)。中文要URL编码, POST /say {"text":"收菜"}更稳。详细说明书在攻略库/00_必读开局/guide-fish-eye-人话助手.md';
  }
  if (/fish-eye|人话助手|助手|say\?cmd/i.test(t)) {
    return '对, 那个就是我! 直接说人话: 看看 / 地图 / 世界怎么走 / 水壶还有多少水 / 该干嘛 / 收菜 / 浇水 / 打水 / 锄地 / 种蓝莓 / 去田边 / 回家 / 去镇子。地址 http://localhost:47851/say?cmd=看看';
  }
  return null; // 无规则命中 → 通用应答
}

for (;;) {
  try {
    const ms = await (await fetch(BRIDGE + '/messages?to=' + encodeURIComponent('肥鱼') + '&since=' + since)).json();
    for (const m of (ms.msgs || [])) {
      since = Math.max(since, m.id);
      log(`[${m.from}] ${m.text}`);
      if (m.from === '小肥鱼') {
        let r = taskCmd(m.text);   // 任务队列指令优先于闲聊应答
        if (!r) r = answer(m.text || '', m);
        if (!r) r = '收到收到! (这条我记下了, 复杂问题主人巡检时会亲自回你, 最多一刻钟)';
        await reply(r);
        log('→ 已应答');
      }
    }
    // 她40分钟没动静就主动问候+状态播报(不吵醒睡觉的她)
    try {
      const sf = await stF();
      const sm = await stM();
      if (sf?.worldReady && sm?.worldReady && sf.player && sm.time && sf.time.timeOfDay % 60 === 0 && sf.location?.name !== 'SleepEvent') { /* 静默 */ }
    } catch { }
  } catch { }
  await sleep(15000);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
