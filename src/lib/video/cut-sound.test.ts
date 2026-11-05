import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  levelKeyGainAt,
  levelKeysExpr,
  normalizeCutLevelKeys,
  withCutLevelKey,
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
    assert.match(graph.filter, /\[1:a\][^;]*volume=0\.5,(?:afade=[^,;]*,)*adelay=12400:all=1\[fx0\]/);
    assert.match(graph.filter, /\[2:a\][^;]*adelay=3000:all=1\[fx1\]/);
    // Past the film's end: left out.
    assert.doesNotMatch(graph.filter, /\[3:a\]/);
    assert.match(graph.filter, /\[fx0\]\[fx1\]amix=inputs=2[^;]*apad=whole_dur=20,atrim=0:20/);
    assert.equal(graph.audioLabel, 'fx');
  });

  it('music level points: a line between them, held before and after', () => {
    const keys = normalizeCutLevelKeys([
      { atSec: 10, level: 0.5 },
      { atSec: 4, level: 1 },
      { atSec: 4.05, level: 2 },
      { atSec: 'x', level: 1 },
      { atSec: 20, level: 9 },
    ]);
    assert.deepEqual(keys, [
      { atSec: 4, level: 1 },
      { atSec: 10, level: 0.5 },
      { atSec: 20, level: 2 },
    ]);
    assert.equal(levelKeyGainAt([], 3), 1);
    assert.equal(levelKeyGainAt(keys, 0), 1);
    assert.equal(levelKeyGainAt(keys, 7), 0.75);
    assert.equal(levelKeyGainAt(keys, 15), 1.25);
    assert.equal(levelKeyGainAt(keys, 99), 2);
    assert.deepEqual(withCutLevelKey(keys, 10.05, 0.2)[1], { atSec: 10.05, level: 0.2 });
    assert.equal(withCutLevelKey(keys, 10.05, 0.2).length, 3);
  });

  it('the level line as an ffmpeg expression gives the same numbers', () => {
    const keys = [
      { atSec: 2, level: 1 },
      { atSec: 6, level: 0.5 },
    ];
    const expr = levelKeysExpr(keys);
    assert.equal(levelKeysExpr([]), '');
    // Evaluate the expression the way ffmpeg would (if / lt / arithmetic only).
    const evaluate = (t: number) =>
      Function(
        'iff',
        'lt',
        't',
        `return ${expr.replace(/if\(/g, 'iff(')};`
      )((c: boolean, a: number, b: number) => (c ? a : b), (a: number, b: number) => a < b, t);
    for (const t of [0, 2, 3, 4, 5.9, 6, 10]) {
      assert.ok(Math.abs(evaluate(t) - levelKeyGainAt(keys, t)) < 1e-9, `t=${t}`);
    }
  });

  it('the encode follows the music line and cleans up the voices when asked', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [8],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: true,
      clipAudioInputs: [2],
      speech: [true],
      sound: { voiceCleanup: true, musicKeys: [{ atSec: 1, level: 0.5 }] },
    });
    assert.match(graph.filter, /\[2:a\][^;]*highpass=f=80,afftdn=nf=-25:tn=1,deesser=i=0\.4,/);
    assert.match(graph.filter, /\[1:a\][^;]*volume='if\(lt\(t,1\),0\.5,0\.5\)':eval=frame/);
    const plain = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [8],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: true,
    });
    assert.doesNotMatch(plain.filter, /afftdn|eval=frame/);
  });

  it('stems: the dialogue, ducked music, ambience and effects tapped out of the mix', () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [8],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: true,
      clipAudioInputs: [3],
      speech: [true],
      ambienceInput: 2,
      effectInputs: [{ input: 4, atSec: 1 }],
      stems: true,
    });
    assert.deepEqual(
      graph.stems?.map(stem => stem.name),
      ['dialogue', 'music', 'ambience', 'effects']
    );
    assert.match(graph.filter, /\[speech0\]asplit=2\[speech\]\[st_dialogue_raw\]/);
    assert.match(graph.filter, /\[ducked0\]asplit=2\[ducked\]\[st_music_raw\]/);
    assert.match(graph.filter, /\[st_music_raw\]apad=whole_dur=8,atrim=0:8,afade=t=out/);
    // The mix itself is built as before.
    assert.match(graph.filter, /\[ducked\]\[sp2\]amix/);
    assert.equal(buildFilterComplex({ shotCount: 1, kinds: ['still'], holdSecs: [3], width: 64, height: 36, crossfadeSec: 0, hasAudioBed: false }).stems, undefined);
  });

  it("a clip's own level points follow its sound, moved past a J cut's early start", () => {
    const graph = buildFilterComplex({
      shotCount: 1,
      kinds: ['clip'],
      holdSecs: [6],
      width: 640,
      height: 360,
      crossfadeSec: 0,
      hasAudioBed: false,
      clipAudioInputs: [1],
      speech: [true],
      soundLeads: [0.5],
      trimStarts: [1],
      volumeKeys: [[{ atSec: 2, level: 0.2 }]],
    });
    assert.match(graph.filter, /\[1:a\][^;]*volume='if\(lt\(t,2\.5\),0\.2,0\.2\)':eval=frame,afade=t=in[^;]*,adelay/);
  });
});
