import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDaySlotPrompt,
  DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_CLOTHED_MOOD_SEX_LEAK_RE,
  DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_BEAT_PRESETS,
  DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS,
  daySlotMatchesAdultMix,
  diversifyDaySlotScenes,
  isDayIntimateSoloBeat,
  isDayRaunchySoloBeat,
} from './day-planner';
import { reinforceIntimateStillPrompt } from './intimate-prompt-clarify';
import { applyQueuePromptSteering } from './queue-prompt-prep';
import {
  buildRapidDuoRecipe,
  calmSexLaughter,
  buildRapidSuggestiveRecipe,
  buildRapidVacationRecipe,
  isRapidDuoRecipePrompt,
  rapidDuoSurface,
  suggestiveBeatClothes,
} from './rapid-duo-recipe';

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

  it('replaces the full brief on Rapid AIO and Edit 2511', () => {
    const beat = 'against the bedroom wall mid-sex, night city glow';
    const rapid = duoPrompt(beat, 'qwen-rapid-aio-edit-nsfw');
    assert.ok(isRapidDuoRecipePrompt(rapid));
    assert.match(rapid, /back pressed flat against the bedroom wall/);
    assert.doesNotMatch(rapid, /DUO ACT:|POSE LOCK:|HEADCOUNT/);
    // Edit 2511 shares the adult recipes (pose-model-profile: compactDayRecipes); others don't.
    assert.ok(isRapidDuoRecipePrompt(duoPrompt(beat, 'qwen-image-edit-2511')));
    assert.ok(!isRapidDuoRecipePrompt(duoPrompt(beat, 'qwen-image-edit-2509')));
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

describe('Rapid suggestive recipe', () => {
  const beats = [
    ...Object.values(DAY_SLOT_SUGGESTIVE_BEAT_PRESETS).flat(),
    ...Object.values(DAY_LATE_SLOT_SUGGESTIVE_BEAT_PRESETS).flat(),
  ];
  const suggestivePrompt = (beat: string, model: string, extra: object = {}) =>
    buildDaySlotPrompt({
      slot: { ...(nightSlot as object), sceneHints: beat } as never,
      characterName: 'Lana',
      characterDescriptor: 'white woman in her 30s',
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      model,
      dayMood: 'suggestive',
      faceOnlyIdentity: true,
      ...extra,
    });

  it('names clothes for every preset beat and stays short', () => {
    for (const beat of beats) {
      const recipe = buildRapidSuggestiveRecipe({ beat, timeOfDay: 'night', poseGuide: true });
      assert.ok(recipe && recipe.length < 900, beat);
      assert.match(recipe, /She wears /, beat);
      assert.doesNotMatch(recipe, /\bnever\b|Cast alone|Image 2/i, beat);
    }
  });

  it('takes the clothes, not the place, from the beat', () => {
    assert.equal(suggestiveBeatClothes('leaning in a doorway in lingerie and an open robe'), 'lingerie and an open robe');
    assert.equal(suggestiveBeatClothes('lounging late in bed in an oversized shirt and panties'), 'an oversized shirt and panties');
    assert.equal(suggestiveBeatClothes('sitting on the hotel bed edge unzipping a dress halfway — lingerie visible'), 'a dress over lingerie');
  });

  it('keeps window beats at the window instead of the bed', () => {
    const recipe = buildRapidSuggestiveRecipe({
      beat: 'leaning on the sill in lingerie under an open shirt, looking back over a shoulder',
      poseGuide: true,
    })!;
    assert.match(recipe, /leaning on the windowsill, weight on one hip, looking back over her shoulder/);
    assert.match(recipe, /She wears lingerie under an open shirt\./);
  });

  it('replaces the brief on Rapid and Edit 2511, and names an attached garment or Keep outfit', () => {
    const beat = 'pouring coffee barefoot in a silk robe loosely tied — leaning on the counter';
    const rapid = suggestivePrompt(beat, 'qwen-rapid-aio-edit-nsfw');
    assert.ok(isRapidDuoRecipePrompt(rapid));
    assert.doesNotMatch(rapid, /CLOTHING LOCK|catalog wardrobe kit/);
    assert.match(rapid, /second image \(pose map\)/);
    // Edit 2511 shares the recipe (pose-model-profile: compactClothedRecipes); others keep the brief.
    assert.match(suggestivePrompt(beat, 'qwen-image-edit-2511'), /Suggestive photo: One woman alone, clothed\./);
    assert.ok(!isRapidDuoRecipePrompt(suggestivePrompt(beat, 'qwen-image-edit-2509')));
    const packshot = suggestivePrompt(beat, 'qwen-rapid-aio-edit-nsfw', { garmentReinforce: true });
    assert.match(packshot, /outfit from the second image.*third image \(pose map\)/);
    const keep = suggestivePrompt(beat, 'qwen-rapid-aio-edit-nsfw', { faceOnlyIdentity: false, plateSource: 'keeper' });
    assert.match(keep, /outfit from the first image/);
    // Companions on: a solo beat keeps the solo recipe; a couple beat gets the couple one.
    assert.match(
      suggestivePrompt(beat, 'qwen-rapid-aio-edit-nsfw', { allowCompanions: true }),
      /One woman alone, clothed\./
    );
    const couple = 'kissing her partner in a doorway, up on her toes in a short dress — his hands on her waist';
    const duo = suggestivePrompt(couple, 'qwen-rapid-aio-edit-nsfw', { allowCompanions: true });
    assert.match(duo, /A woman and a man together, both fully clothed.*She wears a short dress; he wears a casual shirt and jeans\..*the man has his own face/);
    assert.match(duo, /Match their two bodies/);
    // Companions off: the same beat stays one woman.
    assert.match(suggestivePrompt(couple, 'qwen-rapid-aio-edit-nsfw'), /One woman alone, clothed\./);
  });
});

describe('Rapid vacation recipe', () => {
  it('says the class body plainly and dresses from the beat first', () => {
    const swim = buildRapidVacationRecipe({
      beat: 'SWIMMING freestyle mid-stroke in the resort pool — swimsuit, head turned for a breath',
      outfit: 'outfit-relaxed-fit-fuchsia-wrap-dress',
      poseGuide: true,
    })!;
    assert.match(swim, /^Vacation photo:.*swims face-down.*She wears a swimsuit\..*Moment: swimming freestyle/);
    const cafe = buildRapidVacationRecipe({
      beat: 'SEATED at a café terrace sipping morning coffee — hips on the chair, one elbow on the table',
      outfit: 'outfit-relaxed-fit-fuchsia-wrap-dress',
    })!;
    // A kit id reads as words; a table seat is a chair at the table.
    assert.match(cafe, /She sits on the chair, knees bent\. She wears a relaxed fit fuchsia wrap dress\./);
    assert.match(
      buildRapidVacationRecipe({ beat: 'SEATED at a sidewalk café table after dinner — elbows on the table' })!,
      /on a chair at the (?:sidewalk café )?table/
    );
    assert.match(
      buildRapidVacationRecipe({ beat: 'RELAXING in a lit pool at night — floating on her back', outfit: 'wrap dress' })!,
      /floats on her back.*She wears a swimsuit\./
    );
    assert.match(
      buildRapidVacationRecipe({ beat: 'KICKING through the morning surf — sundress hem wet' })!,
      /walks through ankle-deep surf.*She wears a sundress\./
    );
  });

  it('uses the right article and a lounge surface, not a side table', () => {
    const recipe = buildRapidVacationRecipe({
      beat: 'RELAXING on a pool lounge with an iced drink on the side table — one knee raised, one-piece swimsuit',
    })!;
    assert.match(recipe, /lies back on the pool lounge.*She wears a one-piece swimsuit\./);
    assert.match(buildRapidVacationRecipe({ beat: 'DANCING on a terrace — evening wear' })!, /She wears evening wear\./);
  });

  it('replaces the Vacation brief on Rapid solo and on Edit 2511', () => {
    const slot = { ...(nightSlot as object), sceneHints: 'PEDALING a rental bike along the promenade — sundress' } as never;
    const build = (model: string, extra: object = {}) =>
      buildDaySlotPrompt({ slot, hasPlate: true, plateSource: 'cast', poseGuide: true, model, dayMood: 'vacation', ...extra });
    assert.match(build('qwen-rapid-aio-edit-nsfw'), /^Vacation photo:.*rides a bicycle/);
    // Edit 2511 held poses 7/7 with the recipe vs about 2/8 with the brief (live 2026-10-01).
    assert.match(build('qwen-image-edit-2511'), /Vacation photo:.*rides a bicycle/);
    const noMap = build('qwen-image-edit-2511', { poseGuide: false });
    assert.match(noMap, /Vacation photo:.*rides a bicycle/);
    assert.doesNotMatch(noMap, /pose map/);
    assert.ok(!isRapidDuoRecipePrompt(build('qwen-image-edit')));
  });
});

describe('Suggestive couple beats', () => {
  const beats = Object.values(DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS).flat();

  it('name two clothed people and never read as a leftover sex beat', () => {
    for (const beat of beats) {
      assert.match(beat, /\bher partner\b/, beat);
      assert.doesNotMatch(beat, DAY_CLOTHED_MOOD_SEX_LEAK_RE, beat);
    }
  });

  it('lift the solo-only locks from the long brief on other models', () => {
    const slot = { id: 'evening', label: 'Evening', sceneHints: beats[10], location: 'rooftop bar' } as never;
    const prompt = buildDaySlotPrompt({
      slot,
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      model: 'qwen-image-edit-2509',
      dayMood: 'suggestive',
      allowCompanions: true,
    });
    assert.doesNotMatch(prompt, /never invent a man|second adult or muscular man|one woman alone/i);
    assert.match(prompt, /her partner stays fully clothed/);
  });

  it('only fit a Suggestive slot while companions are on', () => {
    const slot = { id: 'evening', label: 'Evening', sceneHints: beats[10], location: 'rooftop bar' } as never;
    assert.equal(daySlotMatchesAdultMix({ slot, dayMood: 'suggestive', allowCompanions: true }), true);
    assert.equal(daySlotMatchesAdultMix({ slot, dayMood: 'suggestive' }), false);
    const moved = { id: 'morning', label: 'Morning', sceneHints: beats[10], location: 'bedroom' } as never;
    assert.equal(daySlotMatchesAdultMix({ slot: moved, dayMood: 'suggestive', allowCompanions: true }), true);
  });

  it('roll into about half the slots with companions on, none without', () => {
    const slots = ['morning', 'afternoon', 'evening', 'night'].map(id => ({ id, label: id })) as never[];
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rolled = (allowCompanions: boolean) =>
      Array.from({ length: 10 }, () =>
        diversifyDaySlotScenes(slots, { dayMood: 'suggestive', allowCompanions, forceBeats: true, random } as never)
          .slots.map(slot => slot.sceneHints ?? '')
      ).flat();
    const duoCount = (list: string[]) => list.filter(beat => beats.includes(beat)).length;
    const on = duoCount(rolled(true));
    assert.ok(on >= 8 && on <= 32, `${on}/40`);
    assert.equal(duoCount(rolled(false)), 0);
  });
});

describe('Rapid clothed recipes and kit labels', () => {
  it('drop trouser rise words from dress kits and keep picnics out of sleep pants', () => {
    const recipe = buildRapidSuggestiveRecipe({ beat: 'leaning in a doorway', outfit: 'low-rise powder blue slip dress' })!;
    assert.match(recipe, /She wears a powder blue slip dress\./);
    assert.match(
      buildRapidVacationRecipe({ beat: 'SEATED at a café', outfit: 'outfit-low-rise-denim-shorts' })!,
      /low rise denim shorts/
    );
    const picnic = buildDaySlotPrompt({
      slot: { ...(nightSlot as object), sceneHints: DAY_SLOT_SUGGESTIVE_DUO_BEAT_PRESETS.afternoon[3] } as never,
      hasPlate: true,
      plateSource: 'cast',
      poseGuide: true,
      model: 'qwen-rapid-aio-edit-nsfw',
      dayMood: 'suggestive',
      allowCompanions: true,
    });
    assert.match(picnic, /he wears a casual shirt and jeans/);
  });
});

describe('Cast descriptors in recipes', () => {
  const gloovi =
    'A half-mushroom humanoid draped in a mossy hoodie, glowing cap-drones humming where sleeves end, bikini straps woven from bioluminescent mycelium that pulse with each beat.';

  it('keep the body, drop clothing and props', async () => {
    const { recipeBodyDescriptor } = await import('./rapid-duo-recipe');
    assert.equal(recipeBodyDescriptor(gloovi), 'A half-mushroom humanoid');
    assert.equal(
      recipeBodyDescriptor('white woman in her 30s, freckles, athletic build, wearing a red leather jacket'),
      'white woman in her 30s, freckles, athletic build'
    );
    assert.equal(
      recipeBodyDescriptor('woman with a sleeve tattoo on her left arm, short platinum hair'),
      'woman with a sleeve tattoo on her left arm, short platinum hair'
    );
    assert.equal(recipeBodyDescriptor('young woman with long dark-blonde hair'), 'young woman with long dark-blonde hair');
  });

  it('never put a costume on a nude still', () => {
    const recipe = buildRapidDuoRecipe({
      beat: 'missionary on the rumpled bed with morning light through blinds',
      descriptor: gloovi,
      poseGuide: true,
    })!;
    assert.match(recipe, /The woman: A half-mushroom humanoid\./);
    assert.doesNotMatch(recipe, /hoodie|drones|straps|mycelium/);
  });
});

describe('calmSexLaughter', () => {
  it('turns Raunchy laughing into closed-lip amusement', () => {
    assert.equal(
      calmSexLaughter('mating press on the couch when the doorbell rings — both adults fully visible, laughing'),
      'mating press on the couch when the doorbell rings — both adults fully visible, amused, lips closed'
    );
    assert.match(
      calmSexLaughter('bent over a desk when the chair rolls away — both scramble laughing'),
      /both scramble, glancing at the interruption, lips closed, amused/
    );
    assert.match(calmSexLaughter('a partner slips and face-plants laughing'), /face-plants, both glancing at each other/);
    assert.match(calmSexLaughter('fingering herself — laughing mid-act'), /lips closed, amused mid-act/);
    assert.doesNotMatch(calmSexLaughter('laughing mid-thrust, then laughs again'), /laugh/i);
  });

  it('reaches the duo recipe Moment line', () => {
    const recipe = buildRapidDuoRecipe({
      beat: 'mating press on the couch with a partner when the doorbell rings — both adults fully visible, laughing',
    });
    assert.ok(recipe);
    assert.doesNotMatch(recipe!, /laugh/i);
  });
});

describe('wall layout on glass', () => {
  it('a window wall turns to face the glass from behind; a plain wall stays face to face', () => {
    const glass = String(buildRapidDuoRecipe({ beat: 'pressed against a hotel window wall mid-sex at dusk', poseGuide: true }));
    assert.match(glass, /stands facing the hotel window with her palms flat against it/);
    assert.doesNotMatch(glass, /back pressed flat against/);
    const wall = String(buildRapidDuoRecipe({ beat: 'pressed against the hallway wall mid-sex', poseGuide: true }));
    assert.match(wall, /back pressed flat against the hallway wall/);
  });
});
