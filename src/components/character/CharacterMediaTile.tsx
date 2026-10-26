'use client';

import Link from 'next/link';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import FilmRecutPanel from '@/components/character/FilmRecutPanel';
import { isAssembledFilmEntry } from '@/lib/film/character-film';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { isGalleryClipEntry } from '@/lib/story/roleplay-film';
import { Button } from '@/components/ui/Button';

export default function CharacterMediaTile({
  entry,
  characterId,
  kept,
  onOpen,
  onToggleKeeper,
  preferred = false,
  onPreferKeeper,
  onAnimateStill,
  onRemoveFromCharacter,
  characterName,
}: {
  entry: ComfyGalleryEntry;
  characterId: string;
  kept?: boolean;
  onOpen?: () => void;
  onToggleKeeper?: () => void;
  /** Day and Story build their plate from this keeper (M2 C6). */
  preferred?: boolean;
  onPreferKeeper?: () => void;
  onAnimateStill?: () => void;
  onRemoveFromCharacter?: () => void;
  /** For a film's Re-cut (FilmRecutPanel). */
  characterName?: string;
}) {
  const previewSrc = galleryEntryHeroPreviewUrl(entry);
  const clip = isGalleryClipEntry({
    ...entry,
    mediaKind: galleryEntryPrimaryMediaKind(entry),
  });
  const galleryHref = `/gallery?character=${encodeURIComponent(characterId)}&focus=${encodeURIComponent(entry.id)}`;
  const kindLabel = isAssembledFilmEntry(entry) ? 'Film' : clip ? 'Clip' : 'Still';
  const canOpen = Boolean(previewSrc && onOpen);

  return (
    <li>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]">
        {canOpen ? (
          <Button
            variant="plain"
            type="button"
            className="block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left"
            data-testid="cast-media-open"
            aria-label={`Open ${kindLabel} in lightbox`}
            onClick={onOpen}
          >
            <GalleryEntryPreview entry={entry} className="aspect-square w-full object-cover" />
          </Button>
        ) : previewSrc ? (
          <GalleryEntryPreview entry={entry} className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center type-caption text-[var(--text-muted)]">
            {entry.status}
          </div>
        )}
        <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
          {kindLabel}
          {kept ? ' · keeper' : ''}
          {entry.reviewRating ? ` · ${entry.reviewRating}★` : ''}
          {entry.favorite ? ' · fav' : ''}
          {' · '}
          <Link href={galleryHref} className="underline-offset-2 hover:underline">
            Gallery
          </Link>
          {!clip && onAnimateStill ? (
            <>
              {' · '}
              <Button
                variant="underline"
                type="button"

                onClick={onAnimateStill}
              >
                Animate
              </Button>
            </>
          ) : null}
          {!clip && onToggleKeeper ? (
            <>
              {' · '}
              <Button
                variant="underline"
                type="button"

                onClick={onToggleKeeper}
              >
                {kept ? 'Drop keeper' : 'Keep'}
              </Button>
            </>
          ) : null}

          {onRemoveFromCharacter ? (
            <>
              {' · '}
              <Button
                variant="underline"
                type="button"

                onClick={onRemoveFromCharacter}
              >
                Remove
              </Button>
            </>
          ) : null}
        </p>
        {!clip && kept && onPreferKeeper ? (
          // Its own line: the caption above is one truncated line (it hid the button).
          <div className="px-2 pb-1">
            <Button
              variant="underline"
              type="button"
              className="type-caption"
              aria-pressed={preferred}
              data-testid="cast-media-prefer-keeper"
              title={
                preferred
                  ? 'Day and Story build their plate from this keeper — click to use the newest again'
                  : 'Day and Story build their plate from this keeper (instead of the newest)'
              }
              onClick={onPreferKeeper}
            >
              {preferred ? 'Day uses this' : 'Use for Day'}
            </Button>
          </div>
        ) : null}
        {isAssembledFilmEntry(entry) ? (
          <FilmRecutPanel entry={entry} characterName={characterName?.trim() || 'Cast'} />
        ) : null}
      </div>
    </li>
  );
}
