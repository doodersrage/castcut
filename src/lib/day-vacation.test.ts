import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_SLOT_VACATION_ACTIVITIES,
  DAY_SLOT_VACATION_BEAT_PRESETS,
  DAY_SLOT_VACATION_SETTING_PRESETS,
  DAY_VACATION_BEAT_CUE_RE,
  DAY_VACATION_SETTING_CUE_RE,
  DAY_VACATION_STALE_SETTING_RE,
  buildDayVacationPromptLocks,
  clothedHeatUnlockPoseClass,
  dayClothedHeatPoseNeedsBodyUnlock,
  daySuggestivePoseNeedsBodyUnlock,
  dayVacationPoseNeedsBodyUnlock,
  pickDayVacationScenePair,
  suggestiveUnlockPoseClass,
  vacationStanceDirective,
} from './day-vacation';

const NON_STAND_POSE_RE =
  /\b(SEATED|MID-STRIDE|RECLINING|RELAXING|DANCING|CLIMBING|WAVING|PERCHED|STRETCHING|KICKING|PADDLING|PEDALING|TOSSING|JUMPING|REACHING|SWIMMING|sit(?:ting)?|seated|reclin|relax|mid-stride|danc|climb|wave|perch|kick|stretch|paddl|pedal|toss|jump|reach|swim)\b/i;

describe('day-vacation', () => {
  it('maps each daypart to travel activities that fit that light', () => {
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.morning.includes('hotel'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.morning.includes('airport'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.morning.includes('spa'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.afternoon.includes('pier'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.afternoon.includes('boat'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.evening.includes('rooftop'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.evening.includes('drive'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.night.includes('hotel'));
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.night.includes('spa'));
  });

  it('ships a large vacation pose catalog per daypart', () => {
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const beats = DAY_SLOT_VACATION_BEAT_PRESETS[slotId];
      assert.ok(beats.length >= 14, `${slotId} should have 14+ poses, got ${beats.length}`);
      assert.ok(DAY_SLOT_VACATION_SETTING_PRESETS[slotId].length >= 10, `${slotId} settings`);
      const nonStand = beats.filter(beat => NON_STAND_POSE_RE.test(beat));
      assert.ok(
        nonStand.length >= Math.ceil(beats.length * 0.7),
        `${slotId} should be mostly non-standing, got ${nonStand.length}/${beats.length}`
      );
      for (const beat of beats) {
        assert.doesNotMatch(
          beat,
          /\b(kneel|kneeling|doggy|mid-sex|missionary|straddl|all\s+fours|hands\s+and\s+knees)\b/i,
          `doggy-prior cue in: ${beat}`
        );
        assert.equal(DAY_VACATION_BEAT_CUE_RE.test(beat), true, `beat cue miss: ${beat}`);
      }
      for (const setting of DAY_SLOT_VACATION_SETTING_PRESETS[slotId]) {
        assert.equal(DAY_VACATION_SETTING_CUE_RE.test(setting), true, `setting cue miss: ${setting}`);
        assert.equal(DAY_VACATION_STALE_SETTING_RE.test(setting), false);
      }
    }
  });

  it('includes explicit RELAXING poses in every daypart', () => {
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const relaxing = DAY_SLOT_VACATION_BEAT_PRESETS[slotId].filter(beat =>
        /\bRELAXING\b/i.test(beat)
      );
      assert.ok(
        relaxing.length >= 2,
        `${slotId} should have 2+ RELAXING beats, got ${relaxing.length}`
      );
    }
  });

  it('includes active poses beyond mid-stride', () => {
    const activeRe =
      /\b(KICKING|SWIMMING|PEDALING|TOSSING|JUMPING|REACHING|PADDLING|DANCING|CLIMBING|STRETCHING)\b/i;
    let activeTotal = 0;
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      activeTotal += DAY_SLOT_VACATION_BEAT_PRESETS[slotId].filter(beat => activeRe.test(beat))
        .length;
    }
    assert.ok(activeTotal >= 12, `expected 12+ active vacation beats, got ${activeTotal}`);
  });

  it('pickDayVacationScenePair prefers unused pose classes across a day', () => {
    const usedPoseClasses = new Set<string>();
    const usedBeats = new Set<string>();
    const usedLocations = new Set<string>();
    let i = 0;
    const sequence = Array.from({ length: 64 }, (_, n) => (n % 10) / 10);
    const classes: string[] = [];
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      const pair = pickDayVacationScenePair(slotId, {
        usedBeats,
        usedLocations,
        usedPoseClasses,
        random: () => sequence[i++ % sequence.length]!,
      });
      assert.ok(pair);
      classes.push(pair!.poseClass);
      usedBeats.add(pair!.beat.toLowerCase());
      usedLocations.add(pair!.setting.trim().toLowerCase());
      usedPoseClasses.add(pair!.poseClass);
    }
    assert.equal(new Set(classes).size, 4, `expected 4 distinct pose classes, got ${classes.join(',')}`);
  });

  it('builds vacation mood locks that fight standing try-on freeze', () => {
    const locks = buildDayVacationPromptLocks({
      beat: 'SEATED at a café terrace sipping morning coffee',
      setting: 'sunlit seaside café terrace',
    });
    assert.match(locks.moodLine, /MOOD: vacation travel day/i);
    assert.match(locks.moodLine, /SEATED|hips on a seat/i);
    assert.match(locks.moodLine, /standing catalog|standing fashion/i);
    assert.match(locks.poseLock, /POSE LOCK/i);
    assert.match(locks.keepUnlock, /standing try-on plate/i);
    assert.match(locks.keepUnlock, /IDENTITY CRITICAL|same face|exact hair color/i);
    assert.doesNotMatch(locks.keepUnlock, /matching Image 3/i);
    assert.equal(locks.poseClass, 'SEATED');
    assert.doesNotMatch(locks.moodLine, /\b(doggy|mid-sex|missionary|oral)\b/i);

    const mid = buildDayVacationPromptLocks({
      beat: 'MID-STRIDE barefoot on wet sand swinging a tote — one foot ahead mid-step',
      setting: 'wet sand at the waterline',
    });
    assert.equal(mid.poseClass, 'MID-STRIDE');
    assert.match(mid.poseLock, /one foot clearly ahead|mid-step walking/i);
    assert.match(mid.keepUnlock, /MID-STRIDE|one foot clearly ahead/i);
    assert.doesNotMatch(mid.poseLock, /\b(doggy|mid-sex)\b/i);
  });

  it('vacationStanceDirective names required silhouette per pose class', async () => {
    const { vacationStanceDirective } = await import('./day-vacation');
    assert.match(vacationStanceDirective('MID-STRIDE'), /FULL BODY|one foot clearly ahead/i);
    assert.match(vacationStanceDirective('WAVING'), /raised HIGH|overhead/i);
    assert.equal(dayVacationPoseNeedsBodyUnlock('MID-STRIDE'), true);
    assert.equal(dayVacationPoseNeedsBodyUnlock('WAVING'), true);
    assert.equal(dayVacationPoseNeedsBodyUnlock('DANCING'), true);
    assert.equal(dayVacationPoseNeedsBodyUnlock('RELAXING'), false);
    assert.equal(dayVacationPoseNeedsBodyUnlock('SEATED'), false);

    const waveLocks = buildDayVacationPromptLocks({
      beat: 'WAVING from a water-taxi rail — one arm high overhead mid-wave',
      setting: 'harbor at dusk',
    });
    assert.equal(waveLocks.poseClass, 'WAVING');
    assert.match(waveLocks.keepUnlock, /CRITICAL:.*WAVING|edit FAILED/i);
    assert.match(waveLocks.poseLock, /BODY: WAVING|arm raised HIGH/i);
    assert.match(vacationStanceDirective('PERCHED'), /hips planted/i);
    assert.match(vacationStanceDirective('RELAXING'), /LYING DOWN|hips and back ON/i);
    assert.match(vacationStanceDirective('REACHING'), /arm stretched high/i);
    assert.match(vacationStanceDirective('SEATED'), /hips firmly ON|knees bent/i);
    assert.match(vacationStanceDirective('DANCING'), /BOTH arms raised|knee lifted/i);

    const danceLocks = buildDayVacationPromptLocks({
      beat: 'DANCING alone on a terrace — both arms raised overhead, one knee lifted mid-kick',
      setting: 'terrace at blue hour',
    });
    assert.equal(danceLocks.poseClass, 'DANCING');
    assert.match(danceLocks.poseLock, /BODY: mid-dance|both arms raised|NEVER both arms hanging/i);
    assert.match(danceLocks.keepUnlock, /CRITICAL:.*DANCING|edit FAILED/i);
    assert.match(vacationStanceDirective('RECLINING'), /LYING DOWN|NOT sitting upright/i);

    const reclineLocks = buildDayVacationPromptLocks({
      beat: 'RECLINING on a pool lounge — body lying flat on the chaise, hips and back on the cushion',
      setting: 'sunlit pool deck',
    });
    assert.equal(reclineLocks.poseClass, 'RECLINING');
    assert.match(reclineLocks.poseLock, /LYING DOWN|NEVER on her feet|NEVER standing beside/i);
  });

  it('pickDayVacationScenePair returns matched beat+venue for a daypart', () => {
    let i = 0;
    const sequence = [0.1, 0.3, 0.5, 0.7, 0.9];
    const pair = pickDayVacationScenePair('afternoon', {
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.ok(pair);
    assert.ok(DAY_SLOT_VACATION_ACTIVITIES.afternoon.includes(pair!.activity));
    assert.ok(DAY_SLOT_VACATION_BEAT_PRESETS.afternoon.includes(pair!.beat));
    assert.ok(DAY_SLOT_VACATION_SETTING_PRESETS.afternoon.includes(pair!.setting));
    assert.equal(DAY_VACATION_STALE_SETTING_RE.test(pair!.setting), false);
  });

  it('maps Suggestive prose upright freezes onto face-break unlock classes', () => {
    assert.equal(
      suggestiveUnlockPoseClass(
        'twisting to zip a dress in a mirror — looking over a shoulder'
      ),
      'LOOK_BACK'
    );
    assert.equal(
      suggestiveUnlockPoseClass(
        'sitting on the hotel bed edge unzipping a dress halfway — lingerie visible'
      ),
      'LOOK_BACK'
    );
    assert.equal(
      suggestiveUnlockPoseClass(
        'leaning in a bedroom doorway in lingerie — hip cocked against the frame'
      ),
      'LEAN'
    );
    assert.equal(
      suggestiveUnlockPoseClass(
        'adjusting a low neckline in a shop window reflection — body angled three-quarter'
      ),
      'LEAN'
    );
    assert.equal(
      suggestiveUnlockPoseClass(
        'DANCING alone on the patio — both arms raised overhead, one knee lifted'
      ),
      'DANCING'
    );
    assert.equal(
      suggestiveUnlockPoseClass(
        'stretching in thin sleepwear by the window — one arm overhead'
      ),
      'STRETCHING'
    );
    assert.equal(
      daySuggestivePoseNeedsBodyUnlock(
        'reclining on a sunlit couch, short hem riding up'
      ),
      false
    );
    assert.equal(
      daySuggestivePoseNeedsBodyUnlock(
        'leaning in a doorway in lingerie and an open robe'
      ),
      true
    );
    assert.equal(
      clothedHeatUnlockPoseClass('leaning in a doorway', 'suggestive'),
      'LEAN'
    );
    assert.equal(
      dayClothedHeatPoseNeedsBodyUnlock('leaning in a doorway', 'suggestive'),
      true
    );
    assert.equal(
      dayClothedHeatPoseNeedsBodyUnlock('leaning in a doorway', 'everyday'),
      false
    );
    // Edit-2511 pose-sticky: sit/lounge also needs face-break (Keep stand + white void).
    assert.equal(
      dayClothedHeatPoseNeedsBodyUnlock(
        'RELAXING on a spa chaise in a robe',
        'vacation',
        { poseStickyModel: true }
      ),
      true
    );
    assert.equal(
      dayClothedHeatPoseNeedsBodyUnlock(
        'RELAXING on a spa chaise in a robe',
        'vacation',
        { poseStickyModel: false }
      ),
      false
    );
    assert.equal(
      dayClothedHeatPoseNeedsBodyUnlock(
        'reclining on a sunlit couch, short hem riding up',
        'suggestive',
        { poseStickyModel: true }
      ),
      true
    );
  });
});
