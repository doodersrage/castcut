import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildManagerInstallPlan,
  buildManagerQueueInstallBody,
  buildManagerQueueTaskBody,
  detectComfyManager,
  explainManagerInstallFailure,
  managerRegistryHasPack,
  parseComfyManagerVersion,
  runManagerInstall,
  type ComfyManagerInfo,
} from './comfyui-manager-api';

const V3_41 = parseComfyManagerVersion('V3.41', 'v1') as ComfyManagerInfo;
const V3_30 = parseComfyManagerVersion('V3.30.4', 'v1') as ComfyManagerInfo;
const V4 = parseComfyManagerVersion('V4.2.2', 'v2') as ComfyManagerInfo;

type Call = { url: string; method: string; body?: string; contentType?: string };

function fakeFetch(handler: (call: Call) => { status: number; body?: string }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url: String(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      contentType: headers['Content-Type'],
    };
    calls.push(call);
    const { status, body } = handler(call);
    return new Response(body ?? '', { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('parseComfyManagerVersion', () => {
  it('reads V3 / V4 version strings', () => {
    assert.deepEqual(V3_41, { version: 'V3.41', major: 3, minor: 41, patch: 0, api: 'v1' });
    assert.equal(V3_30.patch, 4);
    assert.equal(V4.api, 'v2');
    assert.equal(parseComfyManagerVersion('<html>', 'v1'), null);
  });
});

describe('Manager install payloads', () => {
  it('V3 registry install carries version, selected_version, channel and mode', () => {
    assert.deepEqual(
      buildManagerQueueInstallBody({ kind: 'registry', id: 'castcut-nodes' }, { uiId: 'u1' }),
      {
        id: 'castcut-nodes',
        version: 'latest',
        selected_version: 'latest',
        channel: 'default',
        mode: 'cache',
        ui_id: 'u1',
        skip_post_install: false,
      }
    );
  });

  it('V3 listed (non-registry) pack is version "unknown" with its Git URL', () => {
    const body = buildManagerQueueInstallBody(
      { kind: 'listed', id: 'ComfyUI-Foo', files: ['https://github.com/a/ComfyUI-Foo'] },
      { uiId: 'u2', channel: 'recent', mode: 'local' }
    );
    assert.equal(body.version, 'unknown');
    assert.equal(body.selected_version, 'unknown');
    assert.deepEqual(body.files, ['https://github.com/a/ComfyUI-Foo']);
    assert.equal(body.channel, 'recent');
    assert.equal(body.mode, 'local');
  });

  it('V3 plan: queue/install then queue/start, JSON', () => {
    const plan = buildManagerInstallPlan(V3_41, { kind: 'registry', id: 'x' }, { uiId: 'u' });
    assert.equal(plan.queued, true);
    assert.deepEqual(
      plan.steps.map(step => [step.path, step.contentType]),
      [
        ['/manager/queue/install', 'application/json'],
        ['/manager/queue/start', 'application/json'],
      ]
    );
  });

  it('V3.41 Git URL goes to customnode/install/git_url as JSON {url}; older V3 as text', () => {
    const url = 'https://github.com/doodersrage/castcut';
    const now = buildManagerInstallPlan(V3_41, { kind: 'git-url', url }, { uiId: 'u' });
    assert.equal(now.queued, false);
    assert.deepEqual(now.steps, [
      {
        path: '/customnode/install/git_url',
        body: JSON.stringify({ url }),
        contentType: 'application/json',
      },
    ]);
    const old = buildManagerInstallPlan(V3_30, { kind: 'git-url', url }, { uiId: 'u' });
    assert.deepEqual(old.steps[0], {
      path: '/customnode/install/git_url',
      body: url,
      contentType: 'text/plain',
    });
  });

  it('V4 plan: queue/task {kind: install, params} then queue/start; batch for the legacy UI', () => {
    assert.deepEqual(
      buildManagerQueueTaskBody({ kind: 'registry', id: 'castcut-nodes' }, { uiId: 'u' }),
      {
        ui_id: 'u',
        client_id: 'castcut',
        kind: 'install',
        params: {
          id: 'castcut-nodes',
          version: 'latest',
          selected_version: 'latest',
          mode: 'cache',
          channel: 'default',
        },
      }
    );
    const task = buildManagerInstallPlan(V4, { kind: 'registry', id: 'x' }, { uiId: 'u' });
    assert.deepEqual(
      task.steps.map(step => step.path),
      ['/v2/manager/queue/task', '/v2/manager/queue/start']
    );
    const batch = buildManagerInstallPlan(
      V4,
      { kind: 'registry', id: 'x' },
      { uiId: 'u', v2Variant: 'batch' }
    );
    assert.equal(batch.steps.length, 1);
    assert.equal(batch.steps[0]?.path, '/v2/manager/queue/batch');
    const parsed = JSON.parse(batch.steps[0]?.body ?? '{}') as { install: Array<{ id: string; channel: string }> };
    assert.equal(parsed.install[0]?.id, 'x');
    assert.equal(parsed.install[0]?.channel, 'default');
  });

  it('V4 Git URL is the legacy text route', () => {
    const plan = buildManagerInstallPlan(V4, { kind: 'git-url', url: 'https://g/x' }, { uiId: 'u' });
    assert.deepEqual(plan.steps[0], {
      path: '/v2/customnode/install/git_url',
      body: 'https://g/x',
      contentType: 'text/plain',
    });
  });
});

describe('explainManagerInstallFailure', () => {
  const git = { kind: 'git-url', url: 'https://g/x' } as const;
  const registry = { kind: 'registry', id: 'x' } as const;

  it('names allow_git_url_install and the config path', () => {
    const error = explainManagerInstallFailure({
      status: 403,
      bodyText: '{"error": "allow_git_url_install"}',
      target: git,
      userDir: '/opt/comfyui/user',
    });
    assert.equal(error.code, 'git_url_disabled');
    assert.match(error.message, /allow_git_url_install = true/);
    assert.match(error.message, /\/opt\/comfyui\/user\/__manager\/config\.ini/);
    assert.match(error.message, /127\.0\.0\.1/);
  });

  it('security_level 403 and the queue’s 404 "security error"', () => {
    assert.equal(
      explainManagerInstallFailure({ status: 403, bodyText: '{"error":"security_level"}', target: registry })
        .code,
      'security_level'
    );
    assert.match(
      explainManagerInstallFailure({ status: 403, bodyText: 'A security error has occurred', target: registry })
        .message,
      /security_level = normal/
    );
    assert.equal(
      explainManagerInstallFailure({
        status: 404,
        bodyText: 'A security error has occurred. Please check the terminal logs',
        target: { kind: 'listed', id: 'y', files: ['https://g/y'] },
      }).code,
      'git_url_disabled'
    );
  });

  it('outdated ComfyUI, missing routes, bad requests', () => {
    assert.equal(
      explainManagerInstallFailure({ status: 403, bodyText: '{"error":"comfyui_outdated"}', target: git }).code,
      'comfyui_outdated'
    );
    assert.equal(explainManagerInstallFailure({ status: 404, bodyText: '', target: git }).code, 'not_supported');
    assert.equal(explainManagerInstallFailure({ status: 403, bodyText: '', target: git }).code, 'git_url_disabled');
    assert.match(
      explainManagerInstallFailure({ status: 400, bodyText: 'clone failed', target: git }).message,
      /clone failed/
    );
  });
});

describe('detectComfyManager / runManagerInstall', () => {
  it('detects V3 on /api/manager/version and V4 on /api/v2/manager/version', async () => {
    const v3 = fakeFetch(call =>
      call.url.endsWith('/api/manager/version') ? { status: 200, body: 'V3.41' } : { status: 404 }
    );
    assert.equal((await detectComfyManager('http://h', v3.impl))?.api, 'v1');
    const v4 = fakeFetch(call =>
      call.url.endsWith('/api/v2/manager/version') ? { status: 200, body: 'V4.2.2' } : { status: 404 }
    );
    assert.equal((await detectComfyManager('http://h', v4.impl))?.version, 'V4.2.2');
    const none = fakeFetch(() => ({ status: 404 }));
    assert.equal(await detectComfyManager('http://h', none.impl), null);
  });

  it('registry lookup: published, unpublished ([]), no route (null)', async () => {
    const published = fakeFetch(() => ({ status: 200, body: '[{"version":"1.1.0"}]' }));
    assert.equal(await managerRegistryHasPack('http://h', V3_41, 'castcut-nodes', published.impl), true);
    assert.match(published.calls[0]?.url ?? '', /\/api\/customnode\/versions\/castcut-nodes$/);
    const empty = fakeFetch(() => ({ status: 200, body: '[]' }));
    assert.equal(await managerRegistryHasPack('http://h', V3_41, 'castcut-nodes', empty.impl), false);
    const missing = fakeFetch(() => ({ status: 404 }));
    assert.equal(await managerRegistryHasPack('http://h', V4, 'castcut-nodes', missing.impl), null);
  });

  it('V3 queued install: posts install + start, then waits for the queue', async () => {
    const { impl, calls } = fakeFetch(call => {
      if (call.url.endsWith('/queue/status')) {
        return { status: 200, body: '{"total_count":1,"done_count":1,"in_progress_count":0,"is_processing":false}' };
      }
      return { status: 200 };
    });
    const result = await runManagerInstall({
      origin: 'http://h',
      info: V3_41,
      target: { kind: 'registry', id: 'castcut-nodes' },
      fetchImpl: impl,
      uiId: 'u',
      waitOptions: { intervalMs: 1 },
    });
    assert.deepEqual(result, { ok: true, queued: true, finished: true });
    const posted = calls.filter(call => call.method === 'POST');
    assert.equal(posted[0]?.url, 'http://h/api/manager/queue/install');
    assert.equal(posted[0]?.contentType, 'application/json');
    const body = JSON.parse(posted[0]?.body ?? '{}') as Record<string, unknown>;
    assert.equal(body.version, 'latest');
    assert.equal(body.channel, 'default');
    assert.equal(body.mode, 'cache');
    assert.equal(posted[1]?.url, 'http://h/api/manager/queue/start');
  });

  it('V3.41 Git URL refused: plain words with the fix', async () => {
    const { impl } = fakeFetch(() => ({ status: 403, body: '{"error": "allow_git_url_install"}' }));
    const result = await runManagerInstall({
      origin: 'http://h',
      info: V3_41,
      target: { kind: 'git-url', url: 'https://github.com/doodersrage/castcut' },
      fetchImpl: impl,
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected failure');
    assert.equal(result.error.code, 'git_url_disabled');
  });

  it('V4 without queue/task (legacy UI) falls back to queue/batch', async () => {
    const { impl, calls } = fakeFetch(call =>
      call.url.includes('/queue/task') ? { status: 404 } : { status: 200, body: '{"failed":[]}' }
    );
    const result = await runManagerInstall({
      origin: 'http://h',
      info: V4,
      target: { kind: 'registry', id: 'castcut-nodes' },
      fetchImpl: impl,
      wait: false,
    });
    assert.equal(result.ok, true);
    assert.ok(calls.some(call => call.url === 'http://h/api/v2/manager/queue/batch'));
  });
});
