/**
 * "Make a sound" (2026-11-04, parity with ElevenLabs / Runway sound effects): a sound for Cut's
 * effects track from words ("a door slams"). LTX-2.5 writes sound with picture; given a few
 * seconds of plain grey to hold (its video frozen, as Add sound holds a clip) and words naming
 * one sound, it makes that sound alone. Live: a door slam came out as a sharp hit falling to
 * silence, glass shattering bright (centroid ~3.5 kHz), rain a steady bed — Whisper heard no
 * speech in any. Client-safe: the words, the length.
 */

export const SOUND_EFFECT_MIN_SEC = 1;
export const SOUND_EFFECT_MAX_SEC = 8;
export const SOUND_EFFECT_DEFAULT_SEC = 2;
export const SOUND_EFFECT_MAX_WORDS = 200;

export function normalizeSoundEffectSeconds(value: unknown): number {
  const seconds = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(seconds)) return SOUND_EFFECT_DEFAULT_SEC;
  return Math.min(SOUND_EFFECT_MAX_SEC, Math.max(SOUND_EFFECT_MIN_SEC, seconds));
}

/** LTX-2.5's frame count for `seconds` at 24 fps: 8k + 1, at least 9. */
export function soundEffectFrames(seconds: number): number {
  const frames = normalizeSoundEffectSeconds(seconds) * 24;
  return Math.max(9, Math.round((frames - 1) / 8) * 8 + 1);
}

/** What LTX is asked for: the one sound, nothing spoken, no music. */
export function soundEffectPrompt(words: string): string {
  const sound = words
    .trim()
    .slice(0, SOUND_EFFECT_MAX_WORDS)
    .replace(/[.\s]+$/, '');
  return `A sound effect: ${sound}. Only that sound, clearly audible, then quiet. No speech, no talking, no music.`;
}
