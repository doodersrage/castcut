import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildIntimateClipPrompt } from './intimate-clip-prompt';

describe('buildIntimateClipPrompt', () => {
  it('locks the camera, keeps the pose and drops the gag and the laugh', () => {
    const prompt = buildIntimateClipPrompt(
      'bent over the foot of the bed from behind when a partner slips and face-plants laughing — partner still in frame mid-doggy'
    );
    assert.match(prompt, /locked-off static tripod shot/);
    assert.match(prompt, /keep the exact pose and position of the first frame/);
    assert.match(prompt, /he thrusts slowly from behind/);
    assert.doesNotMatch(prompt, /slips|face-plants|doggy/i);
    assert.doesNotMatch(prompt.split('Faces calm')[0]!, /laugh/i);
  });

  it('keeps the act and drops the interruption for a chair lap beat', () => {
    const prompt = buildIntimateClipPrompt(
      'sitting on his lap facing him mid-sex on the office chair when it tips back — partner and Cast both fully visible'
    );
    assert.match(prompt, /sitting on his lap facing him mid-sex on the office chair/);
    assert.doesNotMatch(prompt, /tips back/);
    assert.match(prompt, /rocks her hips/);
  });

  it('speaks about one body for solo beats', () => {
    const prompt = buildIntimateClipPrompt(
      'alone pressed to the hallway wall fully nude one leg hiked — both hands between her thighs fingering, laughing mid-act, Cast alone'
    );
    assert.match(prompt, /Her body keeps the exact pose/);
    assert.doesNotMatch(prompt, /Both bodies/);
  });
});
