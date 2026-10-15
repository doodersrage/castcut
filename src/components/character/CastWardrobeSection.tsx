'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { followLookOutfitInSessions } from '@/lib/cast-plate-switch';
import {
  backfillCastWardrobe,
  normalizeCastWardrobe,
  wearOutfitAgain,
  wornOutfitKey,
} from '@/lib/cast-wardrobe';
import { activeLook, getCharacter, type CharacterRecord } from '@/lib/character-os';
import { dayPartnerNoun } from '@/lib/day-partner';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { galleryEntryPrimaryThumbUrl, galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), { ssr: false });
const OutfitRunwayButton = dynamic(() => import('@/components/character/OutfitRunwayButton'), {
  ssr: false,
});

function when(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Cast home → Wardrobe (cast-wardrobe.ts): every outfit a Day still was made in, newest first,
 * with a still to know it by. Wear again makes it the current look's outfit — Outfit, Day and
 * Story follow, as on a look switch.
 */
export default function CastWardrobeSection({
  character,
  entries,
  onUpdated,
}: {
  character: CharacterRecord;
  entries: ReadonlyArray<ComfyGalleryEntry>;
  onUpdated?: (character: CharacterRecord) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const wardrobe = normalizeCastWardrobe(character.wardrobe) ?? [];
  const hasDayStills = entries.some(
    entry => entry.characterId === character.id && entry.tool === 'image-prompt'
  );
  if (!wardrobe.length && !hasDayStills) return null;
  const findEarlier = () => {
    const count = backfillCastWardrobe(character.id, entries);
    const next = getCharacter(character.id);
    if (next) onUpdated?.(next);
    setNote(
      count
        ? `${count} outfit${count === 1 ? '' : 's'} in the wardrobe. Outfits that were only described come back as words.`
        : 'No earlier outfits found in this Cast’s Day stills.'
    );
  };
  const currentKey =
    wornOutfitKey(activeLook(character).keptOutfit ?? {}) ||
    activeLook(character).lockedWardrobeId ||
    '';
  /** The full-size picture of an outfit (the lightbox), else its thumbnail. */
  const fullFor = (promptIds: string[]) => {
    for (const id of promptIds) {
      const entry = entries.find(item => item.promptId === id);
      const url = entry
        ? galleryEntryPrimaryViewUrl(entry) || galleryEntryPrimaryThumbUrl(entry)
        : null;
      if (url) return url;
    }
    return null;
  };
  const openOutfit = (key: string) => {
    const shown = wardrobe.flatMap(item => {
      const url = fullFor(item.promptIds);
      return url ? [{ key: item.key, url }] : [];
    });
    setLightbox({
      images: shown.map(item => item.url),
      index: Math.max(
        0,
        shown.findIndex(item => item.key === key)
      ),
      title: `${character.name} · wardrobe`,
    });
  };

  const thumbFor = (promptIds: string[]) => {
    for (const id of promptIds) {
      const entry = entries.find(item => item.promptId === id);
      const url = entry ? galleryEntryPrimaryThumbUrl(entry) : null;
      if (url) return url;
    }
    return null;
  };

  return (
    <ToolSection
      title="Wardrobe"
      description={`What ${character.name} has worn in Day, newest first. Wear again puts an outfit back on the current look — Outfit, Day and Story follow.`}
      data-testid="cast-wardrobe-section"
    >
      {note ? <p className="type-caption mb-2 text-[var(--text-secondary)]">{note}</p> : null}
      {hasDayStills ? (
        <Button
          size="sm"
          variant="ghost"
          className="mb-2"
          data-testid="cast-wardrobe-backfill"
          onClick={findEarlier}
        >
          Find earlier outfits
        </Button>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {wardrobe.map(item => {
          const thumb = thumbFor(item.promptIds);
          const current = item.key === currentKey;
          return (
            <li
              key={item.key}
              className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
              data-testid={`cast-wardrobe-${item.key}`}
            >
              {thumb ? (
                <button
                  type="button"
                  className="block w-full cursor-zoom-in rounded-[var(--radius-sm)] border-0 bg-transparent p-0 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  aria-label={`Open ${item.label} full size`}
                  title="View larger"
                  data-testid={`cast-wardrobe-${item.key}-open`}
                  onClick={() => openOutfit(item.key)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI / gallery thumbs */}
                  <img
                    src={thumb}
                    alt={item.label}
                    loading="lazy"
                    className="aspect-[3/4] w-full rounded-[var(--radius-sm)] object-cover"
                  />
                </button>
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] type-caption text-[var(--text-muted)]">
                  No still kept
                </div>
              )}
              {item.runwayUrl ? (
                <video
                  src={item.runwayUrl}
                  className="aspect-[3/4] w-full rounded-[var(--radius-sm)] bg-black object-cover"
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  data-testid={`cast-wardrobe-${item.key}-runway-video`}
                />
              ) : null}
              <p className="truncate text-sm text-[var(--text-primary)]" title={item.label}>
                {item.label}
              </p>
              {fullFor(item.promptIds) ? (
                <OutfitRunwayButton
                  character={character}
                  outfitKey={item.key}
                  imageUrl={fullFor(item.promptIds)!}
                  man={dayPartnerNoun(character) === 'man'}
                  onDone={next => onUpdated?.(next)}
                  onStatus={setNote}
                />
              ) : null}
              <p className="type-caption text-[var(--text-muted)]">
                {item.outfit.footwear ? `${item.outfit.footwear} · ` : ''}
                last {when(item.lastAt)}
                {item.count > 1 ? ` · ${item.count} Days` : ''}
              </p>
              <Button
                size="sm"
                variant={current ? 'ghost' : 'secondary'}
                disabled={current}
                onClick={() => {
                  const result = wearOutfitAgain(character.id, item.key);
                  if (!result) return;
                  followLookOutfitInSessions(
                    character.id,
                    result.previous,
                    activeLook(result.character).keptOutfit,
                    { record: result.character }
                  );
                  onUpdated?.(result.character);
                  setNote(`${item.label} is ${character.name}'s outfit again.`);
                }}
              >
                {current ? 'Wearing now' : 'Wear again'}
              </Button>
            </li>
          );
        })}
      </ul>
      {lightbox ? (
        <ImageLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={index =>
            setLightbox(current => (current ? { ...current, index } : current))
          }
        />
      ) : null}
    </ToolSection>
  );
}
