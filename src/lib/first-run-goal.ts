/**
 * First-run “What do you want to make?” goals.
 * Choosing a goal sets Play workspace and a durable landing CTA.
 */

import { readBrowserString, writeBrowserString } from './browser-storage';

export type FirstRunGoalId = 'character' | 'film' | 'image' | 'surprise';

const GOAL_KEY = 'comfy-first-run-goal-v1';

/** Keep in sync with empty-cta FIRST_RUN_* constants (avoid circular import). */
const GENERATE_HREF = '/?source=random';
const QUEUE_HREF = '/?source=random&autogen=1&autoqueue=1';

export type FirstRunGoalCta = {
  label: string;
  href: string;
};

export type FirstRunGoalOption = {
  id: FirstRunGoalId;
  label: string;
  description: string;
  cta: FirstRunGoalCta;
};

export const FIRST_RUN_GOAL_OPTIONS: FirstRunGoalOption[] = [
  {
    id: 'character',
    label: 'Character',
    description: 'Create a Cast lead and keep using them across looks and films.',
    cta: { label: 'Create on Film', href: '/play' },
  },
  {
    id: 'film',
    label: 'Scene / Film',
    description: 'Look → Outfit → Day → Cut film — stills to a short sequence.',
    cta: { label: 'Start a film', href: '/play' },
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Generate or edit a still. Switch models under Advanced later.',
    cta: { label: 'Open Generate', href: GENERATE_HREF },
  },
  {
    id: 'surprise',
    label: 'Surprise me',
    description: 'Queue a random first scene with no keywords required.',
    cta: { label: 'Generate & queue first scene', href: QUEUE_HREF },
  },
];

export function normalizeFirstRunGoal(value: unknown): FirstRunGoalId | null {
  if (value === 'character' || value === 'film' || value === 'image' || value === 'surprise') {
    return value;
  }
  return null;
}

export function loadFirstRunGoal(): FirstRunGoalId | null {
  return normalizeFirstRunGoal(readBrowserString(GOAL_KEY));
}

export function saveFirstRunGoal(goal: FirstRunGoalId): void {
  writeBrowserString(GOAL_KEY, goal);
}

export function clearFirstRunGoal(): void {
  writeBrowserString(GOAL_KEY, '');
}

export function resolveFirstRunGoalCta(goal?: FirstRunGoalId | null): FirstRunGoalCta | null {
  const id = goal ?? loadFirstRunGoal();
  if (!id) {
    return null;
  }
  return FIRST_RUN_GOAL_OPTIONS.find(entry => entry.id === id)?.cta ?? null;
}
