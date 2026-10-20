/**
 * Review links for a cut film (2026-10-14): a read-only, expiring link — /review/<token> — that
 * plays one film and takes comments pinned to a moment in it, so someone can watch a cut without
 * an account. The token is the only key: random, unguessable, revocable; the link serves that
 * one film and nothing else (its video route reads only the entry the link was made for).
 *
 * Server-only (SQLite kv). The pure parts (limits, normalizing) are exported for tests.
 */

import { randomBytes } from 'node:crypto';
import { readKv, writeKv } from '@/lib/sqlite/kv';

const SCOPE = 'film-reviews';
const INDEX_PREFIX = 'owner:';

export const REVIEW_MAX_DAYS = 30;
export const REVIEW_DEFAULT_DAYS = 7;
export const REVIEW_MAX_COMMENTS = 200;
export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_NAME_MAX = 60;

export type FilmReviewComment = {
  id: string;
  at: number;
  name: string;
  text: string;
  /** Where in the film (seconds), when the reviewer pinned it. */
  timeSec?: number;
};

export type FilmReview = {
  token: string;
  /** Gallery entry of the cut film. */
  entryId: string;
  /** Owner's account (null when sign-in is off). */
  ownerId: string | null;
  title: string;
  createdAt: number;
  expiresAt: number;
  revoked?: boolean;
  comments: FilmReviewComment[];
};

function ownerKey(ownerId: string | null): string {
  return `${INDEX_PREFIX}${ownerId ?? 'local'}`;
}

function isToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}

export function readFilmReview(token: string): FilmReview | null {
  if (!isToken(token)) return null;
  return readKv<FilmReview>(SCOPE, `link:${token}`);
}

/** A link that still plays: not revoked, not expired. */
export function liveFilmReview(token: string, now = Date.now()): FilmReview | null {
  const review = readFilmReview(token);
  if (!review || review.revoked || review.expiresAt <= now) return null;
  return review;
}

export function createFilmReview(input: {
  entryId: string;
  ownerId: string | null;
  title: string;
  days?: number;
  now?: number;
}): FilmReview {
  const now = input.now ?? Date.now();
  const days = Math.min(
    REVIEW_MAX_DAYS,
    Math.max(1, Math.round(input.days ?? REVIEW_DEFAULT_DAYS))
  );
  const review: FilmReview = {
    token: randomBytes(24).toString('base64url'),
    entryId: input.entryId.trim(),
    ownerId: input.ownerId,
    title: input.title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'A film',
    createdAt: now,
    expiresAt: now + days * 24 * 60 * 60 * 1000,
    comments: [],
  };
  writeKv(SCOPE, `link:${review.token}`, review);
  const index = readKv<string[]>(SCOPE, ownerKey(input.ownerId)) ?? [];
  writeKv(SCOPE, ownerKey(input.ownerId), [review.token, ...index].slice(0, 200));
  return review;
}

/** The owner's links (newest first), optionally for one film. */
export function listFilmReviews(ownerId: string | null, entryId?: string): FilmReview[] {
  const tokens = readKv<string[]>(SCOPE, ownerKey(ownerId)) ?? [];
  return tokens
    .map(token => readFilmReview(token))
    .filter((review): review is FilmReview => Boolean(review) && review!.ownerId === ownerId)
    .filter(review => !entryId || review.entryId === entryId);
}

export function revokeFilmReview(token: string, ownerId: string | null): boolean {
  const review = readFilmReview(token);
  if (!review || review.ownerId !== ownerId) return false;
  writeKv(SCOPE, `link:${token}`, { ...review, revoked: true });
  return true;
}

/** A reviewer's comment, cleaned; null when there is nothing to keep. */
export function normalizeReviewComment(
  raw: { name?: unknown; text?: unknown; timeSec?: unknown },
  now = Date.now()
): FilmReviewComment | null {
  const text =
    typeof raw.text === 'string'
      ? raw.text.replace(/\r\n/g, '\n').trim().slice(0, REVIEW_COMMENT_MAX)
      : '';
  if (!text) return null;
  const name =
    (typeof raw.name === 'string'
      ? raw.name.replace(/\s+/g, ' ').trim().slice(0, REVIEW_NAME_MAX)
      : '') || 'Reviewer';
  const time = typeof raw.timeSec === 'number' && Number.isFinite(raw.timeSec) ? raw.timeSec : null;
  return {
    id: randomBytes(6).toString('hex'),
    at: now,
    name,
    text,
    ...(time !== null && time >= 0 && time < 24 * 3600
      ? { timeSec: Math.round(time * 10) / 10 }
      : {}),
  };
}

export function addFilmReviewComment(
  token: string,
  raw: { name?: unknown; text?: unknown; timeSec?: unknown }
): FilmReviewComment | 'gone' | 'full' | 'empty' {
  const review = liveFilmReview(token);
  if (!review) return 'gone';
  if (review.comments.length >= REVIEW_MAX_COMMENTS) return 'full';
  const comment = normalizeReviewComment(raw);
  if (!comment) return 'empty';
  writeKv(SCOPE, `link:${token}`, { ...review, comments: [...review.comments, comment] });
  return comment;
}
