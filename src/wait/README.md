# wait · 星露谷桥的跨进程 `/wait` 挂载器

`/wait` 长轮询（契约 `wait/1.1`）：星露谷桥是 SMAPI mod（C#），改桥要重编+重启游戏代价太高，
所以 wait 做在代理层——1s 采样 `/state` 派生五个路径（invSlotsUsed/invCount/day 等，名字照 MC 桥抄，
一段条件两身体通用），`POST /wait` 对外求值单条件 `path op literal`（绝不 eval）。

| 文件 | 说明 |
| --- | --- |
| `wait_server.py` | 挂载器本体。生产部署 `~/qq-workspace/wait/`，`mount(target_base_url=)` 指向星露谷桥 |
| `selftest_wait_server.py` | 假桥 + 真 socket 12 条：matched/timeout/degraded/400/429/断开即停/双绑被拒 |
| `feiyu-wait.service` | systemd user unit：绑 `127.0.0.1:47870`，base=隧道 47844；`systemctl --user enable --now feiyu-wait` |

- 契约正文、夹具（51+9）、跨语言探针：在平台仓 [feiyu-os `code/wait/`](https://github.com/YeStarOne/feiyu-os)
- 2026-11-08 自 feiyu-os `code/wait` 迁入本仓（平台仓只留跨车道共享件）
- 红线：只绑 loopback/Tailscale；客户端断开必停；POST /wait 不进动作串行队列
