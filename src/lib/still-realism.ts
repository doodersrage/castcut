/**
 * Realism check (pure): does a still look like a photo, or drawn / computer-made (CGI, 3D render,
 * doll-like, video-game)? The vision model rates the whole picture on an anchored 0–10 scale, in a
 * call of its own (`/api/pose-gesture` with `realism: true` — one request beside the pose
 * questions, two model calls).
 *
 * Calibrated 2026-10-04 on the user's clothed Castcut stills (Day, Outfit, Story; Rapid AIO, Edit
 * 2511 Lightning, Qwen-Image 2.1, Klein), nsfwvision-qwen3-vl-8b-v3, judged by eye. Style labels
 * first, on 58 stills (39 photos, 7 drawn / CGI-looking):
 *
 *   question                                              drawn/CGI caught   false alarms on photos
 *   4-way style (photo / painting / 3D / airbrushed)       1 of 7             38 of 39 "airbrushed"
 *   3-way style (photo / painting / 3D)                    5 of 7             28 of 39
 *   "medium" (photograph / digital painting / …)           4 of 7             22 of 39
 *   0–10 "how much like a camera photo"  ≤ 6               4 of 7             1 of 39
 *   anchored 0–10 (this one)  ≤ 4                          3 of 7             0 of 39
 *
 * Offered the words, the model calls nearly every generated still "airbrushed" or "digital
 * painting"; the anchored scale snaps to its anchors (7 for an ordinary still, 4 for a computer-
 * made one) and only the 4 means something. On 306 recent stills the 4s were 13 drawn / CGI
 * (fantasy Story beats on Rapid — floating cups and drones, glowing smoke — and old Klein anime
 * renders), 5 glossy neon "computer-looking" stills and 3 photos; a look at 24 of the rest found
 * no drawn / CGI still among them. On 102 labelled stills (62 photos, 20 drawn / CGI, 20 glossy):
 *
 *   where the question was asked                          drawn/CGI caught   false alarms on photos
 *   on its own (shipped)                                   15 of 20           2 of 62 (3%)
 *   folded into the pose check's yes/no prompt              4 of 20           0 of 62
 *   … asked first in that prompt                            9 of 20           0 of 62
 *   folded into Auto-review's still review                  0 of 20           0 of 62
 *
 * so it is never folded into another prompt. The 5 it misses are mostly broken compositions (a
 * melted body, a floating jump), not a drawn look. A "4" is redone once, like a pose miss.
 */

/** The reply field the rating comes back in. */
export const REALISM_FIELD = 'photo_look';

/** At or below this rating a still looks computer-made (the scale's "4" anchor). */
export const REALISM_COMPUTER_MADE_AT_OR_BELOW = 4;

/**
 * The scale, worded neutrally: it never says what the still is supposed to be, and every anchor
 * is a description the model can match against what it sees.
 */
export const REALISM_SCALE =
  'rate how real it looks on a 0-10 scale: 10 = an ordinary unedited camera or phone photo; ' +
  '7 = a photo, but polished or retouched; 4 = clearly computer-made: a 3D render, CGI, video-game or doll-like look; ' +
  '0 = a drawing, painting or anime.';

/** The realism question (always asked on its own). */
export function realismVisionPrompt(): string {
  return [
    'Look at the whole image: people, skin, hair, clothes, objects, background and light.',
    `${REALISM_SCALE.charAt(0).toUpperCase()}${REALISM_SCALE.slice(1)}`,
    'Reply with strict JSON only, no other text, in this shape:',
    `{"${REALISM_FIELD}":0-10}`,
  ].join('\n');
}

/** A 0–10 rating from a parsed reply value (number or numeric string); null when unreadable. */
export function readRealismRating(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number'
      ? value
      : Number(
          String(value)
            .trim()
            .split(/[^\d.]/)[0]
        );
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

/** The rating from a reply text holding a JSON object with {@link REALISM_FIELD}. */
export function parseRealismReply(text: string | null | undefined): number | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return readRealismRating(parsed?.[REALISM_FIELD] ?? parsed?.photoLook);
  } catch {
    return null;
  }
}

export type RealismVerdict = {
  /** The model's 0–10 rating. */
  rating: number;
  /** The still looks drawn or computer-made: redo it once / prefer the other take. */
  computerMade: boolean;
};

/** Verdict from a rating; null when there was none (an unanswered check never calls a miss). */
export function decideRealism(rating: number | null | undefined): RealismVerdict | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null;
  return { rating, computerMade: rating <= REALISM_COMPUTER_MADE_AT_OR_BELOW };
}

/** The card's mark on a take redone because it looked computer-made. */
export const REALISM_REDO_MARK = 'Redone — looked computer-made';

/** The card's mark while that redo renders. */
export const REALISM_REDOING_MARK = 'Redoing — looked computer-made…';

/** The reason line (Auto-review) for a still that looked computer-made. */
export const REALISM_MISS_REASON = 'looked computer-made';

/**
 * A take's pose score for "keep the better of two takes": a computer-made take drops under the
 * pose gate and is halved, so it ranks below any take that held its pose (and most that didn't)
 * — Best of two prefers the realer take; between two of a kind the pose decides. The Gallery
 * keeps the real pose score.
 */
export function realismRankedScore(
  poseScore: number,
  verdict: RealismVerdict | null | undefined,
  minPoseMatch: number
): number {
  if (!verdict?.computerMade) return poseScore;
  return Math.min(poseScore, minPoseMatch - 0.01) * 0.5;
}
