import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_SLOT_RAUNCHY_BEAT_PRESETS,
  dayHeatPoseClass,
  daySlotsForLength,
  diversifyDaySlotScenes,
  isDayIntimateSoloBeat,
  isDayRaunchySoloBeat,
} from './day-planner';
import { parseIntimateLayout, synthesizeSceneStickFigures } from './day-pose-guide';

const ALL = [
  ...Object.values(DAY_SLOT_INTIMATE_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS).flat(),
  ...Object.values(DAY_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
  ...Object.values(DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
];
const isSolo = (beat: string) => isDayIntimateSoloBeat(beat) || isDayRaunchySoloBeat(beat);

describe('adult Day poses', () => {
  it('draws every partner beat as a real two-person layout and every solo beat as one body', () => {
    for (const beat of ALL) {
      const layout = parseIntimateLayout(beat);
      if (isSolo(beat)) {
        const { figures } = synthesizeSceneStickFigures(beat, 0, { forcePeople: 1 });
        assert.equal(figures.length, 1, beat);
      } else {
        assert.ok(layout && layout !== 'generic' && layout !== 'solo', `${layout}: ${beat}`);
        const { figures } = synthesizeSceneStickFigures(beat, 0, { forcePeople: 2 });
        assert.equal(figures.length, 2, beat);
      }
    }
  });

  it('covers a wide range of partner layouts, not just bent-over / wall / missionary', () => {
    const layouts = new Set(ALL.filter(beat => !isSolo(beat)).map(beat => parseIntimateLayout(beat)));
    for (const expected of ['oral', 'lap', 'prone', 'lift', 'sixty_nine', 'scissors', 'kneeling']) {
      assert.ok(layouts.has(expected as never), `missing ${expected}`);
    }
    assert.ok(layouts.size >= 12, `${layouts.size} layouts`);
  });

  it('spreads a Suggested adult Day across different layouts', () => {
    for (const length of [4, 8] as const) {
      const { slots } = diversifyDaySlotScenes(daySlotsForLength(length), {
        forceBeats: true,
        forceLocations: true,
        dayMood: 'intimate',
        intimateMix: 'duo',
        random: () => 0.42,
      });
      const classes = slots.map(slot => dayHeatPoseClass(slot.sceneHints ?? '', 'intimate'));
      assert.equal(new Set(classes).size, classes.length, `${length}: ${classes.join(', ')}`);
    }
  });

  it('puts the Cast on the lap unless he is the one sitting on hers', () => {
    const own = synthesizeSceneStickFigures('sitting on his lap facing him mid-sex', 0, {
      forcePeople: 2,
    });
    assert.ok(own.figures[0]!.pelvis.y < own.figures[1]!.pelvis.y);
    const swapped = synthesizeSceneStickFigures('he sits on her lap on the chair mid-sex', 0, {
      forcePeople: 2,
    });
    assert.ok(swapped.figures[0]!.pelvis.y > swapped.figures[1]!.pelvis.y);
  });
});

describe('negated locks do not steer adult Day poses', () => {
  it('keeps each duo beat on its own layout through the planner\'s "never solo" suffix', async () => {
    const { planDaySlotPose } = await import('./day-slot-pose');
    const { resolveSceneGuidePlan } = await import('./day-pose-guide');
    const cases: Array<[string, string]> = [
      ['oral sex on her at the edge of the bed, partner kneeling between her thighs — both adults fully visible', 'oral'],
      ['lifted onto a partner mid-sex, legs wrapped around his waist — both adults fully visible', 'lift'],
      ['lying face-down across the bed mid-sex with a partner stretched along her back', 'prone'],
      ['on hands and knees on the kitchen counter mid-sex with a partner', 'bent'],
    ];
    for (const [beat, layout] of cases) {
      const plan = planDaySlotPose({
        slot: { id: 'morning', sceneHints: beat, location: 'hotel' } as never,
        dayMood: 'raunchy',
        intimateMix: 'duo',
        allowCompanions: true,
      });
      const { intent } = resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true });
      assert.equal(intent.intimate, layout, beat);
    }
  });

  it('does not call a partner beat solo because it says "never Cast alone"', () => {
    assert.equal(
      isDayIntimateSoloBeat('partner mid-sex against the counter — Cast and partner both fully visible, never Cast alone'),
      false
    );
    assert.equal(isDayIntimateSoloBeat('alone on her back touching herself, never invent a partner'), true);
  });

  it('does not add the glass-elevator line for a negated "neon"', async () => {
    const { reinforceIntimateStillPrompt } = await import('./intimate-prompt-clarify');
    const prompt = reinforceIntimateStillPrompt(
      'Two adults mid-sex on the bed, both fully nude. LIGHTING: natural lamp light only — never cyan or magenta neon gels.'
    );
    assert.doesNotMatch(prompt, /glass elevator doors/);
  });
});


describe('DUO ACT boilerplate does not pick the pose cue', () => {
  const duoWallPrompt = [
    'MOOD: intimate duo sex still — follow the beat sex/stance exactly.',
    'POSE LOCK: STANDING WALL PRESS — both adults STANDING upright mid-sex with Casts back flat against a solid bedroom WALL.',
    'DUO ACT: both adults mid-sex as the beat says (missionary, doggy, oral, cowgirl, wall sex) — partner body fully visible touching Cast; never Cast alone masturbating.',
    'PARTNERS: Exactly TWO adults — Cast FACE from Image 1 only on the leftmost Image 3 skeleton.',
    'Image 3 is an OpenPose keypoint skeleton map (pose control only, not part of the picture).',
    'beat: against the bedroom wall mid-sex, night city glow',
  ].join('\n');

  it('adds no missionary cue or ORAL clause to a wall beat', async () => {
    const { reinforceIntimateStillPrompt } = await import('./intimate-prompt-clarify');
    const prompt = reinforceIntimateStillPrompt(duoWallPrompt);
    assert.doesNotMatch(prompt, /^missionary position\./);
    assert.doesNotMatch(prompt, /ORAL: giver mouth/);
  });

  it('still cues the beat pose and oral when the beat names them', async () => {
    const { reinforceIntimateStillPrompt } = await import('./intimate-prompt-clarify');
    const sixtyNine = reinforceIntimateStillPrompt(
      duoWallPrompt.replace(/^POSE LOCK:.*\n/m, '').replace(/^beat:.*$/m, 'beat: sixty-nine on the couch in afternoon light')
    );
    assert.match(sixtyNine, /^sixty-nine\./);
    assert.match(sixtyNine, /ORAL: giver mouth/);
  });

  it('keeps "bent over the sink" a standing bend, not hands and knees', async () => {
    const { clarifyIntimateImageLanguage } = await import('./intimate-prompt-clarify');
    const text = clarifyIntimateImageLanguage('bent over the bathroom sink mid-sex with a partner behind');
    assert.match(text, /bent over the bathroom sink/);
  });

  it('does not stack the Story "sex." cue on each reinforce pass', async () => {
    const { reinforceIntimateStillPrompt } = await import('./intimate-prompt-clarify');
    const once = reinforceIntimateStillPrompt('Lana having quick standing sex with a distinct adult partner.');
    assert.equal(reinforceIntimateStillPrompt(reinforceIntimateStillPrompt(once)).match(/\bsex\. /g)?.length, 1);
  });

  it('gives a Rapid duo wall still the wall pack — no solo self-touch, doggy or bed foreground', async () => {
    const { applyQueuePromptSteering } = await import('./queue-prompt-prep');
    const { positive } = applyQueuePromptSteering({
      positive: duoWallPrompt,
      model: 'qwen-rapid-aio-edit-nsfw',
      realismMode: 'off' as never,
      anatomyMode: 'off' as never,
      tool: 'day',
    });
    assert.doesNotMatch(positive, /mid-self-touch|one woman alone never invent a man/);
    assert.doesNotMatch(positive, /doggy rear-entry Cast bent/);
    assert.doesNotMatch(positive, /bare bed surface/);
    assert.match(positive, /standing wall press both adults standing upright/);
  });
});

describe('off-bed duo beats', () => {
  it('drops the bed wording only when the beat happens off the bed', async () => {
    const { intimateBeatIsOffBed } = await import('./intimate-prompt-clarify');
    assert.equal(intimateBeatIsOffBed('against the bedroom wall mid-sex, night city glow'), true);
    assert.equal(intimateBeatIsOffBed('sixty-nine on the couch in afternoon light'), true);
    assert.equal(intimateBeatIsOffBed('reverse cowgirl on the hotel armchair'), true);
    assert.equal(intimateBeatIsOffBed('missionary under warm lamp light through the blinds'), false);
    assert.equal(intimateBeatIsOffBed('doggy on the bed, knees on the sheets by the wall'), false);
    assert.equal(intimateBeatIsOffBed('on her back mid-sex, never against the wall'), false);
  });
});
