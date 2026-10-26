/**
 * Cut's sound mix beyond the levels: the music's start point and fades, an ambience track under
 * everything, and J / L cuts (a clip's sound starting before its picture, or carrying on after
 * it). Pure — the encode (video-server-encode.ts) and the monitor (useCutPreview.ts) read the
 * same numbers.
 */

/** Music and ambience settings for a cut. */
export type CutSoundOptions = {
  /** Start the music this many seconds in (skip its intro). */
  musicStartSec?: number;
  /** Fade the music in over this many seconds (0 = straight in). */
  musicFadeInSec?: number;
  /** Fade the music out over this many seconds at the end (default 1). */
  musicFadeOutSec?: number;
  /** A room tone / ambience track, looped under the whole film. */
  ambienceUrl?: string;
  /** Display name after a local upload. */
  ambienceName?: string;
  /** Ambience gain, 0–1 (default 0.35). */
  ambienceLevel?: number;
  /** Tracks muted (M4 F4): silent in the monitor and left out of the encode. */
  mutedTracks?: CutTrack[];
};

/**
 * The cut's sound tracks as the encode mixes them (video-server-encode.ts): the music bed, the
 * ambience, the clips' own sound (talking clips' lines with it) and the narration voice-over.
 */
export type CutTrack = 'music' | 'ambience' | 'clips' | 'narration';
export const CUT_TRACKS: readonly CutTrack[] = ['clips', 'narration', 'music', 'ambience'];
export const CUT_TRACK_LABELS: Record<CutTrack, string> = {
  clips: 'Clip sound',
  narration: 'Narration',
  music: 'Music',
  ambience: 'Ambience',
};

/**
 * A track's gain from mute and solo: 0 or 1. Solo (one track, the monitor only — never saved,
 * never encoded) silences every other track; a muted track is silent unless it is the solo.
 */
export function cutTrackGain(
  sound: Pick<CutSoundOptions, 'mutedTracks'> | null | undefined,
  track: CutTrack,
  solo?: CutTrack | null
): 0 | 1 {
  if (solo) return solo === track ? 1 : 0;
  return sound?.mutedTracks?.includes(track) ? 0 : 1;
}

/** The muted tracks with `track` muted or not. */
export function withTrackMuted(
  sound: CutSoundOptions | null | undefined,
  track: CutTrack,
  muted: boolean
): CutSoundOptions {
  const rest = (sound?.mutedTracks ?? []).filter(entry => entry !== track);
  const mutedTracks = muted ? [...rest, track] : rest;
  const { mutedTracks: _old, ...base } = sound ?? {};
  return mutedTracks.length ? { ...base, mutedTracks } : base;
}

/**
 * What the encode gets with the muted tracks left out: the music at level 0, every clip's own
 * sound at 0 (`clipKeys`; the lines level can't go below half), no ambience file, no narration.
 * `left` names them, for the status line.
 */
export function withMutedTracksLeftOut<
  O extends {
    musicLevel?: number;
    narrate?: boolean;
    sound?: CutSoundOptions;
    shotEdits?: { shots?: Record<string, { volume?: number } & Record<string, unknown>> } & Record<
      string,
      unknown
    >;
  },
>(options: O, clipKeys: readonly string[] = []): { options: O; left: CutTrack[] } {
  const muted = options.sound?.mutedTracks ?? [];
  if (!muted.length) return { options, left: [] };
  const next: O = { ...options };
  const left: CutTrack[] = [];
  if (muted.includes('music')) {
    next.musicLevel = 0;
    left.push('music');
  }
  if (muted.includes('clips') && clipKeys.length) {
    const shots = { ...(options.shotEdits?.shots ?? {}) };
    for (const key of clipKeys) shots[key] = { ...shots[key], volume: 0 };
    next.shotEdits = { ...(options.shotEdits ?? {}), shots };
    left.push('clips');
  }
  if (muted.includes('narration') && options.narrate) {
    next.narrate = false;
    left.push('narration');
  }
  if (muted.includes('ambience') && options.sound?.ambienceUrl) {
    const { ambienceUrl: _url, ambienceName: _name, ...sound } = options.sound;
    next.sound = sound;
    left.push('ambience');
  }
  return { options: next, left };
}

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

export const normalizeMusicStartSec = (value: unknown) => clamp(value, 0, 600, 0);
export const normalizeMusicFadeInSec = (value: unknown) => clamp(value, 0, 8, 0);
export const normalizeMusicFadeOutSec = (value: unknown) => clamp(value, 0, 8, 1);
export const normalizeAmbienceLevel = (value: unknown) => clamp(value, 0, 1, 0.35);

/** A clean copy (unknown fields dropped, numbers clamped); null when nothing is set. */
export function normalizeCutSound(value: unknown): CutSoundOptions | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: CutSoundOptions = {};
  if (v.musicStartSec !== undefined) out.musicStartSec = normalizeMusicStartSec(v.musicStartSec);
  if (v.musicFadeInSec !== undefined)
    out.musicFadeInSec = normalizeMusicFadeInSec(v.musicFadeInSec);
  if (v.musicFadeOutSec !== undefined)
    out.musicFadeOutSec = normalizeMusicFadeOutSec(v.musicFadeOutSec);
  const ambience = typeof v.ambienceUrl === 'string' ? v.ambienceUrl.trim() : '';
  if (ambience) out.ambienceUrl = ambience;
  if (typeof v.ambienceName === 'string' && v.ambienceName.trim())
    out.ambienceName = v.ambienceName.trim().slice(0, 120);
  if (v.ambienceLevel !== undefined) out.ambienceLevel = normalizeAmbienceLevel(v.ambienceLevel);
  const muted = Array.isArray(v.mutedTracks)
    ? CUT_TRACKS.filter(track => (v.mutedTracks as unknown[]).includes(track))
    : [];
  if (muted.length) out.mutedTracks = muted;
  return Object.keys(out).length ? out : null;
}

/** The music's gain at film time `t` from its fades (1 = full; the level applies on top). */
export function musicFadeGainAt(
  t: number,
  totalSec: number,
  sound?: CutSoundOptions | null
): number {
  const fadeIn = normalizeMusicFadeInSec(sound?.musicFadeInSec);
  const fadeOut = Math.min(normalizeMusicFadeOutSec(sound?.musicFadeOutSec), totalSec);
  let gain = 1;
  if (fadeIn > 0 && t < fadeIn) gain = Math.max(0, t / fadeIn);
  if (fadeOut > 0 && t > totalSec - fadeOut)
    gain = Math.min(gain, Math.max(0, (totalSec - t) / fadeOut));
  return gain;
}

/** The longest J / L overlap Cut offers. */
export const MAX_SOUND_OVERLAP_SEC = 3;

/**
 * A clip's J / L cut, clamped to the sound the file has around what plays: a J cut can only
 * start the sound before the picture as far as the clip's in point leaves (a clip played from its
 * start has nothing before it), an L cut only as far as the file runs past the out point. Not on
 * a sped-up / slowed or reversed clip.
 */
export function soundOverlap(input: {
  /** Where the picture starts in the file. */
  fromSec: number;
  /** How long the picture plays (cut seconds). */
  holdSec: number;
  /** The file's length (null when unknown — no L cut then). */
  fullSec: number | null;
  speed?: number;
  reverse?: boolean;
  leadSec?: number;
  tailSec?: number;
}): { leadSec: number; tailSec: number } {
  if ((input.speed ?? 1) !== 1 || input.reverse) return { leadSec: 0, tailSec: 0 };
  const lead = Math.min(
    clamp(input.leadSec, 0, MAX_SOUND_OVERLAP_SEC, 0),
    Math.max(0, input.fromSec)
  );
  const after =
    input.fullSec != null ? Math.max(0, input.fullSec - (input.fromSec + input.holdSec)) : 0;
  const tail = Math.min(clamp(input.tailSec, 0, MAX_SOUND_OVERLAP_SEC, 0), after);
  return {
    leadSec: Math.round(lead * 1000) / 1000,
    tailSec: Math.round(tail * 1000) / 1000,
  };
}
