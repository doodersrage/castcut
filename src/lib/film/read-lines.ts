/**
 * Lines read aloud, remembered (narration-client.ts): Cut's read lines, narration and audio
 * description kept by what was read and in whose voice, so cutting again — after a reload, or the
 * next version of a 342-line episode — reuses them instead of reading every line again (a minute
 * or more each). Newest kept, the oldest dropped past the limit (wide-stills.ts, the same list).
 */

import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { withWideStill } from './wide-stills';

export const READ_LINES_KEY = 'film-read-lines';
export const READ_LINES_MAX = 4000;

/** What was read (and in whose voice) → the clip's address, oldest first. */
export type ReadLines = Record<string, string>;

export function normalizeReadLines(raw: unknown): ReadLines {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string] =>
          Boolean(entry[0]) && typeof entry[1] === 'string' && Boolean(entry[1])
      )
      .slice(-READ_LINES_MAX)
  );
}

export function withReadLine(
  list: ReadLines,
  key: string,
  url: string,
  max = READ_LINES_MAX
): ReadLines {
  return withWideStill(list, key, url, max);
}

export function loadReadLines(): ReadLines {
  return normalizeReadLines(readBrowserValue<unknown>(READ_LINES_KEY));
}

export function rememberReadLine(key: string, url: string): void {
  writeBrowserValue(READ_LINES_KEY, withReadLine(loadReadLines(), key, url));
}
