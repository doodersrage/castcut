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
import { parseIntimateLayout, synthesizeSceneStickFigures, type StickSkeleton } from './day-pose-guide';

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

describe('adult pose skeletons stay one body', () => {
  const aspect = 512 / 768;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot((a.x - b.x) * aspect, a.y - b.y);

  function assertConnected(fig: StickSkeleton, label: string) {
    const torso = dist(fig.neck, fig.pelvis);
    assert.ok(torso > 0.08, `${label} torso ${torso.toFixed(3)}`);
    const shoulder = {
      x: (fig.lShoulder.x + fig.rShoulder.x) / 2,
      y: (fig.lShoulder.y + fig.rShoulder.y) / 2,
    };
    const hips = { x: (fig.lHip.x + fig.rHip.x) / 2, y: (fig.lHip.y + fig.rHip.y) / 2 };
    assert.ok(dist(fig.neck, shoulder) < torso * 0.75, `${label} neck detached`);
    assert.ok(dist(fig.pelvis, hips) < torso * 0.55, `${label} pelvis detached`);
    for (const [name, a, b] of [
      ['head', fig.head, fig.neck],
      ['l-upper', fig.lShoulder, fig.lElbow],
      ['r-upper', fig.rShoulder, fig.rElbow],
      ['l-fore', fig.lElbow, fig.lWrist],
      ['r-fore', fig.rElbow, fig.rWrist],
      ['l-thigh', fig.lHip, fig.lKnee],
      ['r-thigh', fig.rHip, fig.rKnee],
      ['l-shin', fig.lKnee, fig.lAnkle],
      ['r-shin', fig.rKnee, fig.rAnkle],
    ] as const) {
      const len = dist(a, b);
      assert.ok(len > 0.035, `${label} ${name} collapsed (${len.toFixed(3)})`);
      assert.ok(len < torso * 2.3, `${label} ${name} ${(len / torso).toFixed(2)}× torso`);
    }
  }

  it('draws face-sit, sixty-nine, scissors, lap and mating press as whole bodies', () => {
    const beats = [
      'sitting on his face on the bed — face-sitting a partner, both adults fully visible',
      'sixty-nine on the bed — both adults fully visible',
      'scissoring on the bed in the lamp glow, legs interlocked with a partner — both adults fully visible',
      'sitting on his lap facing him mid-sex — both adults fully visible',
      'mating press on the couch with a partner — both adults fully visible',
    ];
    for (const beat of beats) {
      for (const variant of [0, 1]) {
        const { figures } = synthesizeSceneStickFigures(beat, variant, {
          forcePeople: 2,
          variant,
        });
        assert.equal(figures.length, 2, beat);
        figures.forEach((fig, index) => assertConnected(fig, `${beat} v${variant} p${index}`));
      }
    }
  });

  it('puts each sixty-nine head at the other hips, not at the feet', () => {
    const { figures } = synthesizeSceneStickFigures('sixty-nine on the bed — both adults fully visible', 0, {
      forcePeople: 2,
    });
    const [a, b] = figures;
    assert.ok(a && b);
    const feet = (fig: typeof a) => ({
      x: (fig.lAnkle.x + fig.rAnkle.x) / 2,
      y: (fig.lAnkle.y + fig.rAnkle.y) / 2,
    });
    assert.ok(dist(a.head, b.pelvis) < dist(a.head, feet(b)), 'lead head nearer the partner hips than the feet');
    assert.ok(dist(b.head, a.pelvis) < dist(b.head, feet(a)), 'partner head nearer the lead hips than the feet');
  });

  it('stacks hips on hips, and puts a mouth on the hips when the pose is oral', () => {
    const raw = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const duo = (beat: string) => {
      const { figures } = synthesizeSceneStickFigures(beat, 0, { forcePeople: 2 });
      const [a, b] = figures;
      assert.ok(a && b, beat);
      return [a, b] as const;
    };

    for (const beat of [
      'missionary on the bed with a partner',
      'mating press on the couch with a partner',
      'lying face-down on the bed mid-sex with a partner stretched along her back',
      'spooning sex in bed with a partner behind',
    ]) {
      const [a, b] = duo(beat);
      const gap = raw(a.pelvis, b.pelvis);
      assert.ok(Math.abs(a.pelvis.x - b.pelvis.x) <= 0.06, `${beat} hips slipped along the body`);
      assert.ok(gap >= 0.18 && gap <= 0.24, `${beat} hip gap ${gap.toFixed(3)}`);
      assert.ok(gap < raw(a.head, b.pelvis), `${beat} a head is closer to the hips than the hips are`);
      assert.ok(gap < raw(b.head, a.pelvis), `${beat} a head is closer to the hips than the hips are`);
    }

    for (const beat of [
      'on hands and knees on the bed mid-sex with a partner behind',
      'bent over the kitchen counter mid-sex with a partner behind',
    ]) {
      const [front, rear] = duo(beat);
      assert.ok(Math.abs(rear.pelvis.y - front.pelvis.y) < 0.05, `${beat} rear hips off her hip line`);
      const gap = raw(front.pelvis, rear.pelvis);
      assert.ok(gap >= 0.18 && gap <= 0.24, `${beat} hip gap ${gap.toFixed(3)}`);
    }

    const [lap, seat] = duo('sitting on his lap facing him mid-sex');
    assert.ok(lap.pelvis.y < seat.pelvis.y);
    assert.ok(Math.abs(lap.pelvis.y - seat.pelvis.y) < 0.12, 'sitting on the chest');
    assert.ok(
      raw(lap.pelvis, seat.pelvis) < raw(lap.pelvis, seat.head),
      'lap hips nearer the face than the lap'
    );

    for (const beat of [
      'she kneels on the kitchen floor giving her partner oral sex',
      'a distinct adult partner kneeling for oral sex — head between thighs, nude bodies',
    ]) {
      const oral = duo(beat);
      const giver =
        raw(oral[0].head, oral[1].pelvis) < raw(oral[1].head, oral[0].pelvis) ? oral[0] : oral[1];
      const receiver = giver === oral[0] ? oral[1] : oral[0];
      assert.ok(raw(giver.head, receiver.pelvis) < 0.12, `${beat} mouth off the pelvis`);
      assert.ok(
        raw(giver.head, receiver.pelvis) < raw(giver.head, receiver.head),
        `${beat} mouth closer to the face than the pelvis`
      );
      assert.ok(
        dist(giver.neck, giver.pelvis) > dist(giver.head, giver.neck),
        `${beat} neck longer than the torso`
      );
      for (const [name, a, b] of [
        ['upper arm', giver.lShoulder, giver.lElbow],
        ['forearm', giver.lElbow, giver.lWrist],
        ['upper arm', giver.rShoulder, giver.rElbow],
        ['forearm', giver.rElbow, giver.rWrist],
      ] as const) {
        assert.ok(dist(a, b) > 0.04, `${beat} ${name} collapsed`);
      }
    }

    const [against, press] = duo('against the bedroom wall mid-sex');
    assert.ok(Math.abs(against.pelvis.y - press.pelvis.y) < 0.04, 'wall hips at different heights');
    assert.ok(raw(against.pelvis, press.pelvis) <= 0.22, 'wall hips apart');
  });

  it('keeps the face-sit rider upright over the partner face', () => {
    const { figures } = synthesizeSceneStickFigures(
      'sitting on his face on the bed — face-sitting a partner, both adults fully visible',
      0,
      { forcePeople: 2 }
    );
    const [rider, under] = figures;
    assert.ok(rider && under);
    assert.ok(rider.neck.y < rider.pelvis.y - 0.12, 'rider torso has height');
    assert.ok(under.head.y > rider.pelvis.y, 'partner face is below the rider hips');
    assert.ok(dist(under.head, rider.pelvis) < dist(under.head, rider.head));
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

  it('draws scissors as missionary — the pose the recipe renders (Rapid cannot draw scissoring)', () => {
    const beat = 'scissoring on the bed in the lamp glow, legs interlocked with a partner — both adults fully visible';
    const scissors = synthesizeSceneStickFigures(beat, 0, { forcePeople: 2 }).figures;
    const missionary = synthesizeSceneStickFigures('missionary on the bed with a partner', 0, {
      forcePeople: 2,
    }).figures;
    // Both lying, as missionary draws them (not two seated figures).
    for (const figs of [scissors, missionary]) {
      for (const fig of figs) assert.ok(Math.abs(fig.head.y - fig.pelvis.y) < 0.15, 'lying');
    }
  });
});

