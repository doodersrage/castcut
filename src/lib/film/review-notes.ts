/**
 * Review comments back in the Cut (2026-11-05): a review link's comments (review-store.ts) shown
 * on the timeline of the cut the film came from — a marker at each pinned moment, a click to jump
 * there, a tick when it is dealt with. A film is this cut's when most of its shots are the cut's
 * (cut-recipe.ts lists them by entry id and URL). Pure; the Cut room fetches the links.
 */

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import type { FilmReview } from './review-store';

/** At most this many of the cut's films are asked for their comments (newest first). */
export const CUT_REVIEW_FILMS_MAX = 3;

export type CutReviewNote = {
  token: string;
  id: string;
  name: string;
  text: string;
  at: number;
  timeSec?: number;
  resolved?: boolean;
  /** The film's title, when the comments come from more than one film. */
  film: string;
};

/** The films (newest first, as given) made from this cut: at least half their shots are its own. */
export function filmsOfCut(
  films: readonly Pick<ComfyGalleryEntry, 'id' | 'cutRecipe'>[],
  shots: readonly { url?: string; entryId?: string }[]
): string[] {
  const keys = new Set(
    shots.flatMap(shot => [shot.url?.trim(), shot.entryId?.trim()]).filter(Boolean) as string[]
  );
  if (!keys.size) return [];
  return films
    .filter(film => {
      const own = film.cutRecipe?.shots ?? [];
      if (!own.length) return false;
      const shared = own.filter(
        shot => keys.has(shot.url?.trim() ?? '') || keys.has(shot.entryId?.trim() ?? '')
      ).length;
      return shared > 0 && shared * 2 >= own.length;
    })
    .slice(0, CUT_REVIEW_FILMS_MAX)
    .map(film => film.id);
}

/** Every comment of the links, pinned ones in film order first, then the rest by when they came. */
export function cutReviewNotes(reviews: readonly FilmReview[]): CutReviewNote[] {
  const notes = reviews.flatMap(review =>
    review.comments.map(comment => ({
      token: review.token,
      id: comment.id,
      name: comment.name,
      text: comment.text,
      at: comment.at,
      film: review.title,
      ...(comment.timeSec !== undefined ? { timeSec: comment.timeSec } : {}),
      ...(comment.resolved ? { resolved: true } : {}),
    }))
  );
  return notes.sort((a, b) =>
    a.timeSec !== undefined && b.timeSec !== undefined
      ? a.timeSec - b.timeSec || a.at - b.at
      : a.timeSec !== undefined
        ? -1
        : b.timeSec !== undefined
          ? 1
          : a.at - b.at
  );
}

/** 83.4 → "1:23". */
export function reviewTimeLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
