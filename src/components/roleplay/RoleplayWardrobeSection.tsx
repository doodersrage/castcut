'use client';

import { useMemo, useState } from 'react';
import ClothingPicker from '@/components/wardrobe/ClothingPickerLazy';
import ClothingSheet, { ClothingSummaryRow } from '@/components/wardrobe/ClothingSheet';
import { clothingSummaryLine, clothingSummaryThumbs } from '@/lib/clothing-summary';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import {
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import type { RoleplayToolCache } from '@/lib/play-settings';
import type { useRoleplayWardrobe } from '@/hooks/useRoleplayWardrobe';

const ACCENT = 'amber' as const;

type RoleplayWardrobeSectionProps = {
  busy: boolean;
  toolSettings: RoleplayToolCache;
  onUpdateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  onError: (message: string) => void;
  wardrobe: ReturnType<typeof useRoleplayWardrobe>;
};

/**
 * Story's outfit for stills: one row saying what is worn (kit or your photo, shoes) with
 * Choose…, which opens the same Clothing picker as Day and Outfit as its own sheet. Desk and
 * phone Story render this same row.
 */
export default function RoleplayWardrobeSection({
  busy,
  toolSettings,
  onUpdateToolSettings,
  onError,
  wardrobe,
}: RoleplayWardrobeSectionProps) {
  const {
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    selectedWardrobeId,
    hasCustomGarment,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    applyFootwearPhoto,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectWardrobe,
  } = wardrobe;
  const [open, setOpen] = useState(false);

  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, selectedWardrobeId),
    [filteredWardrobeOptions, selectedWardrobeId]
  );
  const kitLabel = selectedWardrobeId
    ? (wardrobeKitDeck.find(kit => kit.id === selectedWardrobeId)?.label ?? selectedWardrobeId)
    : '';
  const summary = clothingSummaryLine({
    kitLabel,
    hasPhoto: hasCustomGarment,
    footwear: toolSettings.footwear,
    emptyLabel: 'No kit or photo yet — the bible’s look dresses her',
  });
  const thumbs = clothingSummaryThumbs({
    kitLabel,
    kitThumbUrl: resolveWardrobeGarmentThumbUrl(selectedWardrobeId),
    photoUrl: hasCustomGarment ? toolSettings.customGarmentImageUrl : null,
    footwear: toolSettings.footwear,
    footwearImageUrl: toolSettings.footwearImageUrl,
  });

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3"
      data-testid="story-wardrobe"
    >
      <ClothingSummaryRow
        label="Outfit for stills"
        summary={summary}
        thumbs={thumbs}
        disabled={busy}
        testId="story-clothing"
        className="py-2"
        onOpen={() => setOpen(true)}
      />
      <ClothingSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Outfit for stills"
        description="Photo stills use this as Image 2 so beat outfits land on the Cast plate."
      >
        {open ? (
          <ClothingPicker
            accent={ACCENT}
            busy={busy}
            testIdPrefix="story"
            garment={{
              uploading: garmentUploading,
              scanStatus: garmentScanStatus,
              imageUrl: toolSettings.customGarmentImageUrl,
              imageFilename: toolSettings.customGarmentImageFilename,
              description: toolSettings.customGarmentDescription,
              onApply: applyCustomGarment,
              onClear: clearCustomGarment,
              onRescan: rescanCustomGarment,
              onSave: saveCurrentCustomGarment,
              onApplySaved: applySavedCustomGarment,
              onRemoveSaved: removeSavedCustomGarment,
              onDescriptionChange: value =>
                onUpdateToolSettings({ customGarmentDescription: value }),
            }}
            footwear={{
              value: toolSettings.footwear,
              imageUrl: toolSettings.footwearImageUrl,
              imageFilename: toolSettings.footwearImageFilename,
              onChange: patch => onUpdateToolSettings(patch),
              onApplyPhoto: applyFootwearPhoto,
            }}
            kits={wardrobeKitDeck}
            kitsReady={wardrobeReady}
            selectedKitId={selectedWardrobeId}
            kitPickerTestId="story-wardrobe-kit-picker"
            onSelectKit={wardrobeId => selectWardrobe(wardrobeId)}
            onSwipeKit={delta => {
              const next = fittingSwipeNeighbor(wardrobeKitDeck, selectedWardrobeId, delta);
              if (next) {
                selectWardrobe(next.id);
              }
            }}
            onClearKit={() => selectWardrobe(undefined)}
            resolveKitThumb={kit => ({ url: resolveWardrobeGarmentThumbUrl(kit.id) })}
            category={{
              value: wardrobeCategoryFilter,
              options: wardrobeCategoryFilterOptions(),
              onChange: value =>
                onUpdateToolSettings({
                  wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(value),
                }),
            }}
            onError={onError}
          />
        ) : null}
      </ClothingSheet>
    </div>
  );
}
