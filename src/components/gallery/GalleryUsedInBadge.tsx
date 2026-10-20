'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  galleryEntryViewUrls,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { filmsUsingEntry } from '@/lib/gallery/used-in';

/** "In 2 films" on a still or clip that cut films use (gallery-used-in.ts); opens the film. */
export default function GalleryUsedInBadge({ entry }: { entry: ComfyGalleryEntry }) {
  const films = useMemo(
    () => filmsUsingEntry(entry, loadComfyGallery(), galleryEntryViewUrls(entry)),
    [entry]
  );
  if (films.length === 0) return null;
  const first = films[0]!;
  return (
    <Link
      href={`/gallery?focus=${encodeURIComponent(first.filmEntryId)}`}
      className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent-border)]"
      title={`Used in ${films.map(film => `“${film.title}”`).join(', ')} — delete it and a re-cut loses this shot.`}
      data-testid="gallery-card-used-in"
    >
      {films.length === 1 ? 'in a film' : `in ${films.length} films`}
    </Link>
  );
}
