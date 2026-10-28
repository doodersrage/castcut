/**
 * Cut's sound mix beyond the levels: the music's start point and fades, an ambience track under
 * everything, sound effects placed at a time (M10 T4), and J / L cuts (a clip's sound starting
 * before its picture, or carrying on after it). Pure — the encode (video-server-encode.ts) and the monitor (useCutPreview.ts) read the
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
  /** The effects track (M10 T4): sounds placed at a time in the film. */
  effects?: CutEffect[];
};

/** A sound placed on the effects track: a door slam at 12.4 s, at its own level. */
export type CutEffect = {
  id: string;
  url: string;
  name?: string;
  /** Film seconds where it starts. */
  atSec: number;
  /** Gain, 0–2 (1 = as recorded). */
  level?: number;
  /** Silent in the monitor and left out of the encode. */
  muted?: boolean;
};

export const CUT_EFFECTS_MAX = 60;
export const normalizeEffectLevel = (value: unknown) => clamp(value, 0, 2, 1);
export const normalizeEffectAt = (value: unknown) =>
  Math.round(clamp(value, 0, 3600, 0) * 1000) / 1000;

/**
 * The cut's sound tracks as the encode mixes them (video-server-encode.ts): the music bed, the
 * ambience, the clips' own sound (talking clips' lines with it) and the narration voice-over.
 */
export type CutTrack = 'music' | 'ambience' | 'clips' | 'narration' | 'effects';
export const CUT_TRACKS: readonly CutTrack[] = [
  'clips',
  'narration',
  'music',
  'ambience',
  'effects',
];
export const CUT_TRACK_LABELS: Record<CutTrack, string> = {
  clips: 'Clip sound',
  narration: 'Narration',
  music: 'Music',
  ambience: 'Ambience',
  effects: 'Effects',
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
    const { ambienceUrl: _url, ambienceName: _name, ...sound } = next.sound ?? options.sound;
    next.sound = sound;
    left.push('ambience');
  }
  if (muted.includes('effects') && options.sound?.effects?.length) {
    const { effects: _effects, ...sound } = next.sound ?? options.sound;
    next.sound = sound;
    left.push('effects');
  }
  return { options: next, left };
}

/** The effects the encode mixes: unmuted, in time order. */
export function heardEffects(sound: CutSoundOptions | null | undefined): CutEffect[] {
  return (sound?.effects ?? [])
    .filter(effect => !effect.muted && effect.url)
    .sort((a, b) => a.atSec - b.atSec);
}

/** Stored effects, tidied: a url, a time and a level each; at most CUT_EFFECTS_MAX. */
export function normalizeCutEffects(raw: unknown): CutEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: CutEffect[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' ? e.id.trim().slice(0, 80) : '';
    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (!id || !url || seen.has(id)) continue;
    seen.add(id);
    const name = typeof e.name === 'string' ? e.name.trim().slice(0, 120) : '';
    out.push({
      id,
      url,
      ...(name ? { name } : {}),
      atSec: normalizeEffectAt(e.atSec),
      ...(e.level !== undefined && normalizeEffectLevel(e.level) !== 1
        ? { level: normalizeEffectLevel(e.level) }
        : {}),
      ...(e.muted === true ? { muted: true } : {}),
    });
  }
  return out.sort((a, b) => a.atSec - b.atSec).slice(0, CUT_EFFECTS_MAX);
}

/** The sound with one effect added, changed (by id) or removed (patch null). */
export function withCutEffect(
  sound: CutSoundOptions | null | undefined,
  id: string,
  patch: Partial<CutEffect> | null
): CutSoundOptions {
  const { effects = [], ...rest } = sound ?? {};
  const at = effects.findIndex(effect => effect.id === id);
  const next =
    patch === null
      ? effects.filter(effect => effect.id !== id)
      : at >= 0
        ? effects.map(effect => (effect.id === id ? { ...effect, ...patch, id } : effect))
        : [...effects, { atSec: 0, url: '', ...patch, id }];
  const clean = normalizeCutEffects(next);
  return clean.length ? { ...rest, effects: clean } : rest;
}

/**
 * The effects in an ffmpeg graph (the encode): each from its input, at its level, delayed to its
 * time; mixed into `[fx]`, padded or cut to the film's end. Null when there are none.
 */
export function effectsFilterParts(input: {
  effects: ReadonlyArray<{ input: number; atSec: number; level?: number }>;
  endSec: number;
  stereo: string;
  fadeOut: string;
}): { parts: string[]; label: string } | null {
  const placed = input.effects.filter(effect => effect.atSec < input.endSec);
  if (!placed.length) return null;
  const parts = placed.map((effect, k) => {
    const level = normalizeEffectLevel(effect.level);
    return `[${effect.input}:a]${input.stereo},asetpts=PTS-STARTPTS${level !== 1 ? `,volume=${level}` : ''},adelay=${Math.round(effect.atSec * 1000)}:all=1[fx${k}]`;
  });
  const labels = placed.map((_, k) => `[fx${k}]`).join('');
  parts.push(
    `${labels}${placed.length > 1 ? `amix=inputs=${placed.length}:duration=longest:normalize=0,` : ''}apad=whole_dur=${input.endSec},atrim=0:${input.endSec},${input.fadeOut}[fx]`
  );
  return { parts, label: 'fx' };
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
  const effects = normalizeCutEffects(v.effects);
  if (effects.length) out.effects = effects;
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
