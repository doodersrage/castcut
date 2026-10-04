/**
 * The adult age sentence on every prompt path (adult-age-safeguard.ts): one representative
 * prompt per path, as queued. Day (Rapid duo / solo / Suggestive recipes, same-sex duos, a long
 * Edit 2511 brief), Qwen-Image 2.1's conversion, Klein / SDXL at CFG > 1 (youth negative), Story
 * (recipe and long prompt), and the WAN clip made from an explicit still.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADULT_YOUTH_NEGATIVE, hasAdultAgeLine } from './adult-age-safeguard';
import { dayStillAgeFacts, finishDayStillPrompt } from './day-still-prompt';
import { buildIntimateClipPrompt } from './intimate-clip-prompt';
import { applyQueuePromptSteering } from './queue-prompt-prep';
import { toQwenImage21Prompt } from './qwen-image-21-renderer';
import {
  buildRapidDuoRecipe,
  buildRapidSoloRecipe,
  buildRapidSuggestiveRecipe,
  buildStoryRapidDuoRecipe,
} from './rapid-duo-recipe';
import { withStoryAdultAges } from './story-adult-ages';
import type { DayPartner } from './day-partner';

const THEO: DayPartner = {
  name: 'Theo',
  noun: 'man',
  descriptor: 'a man with short brown hair and a square jaw',
  ageBand: '40s',
};
const ADA: DayPartner = { name: 'Ada', noun: 'woman', descriptor: 'a woman with a black bob' };

function finishDay(
  prompt: string,
  facts: Parameters<typeof dayStillAgeFacts>[0],
  adult = true
): string {
  return finishDayStillPrompt(prompt, {
    adultMood: adult,
    adult,
    swapLead: false,
    ages: dayStillAgeFacts(facts),
  });
}

describe('age sentence per prompt path', () => {
  it('Day · Rapid duo recipe with a Cast partner (ages from the traits)', () => {
    const recipe = buildRapidDuoRecipe({
      beat: 'bent over the kitchen counter mid-sex with a partner behind',
      partner: { partner: THEO, image: 'second' },
      poseGuide: 'third',
    })!;
    const prompt = finishDay(recipe, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      lead: { ageBand: 'early-20s' },
      partner: THEO,
      figures: 2,
    });
    assert.equal(
      prompt,
      'Explicit sex photo: The woman stands bent forward over the kitchen counter, hands braced on it, hips pushed back; the man stands close behind her holding her hips, penetrating her from behind. She looks back over her shoulder. Both are adults — the woman in her late twenties, the man in his forties — with mature adult faces and bodies. Moment: bent over the kitchen counter mid-sex with a partner behind. Both are completely nude — her bare breasts with nipples visible and bare vulva, his bare chest and penis; zero fabric on either body. Keep her face from the first image; the man has the face from the second image (a man with short brown hair and a square jaw). Match the two bodies in the third image (pose map). Photorealistic photograph, natural skin.'
    );
  });

  it('Day · Rapid duo recipe with an invented partner (mature default)', () => {
    const recipe = buildRapidDuoRecipe({ beat: 'missionary on the rumpled bed' })!;
    const prompt = finishDay(recipe, {
      playedMood: 'raunchy',
      leadNoun: 'woman',
      partner: { name: '', noun: 'man', invented: true },
      figures: 2,
    });
    assert.match(
      prompt,
      /their faces close\. Both are adults in their thirties, with mature adult faces and bodies\. Moment:/
    );
  });

  it('Day · two women (same-sex duo recipe)', () => {
    const recipe = buildRapidDuoRecipe({
      beat: 'scissoring on the bed',
      partner: { partner: ADA, image: 'second' },
    })!;
    const prompt = finishDay(recipe, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      lead: { ageBand: '30s' },
      partner: ADA,
      figures: 2,
    });
    assert.match(prompt, /Both are adults in their thirties, with mature adult faces and bodies\. Moment:/);
    assert.ok(prompt.indexOf('Both are adults') > prompt.indexOf('Explicit sex photo:') + 40);
  });

  it('Day · Rapid solo recipe', () => {
    const recipe = buildRapidSoloRecipe({
      beat: 'solo masturbation on the couch, alone',
      poseGuide: true,
    })!;
    const prompt = finishDay(recipe, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      lead: { descriptor: 'a woman in her 40s with red hair' },
      figures: 1,
    });
    assert.match(
      prompt,
      /^Explicit solo photo: One woman alone, masturbating\. .+ She is an adult woman in her forties, with a mature adult face and body\. Moment:/
    );
  });

  it('Day · Suggestive recipe (clothed heat)', () => {
    const recipe = buildRapidSuggestiveRecipe({
      beat: 'stretching in thin sleepwear by the window',
      outfit: 'a red satin slip dress',
      faceOnly: true,
    })!;
    const prompt = finishDay(
      recipe,
      { playedMood: 'suggestive', leadNoun: 'woman', figures: 1 },
      false
    );
    assert.match(prompt, /She is an adult woman in her thirties, with a mature adult face and body\. Moment:/);
  });

  it('Day · Everyday / Vacation / Sport stills carry none', () => {
    for (const playedMood of ['everyday', 'vacation', 'sport']) {
      const prompt = finishDay('Day photo: She waters the plants. Moment: morning.', {
        playedMood,
        leadNoun: 'woman',
        figures: 1,
      }, false);
      assert.equal(hasAdultAgeLine(prompt), false, playedMood);
    }
  });

  it('Day · Edit 2511 long brief: the second line, youth words out', () => {
    const brief = [
      'Edit Image 1: SCENE: she is in the bedroom — show that place around her.',
      'POSE LOCK: a petite girl lies back on the bed, nude.',
      'IDENTITY: keep the face from Image 1.',
    ].join('\n');
    const prompt = finishDay(brief, { playedMood: 'raunchy', leadNoun: 'woman', figures: 1 });
    assert.equal(
      prompt.split('\n').slice(0, 3).join('\n'),
      [
        'Edit Image 1: SCENE: she is in the bedroom — show that place around her.',
        'She is an adult woman in her thirties, with a mature adult face and body.',
        'POSE LOCK: a slim woman lies back on the bed, nude.',
      ].join('\n')
    );
  });

  it('Qwen-Image 2.1 · the conversion keeps the sentence', () => {
    const prompt = finishDay(buildRapidDuoRecipe({ beat: 'missionary on the bed' })!, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      figures: 2,
    });
    const converted = toQwenImage21Prompt(prompt);
    assert.ok(hasAdultAgeLine(converted));
    assert.match(converted, /Keep her face from the <image1>\./);
  });

  it('Rapid / Lightning (CFG 1) · the sentence stays, no youth negative', () => {
    const positive = finishDay(buildRapidDuoRecipe({ beat: 'missionary on the bed' })!, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      figures: 2,
    });
    for (const model of ['qwen-rapid-aio-edit-nsfw', 'qwen-image-edit-2511-lightning-8']) {
      const steered = applyQueuePromptSteering({
        positive,
        negative: 'blurry',
        model,
        realismMode: 'off' as never,
        anatomyMode: 'off' as never,
        tool: 'day',
      });
      assert.ok(hasAdultAgeLine(steered.positive), model);
      assert.doesNotMatch(steered.negative ?? '', /schoolgirl/, model);
    }
  });

  it('Klein Base / SDXL (CFG > 1) · the youth terms join the negative', () => {
    for (const model of ['flux-2-klein-9b', 'sdxl']) {
      const steered = applyQueuePromptSteering({
        positive: 'A woman and a man, nude in bed, kissing. Warm lamp light.',
        negative: 'blurry',
        model,
        realismMode: 'off' as never,
        anatomyMode: 'off' as never,
        tool: 'image-prompt',
      });
      assert.ok(hasAdultAgeLine(steered.positive), model);
      for (const term of ADULT_YOUTH_NEGATIVE.split(', ')) {
        assert.ok(steered.negative?.includes(term), `${model}: ${term}`);
      }
    }
  });

  it('Story · Rapid duo recipe on an explicit story', () => {
    const recipe = buildStoryRapidDuoRecipe({
      model: 'qwen-rapid-aio-edit-nsfw',
      blurb: 'reverse cowgirl on the couch, partner lying back',
      omitGarment: true,
      hasGarmentImage: false,
      hasPoseGuide: true,
    })!;
    const prompt = withStoryAdultAges(recipe, {
      content: 'explicit',
      manLead: false,
      leadAgeBand: 'late-20s',
    });
    assert.match(
      prompt,
      /his face is behind her shoulder and his hands on her hips\. Both are adults — one in her late twenties, the other in their thirties — with mature adult faces and bodies\. Moment:/
    );
  });

  it('Story · a long still prompt: youth words from the bible out, the sentence in', () => {
    const prompt = withStoryAdultAges(
      'Mia, a petite college girl with pigtails, straddles him on the dorm bed, both naked.\nPOSE: straddle.\nImage 1 is her face.',
      { content: 'raunchy', manLead: false, people: 2 }
    );
    assert.equal(
      prompt,
      'Mia, a slim college woman with low braids, straddles him on the dorm bed, both naked.\nBoth are adults in their thirties, with mature adult faces and bodies.\nPOSE: straddle.\nImage 1 is her face.'
    );
  });

  it('Story · clean and PG-13 stories are left as written', () => {
    const text = 'Mia waves from the pier. Sunset.';
    assert.equal(withStoryAdultAges(text, { content: 'clean', manLead: false }), text);
    assert.equal(withStoryAdultAges(text, { content: 'pg13', manLead: false }), text);
  });

  it('WAN clip from an explicit still · the still\'s own ages', () => {
    const still = finishDay(buildRapidDuoRecipe({ beat: 'reverse cowgirl on the couch' })!, {
      playedMood: 'intimate',
      leadNoun: 'woman',
      lead: { ageBand: '40s' },
      partner: THEO,
      figures: 2,
    });
    const clip = buildIntimateClipPrompt('reverse cowgirl on the couch', 4, {
      ageLine: still.match(/Both are adults[^.]*\./)?.[0],
    });
    assert.match(
      clip,
      /^4s clip, one continuous shot\. Scene: reverse cowgirl on the couch\. Both are adults in their forties, with mature adult faces and bodies\. Motion:/
    );
    // No still sentence to reuse: the mature default.
    assert.match(
      buildIntimateClipPrompt('solo masturbation on the bed, alone'),
      /Scene: .+\. She is an adult woman in her thirties, with a mature adult face and body\. Motion:/
    );
  });
});
