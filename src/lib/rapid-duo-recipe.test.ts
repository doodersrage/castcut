import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDaySlotPrompt,
  DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_SLOT_RAUNCHY_BEAT_PRESETS,
  isDayIntimateSoloBeat,
  isDayRaunchySoloBeat,
} from './day-planner';
import { reinforceIntimateStillPrompt } from './intimate-prompt-clarify';
import { applyQueuePromptSteering } from './queue-prompt-prep';
import { buildRapidDuoRecipe, isRapidDuoRecipePrompt, rapidDuoSurface } from './rapid-duo-recipe';

const DUO_BEATS = [
  ...Object.values(DAY_SLOT_INTIMATE_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS).flat(),
  ...Object.values(DAY_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
].filter(beat => !isDayIntimateSoloBeat(beat) && !isDayRaunchySoloBeat(beat));

const nightSlot = { id: 'night', label: 'Night', sceneHints: '', location: 'bedroom' } as never;

function duoPrompt(beat: string, model: string): string {
  return buildDaySlotPrompt({
    slot: { ...(nightSlot as object), sceneHints: beat } as never,
    characterName: 'Lana',
    characterDescriptor: 'white woman in her 30s',
    hasPlate: true,
    plateSource: 'cast',
    poseGuide: true,
    model,
    dayMood: 'raunchy',
    intimateMix: 'duo',
    omitGarment: true,
    faceOnlyIdentity: true,
  });
}

describe('Rapid duo recipe', () => {
  it('gives every duo beat preset a compact recipe', () => {
    for (const beat of DUO_BEATS) {
      const recipe = buildRapidDuoRecipe({ beat, timeOfDay: 'night', poseGuide: true });
      assert.ok(recipe, beat);
      assert.ok(recipe.length < 1200, `${recipe.length} chars: ${beat}`);
      assert.doesNotMatch(recipe, /\bdoggy/i, beat);
    }
  });

  it('replaces the full brief only on Rapid AIO', () => {
    const beat = 'against the bedroom wall mid-sex, night city glow';
    const rapid = duoPrompt(beat, 'qwen-rapid-aio-edit-nsfw');
    assert.ok(isRapidDuoRecipePrompt(rapid));
    assert.match(rapid, /back pressed flat against the bedroom wall/);
    assert.doesNotMatch(rapid, /DUO ACT:|POSE LOCK:|HEADCOUNT/);
    assert.ok(!isRapidDuoRecipePrompt(duoPrompt(beat, 'qwen-image-edit-2511')));
  });

  it('survives reinforce and Rapid queue steering unchanged', () => {
    const recipe = duoPrompt('bent over the bathroom sink mid-sex with a partner behind', 'qwen-rapid-aio-edit-nsfw');
    assert.equal(reinforceIntimateStillPrompt(recipe), recipe);
    const { positive } = applyQueuePromptSteering({
      positive: recipe,
      model: 'qwen-rapid-aio-edit-nsfw',
      realismMode: 'off' as never,
      anatomyMode: 'off' as never,
      tool: 'day',
    });
    assert.ok(positive.startsWith(recipe));
    assert.ok(positive.length < recipe.length + 200);
  });

  it('reads who gives oral and which furniture the beat names', () => {
    assert.match(
      buildRapidDuoRecipe({ beat: 'she goes down on her partner on the couch — oral, both adults fully visible' })!,
      /woman kneels on the floor between his knees/
    );
    assert.match(
      buildRapidDuoRecipe({ beat: 'going down on her at the edge of the bed in morning light, partner kneeling between her thighs' })!,
      /sits on the edge of the bed, leaning back/
    );
    assert.match(
      buildRapidDuoRecipe({ beat: 'going down on her in the late-morning sheets, partner between her thighs' })!,
      /man lies between her thighs/
    );
    assert.match(
      buildRapidDuoRecipe({ beat: 'A distinct adult partner kneeling for oral sex on Lana — head between thighs' })!,
      /woman stands with her back against the wall/
    );
    assert.equal(rapidDuoSurface('partner mid-sex over the arm of the couch as takeout spills across the floor'), 'arm of the couch');
    assert.equal(rapidDuoSurface('going down on her at the edge of the bed'), 'edge of the bed');
    assert.equal(rapidDuoSurface('reverse cowgirl on the hotel armchair'), 'hotel armchair');
  });

  it('draws a face-sitting guide for a Rapid 69 beat so the pose check agrees', async () => {
    const { planDaySlotPose } = await import('./day-slot-pose');
    const { resolveSceneGuidePlan } = await import('./day-pose-guide');
    const layoutFor = (model: string) => {
      const plan = planDaySlotPose({
        slot: { id: 'afternoon', sceneHints: 'sixty-nine on the couch in afternoon light — both adults fully visible', location: 'apartment' } as never,
        dayMood: 'raunchy',
        intimateMix: 'duo',
        allowCompanions: true,
        model,
      });
      return resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true }).intent.intimate;
    };
    assert.equal(layoutFor('qwen-rapid-aio-edit-nsfw'), 'facesit');
    assert.equal(layoutFor('qwen-image-edit-2511'), 'sixty_nine');
  });

  it('builds Story recipes only on Rapid, with the right image slots and wardrobe', async () => {
    const { buildStoryRapidDuoRecipe } = await import('./rapid-duo-recipe');
    const clothed = buildStoryRapidDuoRecipe({
      model: 'qwen-rapid-aio-edit-nsfw',
      blurb:
        'Lana having quick standing sex with a distinct adult partner in a half-hidden public spot — clothes open, risk of being seen.',
      omitGarment: false,
      hasGarmentImage: true,
      hasPoseGuide: true,
    })!;
    assert.match(clothed, /penetrating her from behind/);
    assert.match(clothed, /outfit from the second image, pushed open/);
    assert.match(clothed, /third image \(pose map\)/);
    assert.doesNotMatch(clothed, /completely nude/);
    const nude = buildStoryRapidDuoRecipe({
      model: 'qwen-rapid-aio-edit-nsfw',
      blurb: 'A distinct adult partner kneeling for oral sex on Lana — head between thighs, nude bodies.',
      omitGarment: true,
      hasGarmentImage: false,
      hasPoseGuide: true,
    })!;
    assert.match(nude, /completely nude/);
    assert.match(nude, /second image \(pose map\)/);
    assert.equal(
      buildStoryRapidDuoRecipe({
        model: 'qwen-image-edit-2511',
        blurb: 'missionary on the bed',
        omitGarment: true,
        hasGarmentImage: false,
        hasPoseGuide: false,
      }),
      null
    );
  });
});
