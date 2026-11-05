'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/storage/browser-storage';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  galleryEntryPrimaryMediaKind,
  getGalleryCache,
  initGalleryStore,
} from '@/lib/gallery/comfyui-gallery';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import { isGalleryClipEntry } from '@/lib/story/roleplay-film';
import { filmHomeSummary } from '@/lib/play/film-home';
import {
  CLIP_JOBS_UPDATED_EVENT,
  loadTrackedClipJobs,
  type TrackedClipJob,
} from '@/lib/clip/clip-jobs-tracker';
import { cutReviewNotes, CUT_REVIEW_FILMS_MAX, type CutReviewNote } from '@/lib/film/review-notes';
import type { FilmReview } from '@/lib/film/review-store';

const EMPTY: ComfyGalleryEntry[] = [];

function subscribeGallery(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onChange);
  };
}

function subscribeJobs(onChange: () => void): () => void {
  window.addEventListener(CLIP_JOBS_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(CLIP_JOBS_UPDATED_EVENT, onChange);
}

const runningJobsJson = () =>
  JSON.stringify(loadTrackedClipJobs().filter(entry => entry.state === 'running'));

/**
 * The Film page's view of a Cast's film (2026-11-05): their films and latest stills from the
 * Gallery, the long jobs still running, and the review comments not yet ticked off.
 */
export function usePlayFilmHome(characterId: string | null | undefined) {
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY);
  useEffect(() => {
    void initGalleryStore();
  }, []);
  const summary = useMemo(() => {
    const entries = characterId ? filterComfyGalleryEntries(gallery, { characterId }) : EMPTY;
    return filmHomeSummary(entries, entry =>
      isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })
    );
  }, [gallery, characterId]);

  const jobsJson = useSyncExternalStore(subscribeJobs, runningJobsJson, () => '[]');
  const jobs = useMemo(() => JSON.parse(jobsJson) as TrackedClipJob[], [jobsJson]);

  // Comments on the latest few films (the review links are per film).
  const filmKey = summary.films
    .slice(0, CUT_REVIEW_FILMS_MAX)
    .map(film => film.id)
    .join(',');
  const [reviews, setReviews] = useState<{ key: string; notes: CutReviewNote[] }>({
    key: '',
    notes: [],
  });
  useEffect(() => {
    if (!filmKey) return;
    let cancelled = false;
    void Promise.all(
      filmKey.split(',').map(entryId =>
        fetch(`/api/film/review?entryId=${encodeURIComponent(entryId)}`, {
          credentials: 'same-origin',
        })
          .then(response => (response.ok ? response.json() : { reviews: [] }))
          .then(json => ((json as { reviews?: FilmReview[] }).reviews ?? []) as FilmReview[])
          .catch(() => [] as FilmReview[])
      )
    ).then(lists => {
      if (!cancelled) setReviews({ key: filmKey, notes: cutReviewNotes(lists.flat()) });
    });
    return () => {
      cancelled = true;
    };
  }, [filmKey]);
  const openNotes = useMemo(
    () => (reviews.key === filmKey ? reviews.notes.filter(note => !note.resolved) : []),
    [reviews, filmKey]
  );

  return { ...summary, jobs, openNotes };
}
