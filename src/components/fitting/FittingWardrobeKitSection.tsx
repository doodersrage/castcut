'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldDivider, FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import CustomGarmentPhotoControls from '@/components/fitting/CustomGarmentPhotoControls';
import WardrobeCategoryPicker from '@/components/wardrobe/WardrobeCategoryPicker';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import type { FittingClothingOption } from '@/lib/fitting-clothing-options';
import type { FittingKitPreview } from '@/lib/fitting-kit-previews';
import { getFittingKitPreview } from '@/lib/fitting-kit-previews';
import type { FittingSwipeKit } from '@/lib/fitting-room';
import type { WardrobeCategoryFilter } from '@/lib/wardrobe-catalog-ui';
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

export default function FittingWardrobeKitSection({
  busy,
  wardrobeReady,
  wardrobeCategoryFilter,
  wardrobeOptions,
  wardrobeKitCount,
  filteredWardrobeOptions,
  wardrobeGroups,
  swipeDeck,
  deckSelectionId,
  deckSelectionIndex,
  activeThumbRef,
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
  const hasCustomGarment = Boolean(customGarmentImageUrl?.trim());
  const hasKit = Boolean(lockedWardrobeId?.trim());
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
  const selectedKit =
    hasKit && !hasCustomGarment
      ? (swipeDeck.find(kit => kit.id === lockedWardrobeId) ?? null)
      : null;
  const selectedKitThumb = selectedKit
    ? resolveKitThumb(selectedKit.id)
    : { url: null, pending: false };
  return (
    <ToolSection
      title="Wardrobe kit"
      description="Upload your own clothing photo (vision-scanned), or pick a catalog kit — not both."
      data-testid="fitting-kit-strip"
    >
      <WardrobeCategoryPicker
        value={wardrobeCategoryFilter}
        options={wardrobeOptions}
        ready={wardrobeReady}
        disabled={busy}
        onChange={onCategoryFilterChange}
      />
      {wardrobeReady && wardrobeCategoryFilter !== 'all' && wardrobeKitCount === 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-subtle)] px-3 py-3"
          data-testid="fitting-empty-filter"
        >
          <p className="type-caption text-[var(--text-muted)]">No kits in this clothing type.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onCategoryFilterChange('all')}
            >
              Show all types
            </Button>
          </div>
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Or upload a clothing photo above.
          </p>
        </div>
      ) : null}
      <FieldDivider />
      <CustomGarmentPhotoControls
        accent={ACCENT}
        busy={busy}
        garmentUploading={garmentUploading}
        garmentScanStatus={garmentScanStatus}
        customGarmentImageUrl={customGarmentImageUrl}
        customGarmentImageFilename={customGarmentImageFilename}
        customGarmentDescription={customGarmentDescription}
        onApplyCustomGarment={onApplyCustomGarment}
        onClearCustomGarment={onClearCustomGarment}
        onRescanCustomGarment={onRescanCustomGarment}
        onSaveCustomGarment={onSaveCustomGarment}
        onApplySavedCustomGarment={onApplySavedCustomGarment}
        onRemoveSavedCustomGarment={onRemoveSavedCustomGarment}
        onCustomGarmentDescriptionChange={onCustomGarmentDescriptionChange}
        onError={onError}
      />
      <FieldDivider />
      {hasCustomGarment ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="fitting-byo-active">
          Using your clothing photo. Clear it below to pick a catalog kit again.
        </p>
      ) : null}
      {swipeDeck.length > 0 ? (
        <div className="space-y-3">
          {selectedKit ? (
            <div
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-2"
              data-testid="fitting-selected-kit"
            >
              {selectedKitThumb.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedKitThumb.url}
                  alt=""
                  className="h-40 w-28 shrink-0 rounded object-cover sm:h-48 sm:w-32"
                />
              ) : (
                <span className="flex h-40 w-28 shrink-0 items-center justify-center rounded border border-[var(--border-subtle)] type-caption text-[var(--text-muted)] sm:h-48 sm:w-32">
                  No thumb
                </span>
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="type-overline text-[var(--accent-text)]">Selected kit</p>
                <p className="type-heading break-words">{selectedKit.label}</p>
                <p className="type-caption text-[var(--text-muted)]">
                  {[
                    selectedKit.group,
                    deckSelectionIndex >= 0
                      ? `${deckSelectionIndex + 1} / ${swipeDeck.length}`
                      : '',
                    selectedKitThumb.pending ? 'draft preview rendering…' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || hasCustomGarment}
                  data-testid="fitting-clear-kit"
                  onClick={onClearKit}
                >
                  Clear kit
                </Button>
              </div>
            </div>
          ) : null}
          <WardrobeKitPicker
            kits={swipeDeck}
            selectedId={deckSelectionId}
            disabled={!wardrobeReady || busy || hasCustomGarment}
            activeThumbRef={activeThumbRef}
            onSelect={onSelectKit}
            onSwipe={delta => onSwipeKit(delta)}
            resolveThumb={kit => resolveKitThumb(kit.id)}
          />
          <CollapsibleSection
            title="Draft previews & list"
            summary="Auto draft thumbs, optional list picker, and notes."
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
                Draft previews use {previewModelLabel ?? 'a fast edit model'} · 4-step draft ·
                256×384 (3 at a time). Queue try-on keeps your sidebar model and settings.
              </p>
            ) : previewModelLabel ? (
              <p className="type-caption text-[var(--text-muted)]">
                Preview kits: {previewModelLabel} · 4-step draft · 256×384 · 3 concurrent. Queue
                try-on uses {selectedModelLabel ?? sharedModel}.
              </p>
            ) : null}
            <label className="mt-3 space-y-2">
              <FieldLabel>List picker</FieldLabel>
              <SelectInput
                value={lockedWardrobeId ?? ''}
                disabled={!wardrobeReady || busy || hasCustomGarment}
                className={accentFocusClass(ACCENT)}
                onChange={event => {
                  onSelectKit(event.target.value);
                }}
              >
                {filteredWardrobeOptions
                  .filter(option => !option.group)
                  .map(option => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                  <optgroup key={group} label={group}>
                    {groupOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectInput>
            </label>
            <label className="mt-3 space-y-2">
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
        </div>
      ) : null}
      {swipeDeck.length === 0 ? (
        <>
          {hasKit ? (
            <div className="mb-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || hasCustomGarment}
                data-testid="fitting-clear-kit"
                onClick={onClearKit}
              >
                Clear kit
              </Button>
            </div>
          ) : null}
          <label className="mt-3 space-y-2">
            <FieldLabel>List picker</FieldLabel>
            <SelectInput
              value={lockedWardrobeId ?? ''}
              disabled={!wardrobeReady || busy || hasCustomGarment}
              className={accentFocusClass(ACCENT)}
              onChange={event => {
                onSelectKit(event.target.value);
              }}
            >
              {filteredWardrobeOptions
                .filter(option => !option.group)
                .map(option => (
                  <option key={option.value || 'default'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                <optgroup key={group} label={group}>
                  {groupOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectInput>
          </label>
          <FieldDivider />
          <label className="space-y-2">
            <FieldLabel>Notes (optional)</FieldLabel>
            <TextArea
              rows={2}
              value={notes}
              className={accentFocusClass(ACCENT)}
              placeholder="e.g. slightly oversized blazer, sneakers untied"
              onChange={event => onNotesChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </ToolSection>
  );
}
