"""ComfyUI / app calls shared by the pose bench's renderers (run_jobs.py)."""
import json
import time
import urllib.request


def call(base, path, body=None, timeout=60):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def wait(comfy, pid, limit=3600):
    """(output filename, error, seconds of execution) for one queued prompt."""
    start = time.time()
    while time.time() - start < limit:
        try:
            h = call(comfy, '/history/' + pid).get(pid)
        except Exception:
            h = None
        if h:
            st = h.get('status', {})
            if st.get('status_str') == 'error':
                return None, json.dumps(st.get('messages', []))[-500:], None
            if st.get('completed'):
                files = [im['filename'] for out in h.get('outputs', {}).values()
                         for im in out.get('images', []) if im.get('type') == 'output']
                msgs = {m[0]: m[1].get('timestamp') for m in st.get('messages', []) if isinstance(m, list)}
                secs = None
                if 'execution_start' in msgs and 'execution_success' in msgs:
                    secs = round((msgs['execution_success'] - msgs['execution_start']) / 1000, 1)
                return (files[-1] if files else None), (None if files else 'no output'), secs
        time.sleep(2)
    return None, 'timeout', None
