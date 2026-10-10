import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { talkingClipCropRect } from './talking-clip-framing';

describe('talking clip framing', () => {
  it('crops a full-body still chest-up around the face, 3:4, face in the upper third', () => {
    // The user's night still: 1104×1472, face ~120 px brow to chin near the top right.
    const rect = talkingClipCropRect(1104, 1472, { x: 730, y: 210, width: 110, height: 120 })!;
    assert.equal(rect.height, 504);
    assert.equal(rect.width, 378);
    assert.ok(rect.x <= 730 && rect.x + rect.width >= 840, 'face inside');
    assert.ok(210 - rect.y < rect.height / 3, 'face in the upper third');
  });

  it('leaves a still whose face is already large alone', () => {
    assert.equal(talkingClipCropRect(960, 1280, { x: 400, y: 200, width: 200, height: 260 }), null);
  });

  it('stays inside the image near an edge', () => {
    const rect = talkingClipCropRect(800, 1000, { x: 760, y: 10, width: 40, height: 50 })!;
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 800 && rect.y >= 0);
  });
});

describe('talking clip prompt', async () => {
  const { talkingClipPrompt } = await import('./ltx25-renderer');
  it('holds her facing the camera while she says the line (no beat motion, no closed-mouth rule)', () => {
    const prompt = talkingClipPrompt({ setting: 'office building entrance', line: '"Finally. Friday."' });
    assert.match(prompt, /She stops where she is, looks into the camera and says clearly, "Finally\. Friday\."/);
    assert.match(prompt, /does not walk away or turn around/);
    assert.doesNotMatch(prompt, /mid-stride|wide-open mouth/);
    assert.match(talkingClipPrompt({ line: 'Hi there', speaker: 'He' }), /He stops where he is.*His lips move/);
  });
});

describe('keep the full frame', async () => {
  const { normalizeDaySlots } = await import('./day-planner');
  it('is kept on a Day slot only when set', () => {
    const [on, off] = normalizeDaySlots([
      { id: 'morning', label: 'Morning', line: 'Hi there', lineFullFrame: true },
      { id: 'evening', label: 'Evening', line: 'Hi there', lineFullFrame: false },
    ] as never);
    assert.equal(on!.lineFullFrame, true);
    assert.equal('lineFullFrame' in off!, false);
  });
});
