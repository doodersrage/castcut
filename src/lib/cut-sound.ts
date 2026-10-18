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
};

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
