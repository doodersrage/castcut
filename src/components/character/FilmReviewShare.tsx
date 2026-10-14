'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { FilmReview } from '@/lib/film-review-store';

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

/**
 * Under a film: "Share for review" — a read-only, expiring link anyone can open without an
 * account (film-review-store.ts), the comments that come back, and Stop link.
 */
export default function FilmReviewShare({ entryId, title }: { entryId: string; title: string }) {
  const [reviews, setReviews] = useState<FilmReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [tick, setTick] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/film/review?entryId=${encodeURIComponent(entryId)}`, { credentials: 'same-origin' })
      .then(response => (response.ok ? response.json() : { reviews: [] }))
      .then((json: { reviews?: FilmReview[] }) => {
        if (!cancelled) setReviews(json.reviews ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entryId, tick]);

  const linkFor = (token: string) => `${window.location.origin}/review/${token}`;

  const share = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/film/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ entryId, title, days }),
      });
      const json = (await response.json()) as { review?: FilmReview; error?: string };
      if (!response.ok || !json.review) throw new Error(json.error ?? 'Could not make a link.');
      const url = linkFor(json.review.token);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setNote(`Link copied — it works for ${days} day${days === 1 ? '' : 's'}: ${url}`);
      setTick(value => value + 1);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Could not make a link.');
    } finally {
      setBusy(false);
    }
  }, [days, entryId, title]);

  const stop = async (token: string) => {
    await fetch(`/api/film/review?token=${encodeURIComponent(token)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => undefined);
    setTick(value => value + 1);
  };

  const live = reviews.filter(review => !review.revoked && review.expiresAt > now);
  return (
    <div className="mt-2 space-y-2" data-testid="film-review-share">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void share()}>
          Share for review
        </Button>
        <label className="type-caption flex items-center gap-1 text-[var(--text-muted)]">
          for
          <select
            className="ui-select h-7 text-xs"
            value={days}
            onChange={event => setDays(Number(event.target.value))}
            aria-label="Link works for"
          >
            {[1, 3, 7, 14, 30].map(value => (
              <option key={value} value={value}>
                {value} day{value === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <span className="type-caption text-[var(--text-muted)]">
          Anyone with the link can watch this film and comment — nothing else.
        </span>
      </div>
      {note ? <p className="type-caption break-all text-[var(--text-secondary)]">{note}</p> : null}
      {live.map(review => (
        <div
          key={review.token}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2 type-caption text-[var(--text-muted)]">
            <span>
              Link until {new Date(review.expiresAt).toLocaleDateString()} ·{' '}
              {review.comments.length} comment
              {review.comments.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="ui-text-link"
              onClick={() => void navigator.clipboard?.writeText(linkFor(review.token))}
            >
              Copy link
            </button>
            <button type="button" className="ui-text-link" onClick={() => void stop(review.token)}>
              Stop link
            </button>
          </div>
          {review.comments.length ? (
            <ul className="mt-1 space-y-1">
              {review.comments.map(comment => (
                <li key={comment.id} className="text-sm">
                  <span className="type-caption text-[var(--text-muted)]">
                    {comment.name}
                    {typeof comment.timeSec === 'number' ? ` at ${clock(comment.timeSec)}` : ''}
                    :{' '}
                  </span>
                  <span className="text-[var(--text-primary)]">{comment.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
