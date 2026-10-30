/**
 * "Later" on Film Director's next actions: an action put off for a day is left out of the list
 * until then — or until it changes (its title carries its counts: three failed jobs becoming four
 * is a new thing to do). Kept in this browser only: a convenience, not production data. Pure,
 * but for the two storage helpers.
 */
import type { ProductionAction } from './production-next';

/** How long "Later" puts an action off. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** At most this many snoozes are kept (the oldest dropped). */
const MAX_SNOOZES = 50;
const STORAGE_KEY = 'castcut.director.snoozed';

/** Snoozed actions: `${castId}|${action id}|${title}` → until (ms). */
export type ProductionSnoozes = Record<string, number>;

export const snoozeKey = (castId: string, action: Pick<ProductionAction, 'id' | 'title'>) =>
  `${castId}|${action.id}|${action.title}`;

/** The actions not put off, and how many are. */
export function withoutSnoozed(
  actions: readonly ProductionAction[],
  snoozes: ProductionSnoozes,
  castId: string,
  now = Date.now()
): { shown: ProductionAction[]; snoozed: number } {
  const shown = actions.filter(action => !((snoozes[snoozeKey(castId, action)] ?? 0) > now));
  return { shown, snoozed: actions.length - shown.length };
}

/** `action` put off for SNOOZE_MS; expired snoozes dropped, at most MAX_SNOOZES kept. */
export function snoozeAction(
  snoozes: ProductionSnoozes,
  castId: string,
  action: Pick<ProductionAction, 'id' | 'title'>,
  now = Date.now()
): ProductionSnoozes {
  const live = Object.entries(snoozes).filter(([, until]) => until > now);
  live.push([snoozeKey(castId, action), now + SNOOZE_MS]);
  return Object.fromEntries(live.sort((a, b) => b[1] - a[1]).slice(0, MAX_SNOOZES));
}

/** Every snooze of `castId` lifted. */
export function clearSnoozes(snoozes: ProductionSnoozes, castId: string): ProductionSnoozes {
  return Object.fromEntries(
    Object.entries(snoozes).filter(([key]) => !key.startsWith(`${castId}|`))
  );
}

export function readSnoozes(): ProductionSnoozes {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    );
  } catch {
    return {};
  }
}

export function writeSnoozes(snoozes: ProductionSnoozes): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snoozes));
  } catch {
    // Private mode or full storage: the snooze lasts for this visit.
  }
}
