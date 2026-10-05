import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUILT_IN_POSE_PACKS,
  applyPosePackToSlots,
  posePackEntryFitsSetting,
} from './day-pose-packs';
import {
  DAY_LATE_SLOT_BEAT_PRESETS,
  DAY_LATE_SLOT_SETTING_PRESETS,
  DAY_SLOT_BEAT_PRESETS,
  DAY_SLOT_SETTING_PRESETS,
  diversifyDaySlotScenes,
  everydayStanceDirective,
  type DaySlot,
} from './day-planner';
import { dayStillSceneRedraw, dayStillSceneSlot } from './day-still-prompt';
import {
  beatFitsSetting,
  fitBeatToSetting,
  sceneSurfaceConflicts,
  sceneSurfaces,
  sceneVenue,
  settingHostsLying,
  surfaceWordsForSetting,
  withSceneGround,
} from './scene-surface';
import { auditStillPrompt, settingInStillPrompt } from './still-prompt-audit';

const PLAZA = 'busy plaza with a fountain and café umbrellas';
const STREET = 'busy crosswalk downtown';
const PARK = 'leafy city park lawn in late-morning sun';
const BEACH = 'quiet morning beach with raked sand and a striped umbrella';
const BEDROOM = 'sunlit bedroom with rumpled white sheets';
const LIVING = 'dim apartment living room lit by a single lamp and the TV';
const KITCHEN = 'sunlit kitchen window with breakfast clutter on the counters';
const CAFE = 'bright brunch café with marble tables and hanging plants';
/** Castcut_02403's beat (Everyday late morning). */
const SOFA_READ = 'lying on her side on the sofa, head propped on one hand, reading';

describe('sceneVenue', () => {
  it('reads the kind of place from the Setting, rooms first, then outdoor places with café words', () => {
    assert.equal(sceneVenue(PLAZA), 'plaza');
    assert.equal(sceneVenue(STREET), 'street');
    assert.equal(sceneVenue('café corner on a city street'), 'street');
    assert.equal(sceneVenue('lamplit street of restaurants just after dinner'), 'street');
    assert.equal(sceneVenue(PARK), 'park');
    assert.equal(sceneVenue(BEACH), 'beach');
    assert.equal(sceneVenue(BEDROOM), 'bedroom');
    assert.equal(sceneVenue(LIVING), 'living');
    assert.equal(sceneVenue('kitchen lit only by the open fridge'), 'kitchen');
    assert.equal(sceneVenue(CAFE), 'cafe');
    assert.equal(sceneVenue('corner café counter with a fresh pour-over'), 'cafe');
    assert.equal(sceneVenue('sunlit seaside café terrace with white chairs'), 'cafe');
    assert.equal(sceneVenue('golden-hour rooftop garden overlooking a sprawling city'), 'rooftop');
    assert.equal(sceneVenue('steamy bathroom with fogged glass and warm tile — indoor only'), 'bathroom');
    // Unknown, or a sport's own course: no check, no rewrite.
    assert.equal(sceneVenue('convention stage with bright lights'), null);
    assert.equal(sceneVenue('a grass-and-sand pit sector with churned ruts'), null);
    assert.equal(sceneVenue(''), null);
  });
});

describe('sceneSurfaces', () => {
  it('names what to lie, sit and kneel on — and nowhere to lie on a street or in a café', () => {
    assert.equal(sceneSurfaces(PARK)?.lie, 'on the grass');
    assert.equal(sceneSurfaces(BEACH)?.lie, 'on a towel on the sand');
    assert.equal(sceneSurfaces(BEDROOM)?.lie, 'on the bed');
    assert.equal(sceneSurfaces(LIVING)?.lie, 'on the sofa');
    assert.equal(sceneSurfaces(KITCHEN)?.sit, 'on a stool at the counter');
    assert.equal(sceneSurfaces(STREET)?.lie, null);
    assert.equal(sceneSurfaces(STREET)?.sit, 'on a low step');
    assert.equal(sceneSurfaces(CAFE)?.lie, null);
    // Something the Setting names to sit on wins.
    assert.equal(sceneSurfaces(PLAZA)?.sit, "on the fountain's edge");
    assert.equal(sceneSurfaces('corner laundromat with round windows and a bench along the wall')?.sit, 'on the bench');
    assert.equal(sceneSurfaces('convention stage with bright lights'), null);
    assert.equal(settingHostsLying(STREET), false);
    assert.equal(settingHostsLying(PARK), true);
    assert.equal(settingHostsLying('convention stage'), true);
  });
});

describe('fitBeatToSetting', () => {
  it('Castcut_02403: a sofa beat on a plaza sits on the fountain’s edge, not lying', () => {
    assert.equal(
      fitBeatToSetting(SOFA_READ, PLAZA),
      "sitting on the fountain's edge, chin resting on one hand, reading"
    );
  });

  it('keeps the lying pose where the place has somewhere to lie, on its own ground', () => {
    assert.equal(
      fitBeatToSetting(SOFA_READ, PARK),
      'lying on her side on the grass, head propped on one hand, reading'
    );
    assert.equal(
      fitBeatToSetting('lying on the rug mid-stretch before the day starts', BEDROOM),
      'lying on the rug mid-stretch before the day starts'
    );
  });

  it('moves only the furniture her body is on', () => {
    assert.equal(
      fitBeatToSetting('kneeling on the rug to zip a bag by the door', 'quiet neighborhood sidewalk at sunrise'),
      'kneeling on one knee on the pavement to zip a bag by the door'
    );
    assert.equal(
      fitBeatToSetting('sitting at the counter taking a bite of a slice of pizza', 'park bench under amber streetlights'),
      'sitting on the bench taking a bite of a slice of pizza'
    );
    assert.equal(
      fitBeatToSetting('sprawled sideways in an armchair still in the coat', 'city street at night'),
      'slouched sideways on a low step still in the coat'
    );
    // A standing beat at a counter has no place-free version: left for the planner to redraw.
    const reach = 'reaching for a mug at the counter, weight on one hip';
    assert.equal(fitBeatToSetting(reach, STREET), reach);
    assert.ok(sceneSurfaceConflicts(reach, STREET).length > 0);
  });

  it('leaves a beat that fits, and a Setting of no known kind, as they are', () => {
    assert.equal(fitBeatToSetting('sitting on a park bench reading a book', PARK), 'sitting on a park bench reading a book');
    assert.equal(fitBeatToSetting(SOFA_READ, 'convention stage with bright lights'), SOFA_READ);
    assert.equal(fitBeatToSetting('', PLAZA), '');
  });

  it('fits every Everyday beat the planner can draw, or leaves it for a redraw', () => {
    const pools: Array<[string[], string[]]> = [
      ...Object.keys(DAY_SLOT_BEAT_PRESETS).map(
        part =>
          [
            DAY_SLOT_BEAT_PRESETS[part as keyof typeof DAY_SLOT_BEAT_PRESETS],
            DAY_SLOT_SETTING_PRESETS[part as keyof typeof DAY_SLOT_SETTING_PRESETS],
          ] as [string[], string[]]
      ),
      ...Object.keys(DAY_LATE_SLOT_BEAT_PRESETS).map(
        part =>
          [
            DAY_LATE_SLOT_BEAT_PRESETS[part as keyof typeof DAY_LATE_SLOT_BEAT_PRESETS],
            DAY_LATE_SLOT_SETTING_PRESETS[part as keyof typeof DAY_LATE_SLOT_SETTING_PRESETS],
          ] as [string[], string[]]
      ),
    ];
    let fitted = 0;
    let redrawn = 0;
    for (const [beats, settings] of pools) {
      for (const beat of beats) {
        for (const setting of settings) {
          if (beatFitsSetting(beat, setting)) continue;
          const slot = dayStillSceneSlot({ sceneHints: beat, location: setting }, {
            dayMood: 'everyday',
            intimateEnabled: false,
          });
          const redraw = dayStillSceneRedraw(slot, {
            dayMood: 'everyday',
            intimateEnabled: false,
            pairedScenes: false,
          });
          if (redraw) {
            redrawn += 1;
            continue;
          }
          fitted += 1;
          assert.deepEqual(sceneSurfaceConflicts(slot.sceneHints, setting), [], `${beat} → ${slot.sceneHints} @ ${setting}`);
        }
      }
    }
    assert.ok(fitted > 100, `fitted ${fitted}`);
    assert.ok(redrawn < fitted / 2, `redrawn ${redrawn}`);
  });
});

describe('sceneSurfaceConflicts', () => {
  it('finds furniture the place lacks and lying where nobody lies', () => {
    assert.deepEqual(
      sceneSurfaceConflicts('She lies on her side on the sofa, whole body horizontal along it.', PLAZA).map(c => c.kind),
      ['surface', 'posture']
    );
    assert.deepEqual(sceneSurfaceConflicts('She lies back on the grass.', STREET).map(c => c.evidence), ['on the grass', 'lies back']);
    assert.deepEqual(sceneSurfaceConflicts('stirring a pot at the stove', PARK).map(c => c.evidence), ['at the stove']);
    assert.deepEqual(sceneSurfaceConflicts('LYING = body stretched ON the bed/couch/floor', STREET).map(c => c.evidence), ['ON the bed', 'LYING =']);
  });

  it('ignores guards, stance lists, the Setting’s own words and a doormat', () => {
    assert.deepEqual(sceneSurfaceConflicts('never hands-and-knees or rear-presenting on a bed', PLAZA), []);
    assert.deepEqual(
      sceneSurfaceConflicts('match the beat stance — seated, mid-stride, reclining, relaxing, or waving', STREET),
      []
    );
    assert.deepEqual(
      sceneSurfaceConflicts('SCENE: she is in the leafy city park lawn — sitting on the grass.', PARK),
      []
    );
    assert.deepEqual(sceneSurfaceConflicts('bending to pick up keys dropped on the mat', STREET), []);
    assert.deepEqual(sceneSurfaceConflicts('She lies on the sofa.', 'convention stage'), []);
  });
});

describe('stance words and ground', () => {
  it('cuts a stance directive’s seats and beds to the place', () => {
    assert.equal(surfaceWordsForSetting(['bed', 'couch', 'floor'], 'lie', null), 'ON the bed/couch/floor');
    assert.equal(surfaceWordsForSetting(['bed', 'couch', 'floor'], 'lie', LIVING), 'ON the couch/floor');
    assert.equal(surfaceWordsForSetting(['bed', 'couch', 'floor'], 'lie', PARK), 'ON the grass');
    assert.equal(surfaceWordsForSetting(['chair', 'bench', 'stool', 'couch'], 'sit', PLAZA), 'ON a chair/bench');
    assert.match(everydayStanceDirective('LYING', PARK), /^LYING = body stretched ON the grass, hips and back down/);
    // No Setting: the wording is the one it always was.
    assert.equal(
      everydayStanceDirective('LYING'),
      'LYING = body stretched ON the bed/couch/floor, hips and back down — never standing beside it'
    );
  });

  it('says a pose’s floor as the ground outdoors', () => {
    assert.equal(
      withSceneGround('Pose: sitting on the floor cross-legged.', 'golden-hour rooftop garden'),
      'Pose: sitting on the deck cross-legged.'
    );
    assert.equal(withSceneGround('sitting on the floor cross-legged', PARK), 'sitting on the grass cross-legged');
    assert.equal(withSceneGround('sitting on the floor cross-legged', LIVING), 'sitting on the floor cross-legged');
  });
});

describe('dayStillSceneSlot / dayStillSceneRedraw', () => {
  const clothed = { dayMood: 'everyday', intimateEnabled: false };
  it('fits a clothed still’s beat and keeps a typed beat typed', () => {
    const slot = { location: PLAZA, sceneHints: SOFA_READ, sceneHintsTyped: SOFA_READ };
    const fitted = dayStillSceneSlot(slot, clothed);
    assert.equal(fitted.sceneHints, "sitting on the fountain's edge, chin resting on one hand, reading");
    assert.equal(fitted.sceneHintsTyped, fitted.sceneHints);
    // A locked location stands in for an empty Setting.
    assert.equal(
      dayStillSceneSlot({ sceneHints: SOFA_READ }, { ...clothed, lockedLocation: PLAZA }).sceneHints,
      fitted.sceneHints
    );
  });

  it('leaves adult stills alone; an adult mood with Intimate off plays as Everyday', () => {
    const slot = { location: PLAZA, sceneHints: SOFA_READ };
    assert.equal(dayStillSceneSlot(slot, { dayMood: 'intimate', intimateEnabled: true }), slot);
    assert.notEqual(dayStillSceneSlot(slot, { dayMood: 'intimate', intimateEnabled: false }), slot);
  });

  it('redraws a drawn beat the place cannot host, never a typed one', () => {
    const stove = { location: STREET, sceneHints: 'cooking a midnight omelette at the stove' };
    assert.deepEqual(dayStillSceneRedraw(stove, { ...clothed, pairedScenes: false }), {
      sceneHints: undefined,
      sceneHintsTyped: undefined,
    });
    assert.deepEqual(dayStillSceneRedraw(stove, { ...clothed, pairedScenes: true }), {
      sceneHints: undefined,
      sceneHintsTyped: undefined,
      location: undefined,
    });
    assert.equal(
      dayStillSceneRedraw({ ...stove, sceneHintsTyped: stove.sceneHints }, { ...clothed, pairedScenes: false }),
      null
    );
    assert.equal(dayStillSceneRedraw({ location: KITCHEN, sceneHints: stove.sceneHints }, { ...clothed, pairedScenes: false }), null);
  });
});

describe('planner and pose packs', () => {
  it('Everyday draws a beat the slot’s Setting can host', () => {
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const places = [PLAZA, STREET, CAFE, KITCHEN];
    for (let run = 0; run < 30; run += 1) {
      const slots: DaySlot[] = (['morning', 'afternoon', 'evening', 'night'] as const).map(
        (id, index) => ({ id, label: id, location: places[(run + index) % places.length] })
      );
      const { slots: drawn } = diversifyDaySlotScenes(slots, { dayMood: 'everyday', random });
      for (const slot of drawn) {
        const beat = slot.sceneHints ?? '';
        assert.ok(beatFitsSetting(beat, slot.location), `${beat} on ${slot.location}`);
      }
    }
  });

  it('a pack skips lying poses on a street slot and sofa beats it would write there', () => {
    const lounging = BUILT_IN_POSE_PACKS.find(pack => pack.id === 'lounging')!;
    const lie = lounging.entries.find(entry => entry.layout === 'lie_front')!;
    assert.equal(posePackEntryFitsSetting(lie, STREET, false), false);
    assert.equal(posePackEntryFitsSetting(lie, BEDROOM, true), true);
    const slots: DaySlot[] = Array.from({ length: 7 }, (_, index) => ({
      id: index < 4 ? (['morning', 'afternoon', 'evening', 'night'] as const)[index]! : 'morning-2',
      label: `Slot ${index}`,
      location: STREET,
    }));
    const { slots: posed } = applyPosePackToSlots(slots, lounging, { fillBeats: true });
    for (const slot of posed) {
      assert.ok(!/^(?:lie|lounge)/.test(slot.poseLayout ?? ''), `lying layout ${slot.poseLayout} on a street`);
    }
  });
});

describe('auditStillPrompt: scene-surface-mismatch', () => {
  const prompt =
    "Day photo: One woman alone. She lies on her side on the sofa, whole body horizontal along it, head propped on one hand — not sitting. Moment: lying on her side on the sofa, reading. Place: busy plaza with a fountain and café umbrellas.";
  it('flags a pose whose furniture the Setting lacks (Castcut_02403), only when the Setting is given', () => {
    const issues = auditStillPrompt(prompt, { setting: PLAZA });
    assert.deepEqual(issues.map(issue => issue.code), ['scene-surface-mismatch']);
    assert.equal(issues[0]!.evidence, 'on the sofa');
    assert.deepEqual(auditStillPrompt(prompt), []);
    assert.deepEqual(auditStillPrompt(prompt, { setting: null }), []);
    assert.equal(settingInStillPrompt(prompt), PLAZA);
  });

  it('passes the fitted prompt', () => {
    const fitted =
      "Day photo: One woman alone. She sits on the fountain's edge, knees bent. Moment: sitting on the fountain's edge, chin resting on one hand, reading. Place: busy plaza with a fountain and café umbrellas.";
    assert.deepEqual(auditStillPrompt(fitted, { setting: PLAZA }), []);
  });
});

describe('transit kneel', () => {
  it('kneels on the carriage floor inside a car, on the platform at a station', () => {
    assert.match(sceneSurfaces('subway car at rush hour')!.kneel, /floor of the carriage/);
    assert.match(sceneSurfaces('train carriage window seat')!.kneel, /floor of the carriage/);
    assert.match(sceneSurfaces('subway platform late at night')!.kneel, /platform/);
  });
});
