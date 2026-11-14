import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTakeGroupFaces } from './take-group';

const cast = {
  ana: { id: 'ana', name: 'Ana', descriptor: 'a woman with red curls', ipAdapter: { imageFilename: 'ana-face.png' }, traits: { sex: 'woman' } },
  ben: { id: 'ben', name: 'Ben', hints: 'a tall man', ipAdapter: { imageFilename: 'ben-face.png' }, traits: { sex: 'man' } },
  cy: { id: 'cy', name: 'Cy' },
} as unknown as Record<string, never>;
const base = {
  getCharacter: (id: string) => cast[id],
  placePhoto: false,
  adultStill: false,
  partnerFace: true,
  kleinFace: false,
  steps: { checkReference: async () => ({ status: 'ok' as const, issues: [] }) },
};

describe('a group still’s third and fourth person (take-group.ts)', () => {
  it('Qwen-Image 2.1: both faces, the three given something to do', async () => {
    const out = await resolveTakeGroupFaces({
      ...base,
      slot: { thirdCastId: 'ana', fourthCastId: 'ben' },
      stillModel: 'qwen-image-2.1-edit',
    });
    assert.equal(out.third?.filename, 'ana-face.png');
    assert.equal(out.third?.person.busy, true);
    assert.match(out.third?.person.descriptor ?? '', /red curls/);
    assert.equal(out.fourth?.filename, 'ben-face.png');
    assert.equal(out.fourth?.person.descriptor, 'a tall man');
    assert.deepEqual(out.notes, []);
  });

  it('Edit 2511: the third, and the fourth left out with the reason', async () => {
    const out = await resolveTakeGroupFaces({
      ...base,
      slot: { thirdCastId: 'ana', fourthCastId: 'ben' },
      stillModel: 'qwen-image-edit-2511',
    });
    assert.equal(out.third?.filename, 'ana-face.png');
    assert.equal(out.third?.person.busy, false);
    assert.equal(out.fourth, undefined);
    assert.deepEqual(out.notes, ['Ben was left out: four-person stills need Qwen-Image 2.1.']);
  });

  it('no partner in the still, or an adult one: the third left out, and so the fourth', async () => {
    for (const extra of [{ partnerFace: false }, { adultStill: true }, { placePhoto: true }]) {
      const out = await resolveTakeGroupFaces({
        ...base,
        ...extra,
        slot: { thirdCastId: 'ana', fourthCastId: 'ben' },
        stillModel: 'qwen-image-2.1-edit',
      });
      assert.equal(out.third, undefined);
      assert.equal(out.fourth, undefined, 'no fourth without a third');
      assert.equal(out.notes.length, 1);
      assert.match(out.notes[0]!, /^Ana was left out: three-person stills need/);
    }
  });

  it('a Cast member with no face picture is left out, and the card says so', async () => {
    const out = await resolveTakeGroupFaces({
      ...base,
      slot: { thirdCastId: 'cy' },
      stillModel: 'qwen-image-edit-2511',
    });
    assert.equal(out.third, undefined);
    assert.deepEqual(out.notes, ['Cy has no face picture yet — left out of this still.']);
  });
});
