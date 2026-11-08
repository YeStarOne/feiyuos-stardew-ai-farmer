#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""跨进程 `/wait` 挂载器（星露谷桥用）。

星露谷桥是 SMAPI mod（C#），改它要重新编译 + 重启游戏，代价太高。所以 `/wait` 用
"旁边起一个只读代理"的方式挂：本进程按 1s 采样现有桥的 GET 端点，把结果交给
`wait_probe` 的求值器，对外只暴露 `POST /wait`。

  POST /wait {"path":"/state","condition":"invSlotsUsed >= 36","timeout_s":60}
    → {"reason":"matched"|"timeout"|"degraded"|"bad_request", ...}   # 与 CONTRACT wait/1.1 同构

四条硬约束（2026-11-08 与 feiyu-os-repo / minecraft 对齐）：
  1. 采样读桥用 **curl 子进程**，不用 urllib —— 服务器上 python 的 urllib 直连桥会
     ConnectionReset（sd.py 早就踩过，注释还在）。这条不照抄会得到一个"偶发全 failed"。
  2. **客户端断开必须停止采样**，不许采完再写一个必然失败的响应（select + MSG_PEEK）。
  3. `/wait` **绝不进任何动作锁**：只发 GET，永远不碰 POST 动作队列。
  4. 并发上限 4，满了只拒**新**来者（429），已在等的继续等完；同 (path,condition)
     在 1s 内共享一次采样（single-flight）。

另外把星露谷 `/state` 的原始形状**归一化**成契约认识的形状（见 `adapt()`）：
桥给的是 `{worldReady, player{x,y,money,maxItems}, time{dayOfMonth,season}, inventory[]}`，
契约要的是 `{invSlotsUsed, invSlotsTotal, invCount{}, day, ...}`。归一化在这里做，
不在求值器里做——求值器只认字典，不该知道星露谷长什么样。

用法：
  python wait_server.py --base http://127.0.0.1:47844 --port 47870
  python wait_server.py --base ... --port ... --once     # 前台跑，Ctrl-C 停
"""
import argparse
import json
import os
import select
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wait_probe as W                                        # noqa: E402

MAX_WAITERS = 4
POLL_S = 1.0
CURL_TIMEOUT = 8
SINGLEFLIGHT_S = 1.0

BASE = 'http://127.0.0.1:47844'      # 服务器侧隧道口 → PC 17843 代理
TARGET_NAME = 'stardew'

_cache = {}          # path -> (at, payload_or_None)
_cache_lock = threading.Lock()
_waiters = 0
_waiters_lock = threading.Lock()
_started = time.time()


# ---------------------------------------------------------------- 采样
def _curl_get(url, timeout=CURL_TIMEOUT):
    """返回 (payload, None) 或 (None, 失败原因)。子进程 curl，见文件头约束 1。"""
    try:
        p = subprocess.run(['curl', '-s', '-m', str(int(timeout)), url],
                           capture_output=True, timeout=timeout + 3)
    except Exception as e:                                    # noqa: BLE001
        return None, 'curl-spawn:%s' % type(e).__name__
    out = p.stdout.decode('utf-8', 'replace').strip()
    if p.returncode != 0:
        return None, 'curl-rc=%d' % p.returncode
    if not out:
        return None, 'empty'
    try:
        return json.loads(out), None
    except ValueError:
        return None, 'not-json'


def adapt(path, raw):
    """星露谷原始 payload -> 契约 payload。纯函数，便于单测。

    关键一条：`inventory` 是数组，她数不了长度，所以在这里算成两个标量
    （invSlotsUsed / invSlotsTotal）和一个 count map（invCount）。
    这正是 MC 桥在 bot.js 里做的事——两边用同一套字段名，她写一次条件两个身体都能用。
    """
    if not isinstance(raw, dict):
        return None
    inv = raw.get('inventory') or []
    counts = {}
    for it in inv:
        if not isinstance(it, dict):
            continue
        nm = it.get('name')
        if not nm:
            continue
        counts[nm] = counts.get(nm, 0) + int(it.get('stack') or 1)
    # 大小写别名：星露谷的物品名是 'Parsnip' / 'Watering Can' 这种首字母大写，
    # 而她和模型天然会写小写。没有别名的话 `coal >= 10` 永远算 0（missing→0），
    # 于是"等到有 10 个煤"会在真正有煤之后**继续等**——最坏那种失败。
    # MC 桥有静态 schema 兜底（拼错直接 400），星露谷没有物品注册表，所以在这里补。
    # 只对 /inv/count 生效，只加"小写别名"，不改原键，不合并大小写不同的两个物品（星露谷不存在这种）。
    lower = {}
    for k, v in counts.items():
        lower[k.lower()] = lower.get(k.lower(), 0) + v
    for k, v in lower.items():
        counts.setdefault(k, v)
    # 带空格的物品名（'Parsnip Seeds'、'Watering Can'、'Quality Sprinkler'）在契约语法里
    # **写不出来**——ident 只允许 [A-Za-z0-9_]。所以再补一层下划线别名：
    # 'Parsnip Seeds' -> 'parsnip_seeds'。不加这层，她对这些物品永远写不出条件。
    for k, v in list(counts.items()):
        if ' ' in k:
            counts.setdefault(k.replace(' ', '_').lower(), v)
    used = len(inv)
    total = int((raw.get('player') or {}).get('maxItems') or 36)
    t = raw.get('time') or {}

    if path == '/state':
        out = dict(raw)
        out['invSlotsUsed'] = used
        out['invSlotsTotal'] = total
        out['invCount'] = counts
        out['day'] = t.get('dayOfMonth')          # 与 MC 桥同名字段
        return out
    if path == '/pos':
        pl = raw.get('player') or {}
        if 'x' not in pl or 'y' not in pl:
            return None
        return {'x': pl['x'], 'y': pl['y']}
    if path == '/inv/count':
        return counts
    if path == '/time':
        if not t:
            return None
        return dict(t, day=t.get('dayOfMonth'))
    if path == '/health':
        return {'ok': bool(raw.get('worldReady')), 'worldReady': bool(raw.get('worldReady')),
                'uptimeSec': None, 'target': TARGET_NAME}
    return None


# 采样恒定打 /state：其余四个路径全部由它派生（adapt）。好处有两个——
#   ① 她的等待无论写哪个路径，对桥都只有 1 次 GET/s（这才是"把 40 次轮询变成 1 次"的实处）；
#   ② 同一个 tick 里所有等待者看到的是**同一份快照**，不会出现"两个 waiter 对同一秒给出不同答案"。
_SOURCE = '/state'


def probe(path):
    """一次采样：-> (payload, None) 或 (None, 失败原因)。带 1s single-flight。"""
    now = time.time()
    with _cache_lock:
        c = _cache.get(path)
        if c and now - c[0] <= SINGLEFLIGHT_S:
            return c[1], c[2]
    raw, why = _curl_get(BASE + _SOURCE)
    payload = adapt(path, raw) if raw is not None else None
    if payload is None and why is None:
        why = 'adapt-null'         # 桥回了但形状不认识（例如 worldReady=false 时 player 为空）
    with _cache_lock:
        _cache[path] = (now, payload, why)
    return payload, why


# ---------------------------------------------------------------- 判定（复用 wait_probe）
def _new_stats():
    return {'ok': 0, 'failed': 0, 'missing': 0, 'type_error': 0}


def evaluate_request(body, still_there=None):
    """完整执行一次 /wait。返回响应 dict。绝不抛异常（约束：handler 必须在 try 内）。"""
    t0 = time.time()
    if not isinstance(body, dict):
        return _bad('request_shape', 0, t0)
    path = body.get('path')
    cond = body.get('condition')
    tmo = body.get('timeout_s', None)

    # 校验顺序与 CONTRACT §6 一致
    if not isinstance(path, str) or path not in W.WAITABLE:
        return _bad('path_not_waitable', _eff(tmo), t0)
    if not isinstance(cond, str):
        return _bad('request_shape', _eff(tmo), t0)
    if tmo is not None and (isinstance(tmo, bool) or not isinstance(tmo, int) or tmo <= 0):
        return _bad('request_shape', 0, t0)
    eff = min(tmo, W.MAX_TIMEOUT) if tmo is not None else W.DEFAULT_TIMEOUT
    try:
        segs, op, lit = W.parse_condition(cond)
    except W.Bad as e:
        return _bad(e.detail, eff, t0)

    st = _new_stats()
    matched_at = None
    last = None
    recent = []
    deadline = t0 + eff
    i = 0
    while True:
        if still_there is not None and not still_there():
            return None                      # 客户端已断：立刻停采样，不写响应（约束 2）
        i += 1
        payload, why = probe(path)
        if payload is None:
            st['failed'] += 1
            recent = (recent + ['failed'])[-3:]
        else:
            st['ok'] += 1
            last = payload
            dflt = W.MAP_DEFAULT.get(path, W._NODEF)
            verdict = W.evaluate(payload, segs, op, lit, dflt)
            if verdict == 'missing':
                st['missing'] += 1
            elif verdict == 'type_error':
                st['type_error'] += 1
            recent = (recent + ['ok'])[-3:]
            if verdict == 'true':
                matched_at = i
                break
        if time.time() >= deadline:
            break
        time.sleep(max(0.0, min(POLL_S, deadline - time.time())))

    total = st['ok'] + st['failed']
    ratio_bad = total > 0 and st['failed'] / total > 0.5
    if matched_at is not None:
        reason = 'degraded' if (ratio_bad or recent.count('failed') >= 2) else 'matched'
    else:
        reason = 'degraded' if ratio_bad else 'timeout'
    return {
        'contract': W.CONTRACT, 'ok': reason == 'matched', 'reason': reason, 'detail': '',
        'matched': reason == 'matched', 'path': path, 'condition': cond,
        'effective_timeout_s': eff, 'elapsed_ms': int((time.time() - t0) * 1000),
        'samples_total': total, 'samples_ok': st['ok'], 'samples_failed': st['failed'],
        'samples_missing': st['missing'], 'samples_type_error': st['type_error'],
        'matched_at_sample': matched_at, 'value': last, 'target': TARGET_NAME,
    }


def _eff(tmo):
    if isinstance(tmo, int) and not isinstance(tmo, bool) and tmo > 0:
        return min(tmo, W.MAX_TIMEOUT)
    return 0


def _bad(detail, eff, t0):
    return {'contract': W.CONTRACT, 'ok': False, 'reason': 'bad_request', 'detail': detail,
            'matched': False, 'path': None, 'condition': None, 'effective_timeout_s': eff,
            'elapsed_ms': int((time.time() - t0) * 1000), 'samples_total': 0, 'samples_ok': 0,
            'samples_failed': 0, 'samples_missing': 0, 'samples_type_error': 0,
            'matched_at_sample': None, 'value': None, 'target': TARGET_NAME}


# ---------------------------------------------------------------- HTTP
def _client_gone(conn):
    """对端已关闭？只窥视，不消费（约束 2）。"""
    try:
        r, _, _ = select.select([conn], [], [], 0)
        if not r:
            return False
        return conn.recv(1, socket.MSG_PEEK) == b''
    except Exception:                                        # noqa: BLE001
        return True


def _drain(conn, n):
    """429 前把请求体读完，否则客户端看到的是连接重置而不是 429。"""
    left = min(int(n or 0), 65536)
    try:
        while left > 0:
            chunk = conn.recv(min(4096, left))
            if not chunk:
                break
            left -= len(chunk)
    except Exception:                                        # noqa: BLE001
        pass


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'feiyu-wait/1.1'

    def log_message(self, fmt, *a):
        pass

    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        except Exception:                                    # noqa: BLE001
            pass                                             # 客户端已断：不写、不报

    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/healthz':
            return self._send(200, {'ok': True, 'target': TARGET_NAME, 'base': BASE,
                                    'uptimeSec': int(time.time() - _started),
                                    'waiters': _waiters, 'contract': W.CONTRACT})
        if p == '/wait':
            return self._send(405, {'ok': False, 'reason': 'bad_request',
                                    'detail': 'method_not_allowed'})
        return self._send(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        p = urlparse(self.path).path
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if p != '/wait':
            _drain(self.rfile, n)
            return self._send(404, {'ok': False, 'error': 'not found'})
        try:
            raw = self.rfile.read(n) if n else b''
        except Exception:                                    # noqa: BLE001
            raw = b''
        try:
            body = json.loads(raw.decode('utf-8', 'replace') or '{}')
        except ValueError:
            return self._send(400, _bad('request_shape', 0, time.time()))

        global _waiters
        with _waiters_lock:
            if _waiters >= MAX_WAITERS:
                full = True
            else:
                full = False
                _waiters += 1
        if full:
            return self._send(429, {'ok': False, 'reason': 'bad_request',
                                    'detail': 'too_many_waiters', 'contract': W.CONTRACT})
        try:
            res = evaluate_request(body, still_there=lambda: not _client_gone(self.connection))
        except Exception as e:                               # noqa: BLE001
            res = _bad('internal:%s' % type(e).__name__, 0, time.time())
        finally:
            with _waiters_lock:
                _waiters -= 1

        if res is None:
            return                                           # 约束 2：断开就不写
        return self._send(200 if res['reason'] != 'bad_request' else 400, res)


class Srv(ThreadingHTTPServer):
    """单实例绑定。

    2026-11-08 实测踩到：Python 的 HTTPServer 默认 allow_reuse_address=1，
    在 Windows 上等于 SO_REUSEADDR，**第二个进程能成功绑同一端口**，于是两个实例
    同时 LISTENING、请求被随机分给其中一个。表现是"同一个条件一会儿 matched 一会儿
    timeout"——查起来极像逻辑 bug。
    （同一个坑我在 wd_pc_body.py 已经修过一次，这次在 Python 侧又踩到。）
    """
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            except OSError:
                pass
        ThreadingHTTPServer.server_bind(self)


def main(argv=None):
    global BASE, TARGET_NAME
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default=os.environ.get('SD_BRIDGE', BASE))
    ap.add_argument('--port', type=int, default=int(os.environ.get('WAIT_PORT', 47870)))
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--target', default=TARGET_NAME)
    ap.add_argument('--once', action='store_true', help='前台跑（默认也是前台，占位给 systemd 区分）')
    a = ap.parse_args(argv)
    BASE = a.base.rstrip('/')
    TARGET_NAME = a.target

    try:
        srv = Srv((a.host, a.port), H)
    except OSError as e:
        print('wait-server 绑定失败（多半已有实例在跑）: %s' % e, flush=True)
        return 3
    try:
        (os.path.dirname(os.path.abspath(__file__)) + '/wait_server.pid')
        open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wait_server.pid'),
             'w', encoding='utf-8').write(str(os.getpid()))
    except OSError:
        pass
    print('wait-server listening http://%s:%d pid=%d target=%s base=%s contract=%s'
          % (a.host, a.port, os.getpid(), TARGET_NAME, BASE, W.CONTRACT), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
