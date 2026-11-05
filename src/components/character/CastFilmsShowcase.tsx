'use client';

import { useState } from 'react';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import { PlayFilmsShelf, filmTitle } from '@/components/play/PlayFilmHome';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';

/**
 * Film & media leads with the films (2026-11-05): the newest plays here, the rest as posters to
 * pick — re-cut and share stay on each film's tile in Media below.
 */
export default function CastFilmsShowcase({ films }: { films: readonly ComfyGalleryEntry[] }) {
  const newestFirst = [...films].sort(
    (a, b) => (b.completedAt ?? b.queuedAt) - (a.completedAt ?? a.queuedAt)
  );
  const [watchId, setWatchId] = useState<string | null>(null);
  const shown = newestFirst.find(film => film.id === watchId) ?? newestFirst[0];
  const url = shown ? galleryEntryPrimaryViewUrl(shown) : null;
  if (!shown || !url) return null;
  return (
    <section
      className="ui-card space-y-3 p-[var(--card-padding)]"
      data-testid="cast-films-showcase"
    >
      <div className="mx-auto max-w-3xl">
        <FilmWatchPlayer
          key={shown.id}
          compact
          shots={[{ entryId: shown.id, title: filmTitle(shown), url, kind: 'clip' }]}
        />
      </div>
      {newestFirst.length > 1 ? (
        <PlayFilmsShelf films={newestFirst} selectedId={shown.id} onWatch={setWatchId} />
      ) : null}
    </section>
  );
}
