import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_SLOT_SPORTS,
  DAY_SLOT_SPORT_BEAT_PRESETS,
  DAY_SLOT_SPORT_SETTING_PRESETS,
  DAY_SPORT_STALE_SETTING_RE,
  buildDaySportPromptLocks,
  daySportLabel,
  inferDaySportFromScene,
  pickDaySportScenePair,
} from './day-sport';

describe('day-sport', () => {
  it('maps each daypart to sports that typically run then', () => {
    assert.ok(DAY_SLOT_SPORTS.morning.includes('running'));
    assert.ok(DAY_SLOT_SPORTS.morning.includes('yoga'));
    assert.ok(DAY_SLOT_SPORTS.morning.includes('ski'));
    assert.ok(DAY_SLOT_SPORTS.morning.includes('swimming'));
    assert.ok(DAY_SLOT_SPORTS.morning.includes('surfing'));
    assert.ok(DAY_SLOT_SPORTS.afternoon.includes('tennis'));
    assert.ok(DAY_SLOT_SPORTS.afternoon.includes('volleyball'));
    assert.ok(DAY_SLOT_SPORTS.afternoon.includes('boxing'));
    assert.ok(DAY_SLOT_SPORTS.evening.includes('basketball'));
    assert.ok(DAY_SLOT_SPORTS.evening.includes('ski'));
    assert.ok(DAY_SLOT_SPORTS.night.includes('hockey'));
    assert.ok(DAY_SLOT_SPORTS.night.includes('boxing'));
    assert.ok(!DAY_SLOT_SPORTS.morning.includes('hockey'));
  });

  it('expands sport pose pools past the original three-per-sport floor', async () => {
    const { listSportActionPoses } = await import('./athletic-sport-actions');
    for (const sport of [
      'running',
      'tennis',
      'basketball',
      'soccer',
      'yoga',
      'swimming',
      'volleyball',
      'boxing',
      'surfing',
      'cycling',
    ] as const) {
      assert.ok(
        listSportActionPoses(sport).length >= 5,
        `${sport} should have at least 5 mid-action poses`
      );
    }
    // Cycling Day pool unions road/gravel/MTB/CX/track.
    assert.ok(listSportActionPoses('cycling').length >= 12);
  });

  it('builds non-empty beat and setting presets per slot', () => {
    for (const slotId of ['morning', 'afternoon', 'evening', 'night'] as const) {
      assert.ok(DAY_SLOT_SPORT_BEAT_PRESETS[slotId].length > 0, `${slotId} beats`);
      assert.ok(DAY_SLOT_SPORT_SETTING_PRESETS[slotId].length > 0, `${slotId} settings`);
      for (const beat of DAY_SLOT_SPORT_BEAT_PRESETS[slotId]) {
        assert.match(beat, /athletic action|mid-play|Cast alone/i);
        assert.match(beat, /sport footwear|never a sundress/i);
      }
    }
  });

  it('infers sport from beat text and builds prompt locks', () => {
    assert.equal(inferDaySportFromScene('mid-stride sprint — running athletic action'), 'running');
    assert.equal(daySportLabel('track_field'), 'track and field');
    const locks = buildDaySportPromptLocks({
      beat: 'jump shot release — basketball athletic action in proper basketball kit',
      setting: 'an indoor basketball court under arena lights',
    });
    assert.match(locks.moodLine, /MOOD: sport still/i);
    assert.match(locks.moodLine, /basketball/i);
    assert.match(locks.moodLine, /sundress|fashion pin-up/i);
    assert.ok(locks.wardrobeLock);
    assert.match(locks.wardrobeLock!, /SPORT KIT/i);
    assert.match(locks.wardrobeLock!, /discard Image 1|Never a sundress/i);
  });

  it('pickDaySportScenePair returns matched beat+venue for a daypart', () => {
    let i = 0;
    const sequence = [0.1, 0.3, 0.5, 0.7, 0.9];
    const pair = pickDaySportScenePair('morning', {
      random: () => sequence[i++ % sequence.length]!,
    });
    assert.ok(pair);
    assert.ok(DAY_SLOT_SPORTS.morning.includes(pair!.sport));
    assert.ok(DAY_SLOT_SPORT_BEAT_PRESETS.morning.includes(pair!.beat));
    assert.ok(DAY_SLOT_SPORT_SETTING_PRESETS.morning.includes(pair!.setting));
    assert.equal(DAY_SPORT_STALE_SETTING_RE.test(pair!.setting), false);
  });
});
