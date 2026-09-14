/**
 * Habit loop — soft nudge to cut another Day film ~24h after the first cut.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { loadPlayMetrics, type PlayMetrics } from './play-metrics';
import { loadPlayCampaignState } from './play-campaign';
import { getCharacter } from './character-os';

export const PLAY_HABIT_NUDGE_KEY = 'comfy-play-habit-nudge-v1';

const DAY_MS = 1000 * 60 * 60 * 24;

export type PlayHabitNudgeState = {
  version: 1;
  /** User dismissed the current nudge window. */
  dismissedAt?: number;
};

export type PlayHabitNudge = {
  characterId: string;
  characterName: string;
  href: string;
  hoursSinceCut: number;
};

function loadNudgeState(): PlayHabitNudgeState {
  const raw = readBrowserValue<Partial<PlayHabitNudgeState>>(PLAY_HABIT_NUDGE_KEY);
  return {
    version: 1,
    dismissedAt: typeof raw?.dismissedAt === 'number' ? raw.dismissedAt : undefined,
  };
}

export function dismissPlayHabitNudge(at = Date.now()): void {
  writeBrowserValue(PLAY_HABIT_NUDGE_KEY, {
    version: 1,
    dismissedAt: at,
  } satisfies PlayHabitNudgeState);
}

/** True when first cut is ≥24h ago and nudge not dismissed after that cut. */
export function resolvePlayHabitNudge(
  metrics: PlayMetrics = loadPlayMetrics(),
  now = Date.now()
): PlayHabitNudge | null {
  const cutAt = metrics.firstFilmCutAt;
  if (typeof cutAt !== 'number' || cutAt <= 0) {
    return null;
  }
  const elapsed = now - cutAt;
  if (elapsed < DAY_MS) {
    return null;
  }
  const nudge = loadNudgeState();
  if (typeof nudge.dismissedAt === 'number' && nudge.dismissedAt >= cutAt) {
    return null;
  }
  const campaign = loadPlayCampaignState();
  const characterId = campaign?.characterId?.trim() || '';
  const character = characterId ? getCharacter(characterId) : undefined;
  const name = character?.name?.trim() || 'your Cast lead';
  return {
    characterId: characterId || 'unknown',
    characterName: name,
    href: characterId ? `/day?character=${encodeURIComponent(characterId)}` : '/day',
    hoursSinceCut: Math.floor(elapsed / (1000 * 60 * 60)),
  };
}
