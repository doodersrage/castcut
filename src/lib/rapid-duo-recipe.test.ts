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

  it('draws the seated-oral guide for a Rapid 69 / face-sit beat so the pose check agrees', async () => {
    const { planDaySlotPose } = await import('./day-slot-pose');
    const { resolveSceneGuidePlan } = await import('./day-pose-guide');
    const layoutFor = (
      model: string,
      beat = 'sixty-nine on the couch in afternoon light — both adults fully visible'
    ) => {
      const plan = planDaySlotPose({
        slot: { id: 'afternoon', sceneHints: beat, location: 'apartment' } as never,
        dayMood: 'raunchy',
        intimateMix: 'duo',
        allowCompanions: true,
        model,
      });
      return resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true }).intent.intimate;
    };
    assert.equal(layoutFor('qwen-rapid-aio-edit-nsfw'), 'oral');
    assert.equal(
      layoutFor('qwen-rapid-aio-edit-nsfw', 'sitting on his face on the bed — face-sitting a partner'),
      'oral'
    );
    assert.equal(layoutFor('qwen-image-edit-2511'), 'sixty_nine');
    // v23 draws neither a 69 nor face-sitting: the recipe says seated oral, not the act's name.
    const { buildRapidDuoRecipe } = await import('./rapid-duo-recipe');
    const recipe = buildRapidDuoRecipe({
      beat: 'sixty-nine on the living-room rug with a partner when the pizza arrives',
    })!;
    assert.match(recipe, /sits on the edge of the couch.* mouth on her vulva/);
    assert.doesNotMatch(recipe, /sixty-nine|astride his face/);
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

const SOLO_BEATS = [
  ...Object.values(DAY_SLOT_INTIMATE_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS).flat(),
].filter(isDayIntimateSoloBeat);
const RAUNCHY_SOLO_BEATS = [
  ...Object.values(DAY_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
].filter(isDayRaunchySoloBeat);

function soloPrompt(
  beat: string,
  model: string,
  dayMood: 'intimate' | 'raunchy' = 'intimate',
  location = 'bedroom'
): string {
  return buildDaySlotPrompt({
    slot: { ...(nightSlot as object), sceneHints: beat, location } as never,
    characterName: 'Lana',
    characterDescriptor: 'white woman in her 30s',
    hasPlate: true,
    plateSource: 'cast',
    poseGuide: true,
    model,
    dayMood,
    intimateMix: 'solo',
    omitGarment: true,
    faceOnlyIdentity: true,
  });
}

describe('Rapid solo recipe', () => {
  it('replaces the long solo brief on Rapid with a short, partner-free recipe', () => {
    for (const [beats, mood] of [
      [SOLO_BEATS, 'intimate'],
      [RAUNCHY_SOLO_BEATS, 'raunchy'],
    ] as const) {
      for (const beat of beats) {
        const prompt = soloPrompt(beat, 'qwen-rapid-aio-edit-nsfw', mood);
        assert.match(prompt, /^Explicit solo photo: One woman alone/, beat);
        assert.ok(prompt.length < 1400, `${prompt.length}: ${beat}`);
        assert.doesNotMatch(prompt, /partner|two adults|\bman\b|rear-entry|missionary/i, beat);
        assert.ok(isRapidDuoRecipePrompt(prompt));
        // Queue steering must not append its long packs to it either.
        assert.equal(reinforceIntimateStillPrompt(prompt), prompt);
      }
    }
  });

  it("keeps the beat's own room and names the toy", async () => {
    const { buildRapidSoloRecipe } = await import('./rapid-duo-recipe');
    // "kitchen floor … toaster" under a rolled bathroom rendered a bathroom with a toaster.
    const kitchen = buildRapidSoloRecipe({
      beat: 'alone on the kitchen floor naked with knees pulled to her chest fingering herself when the toaster pops',
      setting: 'steamy bathroom with fogged glass and warm tile',
      timeOfDay: 'morning',
    })!;
    assert.match(kitchen, /sits on the kitchen floor/);
    assert.doesNotMatch(kitchen, /bathroom/);
    // A bed beat never lands in a bed-less room.
    assert.doesNotMatch(
      buildRapidSoloRecipe({
        beat: 'alone on her back in rumpled morning sheets, both hands between her thighs',
        setting: 'steamy bathroom with fogged glass and warm tile',
      })!,
      /Room:/
    );
    assert.match(
      buildRapidSoloRecipe({
        beat: 'alone on her back on the bed masturbating',
        setting: 'dim hotel suite with warm lamp light',
      })!,
      /Room: dim hotel suite/
    );
    const toy = buildRapidSoloRecipe({
      beat: 'solo kneeling upright naked after dark — both hands on the base of a dildo, never invent a man',
      toy: true,
    })!;
    assert.match(toy, /bright purple silicone dildo is pushed halfway inside her vagina/);
    // "penis-shaped … tip of the penis" drew a penis growing from her; the toy stays a toy.
    const penisWords = buildRapidSoloRecipe({
      beat: 'alone on her back with a realistic penis-shaped silicone dildo — the tip of the penis pushed into her vaginal opening, shaft entering her vagina',
      toy: true,
    })!;
    assert.doesNotMatch(penisWords, /penis/);
    assert.match(penisWords, /tip of the dildo/);
    // A kitchen sink is a counter, not a bathroom vanity.
    assert.match(
      buildRapidSoloRecipe({ beat: 'solo fingering naked against the kitchen sink, one knee on the counter' })!,
      /kitchen counter beside the sink/
    );
    assert.match(
      buildRapidSoloRecipe({
        beat: 'solo masturbation reclining on the couch, clothes half off',
        clothedOutfit: 'low-rise powder blue slip dress',
      })!,
      /She wears a low-rise powder blue slip dress, pulled down off her breasts/
    );
    assert.doesNotMatch(toy, /never|invent a man/);
    assert.match(
      buildRapidSoloRecipe({ beat: 'alone face-down on the bed masturbating, hips grinding' })!,
      /flat on her stomach .* bare back and buttocks up/
    );
  });

  it('anchors side-lying arms to her own body and keeps one light', async () => {
    const { buildRapidSoloRecipe, buildRapidDuoRecipe } = await import('./rapid-duo-recipe');
    const side = buildRapidSoloRecipe({
      beat: 'solo masturbation on her side on the couch, top knee raised, hand between her thighs',
    })!;
    assert.match(side, /top arm reaches down across her own belly .* bottom arm is folded under her head/);
    // The beat's own light wins over the slot's time of day.
    const duo = buildRapidDuoRecipe({
      beat: 'spooning sex on the couch, afternoon light',
      timeOfDay: 'morning',
    })!;
    assert.doesNotMatch(duo, /Morning light/);
    assert.match(
      buildRapidDuoRecipe({ beat: 'missionary on the rumpled bed', timeOfDay: 'morning' })!,
      /Morning light/
    );
  });

  it('never stages a partner on a solo beat for other models either', () => {
    for (const beat of [...SOLO_BEATS, ...RAUNCHY_SOLO_BEATS]) {
      const out = reinforceIntimateStillPrompt(beat);
      assert.doesNotMatch(
        out,
        /Two adults|rear-entry|Partner's|both adults|missionary position|STANDING upright sex/i,
        beat
      );
    }
    // "riding her own hand" is not straddling a partner.
    assert.match(
      reinforceIntimateStillPrompt('solo kneeling on the sheets masturbating, riding her own hand'),
      /riding her own hand/
    );
  });
});
