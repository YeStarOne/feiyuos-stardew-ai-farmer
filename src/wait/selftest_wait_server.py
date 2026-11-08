#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wait_server 的端到端自测（假桥 + 真 HTTP，不走游戏）。

为什么要有这个：`/wait` 的核心价值是"她不用写轮询循环"，而它自己的实现里塞满了
时序行为（1s 采样、断开即停、并发上限、single-flight）。这些**没法用纯夹具测**
（夹具只测判定逻辑，不测时间），只能用真 socket 跑一遍。

跑法：python selftest_wait_server.py        # 全绿退出码 0
"""
import json
import os
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wait_server as S                                      # noqa: E402

STATE = {
    'mode': 'ok',
    'payload': {
        'worldReady': True,
        'player': {'x': 12.5, 'y': 40.0, 'money': 100, 'maxItems': 36},
        'time': {'dayOfMonth': 8, 'season': 'winter'},
        'inventory': [
            {'name': 'parsnip', 'stack': 3, 'slotIndex': 0},
            {'name': 'coal', 'stack': 2, 'slotIndex': 1},
            {'name': 'stone', 'stack': 50, 'slotIndex': 2},
        ],
    },
}


class Fake(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def do_GET(self):
        p = urlparse(self.path).path
        if STATE['mode'] == 'fail500':
            self.send_response(500)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if p not in ('/state', '/pos', '/time', '/health'):
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        b = json.dumps(STATE['payload']).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)


def serve(handler):
    srv = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def post(port, body, timeout=20, close_after=None):
    s = socket.create_connection(('127.0.0.1', port), timeout=timeout)
    raw = json.dumps(body).encode()
    s.sendall(b'POST /wait HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n'
              b'Content-Length: ' + str(len(raw)).encode() + b'\r\n\r\n' + raw)
    if close_after is not None:
        time.sleep(close_after)
        s.close()
        return None
    buf = b''
    while b'\r\n\r\n' not in buf:
        c = s.recv(4096)
        if not c:
            break
        buf += c
    head, _, rest = buf.partition(b'\r\n\r\n')
    code = int(head.split(b' ')[1])
    n = 0
    for line in head.split(b'\r\n'):
        if line.lower().startswith(b'content-length:'):
            n = int(line.split(b':')[1])
    while len(rest) < n:
        c = s.recv(4096)
        if not c:
            break
        rest += c
    s.close()
    try:
        return code, json.loads(rest.decode())
    except ValueError:
        return code, None


def get(port, path):
    s = socket.create_connection(('127.0.0.1', port), timeout=10)
    s.sendall(b'GET ' + path.encode() + b' HTTP/1.1\r\nHost: x\r\n\r\n')
    buf = b''
    while b'\r\n\r\n' not in buf:
        c = s.recv(4096)
        if not c:
            break
        buf += c
    head, _, rest = buf.partition(b'\r\n\r\n')
    n = 0
    for line in head.split(b'\r\n'):
        if line.lower().startswith(b'content-length:'):
            n = int(line.split(b':')[1])
    while len(rest) < n:
        c = s.recv(4096)
        if not c:
            break
        rest += c
    s.close()
    return int(head.split(b' ')[1]), (json.loads(rest.decode()) if rest else None)


results = []


def check(name, ok, extra=''):
    results.append((name, ok, extra))
    print('%-34s %s %s' % (name, 'PASS' if ok else 'FAIL', extra if not ok else ''))


def main():
    _, bp = serve(Fake)
    S.BASE = 'http://127.0.0.1:%d' % bp
    _, wp = serve(S.H)
    print('fake bridge :%d   wait server :%d   contract=%s\n' % (bp, wp, S.W.CONTRACT))

    # 1 healthz
    code, d = get(wp, '/healthz')
    check('healthz', code == 200 and d.get('ok') and d.get('contract') == S.W.CONTRACT)

    # 2 matched（/state 派生标量）
    S._cache.clear()
    code, d = post(wp, {'path': '/state', 'condition': 'invSlotsUsed >= 3', 'timeout_s': 5})
    check('state invSlotsUsed>=3 matched', d and d['reason'] == 'matched' and d['matched_at_sample'] == 1,
          repr(d and d.get('reason')))

    # 3 count map：不在表里 = 0（wait/1.1 的核心）
    S._cache.clear()
    code, d = post(wp, {'path': '/inv/count', 'condition': 'diamond == 0', 'timeout_s': 5})
    check('inv/count 不在表里=0 matched', d and d['reason'] == 'matched' and d['samples_missing'] == 0,
          repr(d and (d.get('reason'), d.get('samples_missing'))))

    # 4 /pos 派生
    S._cache.clear()
    code, d = post(wp, {'path': '/pos', 'condition': 'x >= 10', 'timeout_s': 5})
    check('pos x>=10 matched', d and d['reason'] == 'matched', repr(d and d.get('reason')))

    # 5 /time 的 day 从 dayOfMonth 合成
    S._cache.clear()
    code, d = post(wp, {'path': '/time', 'condition': 'day >= 1', 'timeout_s': 5})
    check('time day>=1 matched', d and d['reason'] == 'matched', repr(d and d.get('reason')))

    # 6 timeout（样本真的在采）
    S._cache.clear()
    code, d = post(wp, {'path': '/state', 'condition': 'money > 99999999', 'timeout_s': 2})
    check('timeout + samples_ok>=2',
          d and d['reason'] == 'timeout' and d['samples_ok'] >= 2 and d['matched_at_sample'] is None,
          repr(d and (d.get('reason'), d.get('samples_ok'))))

    # 7 degraded：桥全 500 -> 看不见 != 不成立
    STATE['mode'] = 'fail500'
    S._cache.clear()
    code, d = post(wp, {'path': '/state', 'condition': 'invSlotsUsed >= 3', 'timeout_s': 2})
    check('degraded on all-500', d and d['reason'] == 'degraded' and d['samples_ok'] == 0,
          repr(d and (d.get('reason'), d.get('samples_ok'), d.get('samples_failed'))))
    STATE['mode'] = 'ok'

    # 8 语法拒（两个空格）
    S._cache.clear()
    code, d = post(wp, {'path': '/state', 'condition': 'invSlotsUsed  >=  3', 'timeout_s': 2})
    check('bad_request condition_grammar',
          code == 400 and d and d['detail'] == 'condition_grammar', repr((code, d and d.get('detail'))))

    # 9 路径白名单（/fishbot 是 toggle，永不进白名单）
    S._cache.clear()
    code, d = post(wp, {'path': '/fishbot', 'condition': 'ok == true', 'timeout_s': 2})
    check('bad_request path_not_waitable',
          code == 400 and d and d['detail'] == 'path_not_waitable', repr((code, d and d.get('detail'))))

    # 10 并发上限：5 个长等待，至少 1 个 429
    S._cache.clear()
    got = []

    def long_wait():
        try:
            c, dd = post(wp, {'path': '/state', 'condition': 'money > 99999999', 'timeout_s': 3})
            got.append((c, dd and dd.get('detail')))
        except Exception as e:                               # noqa: BLE001
            got.append(('EXC', type(e).__name__))

    ts = [threading.Thread(target=long_wait) for _ in range(5)]
    [t.start() for t in ts]
    time.sleep(0.8)
    [t.join() for t in ts]
    codes = [c for c, _ in got]
    check('5 concurrent -> one 429', codes.count(429) >= 1 and codes.count(200) >= 1, repr(codes))

    # 11 断开即停：0.3s 后关闭，waiter 必须在 ~1.5s 内归零（不能等满 8s）
    S._cache.clear()
    t0 = time.time()
    post(wp, {'path': '/state', 'condition': 'money > 99999999', 'timeout_s': 8}, close_after=0.3)
    zeroed = None
    for _ in range(30):
        time.sleep(0.1)
        if S._waiters == 0:
            zeroed = time.time() - t0
            break
    check('disconnect stops sampling', zeroed is not None and zeroed < 2.0,
          'waiters=%r after %.1fs' % (S._waiters, time.time() - t0))

    # 12 单实例：同端口第二个 bind 必须失败（Windows 上 allow_reuse_address 会让它成功）
    dup = None
    try:
        dup = S.Srv(('127.0.0.1', wp), S.H)
        dup.server_close()
    except OSError:
        dup = None
    check('second bind refused', dup is None, 'dup server 竟然绑上了 %r' % (dup,))

    bad = [r for r in results if not r[1]]
    print('\n%d/%d 通过' % (len(results) - len(bad), len(results)))
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main())
