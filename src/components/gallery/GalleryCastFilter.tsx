'use client';

import { useMemo } from 'react';
import { useHydrated } from '@/hooks/useHydrated';
import { castPlateThumbUrl } from '@/lib/cast-plate-thumb';
import { loadCharacters } from '@/lib/character-os';
import type { ComfyGalleryFilter } from '@/lib/comfyui-gallery';

/**
 * Cast filter: one chip per Cast that has stills here (look-plate thumb + name), plus All.
 * Browser-only data, so it renders after hydration.
 */
export default function GalleryCastFilter({
  filter,
  setFilter,
  castIds,
}: {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  /** Cast ids that appear on gallery entries. */
  castIds: readonly string[];
}) {
  const hydrated = useHydrated();
  const casts = useMemo(() => {
    if (!hydrated || castIds.length === 0) return [];
    const wanted = new Set(castIds);
    return loadCharacters()
      .filter(character => wanted.has(character.id))
      .map(character => ({
        id: character.id,
        name: character.name?.trim() || 'Unnamed Cast',
        thumb: castPlateThumbUrl(character),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [castIds, hydrated]);

  if (casts.length === 0) return null;
  const active = filter.characterId?.trim() || '';
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
      aria-label="Filter by Cast"
      data-testid="gallery-cast-filter"
    >
      <span className="type-caption text-[var(--text-muted)]">Cast</span>
      <button
        type="button"
        className={chip(!active)}
        aria-pressed={!active}
        onClick={() => setFilter(previous => ({ ...previous, characterId: undefined }))}
      >
        All
      </button>
      {casts.map(cast => (
        <button
          key={cast.id}
          type="button"
          className={chip(active === cast.id)}
          aria-pressed={active === cast.id}
          data-testid={`gallery-cast-filter-${cast.id}`}
          onClick={() =>
            setFilter(previous => ({
              ...previous,
              characterId: previous.characterId === cast.id ? undefined : cast.id,
            }))
          }
        >
          {cast.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cast look plate thumb
            <img
              src={cast.thumb}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <span
              aria-hidden
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--bg-active)] text-[9px]"
            >
              {cast.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {cast.name}
        </button>
      ))}
    </div>
  );
}
