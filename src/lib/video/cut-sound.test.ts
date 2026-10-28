import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  heardEffects,
  musicFadeGainAt,
  normalizeCutEffects,
  normalizeCutSound,
  soundOverlap,
  withCutEffect,
  withMutedTracksLeftOut,
} from './cut-sound';
import { buildFilterComplex } from './server-encode';

describe('cut sound', () => {
  it('keeps only real settings, clamped', () => {
    assert.equal(normalizeCutSound(null), null);
    assert.equal(normalizeCutSound({}), null);
    assert.deepEqual(normalizeCutSound({ musicStartSec: -4, musicFadeInSec: 20, ambienceUrl: ' /a.mp3 ', x: 1 }), {
      musicStartSec: 0,
      musicFadeInSec: 8,
      ambienceUrl: '/a.mp3',
    });
  });

  it('fades the music in and out (1 s out by default)', () => {
    assert.equal(musicFadeGainAt(0, 20, { musicFadeInSec: 2 }), 0);
    assert.equal(musicFadeGainAt(1, 20, { musicFadeInSec: 2 }), 0.5);
    assert.equal(musicFadeGainAt(10, 20, {}), 1);
    assert.equal(musicFadeGainAt(19.5, 20, {}), 0.5);
    assert.equal(musicFadeGainAt(19.5, 20, { musicFadeOutSec: 0 }), 1);
  });

  it('clamps J / L cuts to the sound the file has', () => {
    assert.deepEqual(soundOverlap({ fromSec: 0, holdSec: 3, fullSec: 5, leadSec: 1, tailSec: 1 }), {
      leadSec: 0,
      tailSec: 1,
    });
    assert.deepEqual(soundOverlap({ fromSec: 2, holdSec: 3, fullSec: 5.5, leadSec: 3, tailSec: 3 }), {
      leadSec: 2,
      tailSec: 0.5,
    });
    assert.deepEqual(
      soundOverlap({ fromSec: 2, holdSec: 3, fullSec: 9, leadSec: 1, tailSec: 1, speed: 2 }),
      { leadSec: 0, tailSec: 0 }
    );
  });

  // M10 T4: the effects track.
  it('places, changes and removes effects, kept tidy and in time order', () => {
    let sound = withCutEffect(null, 'fx-door', { url: '/door.wav', name: 'Door', atSec: 12.4 });
    sound = withCutEffect(sound, 'fx-buzz', { url: '/buzz.wav', atSec: 3, level: 5 });
    assert.deepEqual(
      sound.effects?.map(effect => [effect.id, effect.atSec, effect.level]),
      [
        ['fx-buzz', 3, 2],
        ['fx-door', 12.4, undefined],
      ]
    );
    sound = withCutEffect(sound, 'fx-door', { atSec: 14, muted: true });
    assert.deepEqual(
      heardEffects(sound).map(effect => effect.id),
      ['fx-buzz']
    );
    assert.equal(withCutEffect(withCutEffect(sound, 'fx-door', null), 'fx-buzz', null).effects, undefined);
    assert.deepEqual(normalizeCutEffects([{ id: 'x' }, { id: 'y', url: '/y.wav', atSec: -2 }, 'z']), [
      { id: 'y', url: '/y.wav', atSec: 0 },
    ]);
    assert.equal(normalizeCutSound({ effects: [{ id: 'a', url: '/a.wav', atSec: 1 }] })?.effects?.length, 1);
  });

  it('a muted effects track is left out of the encode', () => {
    const options = {
      sound: {
        ambienceUrl: '/room.wav',
        effects: [{ id: 'a', url: '/a.wav', atSec: 1 }],
        mutedTracks: ['effects' as const, 'ambience' as const],
      },
    };
    const { options: out, left } = withMutedTracksLeftOut(options);
    assert.deepEqual(left, ['ambience', 'effects']);
    assert.equal(out.sound?.effects, undefined);
    assert.equal(out.sound?.ambienceUrl, undefined);
  });

  it('the encode mixes each effect at its time and level, on top of the rest', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['still'],
      holdSecs: [20],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      effectInputs: [
        { input: 1, atSec: 12.4, level: 0.5 },
        { input: 2, atSec: 3 },
        { input: 3, atSec: 30 },
      ],
    });
    assert.match(graph.filter, /\[1:a\][^;]*volume=0\.5,adelay=12400:all=1\[fx0\]/);
    assert.match(graph.filter, /\[2:a\][^;]*adelay=3000:all=1\[fx1\]/);
    // Past the film's end: left out.
    assert.doesNotMatch(graph.filter, /\[3:a\]/);
    assert.match(graph.filter, /\[fx0\]\[fx1\]amix=inputs=2[^;]*apad=whole_dur=20,atrim=0:20/);
    assert.equal(graph.audioLabel, 'fx');
  });
});
