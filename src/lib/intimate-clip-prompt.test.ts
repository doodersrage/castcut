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

  it('animates the pose the still draws (rapid-duo-recipe.ts), not a different one', () => {
    const motion = (beat: string, options?: Parameters<typeof buildIntimateClipPrompt>[2]) =>
      buildIntimateClipPrompt(beat, 4, options).split('Motion: ')[1] ?? '';
    assert.match(motion('standing sex in the shower'), /both stay standing/);
    assert.doesNotMatch(motion('standing sex in the shower'), /bent/);
    // Wall: face to face with her back to the wall, unless the beat or a window says from behind.
    assert.match(motion('fucking against the wall'), /chest to chest, her back against the wall/);
    assert.doesNotMatch(motion('fucking against the wall'), /from behind|bent/);
    assert.match(motion('against the wall from behind'), /from behind.*facing the wall/);
    assert.match(motion('fucking against the hotel window'), /from behind/);
    // Face-sit and 69 are drawn as seated oral: the clip animates oral, and the Scene line
    // doesn't ask for a 69 or face-sitting.
    for (const beat of ['facesitting in the loft', 'sixty-nine on the bed']) {
      assert.match(motion(beat), /motion of the head at the hips/, beat);
      assert.doesNotMatch(buildIntimateClipPrompt(beat), /sixty-nine|facesit/i, beat);
    }
    assert.match(motion('afterglow in tangled sheets'), /no thrusting/);
    assert.doesNotMatch(motion('half-undressed, skin and erotic heat'), /rhythmic motion of the hips/);
    assert.match(motion('lifted up while fucking'), /legs stay wrapped/);
    // Scissors: seated, leaning back on their hands (the recipe), not lying on their sides.
    assert.match(motion('scissoring on the floor'), /legs cross; both stay sitting/);
    assert.doesNotMatch(motion('scissoring on the floor'), /on their sides/);
    // Two women: their recipes draw a hand, not hips from behind.
    for (const beat of ['spooning in bed', 'lying face-down on the bed mid-sex', 'against the wall from behind']) {
      assert.match(motion(beat, { twoWomen: true }), /hand moves slowly between her thighs|hand between her thighs/, beat);
    }
    // Two men: scissors kneels them face to face (their recipe).
    assert.match(motion('scissoring on the bed', { twoMen: true }), /kneeling upright face to face/);
  });

  it('speaks about one body for solo beats', () => {
    const prompt = buildIntimateClipPrompt(
      'alone pressed to the hallway wall fully nude one leg hiked — both hands between her thighs fingering, laughing mid-act, Cast alone'
    );
    assert.match(prompt, /Her body keeps the exact pose/);
    assert.doesNotMatch(prompt, /Both bodies/);
  });
});
