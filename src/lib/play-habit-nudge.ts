/**
 * Soft nudge to cut another Day film ~24h after the latest cut.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { loadPlayMetrics, type PlayMetrics } from './play-metrics';
import { loadPlayCampaignState, PLAY_CAMPAIGN_STEPS } from './play-campaign';
import { getCharacter } from './character-os';
import { remixDayFilmHref } from './play-starter';
import { loadSettingsCache } from './settings-cache';

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
  /** "about a day", "8 days" — "188 hours" read like a timer (UI audit 2026-10-11). */
  sinceCutLabel: string;
  /** True when the latest campaign close was a Story cut. */
  fromStory?: boolean;
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

/** True when latest cut is ≥24h ago and nudge not dismissed after that cut. */
/** Time since the last cut in words: "about a day" up to 36 h, then whole days. */
export function sinceCutLabel(elapsedMs: number): string {
  const hours = elapsedMs / (1000 * 60 * 60);
  if (hours < 36) return 'about a day';
  const days = Math.round(hours / 24);
  return `${days} days`;
}

export function resolvePlayHabitNudge(
  metrics: PlayMetrics = loadPlayMetrics(),
  now = Date.now()
): PlayHabitNudge | null {
  const cutAt = metrics.lastFilmCutAt ?? metrics.firstFilmCutAt;
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
  const sharedCharacterId = loadSettingsCache().shared.activeCharacterId?.trim() || '';
  // The Cast you have picked now: the last film's lead was named on a page all about another
  // Cast ("Cut another Day film for Tomas?" with Nora active — UI audit 2026-10-11).
  const characterId = sharedCharacterId || campaign?.characterId?.trim() || '';
  if (!characterId) {
    return null;
  }
  const character = getCharacter(characterId);
  if (!character) {
    return null;
  }
  const name = character.name?.trim() || 'your Cast lead';
  const stepId =
    typeof campaign?.stepIndex === 'number'
      ? PLAY_CAMPAIGN_STEPS[campaign.stepIndex]?.id
      : undefined;
  const fromStory = stepId === 'roleplay';
  return {
    characterId,
    characterName: name,
    href: remixDayFilmHref(characterId),
    hoursSinceCut: Math.floor(elapsed / (1000 * 60 * 60)),
    sinceCutLabel: sinceCutLabel(elapsed),
    fromStory,
  };
}
