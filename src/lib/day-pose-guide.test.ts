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

  it('parsePoseGuideIntent clothedUprightOnly kills look-back / kneel / intimate duo', () => {
    const lookBack = parsePoseGuideIntent(
      'kneeling on the hotel bed looking back over a shoulder',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(lookBack.intimate, null);
    assert.equal(lookBack.people, 1);
    // Kneel flattens to sit; look-back social may remain if not kneel-primary.
    assert.ok(lookBack.base === 'sit' || lookBack.base === 'lean' || lookBack.base === 'stand');

    const seated = parsePoseGuideIntent('SEATED at a café terrace sipping morning coffee', 0, {
      forcePeople: 1,
      clothedUprightOnly: true,
    });
    assert.equal(seated.intimate, null);
    assert.equal(seated.people, 1);
    assert.ok(
      seated.base === 'sit' || seated.social === 'drink',
      `expected sit/drink, got base=${seated.base} social=${seated.social}`
    );

    const midStride = parsePoseGuideIntent(
      'MID-STRIDE barefoot on wet sand swinging a tote',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(midStride.people, 1);
    assert.ok(
      midStride.base === 'walk' || midStride.social === 'carry',
      `expected walk/carry, got base=${midStride.base} social=${midStride.social}`
    );
    assert.ok(midStride.stride >= 0.7, `mid-stride stride should be wide, got ${midStride.stride}`);
    assert.equal(midStride.social, null, 'MID-STRIDE must not keep look_back/carry social');
    assert.equal(midStride.base, 'walk');
    // Hard mid-stride must stay wide for EVERY seedSalt — dir=-1 used to collapse to stand.
    for (const salt of [0, 1, 2, 3, 4]) {
      const fig = synthesizeStickSkeleton(midStride, { seedSalt: salt });
      const span = Math.abs(fig.lAnkle.x - fig.rAnkle.x);
      assert.ok(span >= 0.55, `MID-STRIDE ankle span must stay wide (salt ${salt}), got ${span}`);
      assert.ok(
        Math.abs(fig.lAnkle.y - fig.rAnkle.y) >= 0.1,
        `MID-STRIDE needs one foot lifted (salt ${salt}), yDiff=${Math.abs(fig.lAnkle.y - fig.rAnkle.y)}`
      );
    }

    const lookDownWalk = synthesizeSceneStickFigures(
      'MID-STRIDE collecting shells in a straw hat — tote on one arm, looking down at wet sand sparkle',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(lookDownWalk.intent.base, 'walk');
    const lookFig = lookDownWalk.figures[0]!;
    assert.ok(
      lookFig.head.y >= 0.16,
      `looking-down mid-stride head should tip forward, got y=${lookFig.head.y}`
    );
    assert.ok(
      Math.abs(lookFig.lAnkle.x - lookFig.rAnkle.x) >= 0.55,
      `looking-down mid-stride still needs wide ankles, got ${Math.abs(lookFig.lAnkle.x - lookFig.rAnkle.x)}`
    );

    const waving = synthesizeSceneStickFigures(
      'WAVING from a water-taxi rail at dusk — one arm high overhead mid-wave',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(waving.intent.social, 'wave');
    assert.equal(waving.figures.length, 1);
    const waveFig = waving.figures[0]!;
    assert.ok(
      Math.min(waveFig.lWrist.y, waveFig.rWrist.y) < 0.08,
      `solo wave needs one wrist overhead, got L=${waveFig.lWrist.y} R=${waveFig.rWrist.y}`
    );
    assert.ok(
      Math.abs(waveFig.lAnkle.x - waveFig.rAnkle.x) >= 0.3,
      `solo wave needs stepped weight, ankle span=${Math.abs(waveFig.lAnkle.x - waveFig.rAnkle.x)}`
    );

    const perched = parsePoseGuideIntent(
      'PERCHED on a pier piling with fishing line idle — sundress, toes above the water',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(perched.base, 'sit');

    const sipping = parsePoseGuideIntent(
      'SEATED at a café terrace sipping morning coffee',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(sipping.base, 'sit', 'SEATED must beat drink→stand social');
    assert.equal(sipping.social, null);

    const halfTurnWalk = parsePoseGuideIntent(
      'MID-STRIDE barefoot on wet sand swinging a tote — sundress hem lifting, half-turned glance toward the boardwalk',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(halfTurnWalk.base, 'walk', 'MID-STRIDE must beat look_back→stand');
    assert.equal(halfTurnWalk.social, null);

    const reaching = parsePoseGuideIntent(
      'REACHING for a volleyball at the net — one arm high',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(reaching.base, 'reach');

    const relaxing = parsePoseGuideIntent(
      'RELAXING on a beach towel with a sunhat over her face — knees drawn up, sunscreen bottle beside her',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(relaxing.base, 'lie', 'RELAXING towel must stay horizontal, not flatten to sit/stand');
    assert.equal(relaxing.social, null);

    const reclining = parsePoseGuideIntent(
      'RECLINING under a striped beach umbrella on a towel — propped on elbows, knees drawn up',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(reclining.base, 'lie', 'RECLINING towel must stay horizontal');

    const caféDeepSit = parsePoseGuideIntent(
      'SEATED at a café terrace sipping morning coffee — hips on the chair, knees bent',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(caféDeepSit.base, 'sit');
    const seatedFig = synthesizeStickSkeleton(caféDeepSit);
    assert.ok(seatedFig.pelvis.y >= 0.68, `SEATED pelvis must be deep sit, got ${seatedFig.pelvis.y}`);

    const dancing = synthesizeSceneStickFigures(
      'DANCING alone on a terrace at blue hour — hips mid-sway, hands trailing her waist',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(dancing.intent.social, 'dance');
    assert.equal(dancing.figures.length, 1);
    const danceSpan = Math.abs(dancing.figures[0]!.lAnkle.x - dancing.figures[0]!.rAnkle.x);
    assert.ok(danceSpan >= 0.35, `solo dance ankle span should be wide, got ${danceSpan}`);
    const danceFig = dancing.figures[0]!;
    assert.ok(
      Math.min(danceFig.lWrist.y, danceFig.rWrist.y) < 0.08,
      `solo dance needs wrists clearly overhead, got L=${danceFig.lWrist.y} R=${danceFig.rWrist.y}`
    );
    assert.ok(
      Math.min(danceFig.lAnkle.y, danceFig.rAnkle.y) <= 0.55,
      `solo dance needs one knee/ankle lifted mid-step, got L=${danceFig.lAnkle.y} R=${danceFig.rAnkle.y}`
    );
    assert.ok(
      Math.min(danceFig.lAnkle.y, danceFig.rAnkle.y) >= 0.45,
      `solo dance lift must stay human (not gravity-defying), got L=${danceFig.lAnkle.y} R=${danceFig.rAnkle.y}`
    );

    const reachJog = synthesizeSceneStickFigures(
      'REACHING for a pier railing mid-lean after a jog — evening wear light layers',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(reachJog.intent.base, 'reach', 'REACHING must not become walk from jog');
    assert.ok(
      Math.min(reachJog.figures[0]!.lWrist.y, reachJog.figures[0]!.rWrist.y) < 0.12,
      'REACHING needs one wrist overhead'
    );

    const kickSurf = synthesizeSceneStickFigures(
      'KICKING through the morning surf — sundress hem wet, arms out for balance',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(kickSurf.intent.social, 'sport_kick');
    const kickFig = kickSurf.figures[0]!;
    assert.ok(
      Math.min(kickFig.lAnkle.y, kickFig.rAnkle.y) <= 0.4,
      `KICKING needs one ankle lifted mid-kick, got L=${kickFig.lAnkle.y} R=${kickFig.rAnkle.y}`
    );

    const jumpPool = synthesizeSceneStickFigures(
      'JUMPING mid-air off the pool ledge — swimsuit, knees tucked',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(jumpPool.intent.base, 'jump');
    assert.ok(
      Math.max(jumpPool.figures[0]!.lAnkle.y, jumpPool.figures[0]!.rAnkle.y) < 0.42,
      'JUMPING ankles must stay clearly mid-air'
    );
    const tossBall = synthesizeSceneStickFigures(
      'TOSSING a beach ball on the sand — sundress or swimsuit, arms raised mid-catch',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(tossBall.intent.social, 'sport_throw');
    const tossFig = tossBall.figures[0]!;
    assert.ok(
      Math.min(tossFig.lWrist.y, tossFig.rWrist.y) < 0.25,
      `TOSSING needs a cocked/high throw wrist, got L=${tossFig.lWrist.y} R=${tossFig.rWrist.y}`
    );

    const stretchPool = synthesizeSceneStickFigures(
      'STRETCHING both arms overhead at the pool ladder — swimsuit on',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(stretchPool.intent.social, 'stretch');
    assert.ok(
      Math.abs(stretchPool.figures[0]!.lAnkle.x - stretchPool.figures[0]!.rAnkle.x) >= 0.35,
      'STRETCHING needs weight-shift ankle span'
    );
  });

  it('parsePoseGuideIntent forcePeople upgrades solo layouts to a duo wireframe', () => {
    const soloBeat = 'solo masturbation on the bed edge under a lamp, erotic climax';
    const solo = parsePoseGuideIntent(soloBeat, 0);
    assert.equal(solo.people, 1);
    assert.equal(solo.intimate, 'solo');

    const forced = parsePoseGuideIntent(soloBeat, 0, {
      forcePeople: 2,
    });
    assert.equal(forced.people, 2);
    assert.equal(forced.intimate, 'missionary');
    assert.equal(synthesizeSceneStickFigures('alone on the bed', 0, { forcePeople: 2 }).figures.length, 2);
  });

  it('countPoseGuidePeople detects duo and crowd cues', () => {
    assert.equal(countPoseGuidePeople('Alone on the pier.'), 1);
    assert.equal(countPoseGuidePeople('They sit knee-to-knee and whisper.'), 2);
    assert.equal(countPoseGuidePeople('A hug with a stranger in the rain.'), 2);
    assert.equal(countPoseGuidePeople('Argue with each other under neon.'), 2);
    assert.equal(countPoseGuidePeople('Lost among the crowd at the market.'), 3);
    assert.equal(countPoseGuidePeople('A messy threesome in the loft.'), 3);
    assert.equal(countPoseGuidePeople('They fuck against the wall.'), 2);
    assert.equal(countPoseGuidePeople('straddling a partner on a kitchen chair'), 2);
    assert.equal(
      countPoseGuidePeople('undressing in the bedroom doorway before pulling a partner close'),
      2
    );
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
    const cabinetBlurb =
      "She's slumped sideways in the steel cabinet's open drawer, thighs parted as he thrusts from behind—his hand grips her waist while the other sinks deep into her vagina.";
    assert.equal(parseIntimateLayout(cabinetBlurb), 'bent');
    const cabinetIntent = parsePoseGuideIntent(cabinetBlurb, 0);
    assert.equal(cabinetIntent.intimate, 'bent');
    assert.equal(cabinetIntent.people, 2);
    const cabinetFigs = synthesizeIntimateStickFigures(cabinetIntent);
    assert.equal(cabinetFigs.length, 2);
    // Lead slumped lower than a standing desk lean; partner head stays clearly separated.
    assert.ok(cabinetFigs[0]!.pelvis.y > 0.5, 'cabinet lead pelvis stays at drawer height');
    assert.ok(
      Math.hypot(
        cabinetFigs[0]!.head.x - cabinetFigs[1]!.head.x,
        cabinetFigs[0]!.head.y - cabinetFigs[1]!.head.y
      ) >= 0.16,
      'cabinet heads stay separated'
    );
    // Standing partner — ankles near the floor (not kneeling carpet doggy).
    assert.ok(cabinetFigs[1]!.lAnkle.y > 0.85);
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
    assert.equal(
      parseIntimateLayout(
        "She lies still in the drawer's dim glow, eyes closed as he withdraws slowly—his thumb smears her clit."
      ),
      'afterglow'
    );
    assert.equal(parseIntimateLayout('Half-undressed, skin and erotic heat.'), 'undress');
    assert.equal(parseIntimateLayout('Solo masturbation, naked pleasure.'), 'solo');
    assert.equal(
      parseIntimateLayout('alone on her back touching herself, soft lamp on bare skin'),
      'solo'
    );
    assert.equal(
      parseIntimateLayout('solo kneeling on the sheets after dark, self-pleasure, soft lamp'),
      'solo'
    );
    assert.equal(parseIntimateLayout('They make love in the loft.'), 'generic');

    const { resolveSoloMasturbationPoseKind } = await import('./day-pose-guide');
    assert.equal(
      resolveSoloMasturbationPoseKind('alone on her back masturbating'),
      'on_back'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('solo masturbation on her side under a lamp'),
      'side_lying'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('alone face-down on the bed masturbating'),
      'prone'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('solo kneeling on the sheets masturbating'),
      'kneeling'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('alone on all fours on the bed masturbating'),
      'all_fours'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('alone bent over the foot of the bed masturbating'),
      'all_fours'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('solo masturbation leaning on the bathroom sink'),
      'lean'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('alone standing in the shower masturbating'),
      'standing'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('solo masturbation standing against the hotel wall'),
      'standing'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('solo masturbation on the couch'),
      'seated'
    );
    assert.equal(
      resolveSoloMasturbationPoseKind('alone on the bed edge masturbating'),
      'seated'
    );

    const soloKinds = [
      'alone on her back masturbating',
      'solo masturbation on her side',
      'alone face-down masturbating',
      'solo kneeling masturbating',
      'alone on all fours masturbating',
      'solo masturbation leaning on the sink',
      'alone standing in the shower masturbating',
      'solo masturbation on the bed edge',
    ] as const;
    for (const beat of soloKinds) {
      const intent = parsePoseGuideIntent(beat, 0);
      assert.equal(intent.intimate, 'solo', beat);
      assert.equal(intent.people, 1, beat);
      assert.equal(synthesizeIntimateStickFigures(intent).length, 1, beat);
    }

    const soloBack = parsePoseGuideIntent(
      'alone on her back masturbating, soft lamp on bare skin',
      0
    );
    assert.equal(soloBack.intimate, 'solo');
    assert.equal(soloBack.people, 1);
    assert.equal(synthesizeIntimateStickFigures(soloBack).length, 1);

    const soloKneel = parsePoseGuideIntent(
      'solo kneeling on the sheets masturbating after dark, soft lamp',
      0
    );
    assert.equal(soloKneel.intimate, 'solo');
    assert.equal(synthesizeIntimateStickFigures(soloKneel).length, 1);
    const kneelFig = synthesizeIntimateStickFigures(soloKneel)[0]!;
    // One fingering wrist on the vulva midline; other on the hip (two mid-vulva
    // wrists often spawn a ghost covering pair on the chest in Rapid Edit).
    assert.ok(
      Math.abs(kneelFig.rWrist.x - kneelFig.pelvis.x) < 0.06,
      'fingering wrist near pelvis midline'
    );
    assert.ok(
      kneelFig.lWrist.x < kneelFig.pelvis.x - 0.08,
      'other wrist on hip (clear arm chain)'
    );
    assert.ok(kneelFig.rWrist.y > kneelFig.pelvis.y, 'fingering wrist below pelvis');
    assert.ok(kneelFig.lWrist.y > kneelFig.pelvis.y - 0.02, 'hip wrist at/below pelvis');

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
    // Partner: one contact wrist near lead neck (throat); other stays on own hip (ghost-hand risk).
    assert.ok(Math.abs(wallFigs[1]!.rWrist.y - wallFigs[0]!.neck.y) < 0.08);
    assert.ok(Math.abs(wallFigs[1]!.lWrist.x - wallFigs[1]!.lHip.x) < 0.08);

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
    const standA = synthesizeStickSkeleton(parsePoseGuideIntent('Standing still with hands in pockets.', 0));
    const walkSpan = Math.abs(walkA.lAnkle.x - walkA.rAnkle.x);
    const standSpan = Math.abs(standA.lAnkle.x - standA.rAnkle.x);
    assert.ok(
      walkSpan > standSpan + 0.08,
      `mid-stride ankle span (${walkSpan}) should clearly exceed stand (${standSpan})`
    );
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

  it('parseSocialLayout maps hug/dance/fight/climb/phone/look-back and everyday Day stances', async () => {
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
    assert.equal(
      parsePoseGuideIntent(
        "She hangs suspended in the ballroom's shadowed alcove as he lowers her into a velvet chaise, thumb on her clit.",
        0
      ).intimate,
      'lift'
    );
    assert.equal(parseSocialLayout('Sparring in the alley.'), 'fight');
    assert.equal(parseSocialLayout('Climbing the fire escape.'), 'climb');
    assert.equal(parseSocialLayout('Looking at a phone on the stoop.'), 'phone');
    assert.equal(parseSocialLayout('Looks back over the shoulder.'), 'look_back');
    assert.equal(parseSocialLayout('looking over a shoulder while zipping'), 'look_back');
    assert.equal(
      parseSocialLayout('twisting to zip a dress in a mirror — back arched'),
      'look_back'
    );
    assert.equal(parseSocialLayout('Stretching arms overhead mid-yawn.'), 'stretch');
    assert.equal(parseSocialLayout('Waving hello from the balcony.'), 'wave');
    assert.equal(parseSocialLayout('Standing with arms crossed waiting.'), 'cross_arms');
    assert.equal(parseSocialLayout('Pausing with hands in pockets.'), 'pockets');
    assert.equal(parseSocialLayout('Pouring coffee, mug in hand.'), 'drink');
    assert.equal(parseSocialLayout('Carrying a tote bag over one shoulder.'), 'carry');
    assert.equal(parseSocialLayout('Sitting on a bench reading a book.'), 'read');
    assert.equal(parseSocialLayout('Standing at a railing, hands on the rail.'), 'rail');
    assert.equal(parseSocialLayout('Pointing toward a storefront across the street.'), 'point');
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

    const stretch = parsePoseGuideIntent('Stretching arms overhead mid-yawn.', 0);
    assert.equal(stretch.social, 'stretch');
    assert.equal(stretch.people, 1);
    const stretchFigs = synthesizeSocialStickFigures(stretch);
    assert.equal(stretchFigs.length, 1);
    assert.ok(stretchFigs[0]!.rWrist.y < stretchFigs[0]!.head.y + 0.02);

    assert.equal(parsePoseGuideIntent('Holding a glass at a bar rail.', 0).social, 'drink');
    assert.equal(
      parsePoseGuideIntent('Standing at a railing watching the light, hands on the rail.', 0).social,
      'rail'
    );

    const dance = synthesizeSceneStickFigures('Dancing together at the party.', 0);
    assert.equal(dance.intent.social, 'dance');
    assert.equal(dance.figures.length, 2);

    const soloDance = synthesizeSceneStickFigures(
      'DANCING alone on the patio in evening wear — hips mid-sway, hands trailing her own waist',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(soloDance.intent.social, 'dance');
    assert.equal(soloDance.figures.length, 1, 'solo dance must not draw a ballroom pair');

    const zipTwist = synthesizeSceneStickFigures(
      'twisting to zip a dress in a mirror — back arched, looking over a shoulder, lingerie straps visible',
      0,
      { forcePeople: 1, clothedUprightOnly: true }
    );
    assert.equal(zipTwist.intent.social, 'look_back');
    assert.equal(zipTwist.figures.length, 1);
    const zipFig = zipTwist.figures[0]!;
    assert.ok(
      zipFig.lWrist.x > 0.4 && zipFig.lWrist.x < 0.6 && zipFig.rWrist.x > 0.4 && zipFig.rWrist.x < 0.6,
      'zip hands should meet at mid-back, not hang at sides'
    );

    const fight = synthesizeSceneStickFigures('They fight in the courtyard.', 0);
    assert.equal(fight.intent.social, 'fight');
    assert.equal(fight.figures.length, 2);
    assert.ok(
      Math.abs(fight.figures[0]!.pelvis.x - fight.figures[1]!.pelvis.x) >
        Math.abs(hugFigs[0]!.pelvis.x - hugFigs[1]!.pelvis.x)
    );

    const duoSocial = new Set(['hug', 'dance', 'fight']);
    for (const social of [
      'hug',
      'dance',
      'fight',
      'climb',
      'phone',
      'look_back',
      'wave',
      'cross_arms',
      'pockets',
      'stretch',
      'drink',
      'carry',
      'read',
      'rail',
      'point',
      'sport_sprint',
      'sport_yoga_warrior',
      'sport_yoga_dog',
      'sport_cycle',
      'sport_swing',
      'sport_serve',
      'sport_forehand',
      'sport_jump_shot',
      'sport_kick',
      'sport_throw',
      'sport_lunge',
      'sport_handstand',
      'sport_pitch',
      'sport_stick',
      'sport_block',
      'sport_hurdle',
      'sport_slide',
      'sport_dunk',
      'sport_ski',
      'sport_putt',
      'sport_overhead',
    ] as const) {
      const drawn = synthesizeSocialStickFigures({
        base: 'stand',
        armLeft: 'hold',
        armRight: 'hold',
        lean: 0,
        stride: 0.3,
        seed: 7,
        people: duoSocial.has(social) ? 2 : 1,
        social,
        label: social,
      });
      assert.ok(drawn.length >= 1, social);
      assert.ok(drawn.every(fig => Number.isFinite(fig.pelvis.x)), social);
      if (String(social).startsWith('sport_')) {
        assert.equal(drawn.length, 1, `${social} stays solo`);
      }
    }
  });

  it('parseSportLayout maps Day Sport beat lines to mid-action Image 3 layouts', async () => {
    const { parseSportLayout, parseSocialLayout, parsePoseGuideIntent, synthesizeSceneStickFigures } =
      await import('./day-pose-guide');

    assert.equal(
      parseSportLayout(
        'mid-stride sprint drive on the track — running athletic action in proper running kit and sport footwear, mid-play on a running venue, Cast alone'
      ),
      'sport_sprint'
    );
    assert.equal(
      parseSportLayout(
        'holding warrior two with arms extended — yoga athletic action in proper yoga kit'
      ),
      'sport_yoga_warrior'
    );
    assert.equal(
      parseSportLayout('transitioning through downward dog with long spine — yoga athletic action'),
      'sport_yoga_dog'
    );
    assert.equal(
      parseSportLayout(
        'sprinting out of the saddle on a road bike — cycling athletic action in proper cycling kit'
      ),
      'sport_cycle'
    );
    assert.equal(
      parseSportLayout(
        'elevating into a jump shot with elbow aligned — basketball athletic action'
      ),
      'sport_jump_shot'
    );
    assert.equal(
      parseSportLayout(
        'uncoiling into a forehand with racket head lagging — tennis athletic action'
      ),
      'sport_forehand'
    );
    assert.equal(
      parseSportLayout(
        'tossing into a serve with knee bend and upward extension — tennis athletic action'
      ),
      'sport_serve'
    );
    assert.equal(
      parseSportLayout(
        'striking the ball with full follow-through — soccer athletic action'
      ),
      'sport_kick'
    );
    assert.equal(
      parseSportLayout(
        'hurling a javelin with full body rotation — track and field athletic action'
      ),
      'sport_throw'
    );
    assert.equal(
      parseSportLayout(
        'lunging into an attack with foil extended — fencing athletic action'
      ),
      'sport_lunge'
    );
    assert.equal(
      parseSportLayout(
        'throwing a high roundhouse kick with hips fully rotated — martial arts athletic action'
      ),
      'sport_kick'
    );
    assert.equal(
      parseSportLayout(
        'blocking a strike with forearm chambered — martial arts athletic action'
      ),
      'sport_block'
    );
    assert.equal(
      parseSportLayout(
        'holding a handstand line on the floor exercise mat — gymnastics athletic action'
      ),
      'sport_handstand'
    );
    assert.equal(
      parseSportLayout(
        'winding up for a wrist shot with weight on the back skate — hockey athletic action'
      ),
      'sport_stick'
    );
    assert.equal(
      parseSportLayout(
        'unwinding through a driver swing with balanced finish — golf athletic action'
      ),
      'sport_swing'
    );
    assert.equal(
      parseSportLayout(
        'delivering a pitch from the windup with leg kick high — baseball athletic action'
      ),
      'sport_pitch'
    );
    assert.equal(
      parseSportLayout(
        'dynoing to a hold on an overhang with hips driving upward — climbing athletic action'
      ),
      'climb'
    );
    assert.equal(
      parseSportLayout(
        'clearing a hurdle with lead leg extended — running athletic action'
      ),
      'sport_hurdle'
    );
    assert.equal(
      parseSportLayout(
        'dunking two-handed through the rim with knees tucked — basketball athletic action'
      ),
      'sport_dunk'
    );
    assert.equal(
      parseSportLayout(
        'sliding into base with dirt kicking up — baseball athletic action'
      ),
      'sport_slide'
    );
    assert.equal(
      parseSportLayout(
        'carving through a slalom turn with snow spraying — ski athletic action'
      ),
      'sport_ski'
    );
    assert.equal(
      parseSportLayout(
        'rolling a putt with quiet shoulders and steady head — golf athletic action'
      ),
      'sport_putt'
    );
    assert.equal(
      parseSportLayout(
        'smashing an overhead with racket high and torso arched back — tennis athletic action'
      ),
      'sport_overhead'
    );
    assert.equal(
      parseSportLayout(
        'driving a freestyle stroke with a high elbow catch — swimming athletic action'
      ),
      'sport_swim'
    );
    assert.equal(
      parseSportLayout(
        'spiking the ball with a full overhead arm swing — volleyball athletic action'
      ),
      'sport_spike'
    );
    assert.equal(
      parseSportLayout(
        'snapping a jab with the lead hand from a tight boxing stance — boxing athletic action'
      ),
      'sport_box'
    );
    assert.equal(
      parseSportLayout('carving down the face of a clean wave — surfing athletic action'),
      'sport_surf'
    );

    // Martial arts must not become duo fight Image 3.
    assert.equal(
      parseSocialLayout(
        'throwing a high roundhouse kick — martial arts athletic action, Cast alone'
      ),
      'sport_kick'
    );
    const martial = parsePoseGuideIntent(
      'throwing a high roundhouse kick — martial arts athletic action, Cast alone',
      0
    );
    assert.equal(martial.social, 'sport_kick');
    assert.equal(martial.people, 1);

    const sprint = synthesizeSceneStickFigures(
      'mid-stride sprint drive — running athletic action, Cast alone',
      0
    );
    assert.equal(sprint.intent.social, 'sport_sprint');
    assert.equal(sprint.figures.length, 1);
    assert.ok(
      Math.abs(sprint.figures[0]!.lAnkle.x - sprint.figures[0]!.rAnkle.x) > 0.35,
      'sprint stride should be wide'
    );

    const dog = synthesizeSceneStickFigures(
      'transitioning through downward dog — yoga athletic action',
      0
    );
    assert.equal(dog.intent.social, 'sport_yoga_dog');
    assert.ok(dog.figures[0]!.pelvis.y < dog.figures[0]!.head.y, 'dog hips above head');
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
