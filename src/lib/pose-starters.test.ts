import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayPoseAsPhotoPose, soloDayPoseGroups } from './day-pose-presets';
import { bendBody, liftBodyDepth, rotateBody } from './pose-joint-edit';
import {
  addPerson,
  describePoseBody,
  poseFirstLine,
  mirrorBodies,
  poseStarterBody,
  POSE_STARTERS,
  removePerson,
} from './pose-starters';

describe('pose starters', () => {
  it('every starter is a full figure inside the frame', () => {
    for (const { id } of POSE_STARTERS) {
      const body = poseStarterBody(id);
      assert.ok(body.filter(Boolean).length >= 14, id);
      for (const p of body) if (p) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, id);
    }
  });

  it('mirror flips sides and swaps left/right joints; twice is identity', () => {
    const body = poseStarterBody('walk');
    const [m] = mirrorBodies([body]);
    assert.ok(Math.abs(m![5]!.x - (1 - body[2]!.x)) < 1e-9);
    const [back] = mirrorBodies(mirrorBodies([body]));
    back!.forEach((p, i) => {
      assert.ok(Math.abs(p!.x - body[i]!.x) < 1e-9 && Math.abs(p!.y - body[i]!.y) < 1e-9);
    });
  });

  it('adds a second person and removes back to one', () => {
    const two = addPerson([poseStarterBody('stand')]);
    assert.equal(two.length, 2);
    assert.equal(addPerson(two).length, 2);
    assert.equal(removePerson(two).length, 1);
  });

  it('describes each starter figure in words', () => {
    assert.equal(describePoseBody(poseStarterBody('stand')), 'standing');
    assert.equal(describePoseBody(poseStarterBody('sit')), 'seated');
    assert.equal(describePoseBody(poseStarterBody('kneel')), 'kneeling');
    assert.equal(describePoseBody(poseStarterBody('lie')), 'lying down');
    assert.equal(describePoseBody(poseStarterBody('walk')), 'walking mid-stride');
  });

  it('reads each leg on its own: a standing high kick is not "kneeling"', () => {
    // The pose a player drew (512×768 guide): right leg planted, left knee at hip height with
    // the foot up by the shoulder. Averaging the legs called it kneeling, and the model knelt.
    const px: Array<[number, number]> = [
      [166, 93], [166, 156], [121, 163], [108, 263], [103, 355], [210, 163], [259, 247], [337, 230],
      [143, 371], [143, 517], [143, 662], [221, 362], [343, 325], [414, 204],
      [157, 87], [174, 87], [148, 94], [183, 94],
    ];
    const kick = px.map(([x, y]) => ({ x: x / 512, y: y / 768 }));
    const words = describePoseBody(kick, { aspect: 512 / 768 });
    assert.match(words, /^standing on her right leg, left leg kicked high to the side/);
    assert.match(words, /knee bent, foot at shoulder height/);
    assert.doesNotMatch(words, /kneeling/);
    const line = poseFirstLine(kick, 'he', 512 / 768);
    assert.match(line, /^POSE FIRST: he is standing on his right leg, left leg kicked high/);
    assert.match(line, /one foot off the floor, never kneeling\.$/);
  });

  it('a bend at the waist over straight legs is never "lying down"', () => {
    const stand = poseStarterBody('stand');
    const A = 2 / 3;
    const flat = liftBodyDepth(stand, stand, A);
    // Toward the camera: the upper body collapses onto the hip line — the pose that came out
    // as a woman lying on a bed.
    const front = bendBody(stand, flat, Math.PI / 2, A).body;
    assert.equal(
      describePoseBody(front, { aspect: A }),
      'bent forward at the waist toward the camera, legs straight, back flat'
    );
    assert.match(poseFirstLine(front, 'she', A), /feet on the floor, hips high — never lying down\.$/);
    const side = rotateBody(stand, flat, { turn: Math.PI / 2 }, A);
    assert.equal(
      describePoseBody(bendBody(side.body, side.depth, Math.PI / 2, A).body, { aspect: A }),
      'seen from the side, bent forward at the waist, legs straight, back level with the floor'
    );
    assert.equal(
      describePoseBody(bendBody(side.body, side.depth, (Math.PI * 2) / 3, A).body, { aspect: A }),
      'seen from the side, bent right over at the waist, legs straight, head down by the knees'
    );
    assert.equal(
      describePoseBody(bendBody(side.body, side.depth, Math.PI / 4, A).body, { aspect: A }),
      'standing, leaning forward'
    );
    // The lying starter still lies down.
    assert.equal(describePoseBody(poseStarterBody('lie')), 'lying down');
  });

  it('a figure turned around is "seen from behind"; front and side views are not', () => {
    const stand = poseStarterBody('stand');
    const A = 2 / 3;
    const flat = liftBodyDepth(stand, stand, A);
    const back = rotateBody(stand, flat, { turn: Math.PI }, A).body;
    assert.equal(describePoseBody(back, { aspect: A }), 'seen from behind, standing');
    assert.match(
      poseFirstLine(back, 'he', A),
      /^POSE FIRST: he is seen from behind, standing, .* — his back to the camera, never facing it; weight on both feet\.$/
    );
    assert.equal(describePoseBody(stand, { aspect: A }), 'standing');
    const side = rotateBody(stand, flat, { turn: Math.PI / 2 }, A).body;
    assert.doesNotMatch(describePoseBody(side, { aspect: A }), /behind/);
    const mostlyBack = rotateBody(stand, flat, { turn: (Math.PI * 5) / 6 }, A).body;
    assert.match(describePoseBody(mostlyBack, { aspect: A }), /^seen from behind/);
  });

  it('names squats, floor sitting, a wide stance and where the hands are', () => {
    const stand = poseStarterBody('stand');
    const set = (patch: Record<number, [number, number]>) =>
      stand.map((p, i) => (patch[i] ? { x: patch[i]![0], y: patch[i]![1] } : p));
    assert.equal(
      describePoseBody(set({ 3: [0.33, 0.36], 4: [0.43, 0.47], 6: [0.67, 0.36], 7: [0.57, 0.47] })),
      'standing, both hands on hips'
    );
    assert.equal(
      describePoseBody(set({ 3: [0.33, 0.36], 4: [0.43, 0.47] }), { possessive: 'his' }),
      'standing, right hand on hip'
    );
    assert.equal(
      describePoseBody(set({ 3: [0.26, 0.21], 4: [0.12, 0.21], 6: [0.74, 0.21], 7: [0.88, 0.21] })),
      'standing, both arms out to the sides'
    );
    assert.equal(
      describePoseBody(set({ 10: [0.3, 0.84], 9: [0.37, 0.66], 13: [0.7, 0.84], 12: [0.63, 0.66] })),
      'standing with legs wide apart'
    );
    assert.equal(describePoseBody(poseStarterBody('walk')), 'walking mid-stride');
    // Arms hanging by the hips are not "hands on hips".
    assert.equal(describePoseBody(stand), 'standing');
    const squat = stand
      .map((p, i) => (p && (i <= 7 || i >= 14) ? { x: p.x, y: p.y + 0.24 } : p))
      .map((p, i) =>
        i === 8
          ? { x: 0.45, y: 0.72 }
          : i === 11
            ? { x: 0.55, y: 0.72 }
            : i === 9
              ? { x: 0.38, y: 0.7 }
              : i === 12
                ? { x: 0.62, y: 0.7 }
                : p
      );
    assert.equal(describePoseBody(squat), 'squatting low, feet flat');
    assert.equal(describePoseBody(poseStarterBody('sit')), 'seated');
  });

  it('a named Day pose says its own name and cue, in few words', () => {
    const wave = dayPoseAsPhotoPose('wave')!;
    assert.equal(wave.people.length, 1);
    assert.equal(wave.source, 'edited');
    assert.equal(
      wave.words,
      'waving: one arm raised high with an open palm, the other arm relaxed at the side'
    );
    assert.equal(
      poseFirstLine(wave.people[0]!, 'she', wave.aspect, wave.words),
      'POSE FIRST: she is waving: one arm raised high with an open palm, the other arm relaxed at the side, exactly as the pose map in Image 3 shows.'
    );
    // Plain postures are just their name; two-person layouts are not offered.
    assert.equal(dayPoseAsPhotoPose('sit')!.words, 'sitting');
    const offered = soloDayPoseGroups().flatMap(group => group.ids);
    assert.ok(offered.includes('hands_hips') && offered.includes('sport_yoga_warrior'));
    assert.ok(!offered.includes('hug') && !offered.includes('hold_hands'));
    for (const id of offered) assert.ok(dayPoseAsPhotoPose(id)!.words!.length < 140, id);
  });

  it('one knee down with the other foot planted is kneeling on one knee', () => {
    const kneel = poseStarterBody('kneel');
    // Left foot planted in front: the knee up near hip height, the ankle on the floor under it.
    const floor = Math.max(kneel[9]!.y, kneel[10]!.y);
    const genuflect = kneel.map((p, i) =>
      i === 12
        ? { x: kneel[11]!.x + 0.1, y: kneel[11]!.y + 0.06 }
        : i === 13
          ? { x: kneel[11]!.x + 0.1, y: floor }
          : p
    );
    assert.equal(
      describePoseBody(genuflect),
      'kneeling on her right knee, other foot flat on the floor'
    );
  });
});
