import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCastPlatePrepareNegative,
  buildCastPlatePreparePrompt,
  DEFAULT_CAST_PLATE_PREPARE_OPTIONS,
  hasCastPlatePrepareStep,
} from './cast-plate-prepare';

const ALL = DEFAULT_CAST_PLATE_PREPARE_OPTIONS;
const NONE = { stand: false, baseLayer: false, whiteBackground: false };

describe('cast-plate-prepare prompt', () => {
  it('does all three by default: standing, base layer, white', () => {
    assert.deepEqual(ALL, { stand: true, baseLayer: true, whiteBackground: true });
    const prompt = buildCastPlatePreparePrompt({ options: ALL, noun: 'woman' });
    assert.match(prompt, /^Edit Image 1: the same person, now standing upright facing the camera/);
    assert.match(prompt, /full body head to feet in frame/);
    assert.match(prompt, /plain light-beige fitted underwear — a simple bra and briefs/);
    assert.match(prompt, /barefoot/);
    assert.match(prompt, /Plain pure white background, no props\./);
    assert.match(prompt, /Keep her face, hair, skin tone and body shape exactly\./);
    assert.match(prompt, /One person\./);
    // Distilled edit stacks drift on long briefs.
    assert.ok(prompt.length < 480, `prompt is ${prompt.length} chars`);
  });

  it('keeps the outfit and shoes when the base layer is unticked', () => {
    const prompt = buildCastPlatePreparePrompt({
      options: { ...ALL, baseLayer: false },
      noun: 'woman',
    });
    assert.match(prompt, /exactly the same clothes and shoes, now standing upright/);
    assert.doesNotMatch(prompt, /underwear|barefoot/);
    assert.match(prompt, /body shape and the outfit exactly/);
  });

  it('keeps the scene when white is unticked', () => {
    const prompt = buildCastPlatePreparePrompt({
      options: { ...ALL, whiteBackground: false },
      noun: 'woman',
    });
    assert.doesNotMatch(prompt, /white background/);
    assert.match(prompt, /Same place and light as Image 1\./);
    // An isolated plate stays on white either way.
    const onWhite = buildCastPlatePreparePrompt({
      options: { ...ALL, whiteBackground: false },
      noun: 'woman',
      onWhite: true,
    });
    assert.match(onWhite, /Plain pure white background/);
  });

  it('base layer alone is the old Remove clothing edit (pose kept)', () => {
    const prompt = buildCastPlatePreparePrompt({
      options: { ...NONE, baseLayer: true },
      noun: 'woman',
    });
    assert.match(prompt, /^Edit Image 1: change only the clothing\./);
    assert.match(prompt, /same person, face, hair, skin tone, body shape, pose, framing/);
    assert.match(prompt, /lighting and background\./);
    assert.doesNotMatch(prompt, /standing upright/);
  });

  it('dresses a man in a man’s base layer', () => {
    const prompt = buildCastPlatePreparePrompt({ options: ALL, noun: 'man' });
    assert.match(prompt, /boxer briefs and a plain white fitted tank top/);
    assert.doesNotMatch(prompt, /bra/);
    assert.match(prompt, /Keep his face/);
  });

  it('needs at least one step', () => {
    assert.equal(hasCastPlatePrepareStep(NONE), false);
    assert.equal(hasCastPlatePrepareStep({ ...NONE, whiteBackground: true }), true);
  });
});

describe('cast-plate-prepare negative', () => {
  it('keeps the base layer clothed (SFW) and blocks the old pose when standing', () => {
    const negative = buildCastPlatePrepareNegative(ALL);
    assert.match(negative, /\bnude\b/);
    assert.match(negative, /bare breasts/);
    assert.match(negative, /different person/);
    assert.match(negative, /sitting, kneeling, lying down/);
    assert.match(negative, /scenery/);
    assert.match(negative, /\btop\b/);
    // His base layer has a tank top in it.
    assert.doesNotMatch(buildCastPlatePrepareNegative(ALL, 'man'), /\btop\b/);
  });

  it('does not fight the kept outfit or pose', () => {
    const keepOutfit = buildCastPlatePrepareNegative({ ...ALL, baseLayer: false });
    assert.doesNotMatch(keepOutfit, /\bdress\b|shoes|heels/);
    assert.match(keepOutfit, /changed clothes/);
    const keepPose = buildCastPlatePrepareNegative({ ...NONE, baseLayer: true });
    assert.doesNotMatch(keepPose, /sitting/);
    assert.match(keepPose, /changed pose/);
  });
});
