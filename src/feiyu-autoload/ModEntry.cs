// FeiyuAutoLoad: 游戏启动后自动读最新存档, 跳过标题界面(替代物理点击读档)
// 原理: 每2秒检查一次, 标题菜单就绪后执行调试命令 "load <存档夹名>"
using System;
using System.IO;
using System.Linq;
using StardewModdingAPI;
using StardewValley;
using StardewValley.Menus;
using StardewModdingAPI.Events;

namespace FeiyuAutoLoad
{
    public class ModEntry : Mod
    {
        private bool _tried;
        private int _ticks;

        public override void Entry(IModHelper helper)
        {
            helper.Events.GameLoop.UpdateTicked += OnTick;
            helper.Events.GameLoop.UpdateTicked += FurnaceCompensator;
            helper.Events.GameLoop.UpdateTicked += CheatTick;
            StartCheatServer();
            Monitor.Log("FeiyuAutoLoad v1.3 ready (auto load + furnace compensator + cheat server :7846)", LogLevel.Info);
        }

        // ===== 作弊服务(2026-11-03 用户授权"受不了了"): :7846, 游戏线程安全的动作队列 =====
        // /give {id,count} 刷物品 | /mine_tp {level} 任意层传送(enterMine无视解锁) | /onehit {on} 一击碎岩 | /status
        private System.Net.HttpListener _srv;
        private readonly System.Collections.Concurrent.ConcurrentQueue<Action> _acts = new();
        private volatile bool _onehit = true;

        private void StartCheatServer()
        {
            try
            {
                _srv = new System.Net.HttpListener();
                _srv.Prefixes.Add("http://localhost:7846/");
                _srv.Start();
                System.Threading.Tasks.Task.Run(() =>
                {
                    while (_srv.IsListening)
                    {
                        var ctx = _srv.GetContext();
                        Handle(ctx);
                    }
                });
            }
            catch (Exception ex) { Monitor.Log("CheatServer: " + ex.Message, LogLevel.Error); }
        }

        private void Handle(System.Net.HttpListenerContext ctx)
        {
            string path = ctx.Request.Url.AbsolutePath;
            string body = new System.IO.StreamReader(ctx.Request.InputStream).ReadToEnd();
            string resp = "{\"ok\":true}";
            try
            {
                if (path == "/status")
                {
                    resp = "{\"ok\":true,\"worldReady\":" + (Context.IsWorldReady ? "true" : "false")
                        + ",\"level\":" + (Context.IsWorldReady && Game1.mine != null ? Game1.mine.mineLevel : -1)
                        + ",\"onehit\":" + (_onehit ? "true" : "false") + "}";
                }
                else if (path == "/give")
                {
                    string id = Extract(body, "id");
                    int count = int.TryParse(Extract(body, "count"), out int c) ? c : 1;
                    _acts.Enqueue(() =>
                    {
                        var obj = new StardewValley.Object(id, count);
                        Game1.player.addItemToInventory(obj); // addItemByMenu会弹ItemGrabMenu卡住(2026-11-03实测), 直接入包
                        Monitor.Log($"Cheat: give {id} x{count}", LogLevel.Info);
                    });
                    resp = "{\"ok\":true,\"queued\":\"give " + id + " x" + count + "\"}";
                }
                else if (path == "/mine_tp")
                {
                    int lv = int.TryParse(Extract(body, "level"), out int l) ? l : 1;
                    _acts.Enqueue(() =>
                    {
                        StardewValley.Game1.enterMine(lv);
                        Monitor.Log($"Cheat: enterMine({lv})", LogLevel.Info);
                    });
                    resp = "{\"ok\":true,\"queued\":\"enterMine " + lv + "\"}";
                }
                else if (path == "/onehit")
                {
                    _onehit = !body.Contains("false");
                    resp = "{\"ok\":true,\"onehit\":" + (_onehit ? "true" : "false") + "}";
                }
                else if (path == "/clock")
                {
                    // 时间推进作弊(2026-11-03): NagiBridge /resume 后 shouldTimePass 仍为假(游戏paused=False却冻时间, 原因未明),
                    // 改为按游戏自己的10分钟节拍手动推时间 — performTenMinuteClockUpdate 会带动机器MinuteUpdate(熔炉/腌罐/小桶通用)
                    int mins = int.TryParse(Extract(body, "minutes"), out int m) ? m : 10;
                    _acts.Enqueue(() =>
                    {
                        int steps = Math.Min(mins / 10, 200); // 上限200步=2000游戏分, 防推过午夜崩溃
                        for (int i = 0; i < steps && Game1.timeOfDay < 2550; i++)
                        {
                            Game1.timeOfDay += 10;
                            Game1.performTenMinuteClockUpdate();
                        }
                        Monitor.Log($"Cheat: clock +{steps * 10}min → {Game1.timeOfDay}", LogLevel.Info);
                    });
                    resp = "{\"ok\":true,\"queued\":\"clock +" + mins + "min\"}";
                }
                else { resp = "{\"ok\":false,\"error\":\"unknown " + path + "\"}"; }
            }
            catch (Exception ex) { resp = "{\"ok\":false,\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}"; }
            byte[] buf = System.Text.Encoding.UTF8.GetBytes(resp);
            ctx.Response.ContentType = "application/json";
            ctx.Response.ContentLength64 = buf.Length;
            ctx.Response.OutputStream.Write(buf, 0, buf.Length);
            ctx.Response.OutputStream.Close();
        }

        private static string Extract(string body, string key)
        {
            int i = body.IndexOf("\"" + key + "\"");
            if (i < 0) return null;
            int a = body.IndexOf(':', i) + 1;
            while (a < body.Length && body[a] == ' ') a++;
            if (body[a] == '"') { int b = body.IndexOf('"', a + 1); return body.Substring(a + 1, b - a - 1); }
            int e = a; while (e < body.Length && (char.IsDigit(body[e]))) e++;
            return body.Substring(a, e - a);
        }

        private int _cheatTicks;
        private void CheatTick(object sender, UpdateTickedEventArgs e)
        {
            while (_acts.TryDequeue(out var act)) { try { act(); } catch (Exception ex) { Monitor.Log("Cheat act: " + ex.Message, LogLevel.Warn); } }
            if (!_onehit || !Context.IsWorldReady || Game1.currentLocation == null) return;
            if (++_cheatTicks % 20 != 0) return;
            try
            {
                foreach (var kv in Game1.currentLocation.Objects.Pairs)
                {
                    var o = kv.Value;
                    if (o != null && (o.IsBreakableStone() || o.Name.Contains("Node")) && o.getHealth() > 1) o.setHealth(1);
                }
            }
            catch { }
        }

        private void OnTick(object sender, UpdateTickedEventArgs e)
        {
            if (_tried || Context.IsWorldReady) { if (Context.IsWorldReady) _tried = true; return; }
            if (++_ticks % 120 != 0) return;
            // gameMode 0 = 标题界面; 等标题菜单真正挂上再动手
            if (Game1.gameMode != 0 || Game1.game1 == null) return;
            if (Game1.activeClickableMenu is not TitleMenu) return;

            string save = GetSaveName();
            if (save == null)
            {
                Monitor.Log("FeiyuAutoLoad: 未找到存档, 放弃自动读档", LogLevel.Warn);
                _tried = true;
                return;
            }
            _tried = true;
            Monitor.Log($"FeiyuAutoLoad: 自动读档 {save}", LogLevel.Info);
            // 1.6的parseDebugInput不认"load"命令(实测报Unknown), 正门=SaveGame.Load(filename)
            SaveGame.Load(save);
            Game1.exitActiveMenu(); // 原版LoadGameMenu.SaveFileSlot.Activate()同款: 读档+退出标题菜单, 缺一不可
        }

        // 剧情补偿: 事件992553(克林特送熔炉)被AI的warp操作跳过时, 条件满足即按原版授予逻辑补发
        // 原版行为(Game1.cs case "992553"): craftingRecipes.TryAdd("Furnace") + addQuest("11")
        private int _furnaceTicks;
        private void FurnaceCompensator(object sender, UpdateTickedEventArgs e)
        {
            if (!Context.IsWorldReady || ++_furnaceTicks % 600 != 0) return; // 每10秒查一次
            try
            {
                var p = Game1.player;
                bool hasOre = false;
                foreach (var it in p.Items) { if (it != null && it.QualifiedItemId == "(O)378") { hasOre = true; break; } }
                bool hasFurn = p.craftingRecipes.ContainsKey("Furnace");
                Monitor.Log("TDiag: paused=" + Game1.paused + " freezeCtl=" + Game1.freezeControls + " isTimePaused=" + Game1.isTimePaused
                    + " overlay=" + (Game1.overlayMenu != null) + " menu=" + (Game1.activeClickableMenu != null ? Game1.activeClickableMenu.GetType().Name : "null")
                    + " t=" + Game1.timeOfDay, LogLevel.Info);
                // 自动关"你获得了XX"类无选项提示框(挂着会冻时间)
                if (Game1.activeClickableMenu is StardewValley.Menus.DialogueBox db
                    && (db.responses == null || db.responses.Length == 0))
                {
                    db.receiveLeftClick(Game1.viewport.Width / 2, Game1.viewport.Height / 2);
                    Monitor.Log("AutoDismiss: 无选项DialogueBox已关", LogLevel.Info);
                }
                // 自动解卡: 无菜单无事件却锁移动(关弹窗残留)→时间冻结, 强制解锁
                if (Game1.player != null && !Game1.player.CanMove && !Game1.player.UsingTool
                    && Game1.activeClickableMenu == null && !Game1.eventUp && Game1.currentMinigame == null)
                {
                    Game1.player.CanMove = true;
                    Monitor.Log("Unstick: CanMove残留false已强制解锁", LogLevel.Info);
                }
                if (Game1.timeOfDay != 750) return; // 时间没冻就不用吵
                Monitor.Log("FurnaceChk: mining=" + p.GetSkillLevel(3) + " hasOre=" + hasOre + " hasFurnace=" + hasFurn, LogLevel.Info);
                if (p.craftingRecipes.ContainsKey("Furnace")) return;
                if (p.GetSkillLevel(3) < 1) return;                      // 挖矿须1级
                if (!p.Items.Any(i => i != null && i.QualifiedItemId == "(O)378")) return; // 背包须有铜矿
                p.craftingRecipes.TryAdd("Furnace", 0);
                p.addQuest("11");
                p.eventsSeen.Add("992553");                               // 标记事件已看, 防重复播放
                Monitor.Log("FeiyuAutoLoad: 补发熔炉配方(事件992553被AI warp跳过, 条件已满足)", LogLevel.Info);
            }
            catch (Exception ex) { Monitor.Log("FurnaceCompensator: " + ex.Message, LogLevel.Warn); }
        }

        private string GetSaveName()
        {
            string cfg = Helper.Data.ReadJsonFile<ModConfig>("config.json")?.SaveName ?? "auto";
            if (cfg != "auto") return cfg;
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "StardewValley", "Saves");
            if (!Directory.Exists(dir)) return null;
            return new DirectoryInfo(dir).GetDirectories()
                .OrderByDescending(d => d.LastWriteTime)
                .FirstOrDefault()?.Name;
        }
    }

    public class ModConfig
    {
        public string SaveName { get; set; } = "auto";
    }
}
