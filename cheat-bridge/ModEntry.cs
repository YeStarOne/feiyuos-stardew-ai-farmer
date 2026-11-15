// CheatBridge (2026-11-13 v1.0): 本机 cheat 端点 —— 对齐 FLiNG 修改器打的核心字段:
//   money(NetIntDelta, 联机共享钱包) / stamina(netStamina) / health / qi(netQiGems) / item.spawn。
//   所有写操作经 ConcurrentQueue 排到游戏线程(GameLoop.UpdateTicked)执行, 响应带 before/after 审计。
//   用法: POST http://127.0.0.1:7845/cheat  body={"op":"money.add","amount":1000}
//   ops: status / money.set|money.add / stamina.set|stamina.add|stamina.max /
//        health.set / qi.set|qi.add / item.spawn(id 必须带, count 默认1, quality 默认0)
//   ⚠️ /buy 的教训同样适用这里: 桥系列 id 一律字符串("388" 不是 388)。
//
// v1.1 (2026-11-14): 节日独立入场支持(方案A) ——
//   ⭐端口角色感知: SaveLoaded 后绑定, IsMasterGame→7845, farmhand→7846(两客户端共用 Mods 目录,
//     同前缀 HttpListener 会撞口, "撞了改7846"的既定口径固化成代码)。
//   ⭐1.6 就绪检查真 API: Game1.netReady(ReadySynchronizer, public static) ——
//     SetLocalReady(id,ready)/IsReady(id)/GetNumberReady(id)/GetNumberRequired(id)。
//   ⭐新 ops:
//     animal.buy      —— v1.2: 程序化买农场动物(跳过Marnie店UI): new FarmAnimal+adoptAnimal进空位鸡舍/牛棚,
//                        按farmAnimalData.Price扣钱, before/after审计同口径。type如 White Chicken/Cow。
//     animal.feed     —— v1.3: 喂饱指定/全部室内动物(fullness=255+happiness=255): 饿鸡不下蛋的解法,
//                        免买干草走hopper UI。type不给=喂Coop+Barn全部。
//     item.spawn v1.3 —— id带(W)前缀走 new MeleeWeapon(id)(Object构造器造武器=ErrorItem的坑)。
//     walk.cross v1.4 —— ⭐边界walk陷阱治本: 原生 Game1.warpFarmer(locationName,x,y,0) 全流程——
//                        节日入口弹就绪框(festival.auto计票2/2后回调进场)、普通边界直接切图、
//                        落点下一tick生效读/state确认。桥侧walk/go_to都不触发切图判定的唯一解。
//     festival.status —— festivalStart 检查状态(numberReady/Required/localReady/auto)
//     festival.ready  —— netReady.SetLocalReady("festivalStart",true) 只计票【绝不关就绪框】:
//                        反编译 Game1.warpFarmer 节日分支证实: ReadyCheckDialog 的回调=持票入场
//                        机制(2/2 后由它 performWarpFarmer 把本端送进场), 关框=弃票=开场也不传你进去。
//     festival.auto   —— {"enable":true|false} 本端自动计票钩子(仅 festivalStart, 每2秒查一次,
//                        默认 OFF; 建议两端都开=谁原生走进场 2/2 即达, 主持端无持票框不会被拽进场)
using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using StardewModdingAPI;
using StardewValley;

namespace CheatBridge;

public class ModEntry : Mod
{
    private const int PortMaster = 7845;
    private const int PortFarmhand = 7846;
    private int _port;                      // SaveLoaded 后实际绑定的端口(0=未绑定)
    private static readonly JsonSerializerOptions JsonOpt = new() { IncludeFields = true };
    private readonly ConcurrentQueue<Job> _queue = new();
    private Result _result;
    private readonly AutoResetEvent _done = new(false);
    private bool _festivalAuto;             // festival.auto 开关, 默认 OFF
    private int _autoTickDiv;               // 自动计票节流(UpdateTicked 60/s, 每 2 秒查一次)

    private sealed class Job { public string Op; public int Amount; public string Id; public int Count = 1; public int Quality; public bool Enable; public string AnimalType; public string AnimalName; public int X = -1; public int Y = -1; }
    private sealed class Snapshot { public int money; public float stamina; public int health; public int qi; public int time; public string loc; public bool isMaster; public int port; }
    private sealed class Result { public bool ok; public string error; public object data; public Snapshot before; public Snapshot after; }

    public override void Entry(IModHelper helper)
    {
        helper.Events.GameLoop.UpdateTicked += OnTick;
        helper.Events.GameLoop.SaveLoaded += OnSaveLoaded;   // 端口延迟到读档后绑(IsMasterGame 此刻才可靠), 监听线程也在此启动
        Monitor.Log($"CheatBridge v1.1 loaded (端口待 SaveLoaded 角色感知: master={PortMaster}/farmhand={PortFarmhand})", LogLevel.Info);
    }

    private void OnSaveLoaded(object sender, StardewModdingAPI.Events.SaveLoadedEventArgs e)
    {
        _port = Game1.IsMasterGame ? PortMaster : PortFarmhand;
        // ⚠️ 监听线程必须在 _port 定值后再起 —— Entry 时 _port=0, ":0/cheat/" 前缀非法会让监听器夭折
        var t = new Thread(ListenLoop) { IsBackground = true, Name = "CheatBridge.Http" };
        t.Start();
        Monitor.Log($"CheatBridge v1.1 绑定 http://127.0.0.1:{_port}/cheat (IsMasterGame={Game1.IsMasterGame})", LogLevel.Info);
    }

    private void OnTick(object sender, StardewModdingAPI.Events.UpdateTickedEventArgs e)
    {
        // festival.auto: 检查激活(GetNumberRequired>0)且本端未就绪 → 自动计票; 仅 festivalStart
        if (_festivalAuto && ++_autoTickDiv >= 120)
        {
            _autoTickDiv = 0;
            try
            {
                var nr = Game1.netReady;
                if (nr.GetNumberRequired("festivalStart") > 0 && !nr.IsReady("festivalStart"))
                {
                    nr.SetLocalReady("festivalStart", true);
                    Monitor.Log($"[festival.auto] festivalStart 自动计票 (t={Game1.timeOfDay})", LogLevel.Info);
                }
            }
            catch (Exception ex) { Monitor.Log($"[festival.auto] {ex.Message}", LogLevel.Warn); }
        }
        if (_queue.TryDequeue(out var job))
        {
            _result = Execute(job);
            _done.Set();
        }
    }

    private static Snapshot Snap() => new()
    {
        money = Game1.player?.Money ?? -1,
        stamina = Game1.player?.Stamina ?? -1f,
        health = Game1.player?.health ?? -1,
        qi = Game1.player?.QiGems ?? -1,
        time = Game1.timeOfDay,
        loc = Game1.currentLocation?.Name ?? "?",
        isMaster = Game1.IsMasterGame,
        port = 0,
    };

    private Result Execute(Job j)
    {
        var before = Snap();
        before.port = _port;
        try
        {
            var p = Game1.player;
            if (p is null) return new Result { ok = false, error = "player not loaded yet", before = before };
            object data;
            switch (j.Op)
            {
                case "status": data = before; break;
                case "money.set": p.Money = j.Amount; data = new { money = p.Money }; break;
                case "money.add": p.Money += j.Amount; data = new { money = p.Money }; break;
                case "stamina.set": p.Stamina = j.Amount; data = new { stamina = p.Stamina }; break;
                case "stamina.add": p.Stamina += j.Amount; data = new { stamina = p.Stamina }; break;
                case "stamina.max": p.Stamina = p.maxStamina.Value; data = new { stamina = p.Stamina, max = p.maxStamina.Value }; break;
                case "health.set": p.health = j.Amount; data = new { health = p.health }; break;
                case "qi.set": p.QiGems = j.Amount; data = new { qi = p.QiGems }; break;
                case "qi.add": p.QiGems += j.Amount; data = new { qi = p.QiGems }; break;
                case "item.spawn":
                    {
                        if (string.IsNullOrEmpty(j.Id)) return new Result { ok = false, error = "item.spawn needs id (string)", before = before };
                        StardewValley.Item item;
                        if (j.Id.StartsWith("(W)") || j.Id.StartsWith("W")) {
                            var wid = j.Id.Replace("(W)", "").Trim();
                            item = new StardewValley.Tools.MeleeWeapon(wid);
                        } else {
                            var obj = new StardewValley.Object(j.Id, Math.Max(1, j.Count));
                            obj.Quality = j.Quality;
                            item = obj;
                        }
                        p.addItemToInventory(item);
                        data = new { item = item.Name, count = item.Stack, quality = j.Quality };
                        break;
                    }
                case "festival.status":
                    {
                        var nr = Game1.netReady;
                        int nreq = nr.GetNumberRequired("festivalStart");
                        data = new { check = nreq > 0, numberReady = nr.GetNumberReady("festivalStart"), numberRequired = nreq, localReady = nr.IsReady("festivalStart"), auto = _festivalAuto };
                        break;
                    }
                case "festival.ready":
                    {
                        var nr = Game1.netReady;
                        int nreq = nr.GetNumberRequired("festivalStart");
                        bool wasReady = nr.IsReady("festivalStart");
                        nr.SetLocalReady("festivalStart", true);
                        data = new { check = nreq > 0, wasReady, localReady = true, numberReady = nr.GetNumberReady("festivalStart"), numberRequired = nreq, note = "只计票不关框: 就绪框回调=持票入场(2/2后由它warp进场), 关框=弃票" };
                        break;
                    }
                case "walk.cross":
                    {
                        if (string.IsNullOrEmpty(j.Id)) return new Result { ok = false, error = "walk.cross needs id (location name e.g. Town/Beach/UndergroundMine1)", before = before };
                        Game1.warpFarmer(j.Id, j.X, j.Y, 0);
                        data = new { request = j.Id, x = j.X, y = j.Y, note = "原生warpFarmer全流程已发起: 节日入口→弹就绪框(auto计票2/2后回调进场); 普通边界→直接切图; 落点下一tick生效, 读/state确认" };
                        break;
                    }
                case "animal.feed":
                    {
                        int fed = 0;
                        foreach (var b in Game1.getFarm().buildings)
                        {
                            var indoor = b.GetIndoors() as StardewValley.AnimalHouse;
                            if (indoor is null) continue;
                            foreach (var a in indoor.animals.Values)
                            {
                                if (j.AnimalType is null || a.type.Value == j.AnimalType)
                                {
                                    a.fullness.Value = 255;
                                    a.happiness.Value = 255;
                                    fed++;
                                }
                            }
                        }
                        data = new { fed, note = "fullness/happiness=255; 饿鸡不下蛋的API解法" };
                        break;
                    }
                case "animal.buy":
                    {
                        var type = j.AnimalType ?? "White Chicken";
                        // 找同类型且有空位的 Coop/Barn
                        StardewValley.AnimalHouse target = null; string buildingName = null;
                        foreach (var b in Game1.getFarm().buildings)
                        {
                            var indoor = b.GetIndoors() as StardewValley.AnimalHouse;
                            if (indoor is null || indoor.isFull()) continue;
                            bool bCoop = b.buildingType.Value.Contains("Coop");
                            bool bBarn = b.buildingType.Value.Contains("Barn");
                            bool aCoop = type.Contains("Chicken") || type.Contains("Duck") || type.Contains("Rabbit") || type.Contains("Dinosaur");
                            if ((aCoop && bCoop) || (!aCoop && bBarn)) { target = indoor; buildingName = b.buildingType.Value; break; }
                        }
                        if (target is null) return new Result { ok = false, error = "no " + (type.Contains("Chicken") || type.Contains("Duck") || type.Contains("Rabbit") ? "Coop" : "Barn") + " with free slot", before = before };
                        // wiki 硬表(1.6 Marnie 店领养价); animal type 校验用 farmAnimalData
                        if (!StardewValley.Game1.farmAnimalData.ContainsKey(type)) return new Result { ok = false, error = "unknown animal type: " + type, before = before };
                        var prices = new System.Collections.Generic.Dictionary<string, int> { { "White Chicken", 800 }, { "Brown Chicken", 800 }, { "Duck", 1200 }, { "Rabbit", 8000 }, { "Cow", 1500 }, { "Goat", 4000 }, { "Sheep", 8000 }, { "Pig", 16000 } };
                        if (!prices.TryGetValue(type, out int price)) return new Result { ok = false, error = "type " + type + " not purchasable (Dinosaur/Ostrich=孵化)", before = before };
                        if (p.Money < price) return new Result { ok = false, error = "not enough money (need " + price + ", have " + p.Money + ")", before = before };
                                                var mpField = typeof(StardewValley.Game1).GetField("multiplayer", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic);
                        var mp = mpField?.GetValue(null) as StardewValley.Multiplayer;
                        if (mp is null) return new Result { ok = false, error = "multiplayer instance not reachable", before = before };
                        var animal = new StardewValley.FarmAnimal(type, mp.getNewID(), p.UniqueMultiplayerID);
                        if (!string.IsNullOrEmpty(j.AnimalName)) { animal.Name = j.AnimalName; animal.displayName = j.AnimalName; }
                        target.adoptAnimal(animal);
                        p.Money -= price;
                        data = new { animal = animal.displayType, name = animal.Name, price, money = p.Money, building = buildingName };
                        break;
                    }
                case "festival.auto":
                    _festivalAuto = j.Enable;
                    data = new { auto = _festivalAuto, note = "仅festivalStart; 两端都开=谁原生走进场即全员计票, 主持端无持票框不会被拽进场" };
                    break;
                default: return new Result { ok = false, error = "unknown op: " + j.Op, before = before };
            }
            var after = Snap();
            after.port = _port;
            return new Result { ok = true, data = data, before = before, after = after };
        }
        catch (Exception ex)
        {
            return new Result { ok = false, error = ex.Message, before = before };
        }
    }

    private void ListenLoop()
    {
        var listener = new HttpListener();
        try
        {
            listener.Prefixes.Add($"http://127.0.0.1:{_port}/cheat/");
            listener.Prefixes.Add($"http://localhost:{_port}/cheat/");
            listener.Start();
        }
        catch (Exception ex)
        {
            Monitor.Log($"CheatBridge HttpListener failed on {_port}: {ex.Message}", LogLevel.Error);
            return;
        }
        Monitor.Log($"CheatBridge listening on http://127.0.0.1:{_port}/cheat", LogLevel.Info);
        while (listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = listener.GetContext(); } catch { return; }
            try
            {
                string body;
                using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8)) body = reader.ReadToEnd();
                Result res;
                var job = Parse(body);
                if (job is null) res = new Result { ok = false, error = "bad json / missing op" };
                else if (_port == 0) res = new Result { ok = false, error = "world not loaded yet (port binds at SaveLoaded)" };
                else
                {
                    _result = null;
                    _done.Reset();
                    _queue.Enqueue(job);
                    if (!_done.WaitOne(15000) || _result is null) res = new Result { ok = false, error = "no game tick in 15s (world frozen/loading?)" };
                    else res = _result;
                }
                var json = JsonSerializer.Serialize(res, JsonOpt);
                var buf = Encoding.UTF8.GetBytes(json);
                ctx.Response.ContentType = "application/json";
                ctx.Response.ContentLength64 = buf.Length;
                ctx.Response.OutputStream.Write(buf, 0, buf.Length);
                ctx.Response.OutputStream.Close();
            }
            catch (Exception ex)
            {
                try
                {
                    var err = Encoding.UTF8.GetBytes("{\"ok\":false,\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}");
                    ctx.Response.StatusCode = 500;
                    ctx.Response.OutputStream.Write(err, 0, err.Length);
                    ctx.Response.OutputStream.Close();
                }
                catch { }
            }
        }
    }

    private static Job Parse(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        if (!root.TryGetProperty("op", out var opEl)) return null;
        var j = new Job { Op = opEl.GetString() };
        if (root.TryGetProperty("amount", out var a) && a.TryGetInt32(out var av)) j.Amount = av;
        else if (root.TryGetProperty("value", out var v) && v.TryGetInt32(out var vv)) j.Amount = vv;
        if (root.TryGetProperty("id", out var idEl)) j.Id = idEl.GetString();
        if (root.TryGetProperty("count", out var c) && c.TryGetInt32(out var cv)) j.Count = cv;
        if (root.TryGetProperty("quality", out var q) && q.TryGetInt32(out var qv)) j.Quality = qv;
        if (root.TryGetProperty("enable", out var en)) j.Enable = en.ValueKind == JsonValueKind.True;
        if (root.TryGetProperty("type", out var ty) && ty.ValueKind == JsonValueKind.String) j.AnimalType = ty.GetString();
        if (root.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String) j.AnimalName = nm.GetString();
        if (root.TryGetProperty("x", out var xEl) && xEl.TryGetInt32(out var xv)) j.X = xv;
        if (root.TryGetProperty("y", out var yEl) && yEl.TryGetInt32(out var yv)) j.Y = yv;
        return j;
    }
}
