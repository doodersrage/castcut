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

  it('gives standing, wall, face-sit, sixty-nine and afterglow their own motion', () => {
    const motion = (beat: string) => buildIntimateClipPrompt(beat).split('Motion: ')[1] ?? '';
    assert.match(motion('standing sex in the shower'), /both stay standing/);
    assert.doesNotMatch(motion('standing sex in the shower'), /bent/);
    assert.match(motion('fucking against the wall'), /standing against the wall/);
    assert.doesNotMatch(motion('fucking against the wall'), /bent/);
    assert.match(motion('facesitting in the loft'), /on his face/);
    assert.match(motion('sixty-nine on the bed'), /both heads move/);
    assert.match(motion('afterglow in tangled sheets'), /no thrusting/);
    assert.doesNotMatch(motion('half-undressed, skin and erotic heat'), /rhythmic motion of the hips/);
    assert.match(motion('lifted up while fucking'), /legs stay wrapped/);
    assert.match(motion('scissoring on the floor'), /legs cross/);
  });

  it('speaks about one body for solo beats', () => {
    const prompt = buildIntimateClipPrompt(
      'alone pressed to the hallway wall fully nude one leg hiked — both hands between her thighs fingering, laughing mid-act, Cast alone'
    );
    assert.match(prompt, /Her body keeps the exact pose/);
    assert.doesNotMatch(prompt, /Both bodies/);
  });
});
