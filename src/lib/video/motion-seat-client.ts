/**
 * Client: does the still already show a seat behind or under her (motion-seat.ts)? One vision
 * call per still, remembered for the session (reopening the Director doesn't ask again). Null when
 * the LLM is off, no vision model is set up or the call fails — the seat edit then stays on, as
 * before the check.
 */

import { askStillGesture } from '../pose/gesture-vision-client';
import { loadSettingsCache } from '../settings/cache';
import { SEAT_SEEN_QUESTION, seatSeenFromAnswers } from './motion-seat';

const seen = new Map<string, Promise<boolean | null>>();

export function stillShowsSeat(imageUrl: string): Promise<boolean | null> {
  const cached = seen.get(imageUrl);
  if (cached) return cached;
  let shared: ReturnType<typeof loadSettingsCache>['shared'] | undefined;
  try {
    shared = loadSettingsCache().shared;
  } catch {
    shared = undefined;
  }
  if (shared?.sessionLlmEnabled === false) return Promise.resolve(null);
  const asked = askStillGesture({ imageUrl, questions: [{ ...SEAT_SEEN_QUESTION }], shared })
    .then(reply => seatSeenFromAnswers(reply?.answers ?? null))
    .catch(() => null)
    .then(answer => {
      // Unanswered (LLM busy or down): ask again next time.
      if (answer === null) seen.delete(imageUrl);
      return answer;
    });
  seen.set(imageUrl, asked);
  return asked;
}
