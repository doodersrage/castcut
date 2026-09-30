'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldLabel, TextArea } from '@/components/ui/Field';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import ClothingPicker from '@/components/wardrobe/ClothingPicker';
import type { FittingClothingOption } from '@/lib/fitting-clothing-options';
import type { FittingKitPreview } from '@/lib/fitting-kit-previews';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
  type WardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { resolveWardrobeKitThumbUrl } from '@/lib/wardrobe-garment-thumbs';

const ACCENT = 'rose' as const;

export type FittingWardrobeKitSectionProps = {
  busy: boolean;
  leanChrome: boolean;
  wardrobeReady: boolean;
  wardrobeCategoryFilter: WardrobeCategoryFilter;
  wardrobeOptions: FittingClothingOption[];
  wardrobeKitCount: number;
  filteredWardrobeOptions: FittingClothingOption[];
  wardrobeGroups: Map<string, FittingClothingOption[]>;
  swipeDeck: FittingSwipeKit[];
  activeSwipeKit: FittingSwipeKit | null;
  deckSelectionId: string | undefined;
  deckSelectionIndex: number;
  activeThumbRef: RefObject<HTMLButtonElement | null>;
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
  notes: string;
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
  onNotesChange: (notes: string) => void;
  onApplyCustomGarment: (input: { file: File; asPackshot?: boolean }) => Promise<void>;
  onClearCustomGarment: () => void;
  onRescanCustomGarment: () => Promise<void>;
  onSaveCustomGarment: () => void;
  onApplySavedCustomGarment: (garmentId: string) => void;
  onRemoveSavedCustomGarment: (garmentId: string) => void;
  onCustomGarmentDescriptionChange: (description: string) => void;
  onError: (message: string) => void;
};

/**
 * Outfit's clothing: the same Clothing picker as Day and Story (catalog kit or your own photo,
 * one "now wearing" card, Browse), plus Outfit's own draft kit previews and notes.
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
  notes,
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
  onNotesChange,
  onApplyCustomGarment,
  onClearCustomGarment,
  onRescanCustomGarment,
  onSaveCustomGarment,
  onApplySavedCustomGarment,
  onRemoveSavedCustomGarment,
  onCustomGarmentDescriptionChange,
  onError,
}: FittingWardrobeKitSectionProps) {
  useWardrobeGarmentThumbManifestGeneration();
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
  return (
    <ToolSection
      title="Clothing"
      description="A catalog outfit kit or your own clothing photo (vision-scanned) — not both."
      data-testid="fitting-kit-strip"
    >
      <ClothingPicker
        accent={ACCENT}
        busy={busy}
        testIdPrefix="fitting"
        emptyKitLabel="No kit picked yet — choose one to try on, or use your own photo."
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
        kits={swipeDeck}
        kitsReady={wardrobeReady}
        selectedKitId={deckSelectionId}
        kitPickerTestId="fitting-wardrobe-kit-picker"
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
        title="Draft previews & notes"
        summary="Quick draft thumbs of her in each kit, and notes for the try-on."
        defaultOpen={false}
        persistKey="fitting-kit-advanced"
        className="mt-3"
      >
        <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-preview-vs-queue">
          Preview kits = quick draft thumbs. Queue try-on = the full-quality still you Keep for Day.
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
          {completedPreviewCount > 0 || inFlightPreviewCount > 0 ? (
            <span className="type-caption text-[var(--text-muted)]">
              {completedPreviewCount} preview{completedPreviewCount === 1 ? '' : 's'}
              {inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''}
            </span>
          ) : null}
        </div>
        {previewStatus ? (
          <p className="type-caption text-[var(--text-muted)]">{previewStatus}</p>
        ) : hasReference && autoKitPreviews ? (
          <p className="type-caption text-[var(--text-muted)]">
            Draft previews use {previewModelLabel ?? 'a fast edit model'} · 4-step draft · 256×384
            (3 at a time). Queue try-on keeps your sidebar model and settings.
          </p>
        ) : previewModelLabel ? (
          <p className="type-caption text-[var(--text-muted)]">
            Preview kits: {previewModelLabel} · 4-step draft · 256×384 · 3 concurrent. Queue try-on
            uses {selectedModelLabel ?? sharedModel}.
          </p>
        ) : null}
        <label className="mt-3 block space-y-2">
          <FieldLabel>Notes (optional)</FieldLabel>
          <TextArea
            data-testid="fitting-notes"
            rows={2}
            value={notes}
            className={accentFocusClass(ACCENT)}
            placeholder="e.g. slightly oversized blazer, sneakers untied"
            onChange={event => onNotesChange(event.target.value)}
          />
        </label>
      </CollapsibleSection>
    </ToolSection>
  );
}
