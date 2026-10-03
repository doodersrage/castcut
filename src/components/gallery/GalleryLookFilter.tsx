'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { useHydrated } from '@/hooks/useHydrated';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/browser-storage';
import { castPlateTiles } from '@/lib/cast-plate-thumb';
import {
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  getGalleryCache,
  type ComfyGalleryFilter,
} from '@/lib/comfyui-gallery';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { galleryLookChips } from '@/lib/gallery-look-filter';

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onStoreChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

/**
 * Look filter under the Cast filter: with a Cast picked, one chip per look its stills were made
 * in (the look's own plate thumb + name + count), plus "No look" for older stills. Hidden when
 * the Cast's stills are all in one look.
 */
export default function GalleryLookFilter({
  filter,
  setFilter,
}: {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
}) {
  const hydrated = useHydrated();
  const castId = filter.characterId?.trim() || '';
  const active = filter.lookId?.trim() || '';
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  const cast = hydrated && castId ? characters.find(entry => entry.id === castId) : undefined;
  const tiles = useMemo(() => (cast ? castPlateTiles(cast) : []), [cast]);
  const chips = useMemo(() => {
    if (!cast) return [];
    const entries = gallery.filter(entry => entry.characterId === cast.id);
    return galleryLookChips(tiles, entries, active);
  }, [cast, gallery, tiles, active]);

  if (!cast || (chips.length < 2 && !active)) return null;
  const thumbFor = (id: string) => tiles.find(tile => tile.id === id)?.thumb;
  const chip = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
      selected
        ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]'
    }`;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={`Filter ${cast.name} by look`}
      data-testid="gallery-look-filter"
    >
      <span className="type-caption text-[var(--text-muted)]">Look</span>
      <button
        type="button"
        className={chip(!active)}
        aria-pressed={!active}
        data-testid="gallery-look-filter-all"
        onClick={() => setFilter(previous => ({ ...previous, lookId: undefined }))}
      >
        All looks
      </button>
      {chips.map(entry => {
        const thumb = thumbFor(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            className={chip(active === entry.id)}
            aria-pressed={active === entry.id}
            data-testid={`gallery-look-filter-${entry.id}`}
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                lookId: previous.lookId === entry.id ? undefined : entry.id,
              }))
            }
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- look plate thumb
              <img
                src={thumb}
                alt=""
                className="h-4 w-4 rounded-full object-cover"
                loading="lazy"
              />
            ) : null}
            {entry.label}
            <span className="text-[var(--text-muted)]">{entry.count}</span>
          </button>
        );
      })}
    </div>
  );
}
