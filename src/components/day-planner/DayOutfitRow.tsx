'use client';

import { useRef, useState, type ReactNode } from 'react';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import ClothingSheet, { ClothingSummaryThumbStrip } from '@/components/wardrobe/ClothingSheet';
import { castLookPortraitTile, castPlateTiles } from '@/lib/character-plate-thumb';
import { activeLook, type CharacterRecord } from '@/lib/character-os';
import {
  clothingSummaryLine,
  clothingSummaryThumbs,
  type ClothingSummaryThumb,
} from '@/lib/clothing-summary';
import type { DaySlot, DaySlotId } from '@/lib/day-planner';
import { realKitId } from '@/lib/outfit-handoff';
import { resolveWardrobeGarmentThumbUrl } from '@/lib/wardrobe-garment-thumbs';

/**
 * What the Day's row and a slot's Clothing row say is worn: the short line and its pictures.
 * The Day: its kit (the session's outfit lock) or clothing photo, and its shoes. A slot: its own
 * kit, else the Day's.
 */
export function dayClothingView({
  dayKitId,
  slotKitId,
  photoUrl,
  footwear,
  footwearImageUrl,
  labelFor,
}: {
  dayKitId?: string | null;
  slotKitId?: string | null;
  photoUrl?: string | null;
  footwear?: string | null;
  footwearImageUrl?: string | null;
  labelFor: (wardrobeId?: string) => string;
}) {
  const photo = photoUrl?.trim() || '';
  const view = (kitId: string, hasPhoto: boolean, emptyLabel: string) => {
    const kitLabel = kitId ? labelFor(kitId) : '';
    return {
      summary: clothingSummaryLine({ kitLabel, hasPhoto, footwear, emptyLabel }),
      thumbs: clothingSummaryThumbs({
        kitLabel,
        kitThumbUrl: kitId ? resolveWardrobeGarmentThumbUrl(kitId) : null,
        photoUrl: hasPhoto ? photo : null,
        footwear,
        footwearImageUrl,
      }),
    };
  };
  const dayKit = photo ? '' : realKitId(dayKitId);
  const slotKit = realKitId(slotKitId);
  return {
    day: view(dayKit, Boolean(photo), 'No kit — Day picks one per slot'),
    slot: view(slotKit || dayKit, Boolean(photo) && !slotKit, 'No kit — Day picks one'),
  };
}

function slotNames(slots: readonly DaySlot[], ids: readonly DaySlotId[]): string {
  const names = slots.filter(slot => ids.includes(slot.id)).map(slot => slot.label);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One look and one clothing for the whole Day, under the plan bar: the Day's look (its plate)
 * and what it wears — pictures and short names, readable without opening anything — with
 * Choose… (the look tiles and the Clothing picker, for every slot). When slots differ: "N slots
 * differ · Use for every slot" (one write). After Outfit hands over a new outfit while some
 * slots keep their own hand-picked one: "2 slots keep their own outfit · Use the new one
 * everywhere" (day-outfit-scope.ts).
 */
export default function DayOutfitRow({
  character,
  slots,
  busy = false,
  clothingSummary,
  clothingThumbs,
  differingSlotIds,
  handoffKeptSlotIds,
  onChooseLook,
  onUseForEverySlot,
  onUseHandoffEverywhere,
  onDismissHandoff,
  renderClothingPicker,
  className = '',
}: {
  character: CharacterRecord | null | undefined;
  slots: DaySlot[];
  busy?: boolean;
  /** "Boxy chocolate habit · black pumps" — the Day's clothing (clothing-summary). */
  clothingSummary: string;
  clothingThumbs?: ClothingSummaryThumb[];
  differingSlotIds: DaySlotId[];
  handoffKeptSlotIds: DaySlotId[];
  onChooseLook: (lookId: string) => void;
  onUseForEverySlot: () => void;
  onUseHandoffEverywhere: () => void;
  onDismissHandoff: () => void;
  /** The Clothing picker for the whole Day, rendered only while the sheet is open. */
  renderClothingPicker: () => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // The differ line and the notice go once answered: focus moves to Choose…, not the page.
  const chooseRef = useRef<HTMLButtonElement>(null);
  const focusChoose = () => {
    window.requestAnimationFrame(() => chooseRef.current?.focus());
  };
  const tiles = character ? castPlateTiles(character) : [];
  const lookId = character ? activeLook(character).id : '';
  const look = tiles.find(tile => tile.id === lookId);
  const lookLabel = look?.label || (character ? 'Look' : 'No Cast yet');
  const line = `${lookLabel} · ${clothingSummary}`;
  const differ = differingSlotIds.length;
  const kept = handoffKeptSlotIds.length;
  return (
    <div className={`space-y-1.5 ${className}`.trim()}>
      <div
        className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2"
        data-testid="day-outfit-row"
      >
        <div className="flex min-w-0 items-center gap-2">
          {look?.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cast plate, any origin
            <img
              src={look.thumb}
              alt={`Look: ${lookLabel}`}
              title={lookLabel}
              className="h-9 w-7 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] object-cover object-top"
              data-testid="day-outfit-row-look"
            />
          ) : null}
          <ClothingSummaryThumbStrip thumbs={clothingThumbs} testId="day-outfit-row-thumbs" />
          <div className="min-w-0">
            <p className="type-caption text-[var(--text-muted)]">
              Look &amp; clothing · every slot
            </p>
            <p
              className="type-heading line-clamp-2 text-sm break-words sm:line-clamp-1"
              title={line}
              data-testid="day-outfit-row-summary"
            >
              {line}
            </p>
            {differ > 0 ? (
              <p className="type-caption text-[var(--text-muted)]" data-testid="day-outfit-differ">
                <span title={slotNames(slots, differingSlotIds)}>
                  {differ === 1 ? '1 slot differs' : `${differ} slots differ`}
                </span>
                {' · '}
                <button
                  type="button"
                  className="ui-text-link"
                  disabled={busy}
                  data-testid="day-outfit-use-everywhere"
                  onClick={() => {
                    onUseForEverySlot();
                    focusChoose();
                  }}
                >
                  Use for every slot
                </button>
              </p>
            ) : null}
          </div>
        </div>
        <button
          ref={chooseRef}
          type="button"
          className="ui-btn-secondary ui-btn-sm shrink-0"
          disabled={busy}
          data-testid="day-outfit-choose"
          onClick={() => setOpen(true)}
        >
          Choose…
        </button>
      </div>
      {kept > 0 ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-[var(--accent-border)] px-3 py-1.5"
          role="status"
          data-testid="day-outfit-handoff-notice"
        >
          <p className="type-caption min-w-0 flex-1">
            <span title={slotNames(slots, handoffKeptSlotIds)}>
              {kept === 1
                ? `${slotNames(slots, handoffKeptSlotIds)} keeps its own outfit`
                : `${kept} slots keep their own outfit`}
            </span>{' '}
            <span className="text-[var(--text-muted)]">— picked by hand, Outfit left them.</span>
          </p>
          <button
            type="button"
            className="ui-text-link type-caption"
            disabled={busy}
            data-testid="day-outfit-handoff-use"
            onClick={() => {
              onUseHandoffEverywhere();
              focusChoose();
            }}
          >
            Use the new one everywhere
          </button>
          <button
            type="button"
            className="ui-btn-ghost ui-btn-sm !px-2"
            aria-label="Dismiss"
            data-testid="day-outfit-handoff-dismiss"
            onClick={() => {
              onDismissHandoff();
              focusChoose();
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <ClothingSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Look & clothing · whole Day"
        description="Every slot wears this, unless you give a slot its own in its sheet."
        testId="day-outfit-sheet"
      >
        {open ? (
          <div className="space-y-4">
            {character && tiles.length > 1 ? (
              <div className="space-y-1" data-testid="day-outfit-look">
                <p className="type-caption text-[var(--text-muted)]">Look</p>
                <PortraitTileStrip
                  label="Look for the whole Day"
                  value={lookId}
                  disabled={busy}
                  onChange={next => next && onChooseLook(next)}
                  testIdPrefix="day-outfit-look"
                  tiles={tiles.map(tile => castLookPortraitTile(tile, { placeholder: 'No plate' }))}
                />
              </div>
            ) : null}
            {renderClothingPicker()}
          </div>
        ) : null}
      </ClothingSheet>
    </div>
  );
}
