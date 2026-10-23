import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './library';
import { liftBodiesAsync, liftBodiesKnown, liftBodyWithCameraAsync } from './rig3d-lift-async';
import {
  DEFAULT_CAMERA,
  cachedLiftWithCamera,
  leadCameraLiftOptions,
  liftBodies,
  liftBodyWithCamera,
  rememberLiftWithCamera,
} from './rig3d-pose';
import { posturesForReference } from './rig3d-posture-points';
import { stillCameraKnown, stillPoseFigure } from '../director/poses';

const ROOT = join(__dirname, '..', '..', '..');
const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
  references: Array<{ id: string; pose: string; aspect: number; people: NormalizedBody[] }>;
};
const ref = (id: string) => refs.references.find(r => r.id === id)!;
/** The same picture, nudged: a cache entry of its own. */
const nudged = (body: NormalizedBody, by: number): NormalizedBody =>
  body.map(point => (point ? { ...point, x: point.x + by } : point)) as NormalizedBody;

describe('the camera-reading lift off the page thread', () => {
  it('answers as the sync lift does (no Worker in Node: lifted here, a turn later)', async () => {
    const kneel = ref('kneel-4');
    const body = nudged(kneel.people[0]!, 0.001);
    const options = { body: 'female' as const, postures: posturesForReference(kneel) };
    assert.equal(cachedLiftWithCamera(body, kneel.aspect, options), null);
    const read = await liftBodyWithCameraAsync(body, kneel.aspect, options);
    // Now cached: the sync lift gives the same answer at once.
    const again = liftBodyWithCamera(body, kneel.aspect, options);
    assert.deepEqual(again, read);
    assert.notEqual(read.camera, DEFAULT_CAMERA);
  });

  it("a worker's answer (structured-cloned) fills the cache liftBodies reads", () => {
    const kneel = ref('kneel-4');
    const bodies = [nudged(kneel.people[0]!, 0.002)];
    const postures = [posturesForReference(kneel)];
    const kinds = ['female' as const];
    assert.equal(liftBodiesKnown(bodies, kneel.aspect, kinds, DEFAULT_CAMERA, postures), false);
    // Before it is read: 'cached' is the eye-level lift.
    const quick = liftBodies(bodies, kneel.aspect, kinds, DEFAULT_CAMERA, {
      postures,
      estimateCamera: 'cached',
    });
    assert.equal(quick.camera.estimated, undefined);
    // What the worker sends back is plain data: it survives the copy across threads.
    const request = leadCameraLiftOptions(kinds, DEFAULT_CAMERA, postures[0]);
    const there = structuredClone({ body: bodies[0]!, aspect: kneel.aspect, options: request });
    const lift = liftBodyWithCamera(there.body, there.aspect, there.options);
    const reply = structuredClone({ ...lift, moved: lift.camera !== there.options.camera });
    rememberLiftWithCamera(bodies[0]!, kneel.aspect, request, reply);
    assert.equal(liftBodiesKnown(bodies, kneel.aspect, kinds, DEFAULT_CAMERA, postures), true);
    const swapped = liftBodies(bodies, kneel.aspect, kinds, DEFAULT_CAMERA, {
      postures,
      estimateCamera: 'cached',
    });
    const sync = liftBodies(bodies, kneel.aspect, kinds, DEFAULT_CAMERA, {
      postures,
      estimateCamera: true,
    });
    assert.equal(swapped.camera.estimated, true);
    assert.deepEqual(swapped, sync);
  });

  it('an unmoved camera comes back as the given one (callers tell a move by identity)', async () => {
    const stand = refs.references.find(r => r.pose === 'stand')!;
    const body = nudged(stand.people[0]!, 0.003);
    const read = await liftBodyWithCameraAsync(body, stand.aspect, { camera: DEFAULT_CAMERA });
    if (read.camera !== DEFAULT_CAMERA) return; // (this picture reads from above or below)
    const rig = await liftBodiesAsync([body], stand.aspect, ['female'], DEFAULT_CAMERA);
    assert.equal(rig.camera.estimated, undefined);
  });

  it('aborted before it starts, it never answers', async () => {
    const kneel = ref('kneel-4');
    const body = nudged(kneel.people[0]!, 0.004);
    const controller = new AbortController();
    controller.abort();
    let settled = false;
    void liftBodyWithCameraAsync(body, kneel.aspect, {}, controller.signal).finally(() => {
      settled = true;
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(settled, false);
  });

  it("the Director's still: eye level at once, the still's camera once it is read", () => {
    const kneel = ref('kneel-4');
    const body = nudged(kneel.people[0]!, 0.005);
    const postures = posturesForReference(kneel);
    assert.equal(stillCameraKnown(body, kneel.aspect, 'female', postures), false);
    const quick = stillPoseFigure(body, kneel.aspect, 'female', postures, 'known');
    assert.equal(stillCameraKnown(body, kneel.aspect, 'female', postures), false);
    const read = stillPoseFigure(body, kneel.aspect, 'female', postures);
    assert.equal(stillCameraKnown(body, kneel.aspect, 'female', postures), true);
    assert.deepEqual(stillPoseFigure(body, kneel.aspect, 'female', postures, 'known'), read);
    assert.notDeepEqual(quick.view, read.view);
  });
});
