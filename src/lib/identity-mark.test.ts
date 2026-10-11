import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DAY_IDENTITY_BARS, identityMark, STORY_IDENTITY_BARS } from './identity-mark';

describe('identityMark', () => {
  it('is null when no face match was measured', () => {
    assert.equal(identityMark(undefined, DAY_IDENTITY_BARS), null);
    assert.equal(identityMark(Number.NaN, DAY_IDENTITY_BARS), null);
  });

  it('reads Day stills against the plate bars', () => {
    assert.equal(identityMark(0.72, DAY_IDENTITY_BARS, 'Nora')?.label, 'Looks like Nora');
    assert.equal(identityMark(0.5, DAY_IDENTITY_BARS, 'Nora')?.tone, 'warn');
    const miss = identityMark(0.31, DAY_IDENTITY_BARS, 'Nora');
    assert.equal(miss?.tone, 'miss');
    assert.equal(miss?.label, 'Not Nora?');
    assert.equal(miss?.pct, 31);
  });

  it('uses the lower Story bars for staged scenes', () => {
    assert.equal(identityMark(0.31, STORY_IDENTITY_BARS)?.tone, 'ok');
    assert.equal(identityMark(0.1, STORY_IDENTITY_BARS)?.label, 'Not the Cast?');
  });
});

describe('identity per shot', () => {
  it('maps Day slots to their still face match', async () => {
    const { dayFaceBySlot } = await import('./identity-mark');
    const faces = dayFaceBySlot(
      [
        { slotId: 'morning', promptId: 'p1' },
        { slotId: 'night', promptId: 'p2' },
        { slotId: 'evening' },
      ],
      [
        { promptId: 'p1', playChecks: { face: 0.61 } },
        { promptId: 'p2', playChecks: {} },
        { promptId: 'p3', playChecks: { face: 0.2 } },
      ]
    );
    assert.deepEqual([...faces], [['morning', 0.61]]);
  });

  it('drops a Story match made for an earlier still', async () => {
    const { storyShotIdentity } = await import('./identity-mark');
    const identity = storyShotIdentity([
      { id: 'b1', at: 1, imageUrl: '/a.png', faceMatch: { imageUrl: '/a.png', similarity: 0.3 } },
      { id: 'b2', at: 2, imageUrl: '/new.png', faceMatch: { imageUrl: '/old.png', similarity: 0.05 } },
    ]);
    assert.equal(identity({ key: 'b1@1' })?.tone, 'ok');
    assert.equal(identity({ key: 'b2@2' }), null);
  });
});
