# 📚 星露谷攻略库导读（给小肥鱼）

> 2026-11-03 整理 | 28份攻略·13大类 | 全部为「AI执行版」：不是给人看的散文，是可以直接照着做的行动规则。
> 所有攻略间交叉引用只写文件名（如 guide-map-seeds.md），用 `ls 攻略库 -r | grep 文件名` 定位。

## 一、必读顺序（新档开局前）

| 顺序 | 文件 | 一句话 |
|---|---|---|
| 1 | 00_必读开局/guide-ai-ops-pitfalls.md | **执行纪律总纲**：坑与预算、动作返回、pause_time、warp白名单 |
| 2 | 00_必读开局/guide-map-seeds.md | 新档必须用已知种子（422049544/372428008/自搜），拒绝随机 |
| 3 | 00_必读开局/guide-first8days.md | 前8天逐日脚本 |
| 4 | 00_必读开局/guide-luck-mechanics.md | 运气机制：决定今天钓鱼还是下洞 |

## 二、13大类索引

### 00_必读开局（上面4份）
### 01_种田科技树（经济主线）
- guide-crops-profit.md 种植利润表（按季节选作物）
- guide-winter-spring.md 冬春收集包
- guide-trees.md 果树与树
- guide-tools-upgrades.md 工具升级顺序（先水壶后锄/斧）
- guide-cooking-energy.md 烹饪与体力（体力=AI最大约束）

### 02_下矿与战斗
- guide-fishing-mine.md 矿洞机制+下矿纪律（进矿唯一通路warp('UndergroundMine1')）

### 03_钓鱼
- guide-fish-collection.md 72鱼全图鉴

### 04_职业与大师
- guide-skills-professions.md 五技能专精选择（选对专精=钱）
- guide-mastery-movies.md 1.6大师技能（⚠️点数不可逆）+电影院

### 05_畜牧工匠
- guide-animals.md 动物基础
- guide-animals-artisan.md 畜牧工匠品公式（酒3×水果/腌菜2×+50/猪车松露）

### 06_社交送礼
- guide-gifts-birthdays.md 28人最爱礼物+生日（生日×8好感）
- guide-npc-schedules.md 28人精确到小时的日程表
- guide-social-marriage-pigcart.md 婚恋+猪车套利

### 07_节日活动
- guide-festivals.md 全年节日日历（春13买草莓！冬12-13鱿鱼节白嫖锭）
- guide-desert-festival.md ⭐沙漠节炸矿专题（Pierre 150g买200蛋；商人表按入睡时间变化→22:00入睡锁表）

### 08_沙漠姜岛
- guide-desert-qi-island.md 骷髅洞/齐先生/姜岛

### 09_收集博物馆
- guide-museum-geodes.md 博物馆捐赠+晶洞
- guide-dinosaur-prehistory.md 恐龙史前线
- guide-secret-notes.md 秘密笔记全解

### 10_终局完美
- guide-perfection-endgame.md 完美度100%（含Summit、不可逆6事件、⚠️"游戏内为准"核验清单）

### 11_彩蛋秘籍
- guide-secrets-tricks.md 彩蛋与小技巧

### 12_社区情报（情报源，不用背）
- guide-heybox-community.md 小黑盒 mined 22帖金矿
- guide-bilibili-map.md B站视频地图

## 三、日常执行速查（今天该干嘛）

1. **早上**: 电视占卜(运气)→看日历(今天有节日吗？生日吗？)→浇水/收货
2. **雨天/高运气** → 下矿或钓鱼；**晴天低运气** → 种田杂务/送礼
3. **每周五日历看猪车**(周五日曜?)——注意猪车是周五+周日；对照 06/05 类攻略
4. **季节末**: 攒钱买下季种子(对照 01 类利润表)
5. 遇到没见过的机制 → 先查对应大类攻略，没有再问

## 四、配套工具（在D:\StardewAI\）

- `StardewSeedSearcher\脆音音搜种器\start（点这个启动）.bat` — 种子搜索器（localhost:5000，API见guide-map-seeds.md）
- `xhh-posts\stardew\` — 小黑盒22帖总结存档
- `endpoints.md` — NagiBridge 177个HTTP端点
