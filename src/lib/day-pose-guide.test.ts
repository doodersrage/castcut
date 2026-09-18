import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countPoseGuidePeople,
  dayPoseGuideSize,
  drawDayPoseGuide,
  intimateLeadPrefersSecondRole,
  parsePoseGuideIntent,
  resolvePoseGuideKeyFromScene,
  resolveStoryPoseGuideKey,
  resolveStoryPoseGuideKeyFromBeat,
  synthesizeIntimateStickFigures,
  synthesizeSceneStickFigures,
  synthesizeStickSkeleton,
} from './day-pose-guide';

describe('day-pose-guide', () => {
  it('dayPoseGuideSize is portrait for Edit encode', () => {
    const size = dayPoseGuideSize();
    assert.equal(size.width, 512);
    assert.equal(size.height, 768);
  });

  it('resolveStoryPoseGuideKey cycles four stances', () => {
    assert.equal(resolveStoryPoseGuideKey(0), 'morning');
    assert.equal(resolveStoryPoseGuideKey(1), 'afternoon');
    assert.equal(resolveStoryPoseGuideKey(2), 'evening');
    assert.equal(resolveStoryPoseGuideKey(3), 'night');
    assert.equal(resolveStoryPoseGuideKey(4), 'morning');
  });

  it('resolvePoseGuideKeyFromScene maps stance words from the beat', () => {
    assert.equal(resolvePoseGuideKeyFromScene('She sits on the couch and waits.'), 'evening');
    assert.equal(resolvePoseGuideKeyFromScene('Mid-stride down the alley'), 'afternoon');
    assert.equal(resolvePoseGuideKeyFromScene('Reaching for the mug on the shelf'), 'morning');
    assert.equal(resolvePoseGuideKeyFromScene('Standing in the doorway at night'), 'night');
    assert.equal(resolvePoseGuideKeyFromScene('sit while waiting by the window'), 'evening');
    assert.equal(resolvePoseGuideKeyFromScene('a quiet tableau', 2), 'evening');
  });

  it('resolveStoryPoseGuideKeyFromBeat prefers title/blurb over index', () => {
    assert.equal(
      resolveStoryPoseGuideKeyFromBeat({
        title: 'Couch talk',
        blurb: 'They sit knee-to-knee and whisper.',
        storyIndex: 1,
      }),
      'evening'
    );
    assert.equal(
      resolveStoryPoseGuideKeyFromBeat({
        title: 'Fog',
        blurb: 'Nothing moves.',
        storyIndex: 1,
      }),
      'afternoon'
    );
  });

  it('countPoseGuidePeople detects duo and crowd cues', () => {
    assert.equal(countPoseGuidePeople('Alone on the pier.'), 1);
    assert.equal(countPoseGuidePeople('They sit knee-to-knee and whisper.'), 2);
    assert.equal(countPoseGuidePeople('A hug with a stranger in the rain.'), 2);
    assert.equal(countPoseGuidePeople('Argue with each other under neon.'), 2);
    assert.equal(countPoseGuidePeople('Lost among the crowd at the market.'), 3);
    assert.equal(countPoseGuidePeople('A messy threesome in the loft.'), 3);
    assert.equal(countPoseGuidePeople('They fuck against the wall.'), 2);
  });

  it('parseIntimateLayout maps sex-scene stances', async () => {
    const { parseIntimateLayout, synthesizeIntimateStickFigures, parsePoseGuideIntent } =
      await import('./day-pose-guide');
    assert.equal(parseIntimateLayout('Missionary under the sheets.'), 'missionary');
    assert.equal(parseIntimateLayout('Mating press, legs over shoulders.'), 'mating_press');
    assert.equal(parseIntimateLayout('Cowgirl, riding him hard.'), 'straddle');
    assert.equal(parseIntimateLayout('Reverse cowgirl facing away.'), 'reverse_straddle');
    assert.equal(parseIntimateLayout('Bent over the desk from behind.'), 'bent');
    assert.equal(
      parseIntimateLayout(
        "She's curled over a stack of ledgers in the dim archive room as he fucks her from behind."
      ),
      'bent'
    );
    assert.equal(parseIntimateLayout('Prone bone, face-down sex.'), 'prone');
    assert.equal(parseIntimateLayout('Spooning in the dark.'), 'spoon');
    assert.equal(parseIntimateLayout('Scissoring on the floor.'), 'scissors');
    assert.equal(parseIntimateLayout('Fucking against the wall.'), 'wall');
    assert.equal(
      parseIntimateLayout(
        'She leans against the mirrored elevator wall as he presses her back, tongue on her collarbone, hand cups her throat.'
      ),
      'wall'
    );
    assert.equal(parseIntimateLayout('Rear wall press in a glass elevator with city neon.'), 'wall');
    assert.equal(
      parseIntimateLayout(
        "She hangs suspended in the ballroom's shadowed alcove as he lowers her into a velvet chaise, thumb on her clit."
      ),
      'lift'
    );
    const chaiseFigs = synthesizeIntimateStickFigures(
      parsePoseGuideIntent(
        "She hangs suspended in the ballroom's shadowed alcove as he lowers her into a velvet chaise, thumb on her clit.",
        0
      )
    );
    assert.equal(chaiseFigs.length, 2);
    // Dangling legs (ankles below pelvis) — not wrapped cowgirl knees above the hips.
    assert.ok(chaiseFigs[0]!.lAnkle.y > chaiseFigs[0]!.pelvis.y + 0.2);
    assert.equal(parseIntimateLayout('Standing sex in the shower.'), 'standing');
    assert.equal(parseIntimateLayout('Lifted up while fucking.'), 'lift');
    assert.equal(parseIntimateLayout('On their knees for oral.'), 'oral');
    assert.equal(
      parseIntimateLayout(
        "She's kneeling on a lacquered piano bench, barefoot and back bent as he kneels beside her—his tongue laps at her inner thigh while his fingers curl around her clit."
      ),
      'oral'
    );
    const pianoOral = parsePoseGuideIntent(
      "She's kneeling on a lacquered piano bench as he kneels beside her, tongue on her thigh, fingers on her clit.",
      0
    );
    assert.equal(pianoOral.intimate, 'oral');
    const pianoFigures = synthesizeIntimateStickFigures(pianoOral);
    assert.equal(pianoFigures.length, 2);
    // Receiver (first) sits higher on the bench; giver's head is lower toward the pelvis.
    assert.ok(
      pianoFigures[0]!.pelvis.y < pianoFigures[1]!.pelvis.y,
      'piano-bench receiver pelvis stays above giver'
    );
    assert.ok(
      pianoFigures[1]!.head.y > pianoFigures[0]!.pelvis.y - 0.12,
      'giver head stays near receiver pelvis for oral'
    );
    assert.equal(
      countPoseGuidePeople(
        "She's kneeling on a lacquered piano bench as he kneels beside her, tongue on her thigh, fingers on her clit."
      ),
      2
    );
    assert.equal(parseIntimateLayout('Sixty-nine on the bed.'), 'sixty_nine');
    assert.equal(parseIntimateLayout('Facesitting in the loft.'), 'facesit');
    assert.equal(parseIntimateLayout('Sitting on his lap, lotus position.'), 'lap');
    assert.equal(parseIntimateLayout('Kneeling naked and intimate.'), 'kneeling');
    assert.equal(parseIntimateLayout('Afterglow in tangled sheets.'), 'afterglow');
    assert.equal(parseIntimateLayout('Half-undressed, skin and erotic heat.'), 'undress');
    assert.equal(parseIntimateLayout('Solo masturbation, naked pleasure.'), 'solo');
    assert.equal(parseIntimateLayout('They make love in the loft.'), 'generic');

    const missionary = parsePoseGuideIntent('Pinned underneath in missionary.', 0);
    assert.equal(missionary.intimate, 'missionary');
    assert.equal(missionary.people, 2);
    const figures = synthesizeIntimateStickFigures(missionary);
    assert.equal(figures.length, 2);
    assert.ok(figures[0]!.pelvis.y > figures[1]!.pelvis.y);
    assert.ok(
      Math.hypot(
        figures[0]!.head.x - figures[1]!.head.x,
        figures[0]!.head.y - figures[1]!.head.y
      ) >= 0.12,
      'intimate heads stay separated enough to resist merges'
    );

    assert.equal(
      intimateLeadPrefersSecondRole('She goes down on him, licking his cock.', 'oral'),
      true
    );
    assert.equal(
      intimateLeadPrefersSecondRole('He goes down on her, tongue on her clit.', 'oral'),
      false
    );
    assert.equal(
      intimateLeadPrefersSecondRole('She takes him from behind, doggy style.', 'bent'),
      true
    );
    const sheGives = parsePoseGuideIntent(
      'She goes down on him, kneeling and licking his cock.',
      0
    );
    assert.equal(sheGives.intimate, 'oral');
    const sheGivesFigs = synthesizeIntimateStickFigures(sheGives);
    const defaultOral = synthesizeIntimateStickFigures(
      parsePoseGuideIntent('He goes down on her, tongue on her clit.', 0)
    );
    // Lead (index 0) should sit on the giver side when she gives oral.
    assert.notEqual(
      sheGivesFigs[0]!.pelvis.x.toFixed(3),
      defaultOral[0]!.pelvis.x.toFixed(3)
    );

    const wall = parsePoseGuideIntent('Pinned against the wall mid-fuck.', 0);
    assert.equal(wall.intimate, 'wall');
    const wallFigs = synthesizeIntimateStickFigures(wall);
    assert.equal(wallFigs.length, 2);
    // Full standing height — ankles near the floor, not a kneel.
    assert.ok(wallFigs[0]!.lAnkle.y > 0.85 && wallFigs[1]!.lAnkle.y > 0.85);
    assert.ok(wallFigs[0]!.head.y < 0.2);
    // Partner head sits lower toward collarbone, not face-aligned for a kiss.
    assert.ok(wallFigs[1]!.head.y > wallFigs[0]!.head.y + 0.05);
    assert.ok(wallFigs[1]!.head.y < 0.3);
    // Lead hands on the glass ahead — not raised beside her head (kiss/hug bait).
    assert.ok(wallFigs[0]!.lWrist.y > wallFigs[0]!.head.y + 0.15);
    assert.ok(wallFigs[0]!.rWrist.y > wallFigs[0]!.head.y + 0.15);
    // Partner stays to the right / behind the lead (not face-to-face collapse).
    assert.ok(wallFigs[1]!.pelvis.x - wallFigs[0]!.pelvis.x > 0.1);
    // Lead stays against the left wall (not center-cab / handrail composition).
    assert.ok(wallFigs[0]!.pelvis.x < 0.35);
    // Partner contact wrists: one near lead neck (throat), one below pelvis (front crotch).
    assert.ok(Math.abs(wallFigs[1]!.rWrist.y - wallFigs[0]!.neck.y) < 0.08);
    assert.ok(wallFigs[1]!.lWrist.y > wallFigs[0]!.pelvis.y + 0.05);

    const solo = parsePoseGuideIntent('Alone masturbating, erotic climax.', 0);
    assert.equal(solo.intimate, 'solo');
    assert.equal(solo.people, 1);
    assert.equal(synthesizeIntimateStickFigures(solo).length, 1);

    const trio = parsePoseGuideIntent('A messy threesome on the bed.', 0);
    assert.equal(trio.people, 3);
    assert.equal(synthesizeIntimateStickFigures(trio).length, 3);

    // Every named layout synthesizes without throwing.
    const layouts = [
      'missionary',
      'mating_press',
      'straddle',
      'reverse_straddle',
      'bent',
      'prone',
      'spoon',
      'scissors',
      'standing',
      'wall',
      'lift',
      'oral',
      'sixty_nine',
      'facesit',
      'kneeling',
      'lap',
      'afterglow',
      'undress',
      'solo',
      'generic',
    ] as const;
    for (const intimate of layouts) {
      const drawn = synthesizeIntimateStickFigures({
        base: 'stand',
        armLeft: 'hold',
        armRight: 'hold',
        lean: 0,
        stride: 0.3,
        seed: 42,
        people: intimate === 'solo' ? 1 : 2,
        intimate,
        label: intimate,
      });
      assert.ok(drawn.length >= 1, intimate);
      assert.ok(drawn.every(fig => Number.isFinite(fig.pelvis.x)), intimate);
    }
  });

  it('parsePoseGuideIntent + synthesizeStickSkeleton builds unique stances', () => {
    const sit = parsePoseGuideIntent('They sit on the couch and whisper.', 0);
    assert.equal(sit.base, 'sit');
    const walk = parsePoseGuideIntent('Mid-stride down a rainy alley.', 0);
    assert.equal(walk.base, 'walk');
    const run = parsePoseGuideIntent('She sprints across the plaza.', 0);
    assert.equal(run.base, 'run');
    const lie = parsePoseGuideIntent('Sprawled on the floor after the fall.', 0);
    assert.equal(lie.base, 'lie');

    const a = synthesizeStickSkeleton(sit);
    const b = synthesizeStickSkeleton(sit);
    assert.deepEqual(a, b, 'same intent redraws the same skeleton');

    const walkA = synthesizeStickSkeleton(walk);
    const walkOther = synthesizeStickSkeleton(
      parsePoseGuideIntent('Walking through the market stalls.', 0)
    );
    assert.notDeepEqual(
      walkA.lAnkle,
      walkOther.lAnkle,
      'different scene text yields a different generated stance'
    );
    assert.ok(a.pelvis.y > walkA.pelvis.y, 'sit pelvis is lower than walk');
  });

  it('synthesizeSceneStickFigures lays out multi-person poses', () => {
    const solo = synthesizeSceneStickFigures('Standing alone in the doorway.', 0);
    assert.equal(solo.figures.length, 1);

    const duo = synthesizeSceneStickFigures('Face to face, talking to each other.', 0);
    assert.equal(duo.figures.length, 2);
    assert.ok(duo.figures[0]!.pelvis.x < duo.figures[1]!.pelvis.x);

    const crowd = synthesizeSceneStickFigures('Lost among the crowd at dusk.', 0);
    assert.equal(crowd.figures.length, 3);
  });

  it('parseSocialLayout maps hug/dance/fight/climb/phone/look-back', async () => {
    const { parseSocialLayout, synthesizeSocialStickFigures, parsePoseGuideIntent } =
      await import('./day-pose-guide');
    assert.equal(parseSocialLayout('They hug in the rain.'), 'hug');
    assert.equal(parseSocialLayout('A slow dance under neon.'), 'dance');
    assert.equal(parseSocialLayout('They waltz across the ballroom.'), 'dance');
    // Intimate chaise/alcove copy mentioning "ballroom" must not become a dance wireframe.
    assert.equal(
      parseSocialLayout(
        "She hangs suspended in the ballroom's shadowed alcove as he lowers her into a velvet chaise."
      ),
      null
    );
    assert.equal(parsePoseGuideIntent(
      "She hangs suspended in the ballroom's shadowed alcove as he lowers her into a velvet chaise, thumb on her clit.",
      0
    ).intimate, 'lift');
    assert.equal(parseSocialLayout('Sparring in the alley.'), 'fight');
    assert.equal(parseSocialLayout('Climbing the fire escape.'), 'climb');
    assert.equal(parseSocialLayout('Looking at a phone on the stoop.'), 'phone');
    assert.equal(parseSocialLayout('Looks back over the shoulder.'), 'look_back');
    assert.equal(parseSocialLayout('Standing in the doorway.'), null);

    const hug = parsePoseGuideIntent('They embrace each other tightly.', 0);
    assert.equal(hug.social, 'hug');
    assert.equal(hug.people, 2);
    const hugFigs = synthesizeSocialStickFigures(hug);
    assert.equal(hugFigs.length, 2);
    assert.ok(Math.abs(hugFigs[0]!.pelvis.x - hugFigs[1]!.pelvis.x) < 0.2);

    const climb = parsePoseGuideIntent('Climbing the ladder alone.', 0);
    assert.equal(climb.social, 'climb');
    assert.equal(climb.people, 1);
    assert.equal(synthesizeSocialStickFigures(climb).length, 1);

    const phone = parsePoseGuideIntent('Checks a phone while waiting.', 0);
    assert.equal(phone.social, 'phone');
    assert.equal(synthesizeSceneStickFigures('Checks a phone while waiting.', 0).intent.social, 'phone');

    const dance = synthesizeSceneStickFigures('Dancing together at the party.', 0);
    assert.equal(dance.intent.social, 'dance');
    assert.equal(dance.figures.length, 2);

    const fight = synthesizeSceneStickFigures('They fight in the courtyard.', 0);
    assert.equal(fight.intent.social, 'fight');
    assert.equal(fight.figures.length, 2);
    assert.ok(
      Math.abs(fight.figures[0]!.pelvis.x - fight.figures[1]!.pelvis.x) >
        Math.abs(hugFigs[0]!.pelvis.x - hugFigs[1]!.pelvis.x)
    );

    for (const social of ['hug', 'dance', 'fight', 'climb', 'phone', 'look_back'] as const) {
      const drawn = synthesizeSocialStickFigures({
        base: 'stand',
        armLeft: 'hold',
        armRight: 'hold',
        lean: 0,
        stride: 0.3,
        seed: 7,
        people: social === 'climb' || social === 'phone' || social === 'look_back' ? 1 : 2,
        social,
        label: social,
      });
      assert.ok(drawn.length >= 1, social);
      assert.ok(drawn.every(fig => Number.isFinite(fig.pelvis.x)), social);
    }
  });

  it('drawDayPoseGuide paints each Day slot without throwing', () => {
    const ops: string[] = [];
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineCap: '',
      lineJoin: '',
      fillRect: (...args: unknown[]) => {
        ops.push(`fillRect:${args.join(',')}`);
      },
      beginPath: () => {
        ops.push('beginPath');
      },
      arc: () => {
        ops.push('arc');
      },
      moveTo: () => {
        ops.push('moveTo');
      },
      lineTo: () => {
        ops.push('lineTo');
      },
      stroke: () => {
        ops.push('stroke');
      },
      fill: () => {
        ops.push('fill');
      },
    } as unknown as CanvasRenderingContext2D;

    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      ops.length = 0;
      drawDayPoseGuide(ctx, slotId);
      assert.ok(ops.some(op => op.startsWith('fillRect')));
      assert.ok(ops.includes('arc'));
      assert.ok(ops.includes('fill'), 'mannequin head/hand blobs use fill');
      assert.ok(ops.filter(op => op === 'stroke').length > 5);
    }
  });
});
