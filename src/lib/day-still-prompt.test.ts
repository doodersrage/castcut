import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleDayStillPrompt,
  finishDayStillPrompt,
  queuedDayStillPrompt,
  type DayStillPromptFacts,
} from './day-still-prompt';
import { auditStillPrompt } from './still-prompt-audit';
import { buildCompactDayDuoRecipe, buildRapidSuggestiveDuoRecipe } from './rapid-duo-recipe';
import { dayDuoPoseWords } from './pose-coaching';

const RECIPE =
  'Edit Image 1: Day photo: One woman alone. She dances. She wears the outfit from the second image. Moment: dancing under club lights. Place: nightclub dance floor. Keep her face from the first image. Match her body to the third image (pose map).';

const facts = (over: Partial<DayStillPromptFacts> = {}): DayStillPromptFacts => ({
  slotPrompt: RECIPE,
  beat: 'dancing under club lights',
  setting: 'nightclub dance floor',
  dayMood: 'everyday',
  adult: false,
  leadNoun: 'woman',
  partner: null,
  partnerOutfit: null,
  leadOutfit: null,
  dressedPlateIsClothingImage: false,
  pickedShoes: '',
  footwear: '',
  footwearImage: null,
  pose: { layout: 'dance', poseKey: 'dance:1', figures: 1 },
  cueLayouts: new Set(['dance']),
  kleinFace: false,
  ...over,
});

describe('assembleDayStillPrompt', () => {
  it('a one-person recipe carries a one-person cue, inside the recipe', () => {
    const { prompt, cued, recipe } = assembleDayStillPrompt(facts());
    assert.equal(recipe, true);
    assert.equal(cued, false);
    assert.match(prompt, /Pose: dancing alone/);
    assert.deepEqual(auditStillPrompt(prompt, { people: 1, imageCount: 3 }), []);
  });

  it('the dressed plate as the clothing image is named as a picture of her, with the shoes', () => {
    const { prompt } = assembleDayStillPrompt(
      facts({
        dressedPlateIsClothingImage: true,
        pickedShoes: 'white sneakers',
        footwear: 'white sneakers',
      })
    );
    assert.match(
      prompt,
      /the outfit and the shoes shown in the second image \(the same person, dressed, standing\)/
    );
    assert.match(prompt, /FOOTWEAR \(mandatory\)/);
  });

  it('a lying still does not call the dressed plate standing', () => {
    const lying = facts({
      dressedPlateIsClothingImage: true,
      beat: 'lying on her back on a picnic blanket',
      pose: { layout: 'lie', poseKey: 'lie:1', figures: 1 },
    });
    const { prompt } = assembleDayStillPrompt(lying);
    assert.match(prompt, /the outfit shown in the second image \(the same person, dressed\)/);
    assert.doesNotMatch(prompt, /standing/);
  });

  it('a reroll nudge is appended once, and a pose-miss nudge spells the pose out', () => {
    const brief =
      'Edit instruction for a Day still — evening: she leans on the rail.\nMatch Image 3 silhouette exactly.';
    const { prompt, cued } = assembleDayStillPrompt(
      facts({
        slotPrompt: brief,
        pose: { layout: 'rail', poseKey: 'rail:1', figures: 1 },
        cueLayouts: new Set(),
        qualityNudge: 'pose did not match the guide',
      })
    );
    assert.match(prompt, /QUALITY FIX: pose did not match the guide/);
    assert.equal(typeof cued, 'boolean');
  });

  it('a man lead is swapped at the end, keeping his own description', () => {
    const assembled = assembleDayStillPrompt(facts({ leadNoun: 'man' }));
    assert.equal(assembled.swapLead, true);
    const finished = finishDayStillPrompt(assembled.prompt, {
      adultMood: false,
      adult: false,
      swapLead: assembled.swapLead,
      leadDescriptor: 'a tall man with a grey beard',
    });
    assert.match(finished, /One man alone/);
    assert.doesNotMatch(finished, /\bShe\b/);
  });
});

describe('queuedDayStillPrompt', () => {
  it('with nothing in the second slot the pose map is the second image', () => {
    const brief = 'Keep the Keep/Image 2 outfit. Match Image 3 silhouette exactly.';
    const queued = queuedDayStillPrompt(brief, { second: false, third: true });
    assert.equal(queued.guideIsImage2, true);
    assert.equal(queued.imageCount, 2);
    assert.deepEqual(auditStillPrompt(queued.prompt, { imageCount: queued.imageCount }), []);
    const three = queuedDayStillPrompt(brief, { second: true, third: true });
    assert.equal(three.prompt, brief);
    assert.equal(three.imageCount, 3);
  });
});

describe('a beat the player typed for a man lead', () => {
  it('reaches the prompt as typed, a built-in beat is left to the usual swap', async () => {
    const { buildDaySlotPromptForStill, dayBeatIsTyped } = await import('./day-still-prompt');
    const { resolveDayQueueIdentityPlate } = await import('./day-plate');
    const typed = 'he fixes his bike in the garage, grease on his hands';
    const plate = { filename: 'cast-plate-tomas.png', source: 'cast' as const };
    const character = {
      id: 'char-tomas',
      name: 'Tomas',
      version: 1,
      updatedAt: 1,
      descriptor: 'a man with a short beard',
    };
    const build = (slot: Record<string, unknown>) =>
      buildDaySlotPromptForStill(
        { id: 'morning', label: 'morning', location: 'garage', ...slot } as never,
        {
          plate,
          queuePlate: resolveDayQueueIdentityPlate({ character, displayPlate: plate } as never),
          character,
          hasPlate: true,
          leadNoun: 'man',
          dayMood: 'everyday',
          intimateEnabled: false,
          allowCompanions: false,
          model: 'qwen-image-edit-2511-lightning-8',
          defaultPoseGuideStyle: 'openpose',
        } as never
      );
    assert.equal(dayBeatIsTyped({ sceneHints: typed, sceneHintsTyped: typed }), true);
    assert.equal(dayBeatIsTyped({ sceneHints: 'lying on her side', sceneHintsTyped: typed }), false);
    const prompt = build({ sceneHints: typed, sceneHintsTyped: typed });
    // In the prompt's working voice (swapped back for him at the end).
    assert.match(prompt, /she fixes her bike/);
    const finished = finishDayStillPrompt(prompt, { adultMood: false, adult: false, swapLead: true });
    assert.match(finished, /he fixes his bike in the garage, grease on his hands/);
    assert.doesNotMatch(finished, /she fixes|her bike/);
  });
});

  describe('piggyback and head on a shoulder are placed body by body (live A/B 2026-10-05)', () => {
    const PIGGYBACK = "piggyback ride on a friend's back across the park, both laughing";
    const HEAD = "resting her head on her partner's shoulder on a bench by the river at night";
    const duo = (beat: string, layout: string, over: Partial<DayStillPromptFacts> = {}) =>
      facts({
        slotPrompt: buildRapidSuggestiveDuoRecipe({ beat, poseGuide: 'third' })!,
        beat,
        dayMood: 'suggestive',
        pose: { layout, poseKey: `${layout}:2`, figures: 2 },
        cueLayouts: new Set([layout]),
        ...over,
      });

    it('the couple recipe gets a Pose: sentence after the Moment, and no generic cue line', () => {
      const { prompt, cued } = assembleDayStillPrompt(duo(PIGGYBACK, 'piggyback'));
      assert.equal(cued, true);
      assert.match(
        prompt,
        /Moment: piggyback ride on a friend's back across the park, both laughing\. Pose: piggyback ride: she rides up on his back, her arms around his shoulders from behind and her legs wrapped around his waist; he stands leaning forward, his hands holding her thighs at his hips; both faces toward the camera, seen from the side\./
      );
      assert.doesNotMatch(prompt, /POSE DETAIL|one person carries the other/);
    });

    it('head on a shoulder: her head down on his, his head straight; standing beats stand', () => {
      const seated = assembleDayStillPrompt(duo(HEAD, 'head_shoulder')).prompt;
      assert.match(
        seated,
        /Pose: side by side, she leans her head down onto his shoulder, her cheek resting on his shoulder, eyes closed; he sits upright, head straight, his arm around her\./
      );
      const standing = assembleDayStillPrompt(
        duo('standing at the rail, her head on his shoulder', 'head_shoulder')
      ).prompt;
      assert.match(standing, /he stands upright/);
    });

    it('the long brief keeps its usual cue (the words changed nothing on Rapid’s brief)', () => {
      const brief = (cueLayouts: Set<string>) =>
        assembleDayStillPrompt(
          duo(PIGGYBACK, 'piggyback', {
            slotPrompt: `Edit instruction for a Day still: ${PIGGYBACK}.`,
            cueLayouts,
          })
        );
      assert.doesNotMatch(brief(new Set()).prompt, /POSE DETAIL|rides up on/);
      assert.match(
        brief(new Set(['piggyback'])).prompt,
        /^POSE DETAIL \(as Image 3 shows\): one person carries the other on their back/m
      );
    });

    it('a same-sex partner keeps the name the prompt uses', () => {
      const partner = { name: 'Ana', noun: 'woman' as const };
      const slotPrompt = buildCompactDayDuoRecipe({
        beat: PIGGYBACK,
        poseGuide: 'third',
        partner: { partner, image: 'second' },
      })!;
      const { prompt } = assembleDayStillPrompt(
        duo(PIGGYBACK, 'piggyback', { slotPrompt, partner, dayMood: 'everyday' })
      );
      assert.match(
        prompt,
        /she rides up on her friend’s back, .*; her friend stands leaning forward, hands holding her thighs at the hips;/
      );
    });

    it('a couple recipe written for a man lead names him first', () => {
      const slotPrompt = buildRapidSuggestiveDuoRecipe({
        beat: HEAD,
        poseGuide: 'third',
        lead: 'man',
      })!;
      const { prompt, swapLead } = assembleDayStillPrompt(
        duo(HEAD, 'head_shoulder', { slotPrompt, leadNoun: 'man' })
      );
      assert.equal(swapLead, false);
      assert.match(prompt, /Pose: side by side, he leans his head down onto her shoulder/);
    });

    it('other layouts, one-person stills, adult stills and custom poses are left alone', () => {
      assert.equal(dayDuoPoseWords('hug', { lead: 'she', partner: 'he' }), null);
      const solo = assembleDayStillPrompt(
        duo(PIGGYBACK, 'piggyback', { pose: { layout: 'piggyback', figures: 1 } })
      ).prompt;
      assert.doesNotMatch(solo, /rides up on/);
      assert.doesNotMatch(
        assembleDayStillPrompt(duo(PIGGYBACK, 'piggyback', { adult: true })).prompt,
        /rides up on/
      );
      assert.doesNotMatch(
        assembleDayStillPrompt(duo(PIGGYBACK, 'piggyback', { customPose: 'standing' })).prompt,
        /rides up on/
      );
    });
  });
