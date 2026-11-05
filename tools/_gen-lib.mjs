// _gen-lib.mjs — 生成 lib-extra.mjs v2（173 端点全封装）+ docs/端点全表.md (2026-11-06)
// 输入: dll-audit/routes.json(反编译提取) + 端点手册.md(已有描述) + 下面的手工 CAT/EXTRA/NOTES
// 输出: D:/StardewAI/lib-extra.mjs, D:/StardewAI/端点全表.md
// 改了手工数据后重跑: node dll-audit/_gen-lib.mjs
import fs from 'node:fs';

const routes = JSON.parse(fs.readFileSync('D:/StardewAI/dll-audit/routes.json', 'utf8'));
const hb = fs.readFileSync('D:/StardewAI/端点手册.md', 'utf8');

// ---------- 1) 从端点手册抓已有描述 ----------
const descFromHb = {};
for (const line of hb.split(/\r?\n/)) {
  if (!line.trim().startsWith('|')) continue;
  const cells = line.split('|').map(c => c.trim()); // cells[0]='' cells[1]=端点 cells[2..]=内容
  if (cells.length < 4) continue;
  const routeCell = (cells[1] || '').replace(/`/g, '').replace(/\*\*/g, '').replace(/ ✅/, '').trim();
  if (!/^\/[a-z_\/]+$/.test(routeCell)) continue;
  const isVerdict = c => /[⭐❌]|已接|待实机验/.test(c);
  const isParams = c => /^[\`a-zA-Z0-9_,\-\[\]\s]+$/.test(c) && c.length < 60; // 纯参数串
  const candidates = cells.slice(2, -1).filter(c => c && !isVerdict(c) && c !== '—' && !isParams(c));
  if (!candidates.length) continue;
  const best = candidates.reduce((a, b) => (b.length > a.length ? b : a)).replace(/\*\*/g, '').replace(/\`/g, '');
  if (best.length >= 3 && !(routeCell in descFromHb)) descFromHb[routeCell] = best.replace(/\|/g, '，');
}

// ---------- 2) 手工分类（20 类） ----------
const CATS = {
  '状态/快照': ['/state', '/status', '/position', '/money', '/profile', '/special_items', '/pool', '/nuts', '/event_state', '/progress', '/alerts', '/buffs', '/queue'],
  '地图/地形': ['/map', '/warps', '/surroundings', '/tile_props', '/passable', '/passable_rect', '/dump_tile', '/scan', '/scan_chests', '/farm_report', '/crop_seasons', '/farm_buildings', '/doors', '/toggle_doors', '/furniture', '/decor', '/furniture_pickup', '/tank', '/unlocks', '/minecarts'],
  '移动/传送': ['/warp', '/warp_building', '/warp_into', '/walk_to', '/move', '/face', '/stop', '/stand', '/sittable', '/emote'],
  '点击/按键/窗口': ['/key', '/click', '/click_tile', '/drag', '/focus', '/zoom', '/resolution', '/minigame_click', '/minigame_state'],
  '物品/背包/装备': ['/select', '/use', '/interact', '/tool', '/tool_area', '/drop', '/drop_item', '/give', '/equip', '/worn', '/rings', '/ring', '/trinkets', '/trinket', '/eat'],
  '钓鱼/水产': ['/fish_areas', '/fishbot', '/rod', '/fish_pond', '/crab_pots', '/crab_retract', '/pan'],
  '农活/地面': ['/harvest', '/water', '/refill', '/till_area', '/ripen', '/clear_ground', '/debris', '/dig_spot', '/sprinklers'],
  '制作/机器': ['/machines', '/machine_load', '/machine_reqs', '/craft', '/craft_recipes', '/recipes', '/cook', '/process_geode', '/process_geode_batch', '/forge_set', '/tailor_set'],
  '箱子/存储': ['/chest', '/chest_open', '/chest_take', '/chest_take_list', '/store', '/store_all', '/placechest', '/name_chest', '/chest_color'],
  '牧场': ['/animals', '/buy_animal', '/petbowl', '/silo'],
  'NPC/社交/任务': ['/find_npc', '/friendship', '/gift', '/quest_list', '/quest_progress', '/open_questlog', '/order_board', '/bundles', '/levelup_choose', '/dance_invite', '/mastery', '/achievements'],
  '说话/提示/信箱': ['/hud', '/chat', '/chat/history', '/chat/push', '/mail'],
  '节日': ['/festival', '/festival_data', '/festival/interact', '/festival/answer', '/egg_tiles'],
  '矿洞/战斗': ['/mine/elevator', '/ladder', '/mine_rock', '/mine_debug', '/guard', '/bombs'],
  '时间/睡眠/菜单': ['/sleep', '/wakeup', '/cancel_sleep', '/ready_state', '/pause', '/resume', '/set_pause', '/settlement_confirm', '/menu', '/menu_close', '/menu/click', '/menu/number', '/menu/claim_swap', '/heal'],
  '买卖': ['/buy', '/sell', '/sell_to_shop', '/qi_shop', '/qi_buy', '/carpenter'],
  '博物馆': ['/museum_donate', '/museum_remove', '/museum_tiles', '/museum_diag', '/museum_debug'],
  '外观': ['/appearance', '/appearance_creation', '/appearance_info', '/appearance_ref', '/hair_ref', '/color_pick', '/character_customize'],
  '多人': ['/crawl_bed'],
  '调试/截图': ['/gsq', '/unlock_debug', '/weapon_diag', '/screenshot', '/screenshot_portrait'],
};

// ---------- 3) 手工补充描述（手册没写的） ----------
const EXTRA = {
  '/alerts': '事件流（hud 文本/菜单/升级/晕倒…最近 100 条），`?peek=true` 只看不取',
  '/pool': '玩家杂项：是否游泳/浴场/ bathing clothes 等',
  '/nuts': '姜岛金核桃进度（已找到/剩余）',
  '/tank': '鱼缸内容（鱼/帽子/容量），query x,y=鱼缸格',
  '/money': '读=当前金钱；带 amount 正加负减',
  '/scan': '当前地图的交互动作格（门/投放箱/机器/垃圾箱），带 action 字符串',
  '/position': '当前坐标 + 是否可走',
  '/zoom': '读=当前缩放',
  '/status': '桥版本/端口/worldReady/caps',
  '/map': '当前地图元信息（尺寸/类型/玩家落点）',
  '/furniture': '当前图家具清单（类型/尺寸/是否储物/鱼缸）',
  '/doors': '当前图门列表 + interiorDoors 开关状态',
  '/decor': '铺地板/墙纸（只认房间不认格，限室内）',
  '/mastery': '精通系统（1.6）：各技能精通经验/奖牌/未花点数',
  '/achievements': '成就列表（id/name）',
  '/unlocks': '矿洞/巴士/下水道等解锁状态',
  '/minecarts': '矿车网络：解锁条件 + 目的地',
  '/toggle_doors': '开关畜棚/鸡舍门（building,doorX,doorY），放动物出去吃草',
  '/buffs': '当前 buff（食物/饮料/雕像祝福）剩余毫秒与来源',
  '/queue': '批量提交命令数组，主线程顺序执行（省往返、动作更连贯）',
  '/interact': '对面朝格/NPC 交互（对话/机器/门），可带 x,y',
  '/trinket': '装备饰品栏',
  '/ring': '装备戒指到指定槽（slot）',
  '/buy': '在当前商店买东西（quantity/price 可选）',
  '/eat': '吃当前手持食物（先 /select 再 /eat {}）',
  '/set_pause': '设置"失焦暂停"开关（outOfFocus）',
  '/pause': '冻结游戏时间（与 /resume 成对）',
  '/resume': '恢复游戏时间',
  '/drop': '丢弃手上/指定名物品（count）',
  '/gift': '送礼给 NPC（target,item），返回好感变化',
  '/sell': '出货箱卖货（只认 Farm 地图、整叠卖）',
  '/water': '浇水（当前手持水壶对周围格子）',
  '/profile': '五项技能等级（farming/fishing/foraging/mining/combat）',
  '/craft': '制造物品（name,count）',
  '/museum_donate': '把背包里可捐物捐进博物馆',
  '/museum_diag': '博物馆捐赠口诊断（位置类型/能否捐）',
  '/drop_item': '按物品 id/名丢弃（item,count）',
  '/machine_load': '给机器投料（itemId,type[,count][,location]）',
  '/gsq': 'GameStateQuery 条件求值（q=条件串），调试专用',
  '/chat/history': '游戏内聊天历史（最近 N 条）',
  '/mail': '信箱状态（has_mail/unread/received）',
};

// ---------- 4) 坑位注记（写进 JSDoc 和全表） ----------
const NOTES = {
  '/fishbot': '⚠️ 不带 action = toggle！用 {"action":"status"|"on"|"off"}',
  '/eat': '吃"当前手持"——先 /select 再 /eat {}',
  '/give': '只认限定 ID（(O)388 木头、(O)685 鱼饵），写名字会造出 Error Item',
  '/surroundings': '矩形上限 4096 格，超了直接报错不截断',
  '/passable_rect': '一次最多 96×96，大图分块',
  '/tile_props': 'query 参数（GET），不是 JSON body',
  '/dump_tile': 'query 参数（GET），不是 JSON body',
  '/warp': '下一 tick 落地——发完必须轮询 location 确认再动作',
  '/focus': '⚠️ 抢用户前台，用户在用电脑时别调',
  '/click': '⚠️ 物理鼠标语义需游戏前台；自动流程优先 /menu/click',
  '/click_tile': '⚠️ 同 /click，物理点击',
  '/key': '⚠️ escape/confirm 加 nofocus:true 可纯后台；字母/数字/F 键是真键盘，用户在用时禁发',
  '/drag': '⚠️ 真鼠标拖拽，需前台',
  '/resolution': '⚠️ 会改游戏窗口分辨率',
  '/sleep': '返回 ok ≠ 写盘！验证只认存档文件 mtime',
  '/wakeup': '⚠️ 只对 7843(farmhand)；对 7842 会把主持瞬移',
  '/cancel_sleep': '只解 UI 不解床位，还要 /wakeup 才真正起来',
  '/pause': '与 /resume 必须成对',
  '/settlement_confirm': '1.6 结算页是多页，要连点到菜单消失',
  '/menu_close': 'POST 必须带 {}，空 body 411',
  '/sell': '只认 Farm 地图、整叠卖；在店里用 /sell_to_shop',
  '/sell_to_shop': '认当前所在商店、可指定数量（/sell 的补位）',
  '/rod': 'action: show|bait|tackle|clear；饵 ID (O)685',
  '/queue': 'body 是命令数组不是对象；主线程顺序执行',
  '/guard': '⚠️ 只服务 farmhand(7843)，房主被拒；会把武器换到手上，钓鱼/浇水中别开',
  '/egg_tiles': '1.6 节日地图名 Town-EggFestival/Town-EggFestival2（旧名 spring13 报 not found）；与游戏 eggHunt 同源=真彩蛋坐标',
  '/carpenter': 'materials 是 {id,amount} 无名字；affordable=钱+料都够',
  '/crawl_bed': '参数是 player 不是 who；action locate|beds|sleep（sleep 有副作用）',
  '/sittable': 'face 是 bool，朝向在 direction；free 是剩余座位数',
  '/bombs': '只列"已点燃"的炸弹（temporarySprites），背包里的不算',
  '/hud': '中文必须 node fetch 发（curl 会 GBK 乱码）',
  '/chat': '中文必须 node fetch 发（curl 会 GBK 乱码）',
  '/heal': '免费满血满体力（调试口，别滥用）',
  '/mine/elevator': '实测只 reset 不传送，下楼要踩梯子',
  '/machine_load': 'itemId 用限定 ID',
  '/appearance': '⚠️ 只能在捏脸菜单开着时调；菜单外直调会写覆盖值导致换衣服错乱',
  '/state': '巡检第一入口：player/location/time/inventory/otherPlayers/fishing',
  '/alerts': '?peek=true 只读不消费',
  '/warp_into': '触发进门事件（进房子/矿洞用），比 /warp 多走流程',
  '/tool_area': '范围作业（浇水/锄地/收割），自动流程首选',
  '/store_all': 'what/counts/target/default，批量存箱',
  '/chest_take_list': 'items 数组一次取多种',
};

// ---------- 5) 汇总 ----------
const routeSet = new Set(Object.keys(routes));
const catOf = {}, assigned = new Set();
for (const [cat, list] of Object.entries(CATS)) for (const r of list) {
  if (!routeSet.has(r)) { console.error('✗ 分类里有不存在的路由:', r); continue; }
  if (assigned.has(r)) console.error('✗ 重复分类:', r);
  catOf[r] = cat; assigned.add(r);
}
const missing = [...routeSet].filter(r => !assigned.has(r));
if (missing.length) console.error('✗ 未分类', missing.length, ':', missing.join(' '));

const camel = r => r.replace(/^\//, '').split(/[\/_]/).map((s, i) => i ? s[0].toUpperCase() + s.slice(1) : s).join('');
const names = {};
for (const r of routeSet) {
  const n = camel(r);
  if (names[n]) console.error('✗ 函数名冲突:', n, names[n], r);
  names[n] = r;
}

// ---------- 6) 生成 lib-extra.mjs ----------
const qsFor = r => {
  const ps = routes[r].params;
  if (!ps.length) return '';
  return `const q = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const qq = q.toString();`;
};

let fnBlocks = '';
for (const [cat, list] of Object.entries(CATS)) {
  fnBlocks += `\n  // ==================== ${cat} ====================\n`;
  for (const r of list) {
    const meta = routes[r];
    const name = camel(r);
    const desc = descFromHb[r] || EXTRA[r] || '';
    const note = NOTES[r] ? ` ${NOTES[r]}` : '';
    const ps = meta.params.length ? meta.params.join(',') : '—';
    fnBlocks += `  /** ${meta.method} \`${r}\` ${desc ? '—— ' + desc : ''}${note}\n   *  入参: ${ps}${meta.readsQuery ? '（query）' : ''} */\n`;
    if (meta.method === 'GET') {
      if (meta.params.length) {
        fnBlocks += `  ${name}: (p = {}) => { ${qsFor(r)} return call(port, '${r}' + (qq ? '?' + qq : '')); },\n`;
      } else {
        fnBlocks += `  ${name}: (p = {}) => call(port, '${r}'),\n`;
      }
    } else if (r === '/queue') {
      fnBlocks += `  ${name}: (cmds = []) => call(port, '${r}', { method: 'POST', body: cmds }),\n`;
    } else {
      fnBlocks += `  ${name}: (p = {}) => call(port, '${r}', { method: 'POST', body: p }),\n`;
    }
  }
}

const apiMeta = {};
for (const r of routeSet) apiMeta[r] = { method: routes[r].method, params: routes[r].params, cat: catOf[r], desc: descFromHb[r] || EXTRA[r] || '', note: NOTES[r] || '' };

const lib = `// lib-extra.mjs v2 — NagiBridge 全量端点封装（173/173）(2026-11-06)
// ⚠️ 本文件由 dll-audit/_gen-lib.mjs 自动生成，手改会被覆盖；要改描述/坑位注记请改生成器里的 EXTRA/NOTES/CATS。
// 用法:
//   import { HOST, FISH, API } from './lib-extra.mjs';
//   await HOST.state();                      // 全量状态
//   await FISH.rod({ action: 'show' });      // 鱼竿/饵
//   await HOST.warp({ location: 'Farm', x: 64, y: 15 });
//   await HOST.queue([{ endpoint: '/face', body: { direction: 1 } }, ...]); // 批量
//   API['/warp']                             // 元数据 {method,params,cat,desc,note}
// 约定:
//   · GET 端点参数走 query；POST 端点参数走 JSON body（函数名 = 路由去 / 和 _ 的驼峰）。
//   · 标 ⚠️ 的条目有副作用/会抢前台/有历史坑，动手前先看 JSDoc。
//   · 中文一律 node fetch（本文件就是），绝不 curl 直发。
const PORT_BASE = p => \`http://localhost:\${p}\`;

async function call(port, path, { method = 'GET', body, timeout = 12000 } = {}) {
  const r = await fetch(PORT_BASE(port) + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, status: r.status, raw: t.slice(0, 200) }; }
}

// 全部路由元数据（xp.mjs 的 api 命令和文档都吃这份数据）
export const API = ${JSON.stringify(apiMeta)};

export function extra(port = 7842) {
  const get = (p, timeout) => call(port, p, { timeout });
  const post = (p, body, timeout) => call(port, p, { method: 'POST', body, timeout });
  return {
    port,
    state: (p = {}) => call(port, '/state'),
    raw: { get, post },
${fnBlocks}  };
}

export const HOST = extra(7842);
export const FISH = extra(7843);
`;

// ---------- 7) 生成 端点全表.md ----------
let doc = `# 端点全表（173/173 已封装进 lib-extra.mjs v2）

> 2026-11-06 生成（\`dll-audit/_gen-lib.mjs\`，元数据来自反编译 routes.json + 端点手册）。
> **每个端点都有同名函数**：路由 \`/warp_building\` → \`HOST.warpBuilding({...})\`；GET 参数走 query，POST 走 JSON body。
> \`import { API } from './lib-extra.mjs'\` 可拿到机器可读元数据；\`node xp.mjs api [关键字]\` 命令行查询。
> 调用陷阱汇总见 [端点手册.md](端点手册.md) §13；本文只标每条最关键的坑。

`;

let docCount = 0;
for (const [cat, list] of Object.entries(CATS)) {
  doc += `\n## ${cat}（${list.length}）\n\n| 端点 | 方法 | 入参 | 说明 |\n|---|---|---|---|\n`;
  for (const r of list) {
    const meta = routes[r];
    const desc = descFromHb[r] || EXTRA[r] || '—';
    const note = NOTES[r] ? `<br>**${NOTES[r]}**` : '';
    const ps = meta.params.length ? meta.params.map(p => '`' + p + '`').join(' ') : '—';
    doc += `| \`${r}\` | ${meta.method} | ${ps} | ${desc}${note} |\n`;
    docCount++;
  }
}
doc += `\n---\n\n共 ${docCount} 条。危险清单（会抢前台/真键鼠）：\`/focus /click /click_tile /drag /key /resolution\` —— 自动流程优先用 \`/menu/click /tool_area /walk_to\` 这些纯后台端点。\n`;

fs.writeFileSync('D:/StardewAI/lib-extra.mjs', lib, 'utf8');
fs.writeFileSync('D:/StardewAI/端点全表.md', doc, 'utf8');
console.log('lib-extra.mjs', lib.split('\n').length, '行 | 端点全表.md', docCount, '条 | 分类', Object.keys(CATS).length);
