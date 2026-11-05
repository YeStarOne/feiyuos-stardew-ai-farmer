// 手动/应急工具: 清掉农场上的死株(换季枯死的作物)。
// day-loop 每个早晨会自动调同一个 lib.clearDeadCrops(), 这个脚本给巡检或人工手用。
// 用法: node D:/StardewAI/clear-dead.mjs      (死株名单来自存档 XML, 见 lib.mjs 注释)
import { clearDeadCrops, deadCropTiles, log } from './lib.mjs';

const tiles = deadCropTiles();
log('存档死株名单:', tiles.length, '株', tiles.length ? JSON.stringify(tiles.slice(0, 6)) + ' ...' : '');
log('清死株结果:', await clearDeadCrops());
