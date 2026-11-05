// _gen-routes.mjs — 从反编译源码提取全部路由的调用元数据 (2026-11-06)
// 产出 dll-audit/routes.json: { route: {handler, method, params, hints[], hint} }
// method 判定: handler 里出现 ReadJson(ctx) → POST(带 JSON body); 只读 QueryString/无参 → GET
import fs from 'node:fs';
const SRC = 'D:/StardewAI/dll-audit/NagiBridgeRemix.decompiled.cs';
const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

// 1) 路由表: "/xxx" => HandleYyy
const route = new Map();
for (const ln of lines) {
  const m = ln.match(/"(\/[a-z_\/]+)":?\s*=>?\s*(Handle\w+)/);
  if (m) route.set(m[2], m[1]);
}

function bodyOf(handler) {
  const i = lines.findIndex(l => l.includes(`private object ${handler}(`));
  if (i < 0) return null;
  let depth = 0, started = false;
  const buf = [];
  for (let j = i; j < Math.min(lines.length, i + 900); j++) {
    for (const ch of lines[j]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
    buf.push(lines[j]);
    if (started && depth === 0) break;
  }
  return buf.join('\n');
}

const out = {};
for (const [handler, r] of route) {
  const text = bodyOf(handler);
  if (text == null) { out[r] = { handler, method: 'GET', params: [], hint: '' }; continue; }
  const params = new Set();
  for (const m of text.matchAll(/GetParam(?:Or)?\s*(?:<[^>]+>)?\s*\(\s*(?:dict\s*,\s*|p\s*,\s*)?"([a-zA-Z_]+)"/g)) params.add(m[1]);
  for (const m of text.matchAll(/GetValue\s*\(\s*"([a-zA-Z_]+)"/g)) params.add(m[1]);
  for (const m of text.matchAll(/[Qq]ueryString\["([a-zA-Z_]+)"\]/g)) params.add(m[1]);
  const readsJson = /ReadJson\(ctx\)/.test(text);
  const readsQuery = /Request\.QueryString/.test(text);
  const readsStream = /Request\.InputStream/.test(text);
  // /queue 直接读 InputStream 且要求 JSON 数组
  const method = (readsJson || readsStream || r === '/queue') ? 'POST' : 'GET';
  const cn = [...new Set([...text.matchAll(/"([^"]*[\u4e00-\u9fa5][^"]*)"/g)].map(m => m[1]))];
  out[r] = {
    handler,
    method,
    readsQuery,
    params: [...params],
    hint: cn[0] || '',
    hints: cn.slice(0, 4),
  };
}
fs.writeFileSync('D:/StardewAI/dll-audit/routes.json', JSON.stringify(out, null, 1), 'utf8');
const postN = Object.values(out).filter(v => v.method === 'POST').length;
console.log('routes', Object.keys(out).length, '| POST', postN, '| GET', Object.keys(out).length - postN);
