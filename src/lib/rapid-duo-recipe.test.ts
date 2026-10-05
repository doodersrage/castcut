import assert from 'node:assert/strict';
import { adultAgeLine, withAdultAgeLine } from './adult-age-safeguard';
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
import { parseIntimateLayout } from './day-pose-guide';
import { reinforceIntimateStillPrompt } from './intimate-prompt-clarify';
import { applyQueuePromptSteering } from './queue-prompt-prep';
import {
  beatLiesDown,
  buildCompactDayRecipe,
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
    const bare = duoPrompt('bent over the bathroom sink mid-sex with a partner behind', 'qwen-rapid-aio-edit-nsfw');
    assert.equal(reinforceIntimateStillPrompt(bare), bare);
    // As Day queues it: with the people's age sentence after the pose (finishDayStillPrompt).
    const recipe = withAdultAgeLine(
      bare,
      adultAgeLine({ lead: { noun: 'woman' }, partner: { noun: 'man' }, people: 2 })
    );
    const steer = (positive: string) =>
      applyQueuePromptSteering({
        positive,
        model: 'qwen-rapid-aio-edit-nsfw',
        realismMode: 'off' as never,
        anatomyMode: 'off' as never,
        tool: 'day',
      }).positive;
    const positive = steer(recipe);
    assert.ok(positive.startsWith(recipe));
    assert.ok(positive.length < recipe.length + 200);
    // A recipe that reaches the queue with no age sentence gets the generic one.
    assert.match(steer(bare), /Everyone in the picture is an adult in their thirties/);
  });

  it('reads who gives oral and which furniture the beat names', () => {
    assert.match(
      buildRapidDuoRecipe({ beat: 'she goes down on her partner on the couch — oral, both adults fully visible' })!,
      /woman kneels on the floor between his knees/
    );
    assert.match(
      buildRapidDuoRecipe({ beat: 'going down on her at the edge of the bed in morning light, partner kneeling between her thighs' })!,
      /sits on the edge of the bed, feet on the floor, leaning back/
    );
    assert.match(
      buildRapidDuoRecipe({ beat: 'going down on her in the late-morning sheets, partner between her thighs' })!,
      /sits on the edge of the bed, feet on the floor, leaning back.*the man kneels upright on the floor between her knees, his back straight, his face in profile/
    );
    // No kneel and a rug: she sits on the couch edge, not on "the edge of the rug".
    assert.match(
      buildRapidDuoRecipe({ beat: 'oral sex on the living-room rug with a partner when the pizza arrives' })!,
      /sits on the edge of the couch,/
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
    assert.match(recipe, /sits on the edge of the couch.* pressed to her vulva/);
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

  it("Story: places the bodies the pose map draws, not the blurb's other layout", async () => {
    const { buildStoryRapidDuoRecipe } = await import('./rapid-duo-recipe');
    const blurb =
      'She’s standing with her back against a filing cabinet, heels planted wide as she pulls you forward into a slow, grinding reverse straddle — hands gripping your hips';
    const input = {
      model: 'qwen-rapid-aio-edit-nsfw',
      blurb,
      omitGarment: true,
      hasGarmentImage: false,
      hasPoseGuide: true,
    };
    // The writer's pose drew a standing map: the recipe stands them too.
    const standing = buildStoryRapidDuoRecipe({ ...input, guideLayout: 'standing' })!;
    assert.match(standing, /^Explicit sex photo: Both stand\./);
    assert.doesNotMatch(standing, /lies flat on his back|astride/);
    // A map that isn't a sex layout (or no map) leaves the blurb's own read.
    const own = buildStoryRapidDuoRecipe({ ...input, guideLayout: 'stand' })!;
    assert.match(own, /Reverse cowgirl/);
    assert.equal(
      buildStoryRapidDuoRecipe({ ...input, hasPoseGuide: false, guideLayout: 'standing' }),
      buildStoryRapidDuoRecipe({ ...input, hasPoseGuide: false })
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
    // Suggestive stays clothed: the coverage line sits between the clothes and the Moment.
    assert.match(rapid, /She wears [^.]+\. Her clothes stay on, covering her chest and hips\. Moment:/);
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
  it('a passing "sundress" does not overrule the outfit the Day picked', () => {
    const beat = 'WAVING from the hotel balcony rail in a sundress — one arm raised high overhead';
    // A clothing photo (Image 2) or a kit is what she wears; the moment no longer names another.
    const photo = buildRapidVacationRecipe({ beat, outfitImage: 'second' })!;
    assert.match(photo, /She wears the outfit from the second image\./);
    assert.match(photo, /Moment: waving from the hotel balcony rail in her outfit —/);
    assert.doesNotMatch(photo, /sundress/);
    const kit = buildRapidVacationRecipe({ beat, outfit: 'black lace mini dress' })!;
    assert.match(kit, /She wears a black lace mini dress\./);
    assert.doesNotMatch(kit, /sundress/);
    // No outfit picked: the scene's own words dress her, as before.
    assert.match(buildRapidVacationRecipe({ beat })!, /She wears a sundress\./);
    // Clothes the scene needs still win over the Day's outfit.
    for (const [scene, worn] of [
      ['FLOATING on her back in the hotel pool in a swimsuit', 'a swimsuit'],
      ['STRETCHING by the window in a hotel robe', 'a robe'],
    ] as const) {
      assert.match(
        buildRapidVacationRecipe({ beat: scene, outfitImage: 'second' })!,
        new RegExp(`She wears ${worn}\\.`)
      );
    }
  });

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

describe('vacationBeatDressesItself', () => {
  it('water, robe and beach-lounging scenes dress her themselves; named street clothes do not', async () => {
    const { vacationBeatDressesItself } = await import('./rapid-duo-recipe');
    for (const beat of [
      'SWIMMING freestyle mid-stroke in the resort pool — swimsuit, head turned for a breath',
      'FLOATING on her back in a lit pool at night',
      'stretching on the bed in a hotel robe',
      'lounging on a beach towel under an umbrella',
    ]) {
      assert.equal(vacationBeatDressesItself(beat), true, beat);
    }
    for (const beat of [
      'KICKING through the morning surf — sundress hem wet',
      'SEATED at a café terrace sipping morning coffee',
      'WAVING from the hotel balcony rail in a sundress',
      '',
    ]) {
      assert.equal(vacationBeatDressesItself(beat), false, beat);
    }
  });
});

describe('Story clothed two-person stills on Rapid', () => {
  it('use the compact couple recipe with the right image numbers', async () => {
    const { buildStoryClothedDuoRecipe } = await import('./rapid-duo-recipe');
    const blurb = 'She pours a second cup for the man beside her at the kitchen window.';
    const dressed = buildStoryClothedDuoRecipe({
      model: 'qwen-rapid-aio-edit',
      blurb,
      fromDressedPlate: true,
      hasGarmentImage: false,
      hasPoseGuide: true,
    });
    assert.match(dressed ?? '', /A woman and a man together, both fully clothed, both fully in frame/);
    assert.match(dressed ?? '', /outfit from the first image/);
    assert.match(dressed ?? '', /second image \(pose map\)/);
    const withClothing = buildStoryClothedDuoRecipe({
      model: 'qwen-rapid-aio-edit',
      blurb,
      fromDressedPlate: false,
      hasGarmentImage: true,
      hasPoseGuide: true,
    });
    assert.match(withClothing ?? '', /outfit from the second image/);
    assert.match(withClothing ?? '', /third image \(pose map\)/);
    const man = buildStoryClothedDuoRecipe({
      model: 'qwen-rapid-aio-edit',
      blurb: 'He pours a second cup for the woman beside him.',
      fromDressedPlate: true,
      hasGarmentImage: false,
      hasPoseGuide: true,
      lead: 'man',
    });
    assert.match(man ?? '', /Keep his face from the first image/);
    assert.equal(
      buildStoryClothedDuoRecipe({
        model: 'qwen-image-edit-2511-lightning-8',
        blurb,
        fromDressedPlate: true,
        hasGarmentImage: false,
        hasPoseGuide: true,
      }),
      null
    );
  });
});

describe('Day couple recipe for friends', () => {
  it('keeps a friends beat as friends for a same-sex pair', async () => {
    const { buildCompactDayDuoRecipe } = await import('./rapid-duo-recipe');
    const recipe = buildCompactDayDuoRecipe({
      beat: 'walking side by side through the park with her friend, takeaway coffees in hand',
      poseGuide: 'third',
      partner: { partner: { name: 'Sam', noun: 'man', descriptor: 'a man with curly hair' }, image: 'second' },
      lead: 'man',
    } as never);
    assert.doesNotMatch(recipe ?? '', /boyfriend/);
    assert.match(recipe ?? '', /his friend/);
  });
});

describe('Day recipe: lying beats', () => {
  const placement = (beat: string) =>
    /One woman alone\. (.*?) She wears/.exec(
      buildCompactDayRecipe({ beat, setting: 'park', outfitImage: 'second', faceOnly: true }) ?? ''
    )?.[1] ?? null;

  it('says the whole body, horizontal on the surface, not sitting', () => {
    // Live 2026-10-03, Qwen-Image 2.1: "She lies on her back." alone came out sitting up.
    assert.equal(
      placement('lying on her back on a picnic blanket'),
      'She lies flat on her back on the picnic blanket, whole body horizontal, head resting on it, legs stretched out — not sitting.'
    );
    assert.equal(
      placement('lying on her side on the sofa, head propped on one hand, reading'),
      'She lies on her side on the sofa, whole body horizontal along it, head propped on one hand — not sitting.'
    );
    assert.equal(
      placement('lying on her stomach on the bed, feet kicked up behind, scrolling the news'),
      'She lies on her stomach on the bed, whole body horizontal along it, propped on her forearms — not sitting.'
    );
    assert.equal(
      placement('propped back on her elbows on the grass watching the sunset'),
      'She lies back on the grass, propped up on both elbows, whole body horizontal along it, legs stretched out — not sitting.'
    );
    // The beat's own legs are left to it.
    assert.equal(
      placement('lying on the park lawn with sunglasses on, one knee up'),
      'She lies flat on her back on the park lawn, whole body horizontal, head resting on it — not sitting.'
    );
  });

  it('knows a lie from a chair sprawl or a negated one', () => {
    assert.equal(beatLiesDown('lying on the rug mid-stretch'), true);
    assert.equal(beatLiesDown('reclining on the couch with feet up'), true);
    assert.equal(beatLiesDown('sprawled sideways in an armchair still in the coat'), false);
    assert.equal(beatLiesDown('sitting on the bed, never lying down'), false);
    assert.equal(beatLiesDown('leaning on the rail, propped on her elbows'), false);
    assert.equal(placement('sprawled sideways in an armchair still in the coat'), null);
  });
});

describe('Rapid duo recipe: surface wording', () => {
  const recipe = (beat: string, partner?: 'woman' | 'man', lead?: 'man') =>
    buildRapidDuoRecipe({
      beat,
      ...(partner ? { partner: { partner: { noun: partner } as never, image: 'third' as const } } : {}),
      ...(lead ? { lead } : {}),
    }) ?? '';
  const body = (beat: string, partner?: 'woman' | 'man', lead?: 'man') =>
    recipe(beat, partner, lead).split('Moment:')[0]!;

  it('names the edge once, whatever the beat calls it', () => {
    for (const beat of [
      'he kneels and goes down on her on the bed edge — both adults fully visible',
      'he kneels and goes down on her at the edge of the bed — both adults fully visible',
    ]) {
      assert.match(body(beat), /sits on the edge of the bed,/, beat);
    }
    for (const beat of [
      'her partner goes down on her at the edge of the bed — both adults fully visible',
      'she goes down on her partner on the bed edge — both adults fully visible',
    ]) {
      const text = body(beat, 'woman');
      assert.match(text, /sits on the edge of the bed,/, beat);
      assert.doesNotMatch(text, /edge of the (?:edge|bed edge)/, beat);
    }
    assert.match(
      body('she goes down on him at the edge of the bed — both adults fully visible', undefined, 'man'),
      /sits on the edge of the bed\b/
    );
    for (const beat of DUO_BEATS) {
      for (const partner of [undefined, 'woman'] as const) {
        assert.doesNotMatch(recipe(beat, partner), /edge of the (?:edge\b|[\w-]+ edge\b)/, beat);
      }
    }
  });

  it('reads sheets and a mattress as the bed', () => {
    assert.equal(rapidDuoSurface('going down on her in the late-morning sheets'), 'bed');
    assert.equal(rapidDuoSurface('tangled up on the rumpled sheets'), 'rumpled bed');
    assert.equal(rapidDuoSurface('on the bare mattress'), 'bed');
    assert.match(
      body('going down on her in the late-morning sheets, partner between her thighs — both adults fully visible'),
      /sits on the edge of the bed,/
    );
  });

  it('puts rear entry on a rug or floor on all fours, not bent over the rug', () => {
    const beat = 'on all fours on the rug, partner behind her — both adults fully visible';
    for (const text of [body(beat), body(beat, 'woman'), body(beat, 'man', 'man')]) {
      assert.match(text, /on all fours on the rug/);
      assert.match(text, /kneels/);
      assert.doesNotMatch(text, /bent forward over the rug/);
    }
    assert.match(body('bent over the desk from behind with a partner'), /stands bent forward over the desk/);
  });

  it('does not read light on her face as face-sitting', () => {
    assert.equal(
      parseIntimateLayout(
        'lying on her stomach across the bed in a silk camisole and shorts, ankles crossed in the air, chin on her hands, phone glow on her face, clothes stay on'
      ),
      null
    );
    assert.equal(parseIntimateLayout('sun on her face as she rides him'), 'straddle');
    assert.equal(parseIntimateLayout('sitting on his face on the bed'), 'facesit');
  });
});

describe('Vacation recipe: reclining on her side', () => {
  it('says the side, not "lies back", when the beat has her on her side', () => {
    const side = buildRapidVacationRecipe({
      beat: 'RECLINING on the hotel bed on her side, head propped on one hand — room-service tray',
      outfitImage: 'second',
    })!;
    assert.match(side, /She lies on her side on the bed, head propped on one hand, legs along it\./);
    assert.doesNotMatch(side, /lies back/);
    const back = buildRapidVacationRecipe({
      beat: 'RECLINING on a pool lounger with sunglasses on — afternoon sun',
      outfitImage: 'second',
    })!;
    assert.match(back, /She lies back on the (?:pool lounge|lounger), hips and back on it/);
  });
});
