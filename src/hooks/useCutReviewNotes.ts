'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cutReviewNotes, filmsOfCut, type CutReviewNote } from '@/lib/film/review-notes';
import type { FilmReview } from '@/lib/film/review-store';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';

/** This cut's review comments (its films' review links), and ticking one off. */
export function useCutReviewNotes(
  films: readonly Pick<ComfyGalleryEntry, 'id' | 'cutRecipe'>[],
  shots: readonly { url?: string; entryId?: string }[]
): {
  notes: CutReviewNote[];
  loading: boolean;
  error: string | null;
  setResolved: (note: CutReviewNote, resolved: boolean) => Promise<void>;
} {
  const ids = useMemo(() => filmsOfCut(films, shots), [films, shots]);
  const key = ids.join(',');
  // Kept with the films they came from: another cut's comments are never shown for this one.
  const [loaded, setLoaded] = useState<{ key: string; reviews: FilmReview[] }>({
    key: '',
    reviews: [],
  });
  const reviews = useMemo(() => (loaded.key === key ? loaded.reviews : []), [loaded, key]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    void Promise.all(
      key.split(',').map(entryId =>
        fetch(`/api/film/review?entryId=${encodeURIComponent(entryId)}`, {
          credentials: 'same-origin',
        })
          .then(response => (response.ok ? response.json() : { reviews: [] }))
          .then(json => ((json as { reviews?: FilmReview[] }).reviews ?? []) as FilmReview[])
          .catch(() => [] as FilmReview[])
      )
    )
      .then(lists => {
        if (!cancelled) setLoaded({ key, reviews: lists.flat() });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  const notes = useMemo(() => cutReviewNotes(reviews), [reviews]);
  const setResolved = useCallback(async (note: CutReviewNote, resolved: boolean) => {
    setError(null);
    // Ticked at once, put back if the save fails (it waited for the server: the box lagged).
    const mark = (value: boolean) =>
      setLoaded(previous => ({
        ...previous,
        reviews: previous.reviews.map(review =>
          review.token !== note.token
            ? review
            : {
                ...review,
                comments: review.comments.map(comment =>
                  comment.id === note.id ? { ...comment, resolved: value } : comment
                ),
              }
        ),
      }));
    mark(resolved);
    const response = await fetch('/api/film/review', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token: note.token, commentId: note.id, resolved }),
    }).catch(() => null);
    if (!response?.ok) {
      mark(!resolved);
      setError('That comment could not be updated.');
    }
  }, []);
  return { notes, loading, error, setResolved };
}
