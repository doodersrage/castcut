import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castPlacePhotoFor,
  defaultPlaceDesign,
  HOME_DESIGNS,
  normalizeCastPlaces,
  placeRoomOfSetting,
  resolveCastPlace,
  withCastPlace,
  withPlacePhotoInAdultPrompt,
  withPlacePhotoInLongAdultBrief,
  withPlacePhotoInPrompt,
} from './cast-places';

describe('recurring places', () => {
  it('reads which room of her home or office a Setting is', () => {
    const cases: Array<[string, string | null]> = [
      ['sunlit bedroom with rumpled white sheets', 'home:bedroom'],
      ['bedroom vanity with soft window light', 'home:bedroom'],
      ['candlelit bathroom with a big mirror', 'home:bathroom'],
      ['warm kitchen with a pot on the stove', 'home:kitchen'],
      ['apartment at midnight lit by the open fridge and a single lamp', 'home:kitchen'],
      ['living room lit by the TV and a floor lamp', 'home:living room'],
      ['hallway with a full-length mirror', 'home:hallway'],
      ['bright open-plan office with desks and big windows', 'work:desk'],
      ['glass-walled meeting room with a whiteboard', 'work:meeting room'],
      ['office kitchen with a coffee machine and a city view', 'work:kitchen'],
      // Somewhere else.
      ['hotel room with a full-length mirror', null],
      ['busy lunch café near the office', null],
      ['office building entrance at golden hour', null],
      ['apartment front door under a porch light', null],
      ['photo studio with a seamless pale gray backdrop and softboxes', null],
      ['quiet city street under warm streetlights', null],
    ];
    for (const [setting, expected] of cases) {
      const where = placeRoomOfSetting(setting);
      assert.equal(where ? `${where.kind}:${where.room}` : null, expected, setting);
    }
  });

  it('every Cast has a stable home and office without picking one', () => {
    const cast = { id: 'char-nora' };
    assert.equal(defaultPlaceDesign('char-nora', 'home').id, defaultPlaceDesign('char-nora', 'home').id);
    const ids = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => defaultPlaceDesign(id, 'home').id));
    assert.ok(ids.size > 1, 'Cast members do not all share one home');
    const kitchen = withCastPlace('warm kitchen with a pot on the stove', cast)!;
    const bedroom = withCastPlace('sunlit bedroom with rumpled white sheets', cast)!;
    const home = resolveCastPlace(cast, 'home')!;
    assert.ok(kitchen.startsWith('warm kitchen with a pot on the stove, in her apartment: '));
    // The whole home's look in both rooms; each room its own pieces.
    assert.ok(kitchen.includes(home.style) && bedroom.includes(home.style));
    assert.ok(kitchen.endsWith(home.rooms.kitchen!) && bedroom.endsWith(home.rooms.bedroom!));
  });

  it('a picked design, own words, or off', () => {
    const scandi = { id: 'x', places: { home: { design: 'scandi' } } };
    assert.match(withCastPlace('bright kitchen with coffee on the counter', scandi)!, /pale ash floors/);
    const own = { id: 'x', places: { home: { custom: 'a tiny attic flat with slanted ceilings' } } };
    assert.equal(
      withCastPlace('bedroom lit by a single bedside lamp', own),
      'bedroom lit by a single bedside lamp, in her apartment: a tiny attic flat with slanted ceilings'
    );
    const off = { id: 'x', places: { home: { off: true as const } } };
    assert.equal(withCastPlace('bedroom lit by a single bedside lamp', off), 'bedroom lit by a single bedside lamp');
    assert.match(withCastPlace('glass-walled meeting room with a whiteboard', off)!, /at her office: /);
  });

  it('leaves other places, no Cast, and an already placed Setting alone', () => {
    assert.equal(withCastPlace('hotel room at night lit by a lamp', { id: 'x' }), 'hotel room at night lit by a lamp');
    assert.equal(withCastPlace('warm kitchen', null), 'warm kitchen');
    const once = withCastPlace('warm kitchen', { id: 'x' })!;
    assert.equal(withCastPlace(once, { id: 'x' }), once);
  });

  it('keeps only valid choices', () => {
    assert.deepEqual(
      normalizeCastPlaces({ home: { design: 'nope' }, work: { custom: `  a  ${'b'.repeat(300)}` } }),
      { work: { custom: `a ${'b'.repeat(198)}` } }
    );
    assert.equal(normalizeCastPlaces('x'), undefined);
    assert.equal(HOME_DESIGNS.length >= 4, true);
  });
});

describe('a photo of their own room', () => {
  const cast = { id: 'c1', placePhotos: { 'home:living room': 'castcut-room-1.png' } };

  it('is found for a Setting in that room only, and not when the place is off', () => {
    assert.deepEqual(castPlacePhotoFor(cast, 'living room with a floor lamp'), {
      filename: 'castcut-room-1.png',
      kind: 'home',
      room: 'living room',
    });
    assert.equal(castPlacePhotoFor(cast, 'warm kitchen with a pot on the stove'), null);
    assert.equal(castPlacePhotoFor(cast, 'hotel lobby'), null);
    assert.equal(
      castPlacePhotoFor({ ...cast, places: { home: { off: true } } }, 'living room'),
      null
    );
  });

  it('takes the place words and the pose map out of the prompt, keeping the pose in words', () => {
    const prompt = [
      'Edit Image 1: POSE FIRST: she kneels on the floor, exactly as the pose map in Image 3 shows.',
      'SCENE: she is in the living room with a floor lamp, in her apartment: warm cream walls, worn herringbone parquet; a rust-orange sofa — show that place around her.',
      'Day photo: One woman alone. Place: living room with a floor lamp, in her apartment: warm cream walls, worn herringbone parquet; a rust-orange sofa. Keep her face from the first image. Match her body to the third image (pose map). Photorealistic photograph.',
    ].join('\n');
    const out = withPlacePhotoInPrompt(prompt);
    assert.match(out, /POSE FIRST: she kneels on the floor\./);
    assert.doesNotMatch(out, /pose map/);
    assert.doesNotMatch(out, /herringbone|rust-orange/);
    assert.match(
      out,
      /living room with a floor lamp, in the room shown in Image 3 — the same walls, floor, windows, furniture, plants and colours — show that place around her\./
    );
    assert.match(out, /Place: living room with a floor lamp, in the room shown in Image 3 — [^.]+\. Keep her face/);
  });
});

describe('a room photo on an adult solo still', () => {
  it('replaces the Room sentence, or adds one after the Moment', () => {
    assert.match(
      withPlacePhotoInAdultPrompt('Moment: alone on the couch. Room: a grey sofa. She is nude.'),
      /Moment: alone on the couch\. Room: the room shown in Image 3 — [^.]+\. She is nude\./
    );
    assert.match(
      withPlacePhotoInAdultPrompt('Moment: alone on the couch. She is nude.'),
      /Moment: alone on the couch\. Room: the room shown in Image 3/
    );
  });
});

describe('room photos on Rapid and duos', () => {
  it('Rapid: the SCENE line leads with the room', () => {
    const out = withPlacePhotoInPrompt(
      'SCENE: she is in the cozy living room, in her apartment: brick walls — show that place around her.',
      3,
      { lead: true }
    );
    assert.match(
      out,
      /^SCENE: the room shown in Image 3 is where she is — exactly that room: the cozy living room, in the room shown in Image 3 — the same walls/
    );
  });

  it('adult duo: the room replaces the pose map, whose sentence goes', () => {
    const out = withPlacePhotoInAdultPrompt(
      'Moment: on the sofa. Keep her face from the first image. Match the two bodies in the third image (pose map). Photorealistic.',
      3,
      { replacesMap: true }
    );
    assert.doesNotMatch(out, /pose map/);
    assert.match(out, /Room: the room shown in Image 3/);
  });

  it('adult solo keeps its map sentence (the map moved to Image 2)', () => {
    const out = withPlacePhotoInAdultPrompt(
      'Moment: on the sofa. Match her body to the second image (pose map).'
    );
    assert.match(out, /Match her body to the second image \(pose map\)/);
  });
});

describe('room photos in the long Outfit Keep brief', () => {
  it('drops the lines that call Image 3 a pose map, and leads the SETTING with the room', () => {
    const brief = [
      'SETTING (mandatory — replace Image 1 background entirely): living room, in her apartment: brick walls — put them here',
      'Match Image 3 body positions and headcount exactly — do not keep Image 1 standing portrait pose.',
      'Image 3 is an OpenPose keypoint skeleton map (pose control only, not part of the picture). Pose the people.',
      'Image 3 is only a pose map — never draw its lines.',
      'single-subject framing — the Image 3 keypoint skeleton is pose control, never drawn into the scene. clean skin',
    ].join('\n');
    const out = withPlacePhotoInPrompt(brief, 3, { lead: true });
    assert.doesNotMatch(out, /OpenPose|only a pose map|Match Image 3 body|keypoint skeleton/);
    assert.match(
      out,
      /^SETTING \(mandatory — replace Image 1 background entirely\): the room shown in Image 3 is where the subject is — exactly that room: living room, in the room shown in Image 3/
    );
    assert.match(out, /single-subject framing\. clean skin/);
  });
});

describe('withPlacePhotoInLongAdultBrief', () => {
  it('names the room in the brief\'s scene sentence; the map lines stay', () => {
    const brief =
      'Change the scene so she is indoors at sunlit bedroom with rumpled sheets — opaque walls only, lit only by indoor lamp or window light. Image 3 has two skeletons.';
    const out = withPlacePhotoInLongAdultBrief(brief, 4);
    assert.match(
      out,
      /^Change the scene so she is indoors in the room shown in Image 4 — exactly that room: the same walls, floor, windows, furniture, plants and colours — opaque walls only/
    );
    assert.match(out, /Image 3 has two skeletons\./);
  });

  it('falls back to a Room sentence', () => {
    assert.match(
      withPlacePhotoInLongAdultBrief('Moment: on the sofa.', 4),
      /Moment: on the sofa\. Room: the room shown in Image 4/
    );
  });
});
