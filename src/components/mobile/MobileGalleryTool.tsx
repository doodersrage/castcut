'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import GalleryUploadButton from '@/components/gallery/GalleryUploadButton';
import MotionMedia from '@/components/ui/MotionMedia';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import { recordCatalogBiasFromPrompt } from '@/lib/catalog-rating-bias';
import {
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import {
  filterComfyGalleryEntries,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { buildGalleryHandoff, saveGalleryHandoff } from '@/lib/gallery-handoff';
import {
  newCharacterPlateId,
  roleplayPatchFromPlate,
  toMobileStudioHref,
  upsertCharacterPlate,
  withCharacterQuery,
} from '@/lib/mobile-studio';
import { remixDayFilmHref } from '@/lib/play-starter';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
} from '@/lib/settings-cache';

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function MobileGalleryTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get('character')?.trim() || '';
  const derivedKind = searchParams.get('derivedKind')?.trim() || '';
  const filmMode = derivedKind === 'film';
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const watchCharacter =
    (characterId ? characters.find(entry => entry.id === characterId) : null) ??
    (characterId ? getCharacter(characterId) : null) ??
    null;

  const {
    storeReady,
    entries: allEntries,
    setReviewRating,
    setFilter,
  } = useComfyUiGallery({
    status: 'completed',
    ...(filmMode ? { derivedKind: 'film' as const } : {}),
    ...(characterId ? { characterId } : {}),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setFilter(previous => ({
      ...previous,
      status: 'completed',
      derivedKind: filmMode ? 'film' : undefined,
      characterId: characterId || undefined,
    }));
  }, [characterId, filmMode, setFilter]);

  const entries = useMemo(() => {
    const filtered = filterComfyGalleryEntries(allEntries, {
      status: 'completed',
      ...(filmMode ? { derivedKind: 'film' as const } : {}),
      ...(characterId ? { characterId } : {}),
    }).filter(entry => galleryEntryPrimaryThumbUrl(entry) || galleryEntryPrimaryViewUrl(entry));
    return filtered.slice(0, filmMode ? 24 : 48);
  }, [allEntries, characterId, filmMode]);

  const selected = entries.find(entry => entry.id === selectedId) ?? entries[0] ?? null;
  const selectedUrl = selected
    ? galleryEntryPrimaryViewUrl(selected) || galleryEntryPrimaryThumbUrl(selected)
    : null;

  useEffect(() => {
    if (!filmMode || entries.length === 0 || !selectedUrl) {
      return;
    }
    // Honest Watch step — only when a film is actually on screen autoplaying.
    void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
      markOnboardingWatchFirstFilm();
    });
  }, [entries.length, filmMode, selectedUrl]);

  const openInPlay = (entry: ComfyGalleryEntry) => {
    const url = galleryEntryPrimaryViewUrl(entry) || galleryEntryPrimaryThumbUrl(entry);
    if (!url) {
      return;
    }
    const plate = {
      id: newCharacterPlateId(),
      name: (entry.tool || 'Gallery still').replace(/-/g, ' '),
      createdAt: Date.now(),
      originalUrl: url,
      isolatedUrl: url,
      isolated: false,
    };
    const mobile = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
    saveToolSettings('mobileStudio', {
      ...mobile,
      plates: upsertCharacterPlate(mobile.plates, plate),
      activePlateId: plate.id,
    });
    const roleplay = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
    saveToolSettings('roleplay', { ...roleplay, ...roleplayPatchFromPlate(plate) });
    router.push('/m/story');
  };

  const openInCompose = (entry: ComfyGalleryEntry) => {
    saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
    router.push('/compose?from=gallery');
  };

  if (!storeReady) {
    return <p className="type-caption text-[var(--text-muted)]">Loading gallery…</p>;
  }

  return (
    <div className="space-y-4" data-testid={filmMode ? 'mobile-gallery-films' : 'mobile-gallery'}>
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">{filmMode ? 'Watch' : 'Gallery'}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {filmMode
            ? watchCharacter
              ? `${watchCharacter.name} — play Day films, then jump back into the reel.`
              : 'Play your Day films. Remix the same look when you want another cut.'
            : 'Rate stills. Upload your own. Open one in Play or Compose.'}
        </p>
        {!filmMode ? (
          <GalleryUploadButton className="ui-btn-secondary mt-2 px-3 py-2 text-xs" />
        ) : null}
        {filmMode ? (
          <div className="mt-2 space-y-2" data-testid="mobile-watch-cast-strip">
            {watchCharacter ? (
              <p
                className="type-caption text-[var(--text-muted)]"
                data-testid="mobile-watch-cast-name"
              >
                Cast · {watchCharacter.name}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {characterId ? (
                <ButtonLink
                  href={toMobileStudioHref(remixDayFilmHref(characterId))}
                  size="sm"
                  variant="secondary"
                  data-testid="mobile-gallery-remix-day"
                >
                  Same look, new Day
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={withCharacterQuery('/m/day', characterId)}
                  size="sm"
                  variant="secondary"
                >
                  Open Day
                </ButtonLink>
              )}
              {characterId ? (
                <>
                  <ButtonLink
                    href={withCharacterQuery('/m/story', characterId)}
                    size="sm"
                    variant="secondary"
                    data-testid="mobile-watch-open-story"
                  >
                    Open Story
                  </ButtonLink>
                  <ButtonLink
                    href={withCharacterQuery('/m/fitting', characterId)}
                    size="sm"
                    variant="ghost"
                    data-testid="mobile-watch-open-outfit"
                  >
                    Outfit
                  </ButtonLink>
                </>
              ) : null}
              <ButtonLink href="/m/gallery" size="sm" variant="ghost">
                All stills
              </ButtonLink>
            </div>
          </div>
        ) : null}
      </div>

      {entries.length === 0 ? (
        filmMode ? (
          <GalleryEmptyPanel
            filtered
            derivedKind="film"
            characterId={characterId || null}
            onClearFilters={() => router.push('/m/gallery')}
          />
        ) : (
          <GalleryEmptyPanel
            filtered={false}
            onClearFilters={() => undefined}
            onUpload={() => undefined}
          />
        )
      ) : (
        <>
          {filmMode && selectedUrl ? (
            <div
              className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-black"
              data-testid="mobile-gallery-film-player"
            >
              <MotionMedia
                src={selectedUrl}
                className="mx-auto max-h-80 w-full object-contain"
                controls
                autoPlay
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {entries.map(entry => {
              const thumb = galleryEntryPrimaryThumbUrl(entry) || galleryEntryPrimaryViewUrl(entry);
              const active = (selected?.id ?? selectedId) === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={[
                    'overflow-hidden rounded-2xl border text-left',
                    active
                      ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-ring)]'
                      : 'border-[var(--border-subtle)]',
                  ].join(' ')}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className={
                        filmMode
                          ? 'aspect-video w-full object-cover'
                          : 'aspect-square w-full object-cover'
                      }
                    />
                  ) : null}
                  {entry.reviewRating ? (
                    <p className="px-2 py-1 text-xs text-[var(--text-muted)]">
                      {entry.reviewRating}★
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected && !filmMode ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] p-3">
          <p className="type-caption text-[var(--text-muted)]">Selected</p>
          <div className="flex flex-wrap gap-1">
            {RATINGS.map(rating => (
              <Button
                key={rating}
                size="sm"
                variant={selected.reviewRating === rating ? 'primary' : 'secondary'}
                onClick={() => {
                  setReviewRating(selected.id, rating);
                  recordCatalogBiasFromPrompt(selected.prompt || '', rating);
                }}
              >
                {rating}★
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => openInPlay(selected)}>
              Open in Story
            </Button>
            <Button variant="secondary" onClick={() => openInCompose(selected)}>
              Open in Compose
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
