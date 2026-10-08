import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kleinColorAnchorStrengthForTool } from './comfyui-runtime-for-model';

describe('Klein color anchor on Outfit try-ons', () => {
  it('caps the anchor at 0.1 for fitting and leaves every other tool alone', () => {
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'fitting'), 0.1);
    assert.equal(kleinColorAnchorStrengthForTool(undefined, 'fitting'), 0.1);
    assert.equal(kleinColorAnchorStrengthForTool(0.05, 'fitting'), 0.05);
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'day'), 0.45);
    assert.equal(kleinColorAnchorStrengthForTool(undefined, 'roleplay'), undefined);
  });
});

describe('Day dress plate engine', () => {
  it('renders on Klein 9B Distilled when installed, else the still engine; the anchor caps per queue', async () => {
    const { dressPlateEngine } = await import('./day-dress-plate-client');
    assert.equal(dressPlateEngine('qwen-image-edit-2511-lightning-8', () => true), 'flux-2-klein-9b-distilled');
    assert.equal(
      dressPlateEngine('qwen-image-edit-2511-lightning-8', id => id !== 'flux-2-klein-9b-distilled'),
      'qwen-image-edit-2511-lightning-8'
    );
    assert.equal(dressPlateEngine('qwen-rapid-aio-edit', null), 'qwen-rapid-aio-edit');
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'image-prompt', 0.1), 0.1);
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'image-prompt'), 0.45);
  });
});

describe('Klein Enhancer settings reach the server', () => {
  it('stripEmptyComfyUiRuntime keeps the Klein Enhancer fields', async () => {
    const { stripEmptyComfyUiRuntime } = await import('./comfyui-config');
    const out = stripEmptyComfyUiRuntime({
      kleinEnhancerEnabled: false,
      kleinEnhancerTextEnabled: false,
      kleinEnhancerColorAnchorEnabled: true,
      kleinEnhancerColorAnchorStrength: 0.1,
    });
    assert.equal(out?.kleinEnhancerEnabled, false);
    assert.equal(out?.kleinEnhancerTextEnabled, false);
    assert.equal(out?.kleinEnhancerColorAnchorEnabled, true);
    assert.equal(out?.kleinEnhancerColorAnchorStrength, 0.1);
  });
});

describe('Outfit try-on notes keep styling, not the Look scene', () => {
  it('drops moodboard scene lines and keeps clothing styling', async () => {
    const { fittingStylingNotes, buildFittingOutfitPrompt } = await import('./fitting-room');
    const notes = [
      'Compose a cohesive scene from the moodboard references.',
      'subject: Loose Lana',
      'character notes: a White woman in her thirties',
      'moodboard cues:',
      '1. Mood — Golden',
      '   notes: hopeful, open, romantic',
      '2. Lighting — Sunset',
      '   notes: warm backlight, long shadows',
      'output: single polished scene still with readable composition and consistent anatomy',
      'mood: Golden: hopeful, open, romantic',
      'lighting: Sunset: warm backlight, long shadows',
      'location: Outdoors: rooftop, park, riverside',
      'tuck the blouse in, sleeves rolled once',
    ].join('\n');
    assert.equal(fittingStylingNotes(notes), 'tuck the blouse in, sleeves rolled once');
    const prompt = buildFittingOutfitPrompt({ outfitLabel: 'red dress', notes, isolated: true });
    assert.doesNotMatch(prompt, /Sunset|rooftop|moodboard/);
    assert.match(prompt, /lighting: soft, even studio light/);
    assert.match(prompt, /styling tweaks .*tuck the blouse in/);
  });
});
