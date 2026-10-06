import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FixAreaPoll, FixAreaTarget } from './fix-area-client';
import {
  createFixAreaSessionStore,
  FIX_AREA_MISSING_READS,
  fixAreaSessionChipLabel,
  fixAreaSessionMatchesStill,
  fixAreaSessionProgress,
  type FixAreaSessionDeps,
} from './fix-area-session';

const image = (name: string) => ({ filename: name, subfolder: '', type: 'output' });

function harness(options?: { adult?: FixAreaTarget['adult']; gatePass?: boolean }) {
  const polls = new Map<string, FixAreaPoll[]>();
  const cancelled: string[][] = [];
  let ticks = 0;
  let stopped = 0;
  const gated: string[] = [];
  const deps: FixAreaSessionDeps = {
    poll: async promptId => polls.get(promptId)?.shift() ?? { status: 'pending' },
    gate: async imageUrl => {
      gated.push(imageUrl);
      return options?.gatePass === false
        ? { pass: false, reason: 'looked young' }
        : { pass: true, reason: 'adult', verdict: 'passed' };
    },
    cancel: ids => {
      cancelled.push(ids);
    },
    imageUrl: img => `/view/${img.filename}`,
    schedule: () => {
      ticks += 1;
      return () => {
        stopped += 1;
      };
    },
    now: () => 1000,
    id: () => `s${polls.size}`,
  };
  const store = createFixAreaSessionStore(deps);
  const target: FixAreaTarget = {
    displayUrl: '/shown.png',
    comfyUrl: '/api/comfyui/view?filename=still.png',
    adult: options?.adult ?? null,
    onUse: () => undefined,
  };
  const start = (open = true) =>
    store.start({
      target,
      maskUrl: 'data:image/png;base64,AAAA',
      maskBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
      aspect: 0.75,
      text: 'a plain wall',
      mode: 'area',
      identity: false,
      jobs: [
        { promptId: 'a', seed: 1 },
        { promptId: 'b', seed: 2 },
      ],
      open,
    });
  return {
    store,
    polls,
    cancelled,
    gated,
    start,
    target,
    timers: () => ({ ticks, stopped }),
  };
}

describe('fix-area session store', () => {
  it('polls every take on one timer and keeps a session a closed dialog left behind', async () => {
    const h = harness();
    const session = h.start();
    assert.equal(h.timers().ticks, 1, 'the timer starts with the first unfinished take');
    assert.equal(fixAreaSessionChipLabel(session), null, 'no chip while the dialog shows it');

    // The dialog closes while both takes render: the chip says so.
    h.store.setOpen(session.id, false);
    assert.equal(fixAreaSessionChipLabel(h.store.get(session.id)), 'Fixing… 0 of 2');

    h.polls.set('a', [{ status: 'running' }, { status: 'done', image: image('fix-1.png') }]);
    h.polls.set('b', [{ status: 'done', image: image('fix-2.png') }]);
    await h.store.tick();
    let current = h.store.get(session.id)!;
    assert.equal(current.candidates[0]!.state.status, 'running');
    assert.equal(current.candidates[1]!.state.status, 'ready');
    assert.equal(fixAreaSessionChipLabel(current), 'Fixing… 1 of 2');
    await h.store.tick();
    current = h.store.get(session.id)!;
    assert.equal(current.candidates[0]!.state.status, 'ready');
    assert.deepEqual(fixAreaSessionProgress(current), {
      total: 2,
      landed: 2,
      ready: 2,
      settled: true,
    });
    assert.equal(fixAreaSessionChipLabel(current), 'Fix ready — compare');
    assert.equal(h.timers().stopped, 1, 'the timer stops once nothing renders');
    // A late poll never undoes a landed take.
    h.polls.set('a', [{ status: 'missing' }]);
    await h.store.tick();
    assert.equal(h.store.get(session.id)!.candidates[0]!.state.status, 'ready');
    assert.equal(h.cancelled.length, 0);
  });

  it('a dev double mount (open → closed → open) leaves the session open and tracked', () => {
    const h = harness();
    const session = h.start();
    h.store.setOpen(session.id, true);
    h.store.setOpen(session.id, false);
    h.store.setOpen(session.id, true);
    assert.equal(h.store.get(session.id)!.open, true);
    assert.equal(h.cancelled.length, 0, 'nothing is cancelled by a remount');
    assert.equal(h.store.all().length, 1);
  });

  it('a Fix queued after its dialog went away starts closed, so the tray offers it', () => {
    const h = harness();
    const session = h.start(false);
    assert.equal(session.open, false);
    assert.equal(fixAreaSessionChipLabel(session), 'Fixing… 0 of 2');
  });

  it('discard cancels only the takes that have not landed, and stops the timer', async () => {
    const h = harness();
    const session = h.start();
    h.polls.set('a', [{ status: 'done', image: image('fix-1.png') }]);
    await h.store.tick();
    h.store.discard(session.id);
    assert.deepEqual(h.cancelled, [['b']]);
    assert.equal(h.store.all().length, 0);
    assert.equal(h.timers().stopped, 1);
    // A read that was out when the session went: nothing comes back to life.
    await h.store.tick();
    assert.equal(h.store.all().length, 0);
  });

  it('a job missing from the queue and history is lost only after several reads', async () => {
    const h = harness();
    const session = h.start();
    h.polls.set('a', Array.from({ length: FIX_AREA_MISSING_READS }, () => ({ status: 'missing' }) as const));
    for (let read = 1; read < FIX_AREA_MISSING_READS; read += 1) {
      await h.store.tick();
      assert.equal(h.store.get(session.id)!.candidates[0]!.state.status, 'queued', `read ${read}`);
    }
    await h.store.tick();
    const lost = h.store.get(session.id)!.candidates[0]!.state;
    assert.equal(lost.status, 'failed');
    h.polls.set('b', [{ status: 'error', message: 'The fix failed in ComfyUI.' }]);
    await h.store.tick();
    const failed = h.store.get(session.id)!;
    assert.equal(failed.candidates[1]!.state.status, 'failed');
    assert.equal(fixAreaSessionChipLabel({ ...failed, open: false }), 'Fix failed — see why');
  });

  it('adult stills: a landed take is checked, then shown or withheld', async () => {
    const pass = harness({ adult: { clothed: true } });
    const session = pass.start();
    pass.polls.set('a', [{ status: 'done', image: image('fix-1.png') }]);
    await pass.store.tick();
    const checked = pass.store.get(session.id)!.candidates[0]!.state;
    assert.equal(checked.status, 'ready');
    assert.equal(checked.status === 'ready' && checked.adultCheck, 'passed');
    assert.deepEqual(pass.gated, ['/view/fix-1.png']);

    const withheld = harness({ adult: { clothed: false }, gatePass: false });
    const other = withheld.start();
    withheld.polls.set('b', [{ status: 'done', image: image('fix-2.png') }]);
    await withheld.store.tick();
    const state = withheld.store.get(other.id)!.candidates[1]!.state;
    assert.equal(state.status, 'withheld');
    assert.equal(state.status === 'withheld' && state.reason, 'looked young');
  });

  it('finds the session of a still by its shown picture or its ComfyUI output', () => {
    const h = harness();
    const session = h.start();
    assert.equal(fixAreaSessionMatchesStill(session, '/shown.png'), true);
    assert.equal(fixAreaSessionMatchesStill(session, h.target.comfyUrl), true);
    assert.equal(fixAreaSessionMatchesStill(session, '/other.png'), false);
    assert.equal(fixAreaSessionMatchesStill(session, ''), false);
  });
});
