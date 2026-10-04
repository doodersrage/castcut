'use client';

import type { FootwearFieldValue } from '@/components/wardrobe/FootwearField';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { CollapsibleSection, ToolSection } from '@/components/ui/ToolPageShell';
import ClothingPicker from '@/components/wardrobe/ClothingPickerLazy';
import ClothingSheet, { ClothingSummaryRow } from '@/components/wardrobe/ClothingSheet';
import { clothingSummaryLine, clothingSummaryThumbs } from '@/lib/clothing-summary';
import type { FittingKitPreview } from '@/lib/fitting-kit-previews';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import type { FittingClothingOption } from '@/lib/fitting-clothing-options';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
  type WardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeKitThumbUrl } from '@/lib/wardrobe-garment-thumbs';

const ACCENT = 'rose' as const;

export const FITTING_EMPTY_KIT_LABEL =
  'No kit picked yet — choose one to try on, or use your own photo.';

export type FittingWardrobeKitSectionProps = {
  busy: boolean;
  wardrobeReady: boolean;
  wardrobeCategoryFilter: WardrobeCategoryFilter;
  wardrobeOptions: FittingClothingOption[];
  swipeDeck: FittingSwipeKit[];
  deckSelectionId: string | undefined;
  activeLookId: string;
  kitPreviews: Record<string, FittingKitPreview>;
  autoKitPreviews: boolean;
  hasReference: boolean;
  isolateSubject: boolean;
  referenceIsolated: boolean;
  previewModel: string | null | undefined;
  previewModelLabel: string | null;
  selectedModelLabel?: string;
  sharedModel: string;
  lockedWardrobeId?: string;
  /** The locked kit's label — the Clothing row's one line. */
  lockedWardrobeLabel?: string;
  completedPreviewCount: number;
  inFlightPreviewCount: number;
  previewStatus: string | null;
  customGarmentImageUrl?: string;
  customGarmentImageFilename?: string;
  customGarmentDescription?: string;
  garmentUploading: boolean;
  garmentScanStatus?: string | null;
  onCategoryFilterChange: (filter: WardrobeCategoryFilter) => void;
  onSwipeKit: (delta: number) => void;
  onSelectKit: (wardrobeId: string) => void;
  onClearKit: () => void;
  onToggleAutoKitPreviews: () => void;
  onFillKitPreviews: () => void;
  onApplyCustomGarment: (input: { file: File; asPackshot?: boolean }) => Promise<void>;
  onClearCustomGarment: () => void;
  onRescanCustomGarment: () => Promise<void>;
  onSaveCustomGarment: () => void;
  onApplySavedCustomGarment: (garmentId: string) => void;
  onRemoveSavedCustomGarment: (garmentId: string) => void;
  onCustomGarmentDescriptionChange: (description: string) => void;
  footwear: FootwearFieldValue;
  onError: (message: string) => void;
  /** Phone: the row alone (no section card), small tiles, the phone's kit-strip test id. */
  compact?: boolean;
  kitPickerTestId?: string;
};

/**
 * Outfit's Clothing: one row saying what is worn now (kit or your photo, shoes) with Choose…,
 * which opens the same Clothing picker as Day and Story (kit deck, your own photo, footwear)
 * as its own sheet — plus Outfit's draft kit previews under it. Desk and phone share it.
 */
export default function FittingWardrobeKitSection({
  busy,
  wardrobeReady,
  wardrobeCategoryFilter,
  wardrobeOptions,
  swipeDeck,
  deckSelectionId,
  activeLookId,
  kitPreviews,
  autoKitPreviews,
  hasReference,
  isolateSubject,
  referenceIsolated,
  previewModel,
  previewModelLabel,
  selectedModelLabel,
  sharedModel,
  lockedWardrobeId,
  lockedWardrobeLabel,
  completedPreviewCount,
  inFlightPreviewCount,
  previewStatus,
  customGarmentImageUrl,
  customGarmentImageFilename,
  customGarmentDescription,
  garmentUploading,
  garmentScanStatus,
  onCategoryFilterChange,
  onSwipeKit,
  onSelectKit,
  onClearKit,
  onToggleAutoKitPreviews,
  onFillKitPreviews,
  onApplyCustomGarment,
  onClearCustomGarment,
  onRescanCustomGarment,
  onSaveCustomGarment,
  onApplySavedCustomGarment,
  onRemoveSavedCustomGarment,
  onCustomGarmentDescriptionChange,
  footwear,
  onError,
  compact = false,
  kitPickerTestId = 'fitting-wardrobe-kit-picker',
}: FittingWardrobeKitSectionProps) {
  useWardrobeGarmentThumbManifestGeneration();
  const [open, setOpen] = useState(false);
  // Person draft preview when one landed for this look, else the packaged garment thumb.
  const resolveKitThumb = (kitId: string) => {
    const preview = activeLookId
      ? getFittingKitPreview(kitPreviews, kitId, activeLookId)
      : undefined;
    const personUrl = preview?.status === 'completed' ? preview.imageUrl?.trim() || null : null;
    const pending = preview?.status === 'queued' || preview?.status === 'running';
    return {
      url: resolveWardrobeKitThumbUrl({ wardrobeId: kitId, personPreviewUrl: personUrl }),
      pending: Boolean(pending && !personUrl),
    };
  };
  const summary = clothingSummaryLine({
    kitLabel: lockedWardrobeLabel || lockedWardrobeId,
    hasPhoto: Boolean(customGarmentImageUrl?.trim()),
    footwear: footwear.value,
    emptyLabel: 'No kit yet — pick one, or use your own photo',
  });
  const thumbs = clothingSummaryThumbs({
    kitLabel: lockedWardrobeLabel || lockedWardrobeId,
    kitThumbUrl: lockedWardrobeId?.trim() ? resolveKitThumb(lockedWardrobeId.trim()).url : null,
    photoUrl: customGarmentImageUrl,
    footwear: footwear.value,
    footwearImageUrl: footwear.imageUrl,
  });
  const previewCount =
    completedPreviewCount > 0 || inFlightPreviewCount > 0
      ? `${completedPreviewCount} preview${completedPreviewCount === 1 ? '' : 's'}${
          inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''
        }`
      : '';

  const row = (
    <ClothingSummaryRow
      label={compact ? 'Clothing' : 'Now wearing'}
      summary={summary}
      thumbs={thumbs}
      disabled={busy}
      testId="fitting-clothing"
      onOpen={() => setOpen(true)}
    />
  );

  const sheet = (
    <ClothingSheet
      open={open}
      onClose={() => setOpen(false)}
      title="Clothing"
      description="A catalog outfit kit or your own clothing photo (vision-scanned) — not both — and the shoes."
    >
      {open ? (
        <div className="space-y-3">
          <ClothingPicker
            accent={ACCENT}
            busy={busy}
            testIdPrefix="fitting"
            emptyKitLabel={FITTING_EMPTY_KIT_LABEL}
            clearKitLabel="Clear kit"
            garment={{
              uploading: garmentUploading,
              scanStatus: garmentScanStatus,
              imageUrl: customGarmentImageUrl,
              imageFilename: customGarmentImageFilename,
              description: customGarmentDescription,
              onApply: onApplyCustomGarment,
              onClear: onClearCustomGarment,
              onRescan: onRescanCustomGarment,
              onSave: onSaveCustomGarment,
              onApplySaved: onApplySavedCustomGarment,
              onRemoveSaved: onRemoveSavedCustomGarment,
              onDescriptionChange: onCustomGarmentDescriptionChange,
            }}
            footwear={footwear}
            kits={swipeDeck}
            kitsReady={wardrobeReady}
            selectedKitId={deckSelectionId}
            kitSize={compact ? 'sm' : 'md'}
            kitPickerTestId={kitPickerTestId}
            onSelectKit={onSelectKit}
            onSwipeKit={delta => onSwipeKit(delta)}
            onClearKit={onClearKit}
            resolveKitThumb={kit => resolveKitThumb(kit.id)}
            category={{
              value: wardrobeCategoryFilter,
              options: wardrobeCategoryFilterOptions().map(option => ({
                value: option.value,
                label: wardrobeReady
                  ? `${option.label} (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                  : option.label,
              })),
              onChange: value => onCategoryFilterChange(normalizeWardrobeCategoryFilter(value)),
            }}
            onError={onError}
          />
          <CollapsibleSection
            title="Draft previews"
            summary="Quick draft thumbs of the plate in each kit."
            defaultOpen={false}
            persistKey="fitting-kit-advanced"
          >
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid="fitting-preview-vs-queue"
            >
              Preview kits = quick draft thumbs. Queue try-on = the full-quality still you Keep for
              Day.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ChipButton
                active={autoKitPreviews}
                disabled={busy || !hasReference}
                onClick={onToggleAutoKitPreviews}
              >
                Auto draft previews
              </ChipButton>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  busy ||
                  !hasReference ||
                  !activeLookId ||
                  !previewModel ||
                  swipeDeck.length === 0 ||
                  (isolateSubject && referenceIsolated !== true)
                }
                onClick={() => void onFillKitPreviews()}
              >
                Preview kits
              </Button>
              {previewCount ? (
                <span className="type-caption text-[var(--text-muted)]">{previewCount}</span>
              ) : null}
            </div>
            {previewStatus ? (
              <p className="type-caption text-[var(--text-muted)]">{previewStatus}</p>
            ) : hasReference && autoKitPreviews ? (
              <p className="type-caption text-[var(--text-muted)]">
                Draft previews use {previewModelLabel ?? 'a fast edit model'} · 4-step draft ·
                256×384 (3 at a time). Queue try-on keeps your sidebar model and settings.
              </p>
            ) : previewModelLabel ? (
              <p className="type-caption text-[var(--text-muted)]">
                Preview kits: {previewModelLabel} · 4-step draft · 256×384 · 3 concurrent. Queue
                try-on uses {selectedModelLabel ?? sharedModel}.
              </p>
            ) : null}
          </CollapsibleSection>
        </div>
      ) : null}
    </ClothingSheet>
  );

  if (compact) {
    return (
      <div data-testid="mobile-fitting-clothing">
        {row}
        {previewStatus || previewCount ? (
          <p className="type-caption text-[var(--text-muted)]">{previewStatus || previewCount}</p>
        ) : null}
        {sheet}
      </div>
    );
  }

  return (
    <ToolSection
      title="Clothing"
      description="What she tries on — a catalog outfit kit or your own clothing photo, and the shoes."
      data-testid="fitting-kit-strip"
    >
      {row}
      {previewStatus ? (
        <p className="type-caption text-[var(--text-muted)]">{previewStatus}</p>
      ) : null}
      {sheet}
    </ToolSection>
  );
}
