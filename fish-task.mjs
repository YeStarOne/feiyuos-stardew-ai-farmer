// fish-task.mjs — 泡泡任务队列 v1 (2026-11-14 用户拍板)
// 「给她装任务队列, 任务列表可激活泡泡会话, 每完成一个泡泡自己划掉, 遇到困难直接激活主持会话」
// 队列文件: D:/StardewAI/fish-pending.json (单一事实源)
//   - add: 写队列 + 板上发单(to=小肥鱼, 她24h有人话助手/管家在板)
//   - done: 划掉(她自己板上说「完成 <id>」由 fish-concierge 代写; 本CLI也可手工划)
//   - block: 标记困难 + 写 fish-pending.json 的 hostEscalation(主持巡检/开场第一时间读)
// 用法:
//   node fish-task.mjs add "标题" --detail "细节" --priority 2
//   node fish-task.mjs list [--all]
//   node fish-task.mjs next
//   node fish-task.mjs done <id> [--note "..."]
//   node fish-task.mjs block <id> --reason "..." [--from-her]
import fs from 'node:fs';

const QUEUE = 'D:/StardewAI/fish-pending.json';
const BOARD = 'http://localhost:7850';
const args = process.argv.slice(2);
const cmd = args[0];

const load = () => {
  try { return JSON.parse(fs.readFileSync(QUEUE, 'utf8')); }
  catch { return { version: 1, updated: new Date().toISOString(), seq: 0, tasks: [], hostEscalation: [] }; }
};
const save = (q) => {
  q.updated = new Date().toISOString();
  const tmp = QUEUE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(q, null, 1), 'utf8');
  fs.renameSync(tmp, QUEUE);
};
const boardSend = async (text) => {
  try {
    const r = await fetch(BOARD + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ from: '肥鱼', to: '小肥鱼', text }) }).then(x => x.json());
    return r.id;
  } catch (e) { return 'board失败:' + String(e).slice(0, 50); }
};

async function main() {
  const q = load();
  if (cmd === 'add') {
    const title = args[1] || '(无标题)';
    const get = (flag, def) => { const i = args.indexOf(flag); return i > 0 ? args[i + 1] : def; };
    const t = {
      id: 'F' + (q.seq = (q.seq || 0) + 1),
      title,
      detail: get('--detail', '') || '',
      priority: Number(get('--priority', 2)) || 2,
      state: 'pending',          // pending | in_progress | done | blocked
      createdAt: new Date().toISOString().slice(0, 19),
      stateLog: [{ st: 'pending', at: new Date().toISOString().slice(0, 19), by: '主持' }],
      result: null,
    };
    q.tasks.unshift(t);
    save(q);
    const prio = { 1: '🔥急', 2: '常规', 3: '有空' }[t.priority] || t.priority;
    const bid = await boardSend(`【任务单 ${t.id}·${prio}】${title}${t.detail ? '\n— ' + t.detail : ''}\n(做完板上回「完成 ${t.id}」我帮你划掉; 卡住就回「卡住 ${t.id} 原因」, 主持会来救)`);
    console.log(`added ${t.id} [${prio}] ${title} (板#${bid})`);
  } else if (cmd === 'list') {
    const all = args.includes('--all');
    for (const t of q.tasks.filter(t => all || t.state === 'pending' || t.state === 'in_progress' || t.state === 'blocked')) {
      console.log(`${t.id} [${t.state}] P${t.priority} ${t.title}` + (t.blockedReason ? ' ⛔' + t.blockedReason : ''));
    }
    console.log(`— 队列 ${q.tasks.filter(t => t.state === 'done').length} done / ${q.tasks.filter(t => t.state !== 'done').length} open (updated ${q.updated})`);
    if (q.hostEscalation?.length) console.log('⛔ 主持待处理升级:', JSON.stringify(q.hostEscalation));
  } else if (cmd === 'next') {
    const t = q.tasks.filter(t => t.state === 'pending' || t.state === 'in_progress').sort((a, b) => a.priority - b.priority)[0];
    console.log(t ? JSON.stringify(t, null, 1) : '队列空');
  } else if (cmd === 'done') {
    const id = args[1];
    const t = q.tasks.find(x => x.id === id);
    if (!t) { console.log('no such id', id); process.exit(1); }
    const note = (args.indexOf('--note') > 0 ? args[args.indexOf('--note') + 1] : '') || '';
    t.state = 'done'; t.result = note; t.doneAt = new Date().toISOString().slice(0, 19);
    t.stateLog.push({ st: 'done', at: t.doneAt, by: args.includes('--from-her') ? '泡泡' : '主持' });
    q.hostEscalation = (q.hostEscalation || []).filter(x => x.id !== id);
    save(q);
    console.log(`☑ ${id} 划掉 ${title0(t)}${note ? ' — ' + note : ''}`);
  } else if (cmd === 'block') {
    const id = args[1];
    const t = q.tasks.find(x => x.id === id);
    if (!t) { console.log('no such id', id); process.exit(1); }
    const ri = args.indexOf('--reason');
    t.state = 'blocked'; t.blockedReason = ri > 0 ? args[ri + 1] : '(未说明)';
    t.stateLog.push({ st: 'blocked', at: new Date().toISOString().slice(0, 19), by: args.includes('--from-her') ? '泡泡' : '主持' });
    q.hostEscalation = q.hostEscalation || [];
    if (!q.hostEscalation.find(x => x.id === id)) q.hostEscalation.push({ id, title: t.title, reason: t.blockedReason, at: new Date().toISOString().slice(0, 19) });
    save(q);
    console.log(`⛔ ${id} 标记困难: ${t.blockedReason} (已入主持待处理)`);
  } else {
    console.log('用法: add|list|next|done|block (见文件头注释)');
  }
}
function title0(t) { return t.title; }
await main();
