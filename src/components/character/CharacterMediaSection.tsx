'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/ViewState';
import { SegmentedControl, ToolActionRow, ToolSection } from '@/components/ui/ToolPageShell';
import { FieldError } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  resolveGalleryLightboxOpenIndex,
} from '@/lib/comfyui-gallery';
import { buildLightboxStateFromPlaylist } from '@/lib/gallery-lightbox-state';
import { castPlateTiles } from '@/lib/cast-plate-thumb';
import { filterGalleryEntriesByLook, galleryLookChips } from '@/lib/gallery-look-filter';
import { remixDayFilmHref } from '@/lib/play-starter';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import CharacterMediaTile from '@/components/character/CharacterMediaTile';
import type { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
});

type CharacterMediaSectionProps = Pick<
  ReturnType<typeof useCharacterHomeOrchestration>,
  | 'character'
  | 'mediaTab'
  | 'setMediaTab'
  | 'entries'
  | 'stillEntries'
  | 'clipEntries'
  | 'filmEntries'
  | 'keepers'
  | 'visible'
  | 'lastClip'
  | 'currentLook'
  | 'continueError'
  | 'go'
  | 'extendReel'
  | 'continueRoleplay'
  | 'animateStill'
  | 'toggleKeeper'
  | 'removeFromCharacter'
  | 'continueClipActionLabel'
  | 'loadEngineSettings'
  | 'galleryEntryPrimaryViewUrl'
>;

export default function CharacterMediaSection({
  character,
  mediaTab,
  setMediaTab,
  entries,
  stillEntries,
  clipEntries,
  filmEntries,
  keepers,
  visible,
  lastClip,
  currentLook,
  continueError,
  go,
  extendReel,
  continueRoleplay,
  animateStill,
  toggleKeeper,
  removeFromCharacter,
  continueClipActionLabel,
  loadEngineSettings,
  galleryEntryPrimaryViewUrl,
}: CharacterMediaSectionProps) {
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  /** One look's stills only (each still remembers the look it was made in). */
  const [lookFilter, setLookFilter] = useState<string | null>(null);

  const lookTiles = useMemo(() => (character ? castPlateTiles(character) : []), [character]);
  const knownLookIds = useMemo(() => new Set(lookTiles.map(tile => tile.id)), [lookTiles]);
  const lookChips = useMemo(
    () => galleryLookChips(lookTiles, entries, lookFilter),
    [lookTiles, entries, lookFilter]
  );
  const byLook = useCallback(
    <T extends (typeof entries)[number]>(list: T[]) =>
      filterGalleryEntriesByLook(list, lookFilter, knownLookIds),
    [lookFilter, knownLookIds]
  );
  const shown = useMemo(() => byLook(visible), [byLook, visible]);

  const lightboxEntries = useMemo(
    () => shown.filter(entry => Boolean(galleryEntryHeroPreviewUrl(entry))),
    [shown]
  );

  const openEntry = useCallback(
    (entryId: string) => {
      const playlist = buildGalleryLightboxPlaylist(lightboxEntries);
      const index = resolveGalleryLightboxOpenIndex(lightboxEntries, entryId);
      const next = buildLightboxStateFromPlaylist(playlist, index);
      if (next) {
        setLightbox(next);
      }
    },
    [lightboxEntries]
  );

  if (!character) {
    return null;
  }

  return (
    <ToolSection
      title="Media"
      description={
        mediaTab === 'clips'
          ? 'Clips you can play here. Continue a clip from its last frame, or stitch clips into one.'
          : mediaTab === 'films'
            ? 'Assembled Day / Story films stamped on this character.'
            : 'Jobs stamped with this character. Click a still or clip to open it here.'
      }
      data-testid="cast-media"
    >
      <SegmentedControl
        aria-label="Character media"
        value={mediaTab}
        onChange={setMediaTab}
        options={[
          { value: 'all', label: `All (${byLook(entries).length})` },
          {
            value: 'stills',
            label: `Stills (${byLook(stillEntries).length})`,
          },
          {
            value: 'clips',
            label: `Clips (${byLook(clipEntries).length})`,
          },
          {
            value: 'films',
            label: `Films (${byLook(filmEntries).length})`,
          },
          { value: 'keepers', label: `Keepers (${byLook(keepers).length})` },
        ]}
      />
      {lookChips.length > 1 || lookFilter ? (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Show one look"
          data-testid="cast-media-look-filter"
        >
          <span className="type-caption text-[var(--text-muted)]">Look</span>
          {[{ id: '', label: 'All looks', count: entries.length }, ...lookChips].map(chip => {
            const selected = (lookFilter ?? '') === chip.id;
            return (
              <button
                key={chip.id || 'all'}
                type="button"
                aria-pressed={selected}
                data-testid={`cast-media-look-${chip.id || 'all'}`}
                onClick={() => setLookFilter(chip.id && !selected ? chip.id : null)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  selected
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--accent-border)]'
                }`}
              >
                {chip.label}
                <span className="text-[var(--text-muted)]">{chip.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {entries.length > 0 ? (
        <ToolActionRow>
          <ButtonLink
            href={`/gallery?character=${encodeURIComponent(character.id)}${
              lookFilter ? `&look=${encodeURIComponent(lookFilter)}` : ''
            }`}
            size="sm"
            variant="ghost"
            data-testid="cast-see-in-gallery"
          >
            See all in Gallery
          </ButtonLink>
        </ToolActionRow>
      ) : null}
      {mediaTab === 'clips' || mediaTab === 'films' || mediaTab === 'all' ? (
        <ToolActionRow>
          {mediaTab === 'films' ? (
            <ButtonLink
              href="#character-film-studio"
              size="sm"
              variant="secondary"
              data-testid="cast-open-film-studio"
            >
              Open Film studio
            </ButtonLink>
          ) : null}
          {mediaTab !== 'films' && lastClip ? (
            <Button size="sm" variant="primary" onClick={extendReel}>
              {(() => {
                const label = continueClipActionLabel({
                  parentUrl: galleryEntryPrimaryViewUrl(lastClip),
                  engine: loadEngineSettings().engine,
                });
                if (label === 'Extend clip') return 'Extend reel';
                if (label === 'Stitch continue') return 'Stitch continue reel';
                return 'Continue reel';
              })()}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            data-testid="cast-continue-roleplay"
            onClick={continueRoleplay}
          >
            Continue in Story
          </Button>
        </ToolActionRow>
      ) : null}
      {continueError ? <FieldError>{continueError}</FieldError> : null}
      {shown.length === 0 && visible.length > 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="Nothing in this look"
          description="Pick All looks to see the rest."
          action={{ label: 'All looks', onClick: () => setLookFilter(null) }}
        />
      ) : visible.length === 0 ? (
        mediaTab === 'films' ? (
          <div className="space-y-3" data-testid="cast-films-empty">
            <EmptyState
              compact
              icon="inbox"
              title="No films yet"
              description="Cut a Day film for this cast, or remix the same look with fresh stills."
              action={{
                label: 'Same look, new Day',
                href: remixDayFilmHref(character.id),
              }}
            />
            <ToolActionRow>
              <ButtonLink
                href={`/day?character=${encodeURIComponent(character.id)}`}
                size="sm"
                variant="secondary"
              >
                Open Day
              </ButtonLink>
              <ButtonLink href="#character-film-studio" size="sm" variant="ghost">
                Open Film studio
              </ButtonLink>
            </ToolActionRow>
          </div>
        ) : mediaTab === 'keepers' ? (
          <EmptyState
            compact
            icon="inbox"
            title="No keepers yet"
            description="Press Keep on a still (here under All, or in Outfit / Day) to collect the best ones."
          />
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="Nothing stamped yet"
            description="Queue from Generate, Story, or Video with this character active. Older stills stay untagged."
            action={{ label: 'Generate as this character', onClick: () => go('/character') }}
          />
        )
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {shown.map(entry => (
            <CharacterMediaTile
              key={entry.id}
              entry={entry}
              characterId={character.id}
              kept={keepers.some(keeper => keeper.id === entry.id)}
              onOpen={galleryEntryHeroPreviewUrl(entry) ? () => openEntry(entry.id) : undefined}
              onToggleKeeper={currentLook ? () => toggleKeeper(entry.id) : undefined}
              onAnimateStill={
                !isGalleryClipEntry({
                  ...entry,
                  mediaKind: galleryEntryPrimaryMediaKind(entry),
                }) && entry.status === 'completed'
                  ? () => animateStill(entry)
                  : undefined
              }
              onRemoveFromCharacter={() => removeFromCharacter(entry)}
            />
          ))}
        </ul>
      )}
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />
    </ToolSection>
  );
}
