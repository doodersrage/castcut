/**
 * Cut sound levels (shared by the Cut options and the server encode): the music bed and the
 * talking clips' lines, as gains. 1 = as recorded. The server mix ducks the music under lines
 * either way; these set how loud each sits.
 */

export const MUSIC_LEVEL_RANGE = { min: 0, max: 1.5 } as const;
export const VOICE_LEVEL_RANGE = { min: 0.5, max: 2 } as const;

function clampLevel(value: unknown, range: { min: number; max: number }): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.round(Math.min(range.max, Math.max(range.min, numeric)) * 100) / 100;
}

export function normalizeMusicLevel(value: unknown): number {
  return value == null ? 1 : clampLevel(value, MUSIC_LEVEL_RANGE);
}

export function normalizeVoiceLevel(value: unknown): number {
  return value == null ? 1 : clampLevel(value, VOICE_LEVEL_RANGE);
}

/** "music 60% · lines 150%" for the options summary (empty at the defaults). */
export function mixLevelsSummary(music?: number, voice?: number): string {
  const m = normalizeMusicLevel(music);
  const v = normalizeVoiceLevel(voice);
  return [
    m !== 1 ? `music ${Math.round(m * 100)}%` : '',
    v !== 1 ? `lines ${Math.round(v * 100)}%` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
