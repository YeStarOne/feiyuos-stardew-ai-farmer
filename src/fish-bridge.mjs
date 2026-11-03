// 双鱼通信桥 v1.0 (2026-11-04): 肥鱼(主窗口/7842) ↔ 小肥鱼(fish窗口/7843) 互发消息
// API:  POST /send  {from, to, text}            → 投递
//      GET  /messages?to=feiyu&since=N          → 拉新消息 {id,from,text,ts}
//      GET  /status
// 存内存+落盘 fish-bridge.json (断线不丢). 启动: node fish-bridge.mjs (默认7850)
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.FISH_BRIDGE_PORT || 7850);
const FILE = 'D:/StardewAI/fish-bridge.json';
let msgs = [];
try { msgs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(msgs)); } catch { } };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/send') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { from, to, text } = JSON.parse(body);
        if (!from || !to || !text) throw new Error('need from/to/text');
        msgs.push({ id: msgs.length + 1, from, to, text: String(text).slice(0, 2000), ts: Date.now() });
        save();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, id: msgs.length }));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }
  if (u.pathname === '/messages') {
    const to = u.searchParams.get('to') || '';
    const since = Number(u.searchParams.get('since') || 0);
    const out = msgs.filter(m => m.to === to && m.id > since);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, msgs: out, latest: msgs.length }));
    return;
  }
  if (u.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, total: msgs.length, port: PORT }));
    return;
  }
  res.writeHead(404); res.end('{"ok":false}');
}).listen(PORT, () => console.log('fish-bridge on :' + PORT));
