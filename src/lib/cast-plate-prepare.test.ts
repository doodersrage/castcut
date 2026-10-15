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

describe('clean-shaven prepare step', () => {
  it('shaves him and keeps everything else', async () => {
    const { buildCastPlatePreparePrompt, buildCastPlatePrepareNegative, hasCastPlatePrepareStep } =
      await import('./cast-plate-prepare');
    const options = { stand: false, baseLayer: false, whiteBackground: false, shave: true };
    assert.equal(hasCastPlatePrepareStep(options), true);
    const prompt = buildCastPlatePreparePrompt({ options, noun: 'man' });
    assert.match(prompt, /^Edit Image 1: make him clean-shaven\. Shave off all his stubble and beard/);
    assert.match(prompt, /Shave only the face: keep his chest hair, body hair and body/);
    assert.match(prompt, /Keep the exact same person, face, hair, .*clothing and lighting and background/);
    assert.match(buildCastPlatePrepareNegative(options, 'man'), /stubble/);
  });
});

describe('look trait plate edit', () => {
  it('says only the changes and stops keeping the hair it changes', async () => {
    const { buildCastPlatePreparePrompt, buildCastPlatePrepareNegative, hasCastPlatePrepareStep } =
      await import('./cast-plate-prepare');
    const options = {
      stand: false,
      baseLayer: false,
      whiteBackground: false,
      traits: { changes: ['Change her hair to long straight black hair.'], hair: true, body: false },
    };
    assert.equal(hasCastPlatePrepareStep(options), true);
    const prompt = buildCastPlatePreparePrompt({ options, noun: 'woman' });
    assert.equal(
      prompt,
      'Edit Image 1: change only these details. Change her hair to long straight black hair. Keep the exact same person, face, skin tone, body shape, pose, framing, clothing and lighting and background. One person. Photoreal.'
    );
    assert.doesNotMatch(buildCastPlatePrepareNegative(options), /changed hairstyle/);
    const body = buildCastPlatePreparePrompt({
      options: { ...options, traits: { changes: ['Make his body soft.'], hair: false, body: true } },
      noun: 'man',
    });
    assert.match(body, /face, hair, skin tone, build, pose/);
    assert.equal(hasCastPlatePrepareStep({ ...options, traits: { changes: [], hair: false, body: false } }), false);
  });
});

