// 挖矿编排 v0.2 (2026-10-30): mine-calibrate.mjs 实测定稿
// ✅直用镐砸矿洞石头是真的(ok:true且石块真消失, 与锄地假ok不同) → 主路径=select Pickaxe+useOn(邻格)
// ✅warp('UndergroundMine1',5,5)落点正确; 电梯GET /mine/elevator={floors:[],maxFloor:1,currentLevel}
// ⚠️矿洞内warp后游戏时间曾异常快进(920→2410), 疑似与warp/换层有关, 下矿后须盯时间
// ⚠️从矿洞warp FarmHouse偶发首次不生效, 回家后必须复读/state确认, 不对就再warp一次
// 行为学桥(7845)端点=POST /select {x1,y1,x2,y2,button}(不是/behaviorSelect), 矿石群可框选加速
import { get, post, st, log, sleep, warp_into } from './lib.mjs';

// 电梯可达层清单
export async function mineElevator() {
  return get('/mine/elevator');   // {ok, floors:[], maxFloor, currentLevel}
}

// 传送到矿梯层 (格式待验证: POST /mine/elevator {floor:N})
export async function mineGoFloor(n) {
  return post('/mine/elevator', { floor: n });
}

// 找最近的石头并挖 (端点自带目标选择? 响应含blocked/rockId, 疑似远程探测)
export async function mineRock() {
  return post('/mine_rock', {});
}

// 主循环: 进矿→逐层向下→清石头→找到梯子/竖井→下一层
export async function mineRun(maxFloors = 5) {
  const s = await st();
  log('体力', Math.round(s.player.stamina));
  const ev = await mineElevator();
  log('电梯可达:', JSON.stringify(ev));
  // TODO 实测: 进矿入口(矿车/levator warp), floor参数名, mine_rock是否自动寻路
  // 保守骨架:
  // 1. warp 进矿 2. 循环 mineRock → 回查 /surroundings 确认石头消失+捡掉落
  // 3. 找 ladder/shaft → 下一层 4. 体力<80 或包满撤出(电梯回0)
  for (let i = 0; i < maxFloors; i++) {
    const r = await mineRock();
    log('mine_rock:', JSON.stringify(r).slice(0, 150));
    await sleep(600);
    if (r.ok === false && /no rock|blocked/i.test(r.error || '')) break;
  }
}

// 直接跑: node mine-run.mjs
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await mineRun(3);
}
