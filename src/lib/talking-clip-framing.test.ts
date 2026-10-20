import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { talkingClipCropRect } from './talking-clip-framing';
import { talkingClipPrompt } from './ltx25-renderer';

describe('talking clip framing', () => {
  it('crops a full-body still chest-up around the face, 3:4, face in the upper third', () => {
    // The user's night still: 1104×1472, face ~120 px brow to chin near the top right.
    const rect = talkingClipCropRect(1104, 1472, { x: 730, y: 210, width: 110, height: 120 })!;
    assert.equal(rect.height, 504);
    assert.equal(rect.width, 378);
    assert.ok(rect.x <= 730 && rect.x + rect.width >= 840, 'face inside');
    assert.ok(210 - rect.y < rect.height / 3, 'face in the upper third');
  });

  it('leaves a still whose face is already large alone', () => {
    assert.equal(talkingClipCropRect(960, 1280, { x: 400, y: 200, width: 200, height: 260 }), null);
  });

  it('stays inside the image near an edge', () => {
    const rect = talkingClipCropRect(800, 1000, { x: 760, y: 10, width: 40, height: 50 })!;
    assert.ok(rect.x >= 0 && rect.x + rect.width <= 800 && rect.y >= 0);
  });
});

describe('talking clip prompt', async () => {
  const { talkingClipPrompt } = await import('./ltx25-renderer');
  it('holds her facing the camera while she says the line (no beat motion, no closed-mouth rule)', () => {
    const prompt = talkingClipPrompt({ setting: 'office building entrance', line: '"Finally. Friday."' });
    assert.match(prompt, /She stops where she is, looks into the camera and says clearly, "Finally\. Friday\."/);
    assert.match(prompt, /does not walk away or turn around/);
    assert.doesNotMatch(prompt, /mid-stride|wide-open mouth/);
    assert.match(talkingClipPrompt({ line: 'Hi there', speaker: 'He' }), /He stops where he is.*His lips move/);
  });
});

describe('keep the full frame', async () => {
  const { normalizeDaySlots } = await import('./day/planner');
  it('is kept on a Day slot only when set', () => {
    const [on, off] = normalizeDaySlots([
      { id: 'morning', label: 'Morning', line: 'Hi there', lineFullFrame: true },
      { id: 'evening', label: 'Evening', line: 'Hi there', lineFullFrame: false },
    ] as never);
    assert.equal(on!.lineFullFrame, true);
    assert.equal('lineFullFrame' in off!, false);
  });
});

describe('one-shot conversation', async () => {
  const { conversationClipPrompt, conversationPartnerNoun } = await import('./ltx25-renderer');
  const { buildSpokenLineMessages } = await import('./spoken-line');
  it('names who says what, in order, and keeps them in place', () => {
    const prompt = conversationClipPrompt({ line: 'You made coffee?', reply: 'Only because you were snoring.', lead: 'woman', partner: 'man' });
    assert.match(prompt, /The woman turns to the man and says, "You made coffee\?" The man answers, "Only because you were snoring\."/);
    assert.match(prompt, /they stay in place/);
    assert.match(
      conversationClipPrompt({ line: 'Hi', reply: 'Hey', lead: 'woman', partner: 'woman' }),
      /One woman turns to the other woman.*The other woman answers/
    );
  });
  it('reads the other person from the still, else the opposite of the lead', () => {
    assert.equal(conversationPartnerNoun('… her girlfriend has her own face …', 'woman'), 'woman');
    assert.equal(conversationPartnerNoun('a couple at the counter', 'woman'), 'man');
    assert.equal(conversationPartnerNoun('his boyfriend has the face from Image 2', 'man'), 'man');
  });
  it('a reply suggestion answers the line', () => {
    const [system] = buildSpokenLineMessages({ scene: 'kitchen', replyTo: 'You made coffee?' });
    assert.match(system!.content, /other person in the scene could say back to her, answering: "You made coffee\?"/);
  });
});

describe('how the line is said', async () => {
  const { talkingClipPrompt, conversationClipPrompt, extendSegmentPrompt, normalizeSpokenLineTone, spokenLineVerb } =
    await import('./ltx25-renderer');
  it('natural (or no tone) keeps "says clearly"', () => {
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'natural' }), /looks into the camera and says clearly, "Hi"/);
    assert.match(talkingClipPrompt({ line: 'Hi' }), /says clearly, "Hi"/);
  });
  it('a tone swaps the speech verb, with the speaker’s pronoun', () => {
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'whisper' }), /looks into the camera and leans in and whispers, in a soft breathy whisper, "Hi"/);
    assert.match(talkingClipPrompt({ line: 'Hi', tone: 'angry', speaker: 'He' }), /snaps angrily, his voice sharp and raised, "Hi"/);
    assert.equal(spokenLineVerb('laughing', 'She'), 'laughs and says through her laughter,');
    assert.equal(spokenLineVerb('shouting', 'He'), 'shouts at the top of his voice, calling out loudly,');
    assert.equal(spokenLineVerb('nervous', 'She'), 'says nervously, hesitating, her voice shaky and quick,');
    assert.equal(normalizeSpokenLineTone('singsong'), 'singsong');
    assert.equal(normalizeSpokenLineTone('sleepy'), undefined);
  });
  it('reaches conversations and 30-second parts', () => {
    assert.match(
      conversationClipPrompt({ line: 'Coffee?', reply: 'Yes.', tone: 'teasing' }),
      /The woman turns to the man and says in a playful, teasing tone with a little smirk, "Coffee\?"/
    );
    assert.match(conversationClipPrompt({ line: 'Coffee?', reply: 'Yes.' }), /turns to the man and says, "Coffee\?"/);
    assert.match(
      extendSegmentPrompt('She waves.', undefined, { line: 'Bye!', tone: 'excited' }),
      /As she does, she says excitedly, her voice bright, loud and fast, "Bye!"/
    );
  });
  it('stores only known, non-natural tones', () => {
    assert.equal(normalizeSpokenLineTone('tender'), 'tender');
    assert.equal(normalizeSpokenLineTone('natural'), undefined);
    assert.equal(normalizeSpokenLineTone('sarcastic'), undefined);
    assert.equal(normalizeSpokenLineTone(3), undefined);
  });
});

describe('wide talking prompt (full-body still kept whole)', async () => {
  const { talkingClipPrompt } = await import('./ltx25-renderer');
  it('calls it a wide shot, does not address the camera, and rules out the close-up', () => {
    const prompt = talkingClipPrompt({ line: 'Want one?', setting: 'florist', tone: 'teasing', wide: true });
    assert.match(prompt, /^Wide shot, full body, seen from a few metres away/);
    // Wide (usually standing): no posture words — "sitting or lying" sat standing women down.
    assert.match(prompt, /She keeps exactly the pose and position of the first frame and says in a playful, teasing tone with a little smirk, "Want one\?"/);
    assert.doesNotMatch(prompt, /sitting|lying|stand up/);
    // Mid (seated / knees-up): the seated hold that kept the park-bench clip full-frame.
    const mid = talkingClipPrompt({ line: 'Hi', framing: 'mid', seated: true });
    assert.match(mid, /in the same pose as the first frame — sitting or lying, she stays that way/);
    assert.match(mid, /does not stand up/);
    assert.doesNotMatch(prompt, /into the camera|facing the camera/);
    assert.match(prompt, /her whole body in view from head to feet; the camera does not move, zoom or push in, and there is no close-up/);
    assert.match(talkingClipPrompt({ line: 'Hi', speaker: 'He', wide: true }), /He keeps exactly the pose and position of the first frame and says clearly.*his body stays still.*his whole body/);
  });
});

describe('talking framing bands', () => {
  it('splits kept-whole stills into wide, mid and close', async () => {
    const { talkingFramingFromShare } = await import('./talking-clip-framing');
    assert.equal(talkingFramingFromShare(0.05), 'wide');
    // The park-bench still that punched in: ~8% face, just over the old full-body bar.
    assert.equal(talkingFramingFromShare(0.085), 'mid');
    assert.equal(talkingFramingFromShare(0.2), 'close');
    // No face found: hold the frame rather than risk a punch-in.
    assert.equal(talkingFramingFromShare(null), 'mid');
  });

  it('mid stills take the wide wording and never ask her to look into the camera', () => {
    const prompt = talkingClipPrompt({ line: 'Hi', framing: 'mid', setting: 'park bench' });
    assert.match(prompt, /^Wide shot, full body/);
    assert.match(prompt, /no close-up/);
    assert.doesNotMatch(prompt, /looks into the camera/);
    assert.match(talkingClipPrompt({ line: 'Hi', framing: 'wide' }), /^Wide shot, full body/);
    assert.match(talkingClipPrompt({ line: 'Hi', framing: 'close' }), /looks into the camera/);
  });
});

describe('room sound (Add sound)', () => {
  it('names the place and its likely sounds, never words', async () => {
    const { dubPrompt, ambienceSounds } = await import('./ltx25-renderer');
    assert.equal(ambienceSounds('harbor-side brunch terrace'), 'low murmur of other guests, cups and cutlery clinking');
    assert.equal(
      ambienceSounds('park bench under amber streetlights at blue hour'),
      'birdsong, a light breeze in the trees, distant traffic, hushed for the late hour'
    );
    assert.equal(ambienceSounds('somewhere'), '');
    const prompt = dubPrompt({ scene: 'She reads', place: 'calm turquoise bay' });
    assert.match(prompt, /The natural background sound of calm turquoise bay: waves breaking, wind, distant gulls, clearly audible\./);
    assert.match(prompt, /no talking/);
    // Without a place: as before.
    assert.match(dubPrompt({ scene: 'She reads' }), /Natural room sound\.$/);
  });
});

describe('scene stays alive', () => {
  it('names what keeps moving, from the place and the line, and only names the place', async () => {
    const { talkingClipPrompt, sceneMotionCues } = await import('./ltx25-renderer');
    const coffee = talkingClipPrompt({
      line: 'That coffee steam’s doing a little dance in the sun.',
      setting: 'quiet neighborhood sidewalk at sunrise',
      wide: true,
    });
    assert.match(coffee, /The place is the one in the first frame \(quiet neighborhood sidewalk at sunrise\)/);
    assert.match(coffee, /Around her the scene stays alive: wisps of steam keep rising and curling from the hot drink\./);
    assert.equal(
      sceneMotionCues('old-town plaza with a fountain and café lights', 'He'),
      'Around him the scene stays alive: the fountain keeps splashing, and people in the background keep moving.'
    );
    // Nothing named that moves: the place stays as it was, no cue.
    const office = talkingClipPrompt({ line: 'Finally. Friday.', setting: 'office lobby' });
    assert.match(office, /The place stays as in the first frame \(office lobby\)/);
    assert.doesNotMatch(office, /stays alive/);
  });
});

describe('caught mid-movement', () => {
  it('a wide clip stops her where she is instead of freezing the stride, or walking her off', async () => {
    const { talkingClipPrompt, stillInMotion } = await import('./ltx25-renderer');
    const moving = talkingClipPrompt({ line: 'Hi', framing: 'wide', inMotion: true });
    assert.match(moving, /She keeps exactly the pose and position of the first frame, except that she stops where she is and stands evenly on both feet naturally, and says clearly, "Hi"/);
    assert.match(moving, /she keeps facing the same way, and she does not walk away, turn around or step toward the camera/);
    assert.doesNotMatch(moving, /finishes the movement/);
    // Seated keeps its own hold even if the words say walking.
    assert.match(talkingClipPrompt({ line: 'Hi', framing: 'mid', seated: true, inMotion: true }), /sitting or lying, she stays that way — and says/);
    assert.equal(stillInMotion('She walks mid-step, one foot ahead of the other.'), true);
    assert.equal(stillInMotion('Moment: dancing barefoot at the shoreline — both arms out mid-spin'), true);
    assert.equal(stillInMotion('Moment: climbing the stairs to the flat'), false);
    assert.equal(stillInMotion('She leans in the doorway.'), false);
  });
});

describe('limbs caught mid-action', () => {
  // OpenPose order, 0–1 of a 3:4 still: a standing woman, then one change at a time.
  const standing = () => {
    const b: Array<{ x: number; y: number } | null> = Array(18).fill(null);
    b[1] = { x: 0.5, y: 0.2 }; // neck
    b[2] = { x: 0.45, y: 0.2 }; // right shoulder
    b[5] = { x: 0.55, y: 0.2 };
    b[4] = { x: 0.44, y: 0.45 }; // right wrist, down
    b[7] = { x: 0.56, y: 0.45 };
    b[8] = { x: 0.47, y: 0.45 }; // hips
    b[11] = { x: 0.53, y: 0.45 };
    b[9] = { x: 0.47, y: 0.65 }; // knees
    b[12] = { x: 0.53, y: 0.65 };
    b[10] = { x: 0.47, y: 0.85 }; // ankles
    b[13] = { x: 0.53, y: 0.85 };
    return b;
  };

  it('reads raised arms, a lifted foot, a wide stance and a bend from the pose', async () => {
    const { stillLimbHolds, NO_LIMB_HOLDS } = await import('./talking-clip-framing');
    assert.deepEqual(stillLimbHolds(standing()), NO_LIMB_HOLDS);
    const wave = standing();
    wave[4] = { x: 0.4, y: 0.05 };
    assert.equal(stillLimbHolds(wave).armsUp, 1);
    const stretch = standing();
    stretch[4] = { x: 0.45, y: 0.02 };
    stretch[7] = { x: 0.55, y: 0.02 };
    assert.equal(stillLimbHolds(stretch).armsUp, 2);
    const knee = standing();
    knee[12] = { x: 0.56, y: 0.5 }; // knee lifted toward the hip
    knee[13] = { x: 0.6, y: 0.62 };
    assert.equal(stillLimbHolds(knee).footOff, true);
    const lunge = standing();
    lunge[10] = { x: 0.3, y: 0.85 };
    lunge[13] = { x: 0.7, y: 0.85 };
    lunge[9] = { x: 0.39, y: 0.65 };
    lunge[12] = { x: 0.61, y: 0.65 };
    assert.equal(stillLimbHolds(lunge).stride, true);
    const bent = standing();
    bent[1] = { x: 0.25, y: 0.4 }; // torso forward over straight legs
    assert.equal(stillLimbHolds(bent).bent, true);
  });

  it('a crouch with nothing else caught is read as a bend over a wide stance', async () => {
    const { stillLimbHolds } = await import('./talking-clip-framing');
    // The volleyball ready stance (a square still): hips dropped, one knee bent, both feet down.
    const crouch: Array<{ x: number; y: number } | null> = Array(18).fill(null);
    Object.assign(crouch, {
      1: { x: 0.508, y: 0.325 },
      2: { x: 0.452, y: 0.321 },
      4: { x: 0.246, y: 0.404 },
      5: { x: 0.564, y: 0.33 },
      7: { x: 0.292, y: 0.386 },
      8: { x: 0.483, y: 0.556 },
      9: { x: 0.343, y: 0.637 },
      10: { x: 0.392, y: 0.837 },
      11: { x: 0.572, y: 0.554 },
      12: { x: 0.65, y: 0.693 },
      13: { x: 0.76, y: 0.83 },
    });
    const h = stillLimbHolds(crouch, 1);
    assert.equal(h.bent, true);
    assert.equal(h.stride, true);
  });

  it('a bend on straight legs is standing, not seated', async () => {
    const { stillPostureFromBody } = await import('./talking-clip-framing');
    const bent = standing();
    bent[1] = { x: 0.2, y: 0.44 };
    assert.equal(stillPostureFromBody(bent), 'upright');
  });

  it('a foot on a step or a wall is resting, not lifted', async () => {
    const { stillFootSupported } = await import('./talking-clip-framing');
    assert.equal(stillFootSupported('posing under neon, one foot up on a step'), true);
    assert.equal(stillFootSupported('leaning against a wall, one foot against it'), true);
    assert.equal(stillFootSupported('dancing alone: both arms raised, one knee lifted'), false);
  });

  it('the hold names each limb she relaxes', () => {
    const prompt = talkingClipPrompt({
      line: 'Hi',
      framing: 'wide',
      limbs: { armsUp: 2, footOff: true, stride: false, bent: false },
    });
    assert.match(prompt, /except that she lowers both raised arms to a relaxed position, puts her lifted foot down and stands evenly on both feet naturally, and says clearly, "Hi"/);
    assert.match(
      talkingClipPrompt({ line: 'Hi', framing: 'wide', seated: true, limbs: { armsUp: 0, footOff: false, stride: false, bent: true } }),
      /except that she straightens up naturally, and says/
    );
    assert.match(
      talkingClipPrompt({ line: 'Hi', framing: 'wide', speaker: 'He', limbs: { armsUp: 1, footOff: false, stride: true, bent: false } }),
      /except that he lowers his raised arm to a relaxed position and stands evenly on both feet naturally/
    );
    // Nothing caught mid-action: the plain hold.
    assert.match(talkingClipPrompt({ line: 'Hi', framing: 'wide' }), /She keeps exactly the pose and position of the first frame and says/);
  });

  it('a chest-up clip lowers the raised arm and keeps looking at the camera after the line', () => {
    const prompt = talkingClipPrompt({ line: 'Hi', framing: 'close', limbs: { armsUp: 2, footOff: false, stride: false, bent: false } });
    assert.match(prompt, /She stops where she is, lowers both raised arms naturally, looks into the camera and says clearly, "Hi"/);
    assert.match(prompt, /when she finishes speaking she keeps looking at the camera, exactly where she is, until the shot ends/);
    assert.match(prompt, /the camera does not move or zoom/);
    assert.match(talkingClipPrompt({ line: 'Hi', framing: 'close' }), /She stops where she is, looks into the camera and says/);
  });
});

describe('seated or not', () => {
  // Bodies built from the user's stills: neck, hips and knees in 0–1 of the still.
  const body = (neckY: number, hipY: number, kneeYs: [number | null, number | null], hipDx = 0) => {
    const b: Array<{ x: number; y: number } | null> = Array(18).fill(null);
    b[1] = { x: 0.5, y: neckY };
    b[8] = { x: 0.48 + hipDx, y: hipY };
    b[11] = { x: 0.52 + hipDx, y: hipY };
    if (kneeYs[0] !== null) b[9] = { x: 0.48, y: hipY + kneeYs[0] * (hipY - neckY) };
    if (kneeYs[1] !== null) b[12] = { x: 0.52, y: hipY + kneeYs[1] * (hipY - neckY) };
    return b;
  };

  it('reads posture from the still, not from how big her face is', async () => {
    const { stillPostureFromBody } = await import('./talking-clip-framing');
    // Standing, waving (the still that sat down): thighs drop ~0.9 of a torso.
    assert.equal(stillPostureFromBody(body(0.2, 0.45, [0.92, 0.87])), 'upright');
    // The park bench, the record shop: thighs level.
    assert.equal(stillPostureFromBody(body(0.3, 0.55, [0.27, -0.18])), 'seated');
    assert.equal(stillPostureFromBody(body(0.3, 0.55, [-0.11, -0.16])), 'seated');
    // Climbing stairs, one knee up: not seated.
    assert.equal(stillPostureFromBody(body(0.2, 0.45, [0.77, 0.37])), 'upright');
    // Lying: torso flat.
    assert.equal(stillPostureFromBody(body(0.6, 0.62, [0.1, 0.1], 0.3)), 'seated');
    // No hips: can't tell.
    assert.equal(stillPostureFromBody(Array(18).fill(null)), null);
  });

  it('falls back to the still\'s words, ignoring "not …"', async () => {
    const { stillWordsSeated } = await import('./talking-clip-framing');
    assert.equal(stillWordsSeated('She stands waving, one arm raised high overhead'), false);
    assert.equal(stillWordsSeated('She sits, knees bent. Moment: perched on a low wall'), true);
    assert.equal(stillWordsSeated('Fix the pose: body sitting, not standing'), true);
    assert.equal(stillWordsSeated('Fix the pose: body standing, not sitting'), false);
  });

  it('a standing still never gets the seated hold, whatever its framing', () => {
    for (const framing of ['wide', 'mid'] as const) {
      assert.doesNotMatch(talkingClipPrompt({ line: 'Hi', framing }), /sitting or lying|does not stand up/);
    }
  });
});

describe('a held gesture', () => {
  it('keeps her spot and lowers the raised arm, instead of freezing the wave', async () => {
    const { talkingClipPrompt, stillHeldGesture } = await import('./ltx25-renderer');
    const prompt = talkingClipPrompt({ line: 'Hi', framing: 'mid', heldGesture: true });
    assert.match(prompt, /She keeps exactly the pose and position of the first frame, except that she lowers her raised arm to a relaxed position naturally, and says clearly, "Hi"/);
    assert.doesNotMatch(prompt, /finishes the movement/);
    assert.equal(stillHeldGesture('Pose: one hand raised touching the hair behind the ear, elbow up and out.'), true);
    assert.equal(stillHeldGesture('She stands waving, one arm raised high overhead, weight on one hip'), true);
    assert.equal(stillHeldGesture('She stands with her hands on her hips'), false);
  });
});
