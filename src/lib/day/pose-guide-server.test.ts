import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { buildDayPoseGuide } from './pose-guide-server';

describe('pose guides drawn on the server (Phase 3, step 5)', () => {
  const cases: Array<[string, string, number]> = [
    ['morning', 'pours coffee at the kitchen counter', 1],
    ['afternoon', 'sits on a park bench reading a book', 1],
    ['evening', 'Mara and Theo, the two of them together, dancing close in the living room', 2],
  ];
  for (const [slotId, beat, people] of cases) {
    it(`draws "${beat}" as a PNG at the still's aspect`, async () => {
      const guide = await buildDayPoseGuide(slotId as never, beat, 'qwen-image-edit-2511', {
        stylePreference: 'openpose',
        aspect: { width: 1536, height: 864 },
        ...(people === 2 ? { headcount: 2 } : {}),
      } as never);
      assert.equal(guide.file.type, 'image/png');
      const bytes = Buffer.from(await guide.file.arrayBuffer());
      const meta = await sharp(bytes).metadata();
      assert.equal(meta.format, 'png');
      assert.ok(Math.abs(meta.width! / meta.height! - 1536 / 864) < 0.02, `${meta.width}×${meta.height}`);
      // A skeleton drawn: coloured pixels on the black ground.
      const { data } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let lit = 0;
      for (let i = 0; i < data.length; i += 3) if (data[i]! + data[i + 1]! + data[i + 2]! > 60) lit += 1;
      assert.ok(lit > 500, `only ${lit} lit pixels`);
      assert.ok(guide.keypoints.length >= 1);
    });
  }
});

describe('a guide cut to its shot size (the flagship café, 2026-11-15)', () => {
  // Cropped only by region, a seated waist-up two-shot kept hips and knees on the bottom edge:
  // long neck-to-hip lines over knee stubs, and the stills drew a third person and a leg up.
  it('waist-up keeps nothing below the hips; a close-up nothing below the shoulders', async () => {
    const guide = (shot: 'waist' | 'head' | 'full') =>
      buildDayPoseGuide(
        'afternoon' as never,
        'Slyne and Jason, the two of them together. Slyne sits down across from him.',
        'qwen-image-2.1-edit-turbo-8',
        {
          stylePreference: 'openpose',
          aspect: { width: 1664, height: 928 },
          forcePeople: 2,
          pose: { body: 'sit' },
          camera: { shot },
          library: [],
        } as never
      );
    const knees = [9, 10, 12, 13];
    const waist = await guide('waist');
    assert.equal(waist.keypoints.length, 2);
    for (const person of waist.keypoints) {
      assert.ok(knees.every(index => !person[index]), 'no knees or ankles');
      assert.ok(person[1], 'the neck is drawn');
    }
    const head = await guide('head');
    for (const person of head.keypoints) assert.ok([8, 11, ...knees].every(index => !person[index]));
    const full = await guide('full');
    assert.ok(full.keypoints.some(person => person[9] || person[12]), 'a full shot keeps the legs');
  });
});
