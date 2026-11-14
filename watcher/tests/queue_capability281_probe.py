"""Feed the actual local Workerd cache reply to the real Watcher transport/caller.

Only local synthetic HTTP responses and files are doubled. Never reads a user config.
"""
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.parse
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import watcher

cache = json.load(sys.stdin)
with tempfile.TemporaryDirectory() as folder:
    cfg = dict(wow_dir=folder, account='SYNTHETIC', worker_url='https://test.invalid',
               watcher_token='synthetic-cache281-token', verify_secret='synthetic-cache281-secret',
               officer_character='Fixture Officer', membership_only=True,
               state_file=str(Path(folder) / 'state.json'))
    w = watcher.Watcher(cfg)
    requests = []

    class Response:
        status = 200
        headers = {}
        def __init__(self, url, value):
            self.url, self.data = url, io.BytesIO(json.dumps(value).encode())
        def __enter__(self): return self
        def __exit__(self, *args): self.data.close()
        def geturl(self): return self.url
        def read(self, size=-1): return self.data.read(size)

    def transport(request, timeout):
        path = urllib.parse.urlsplit(request.full_url).path
        requests.append((request.get_method(), path))
        if request.get_method() == 'GET' and path == '/health':
            return Response(request.full_url, dict(ok=True, build='2026-11-13.281', verification=dict(
                mode='members-only', nativeScopePinned=True,
                nativeMembershipProofVersion=1, nativeRosterProtocolVersion=2)))
        if request.get_method() == 'GET' and path == '/queue':
            return Response(request.full_url, cache if 'cacheOnly242=1' in request.full_url else dict(
                presenceOnly=True, entries=[], setGuildNote=False))
        if path == '/internal/roles242/continue':
            raise urllib.error.HTTPError(request.full_url, 401, 'retired officer signer', {}, io.BytesIO())
        raise AssertionError('unexpected synthetic request')

    w.pull_strict_display = lambda: None
    with patch.object(w.worker.opener, 'open', side_effect=transport):
        w.require_launch_worker()
        requests.clear()
        w.pull_queue()
        assert not w.worker.paused(), 'real queue reply must not trigger a global authentication pause'
        assert requests == [('GET', '/queue'), ('GET', '/queue')], requests
        assert w.worker.call('GET', '/health', retries=1)[0] is True
        assert requests[-1] == ('GET', '/health')
    with patch.object(w.worker.opener, 'open', side_effect=urllib.error.HTTPError(
            'https://test.invalid/health', 401, 'synthetic bearer refusal', {}, io.BytesIO())):
        began = time.time()
        assert w.worker.call('GET', '/health', retries=1)[0] is False
        assert w.worker.paused() and w.worker._pause_data()['worker_retry_at'] >= began + 899
    print('PASS actual Workerd cache -> real Watcher: no internal wake, next bearer read unpaused; real bearer401 retains900s pause')
