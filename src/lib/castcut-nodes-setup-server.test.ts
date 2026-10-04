import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countComfyQueue,
  installCastcutNodesWithManager,
  readCastcutNodesReport,
} from './castcut-nodes-setup-server';

type Call = { url: string; method: string; body?: string };

function fakeComfy(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? 'GET', body: init?.body as string };
    calls.push(call);
    const path = new URL(call.url).pathname;
    const hit = routes[`${call.method} ${path}`];
    if (!hit) return new Response('', { status: 404 });
    const body = typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body ?? '');
    return new Response(body, { status: hit.status });
  }) as typeof fetch;
  return { impl, calls };
}

const SYSTEM_STATS = {
  system: {
    os: 'linux',
    comfyui_version: '0.37.0',
    python_version: '3.14.7 (main)',
    embedded_python: false,
    argv: ['/opt/comfyui/main.py', '--listen', '127.0.0.1'],
  },
};

describe('readCastcutNodesReport', () => {
  it('missing pack, Manager V3.41, a busy queue', async () => {
    const routes: Record<string, { status: number; body?: unknown }> = {
      'GET /system_stats': { status: 200, body: SYSTEM_STATS },
      'GET /queue': { status: 200, body: { queue_running: [[1]], queue_pending: [[2], [3]] } },
      'GET /api/manager/version': { status: 200, body: 'V3.41' },
    };
    for (const type of ['CastcutPoseScore', 'CastcutPickBest', 'CastcutFaceDistance', 'CastcutMaskRepair', 'CastcutReport']) {
      routes[`GET /object_info/${type}`] = { status: 200, body: {} };
    }
    const { impl } = fakeComfy(routes);
    const report = await readCastcutNodesReport('http://h:8188/', impl);
    assert.equal(report.reachable, true);
    assert.equal(report.status?.state, 'missing');
    assert.deepEqual(report.manager, { version: 'V3.41', api: 'v1' });
    assert.deepEqual(report.queue, { running: 1, pending: 2 });
    assert.equal(report.system?.comfyuiVersion, '0.37.0');
  });

  it('unreachable ComfyUI', async () => {
    const { impl } = fakeComfy({});
    const report = await readCastcutNodesReport('http://h:8188', impl);
    assert.equal(report.reachable, false);
    assert.equal(report.status, null);
    assert.equal(report.manager, null);
  });

  it('counts the queue', () => {
    assert.deepEqual(countComfyQueue({ queue_running: [], queue_pending: [1] }), { running: 0, pending: 1 });
    assert.equal(countComfyQueue(null), null);
  });
});

describe('installCastcutNodesWithManager', () => {
  it('no Manager: says so', async () => {
    const { impl } = fakeComfy({});
    const result = await installCastcutNodesWithManager('http://h', impl);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected failure');
    assert.equal(result.code, 'no_manager');
  });

  it('not in the registry yet: Git URL, refused with the allow_git_url_install fix', async () => {
    const { impl, calls } = fakeComfy({
      'GET /api/manager/version': { status: 200, body: 'V3.41' },
      'GET /system_stats': { status: 200, body: SYSTEM_STATS },
      'GET /api/customnode/versions/castcut-nodes': { status: 200, body: [] },
      'POST /api/customnode/install/git_url': { status: 403, body: { error: 'allow_git_url_install' } },
    });
    const result = await installCastcutNodesWithManager('http://h', impl);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected failure');
    assert.equal(result.code, 'git_url_disabled');
    assert.match(result.message, /\/opt\/comfyui\/user\/__manager\/config\.ini/);
    const post = calls.find(call => call.method === 'POST');
    assert.deepEqual(JSON.parse(post?.body ?? '{}'), { url: 'https://github.com/doodersrage/castcut-nodes' });
  });

  it('published in the registry: queue/install by id', async () => {
    const { impl, calls } = fakeComfy({
      'GET /api/manager/version': { status: 200, body: 'V3.41' },
      'GET /system_stats': { status: 200, body: SYSTEM_STATS },
      'GET /api/customnode/versions/castcut-nodes': { status: 200, body: [{ version: '1.1.0' }] },
      'POST /api/manager/queue/install': { status: 200 },
      'POST /api/manager/queue/start': { status: 200 },
      'GET /api/manager/queue/status': {
        status: 200,
        body: { total_count: 1, done_count: 1, in_progress_count: 0, is_processing: false },
      },
    });
    const result = await installCastcutNodesWithManager('http://h', impl);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected success');
    assert.equal(result.via, 'registry');
    const install = calls.find(call => call.url.endsWith('/queue/install'));
    const body = JSON.parse(install?.body ?? '{}') as Record<string, unknown>;
    assert.equal(body.id, 'castcut-nodes');
    assert.equal(body.selected_version, 'latest');
  });
});
