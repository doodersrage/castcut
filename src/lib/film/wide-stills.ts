/**
 * Widened stills, remembered (widen-client.ts): a portrait still filled out to 16:9 for a wide
 * cut is kept by the still's address, so cutting again — or the next version of a 234-shot
 * episode — reuses it instead of widening every picture again (about ten seconds each). Day
 * keeps its own on the slot's still; this is for every other source. Newest kept, the oldest
 * dropped past the limit.
 */

import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const WIDE_STILLS_KEY = 'film-wide-stills';
export const WIDE_STILLS_MAX = 2000;

/** Still address → its widened version's, oldest first. */
export type WideStills = Record<string, string>;

export function normalizeWideStills(raw: unknown): WideStills {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string] =>
          Boolean(entry[0]) && typeof entry[1] === 'string' && Boolean(entry[1])
      )
      .slice(-WIDE_STILLS_MAX)
  );
}

/** The list with `still` → `wide` added as the newest, the oldest dropped past `max`. */
export function withWideStill(
  list: WideStills,
  still: string,
  wide: string,
  max = WIDE_STILLS_MAX
): WideStills {
  const { [still]: _old, ...rest } = list;
  return Object.fromEntries([...Object.entries(rest), [still, wide]].slice(-max));
}

export function loadWideStills(): WideStills {
  return normalizeWideStills(readBrowserValue<unknown>(WIDE_STILLS_KEY));
}

export function rememberWideStill(still: string, wide: string): void {
  writeBrowserValue(WIDE_STILLS_KEY, withWideStill(loadWideStills(), still, wide));
}
