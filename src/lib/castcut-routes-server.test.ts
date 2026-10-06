import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  castcutFaceBoxes,
  castcutFaceDistances,
  castcutObjectInfoFingerprint,
  castcutRoutes,
  castcutStageAsInput,
  forgetCastcutRoutes,
  parseCastcutRoutesInfo,
} from './castcut-routes-server';
import { queueContextFromJobList } from './comfyui-status';
import { measureFaceMatchInComfy } from './face-match-server';

const BASE = 'http://comfy.test:8188';
const INFO = {
  name: 'castcut-nodes',
  version: '1.2.0',
  routes: ['info', 'analyze', 'stage', 'object-info-fingerprint'],
  analyze: { faceAnalysis: true, ops: ['face-distance', 'face-boxes'] },
};

type Call = { url: string; method: string; body: unknown };

/** A fetch that answers by path and records what was asked. */
function fakeFetch(answers: Record<string, (body: unknown) => [number, unknown]>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', body });
    const answer = answers[path];
    if (!answer) return new Response('not found', { status: 404 });
    const [status, payload] = answer(body);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

afterEach(() => forgetCastcutRoutes());

describe('Castcut node pack routes', () => {
  it('reads the info payload, and refuses anything else', () => {
    assert.deepEqual(parseCastcutRoutesInfo(INFO), {
      version: '1.2.0',
      routes: INFO.routes,
      faceAnalysis: true,
    });
    assert.equal(parseCastcutRoutesInfo({ version: 1 }), null);
    assert.equal(parseCastcutRoutesInfo('nope'), null);
    assert.equal(parseCastcutRoutesInfo({ version: '1.2.0', routes: [] })?.faceAnalysis, false);
  });

  it('asks a ComfyUI once, and treats a missing pack as no routes', async () => {
    const withPack = fakeFetch({ '/castcut/info': () => [200, INFO] });
    assert.equal((await castcutRoutes(BASE, withPack.impl))?.version, '1.2.0');
    await castcutRoutes(`${BASE}/`, withPack.impl);
    assert.equal(withPack.calls.length, 1);

    const without = fakeFetch({});
    assert.equal(await castcutRoutes('http://other.test', without.impl), null);
    assert.equal(await castcutRoutes('http://other.test', without.impl), null);
    assert.equal(without.calls.length, 1);
  });

  it('face distances: CPU, both pictures read in place, no face in the reference is null', async () => {
    const { impl, calls } = fakeFetch({
      '/castcut/analyze': body =>
        (body as { reference: { filename: string } }).reference.filename === 'hair.png'
          ? [200, { op: 'face-distance', error: 'no-face-in-reference' }]
          : [200, { op: 'face-distance', metric: 'cosine', distances: [0.29, 100] }],
    });
    const ref = { filename: 'plate.png', subfolder: '', type: 'input' };
    const still = { filename: 'Castcut_1.png', subfolder: 'day', type: 'output' };
    assert.deepEqual(
      await castcutFaceDistances(BASE, { reference: ref, images: [still, still] }, impl),
      [0.29, 100]
    );
    assert.deepEqual(calls[0]!.body, {
      op: 'face-distance',
      provider: 'CPU',
      reference: ref,
      images: [still, still],
    });
    assert.equal(
      await castcutFaceDistances(
        BASE,
        { reference: { ...ref, filename: 'hair.png' }, images: [still] },
        impl
      ),
      null
    );
  });

  it('face boxes send the bytes and the turns; an error answer throws', async () => {
    const { impl, calls } = fakeFetch({
      '/castcut/analyze': () => [
        200,
        { op: 'face-boxes', results: [{ rotation: 'none', boxes: [] }] },
      ],
    });
    const turns = await castcutFaceBoxes(
      BASE,
      { image: { data: 'QUJD' }, rotations: ['none', '90 degrees'] },
      impl
    );
    assert.deepEqual(turns, [{ rotation: 'none', boxes: [] }]);
    assert.deepEqual(calls[0]!.body, {
      op: 'face-boxes',
      provider: 'CPU',
      image: { data: 'QUJD' },
      rotations: ['none', '90 degrees'],
      stopAtFirst: true,
    });
    const failing = fakeFetch({ '/castcut/analyze': () => [400, { error: 'Invalid type.' }] });
    await assert.rejects(
      castcutFaceBoxes(BASE, { image: { data: 'x' }, rotations: ['none'] }, failing.impl),
      /HTTP 400\): Invalid type/
    );
  });

  it('stage sends the cleaned name prefix the app gives uploads', async () => {
    const { impl, calls } = fakeFetch({
      '/castcut/stage': () => [200, { name: 'face-check-0123456789abcdef.png', subfolder: '' }],
    });
    const name = await castcutStageAsInput(
      BASE,
      { filename: 'Castcut_02887_.PNG', subfolder: '', type: 'output' },
      'face-check',
      impl
    );
    assert.equal(name, 'face-check-0123456789abcdef.png');
    assert.deepEqual(calls[0]!.body, {
      filename: 'Castcut_02887_.PNG',
      subfolder: '',
      type: 'output',
      prefix: 'face-check',
      extension: '.png',
    });
  });

  it('the object_info fingerprint needs the route', async () => {
    const withRoute = fakeFetch({
      '/castcut/info': () => [200, INFO],
      '/castcut/object-info-fingerprint': () => [200, { fingerprint: 'abc123' }],
    });
    assert.equal(await castcutObjectInfoFingerprint(BASE, withRoute.impl), 'abc123');
    forgetCastcutRoutes();
    const older = fakeFetch({ '/castcut/info': () => [200, { ...INFO, routes: ['info'] }] });
    assert.equal(await castcutObjectInfoFingerprint(BASE, older.impl), null);
    assert.equal(older.calls.length, 1);
  });
});

describe('queue position from the jobs list', () => {
  const jobs = {
    jobs: [
      { id: 'late', status: 'pending', priority: 12 },
      { id: 'front', status: 'pending', priority: -2_208_697_404_041 },
      { id: 'running', status: 'in_progress', priority: 3 },
      { id: 'next', status: 'pending', priority: -395 },
    ],
  };

  it('orders pending jobs by priority, the queue number ComfyUI runs first', () => {
    assert.deepEqual(queueContextFromJobList('front', jobs), {
      isRunning: false,
      pendingPosition: 1,
    });
    assert.deepEqual(queueContextFromJobList('late', jobs), {
      isRunning: false,
      pendingPosition: 3,
    });
    assert.deepEqual(queueContextFromJobList('running', jobs), {
      isRunning: true,
      pendingPosition: null,
    });
    assert.equal(queueContextFromJobList('gone', jobs), null);
  });

  it('no jobs list (older ComfyUI) is undefined, so /queue is read', () => {
    assert.equal(queueContextFromJobList('x', { error: 'nope' }), undefined);
    assert.equal(queueContextFromJobList('x', null), undefined);
  });
});

describe('face match through the pack route', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const urls = {
    referenceUrl: '/api/comfyui/view?filename=plate.png&subfolder=&type=input',
    imageUrl: '/api/comfyui/view?filename=Castcut_1.png&subfolder=&type=output',
    comfyUrl: BASE,
  };

  it('answers from /castcut/analyze without queueing a graph', async () => {
    const { impl, calls } = fakeFetch({
      '/castcut/info': () => [200, INFO],
      '/castcut/analyze': () => [200, { distances: [0.3] }],
    });
    globalThis.fetch = impl;
    const result = await measureFaceMatchInComfy(urls);
    assert.equal(result.available, true);
    assert.equal(result.available && result.distance, 0.3);
    assert.ok(!calls.some(call => call.url.includes('/prompt')));
  });

  it('falls back to the graph when the route fails', async () => {
    const { impl, calls } = fakeFetch({
      '/castcut/info': () => [200, INFO],
      '/castcut/analyze': () => [500, { error: 'boom' }],
    });
    globalThis.fetch = impl;
    const result = await measureFaceMatchInComfy(urls);
    // The fake ComfyUI has no FaceAnalysis nodes either: the graph path says so.
    assert.equal(result.available, false);
    assert.ok(calls.some(call => call.url.includes('/object_info/')));
  });
});
