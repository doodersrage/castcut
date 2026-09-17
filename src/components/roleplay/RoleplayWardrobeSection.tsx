'use client';

import { useMemo } from 'react';
import CustomGarmentPhotoControls from '@/components/fitting/CustomGarmentPhotoControls';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import { FieldDivider, FieldLabel, SelectInput } from '@/components/ui/Field';
import { CollapsibleSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import {
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import type { RoleplayToolCache } from '@/lib/settings-cache';
import type { useRoleplayWardrobe } from '@/hooks/useRoleplayWardrobe';

const ACCENT = 'amber' as const;

type RoleplayWardrobeSectionProps = {
  busy: boolean;
  toolSettings: RoleplayToolCache;
  onUpdateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  onError: (message: string) => void;
  wardrobe: ReturnType<typeof useRoleplayWardrobe>;
};

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
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectWardrobe,
  } = wardrobe;

  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, selectedWardrobeId),
    [filteredWardrobeOptions, selectedWardrobeId]
  );

  return (
    <div data-testid="story-wardrobe">
      <CollapsibleSection
        title="Outfit for stills"
        summary={
          hasCustomGarment
            ? 'Your clothing photo'
            : selectedWardrobeId
              ? selectedWardrobeId
              : 'Kit or clothing photo'
        }
        defaultOpen={hasCustomGarment || Boolean(selectedWardrobeId)}
        persistKey="roleplay-wardrobe"
      >
        <p className="type-caption text-[var(--text-muted)]">
          Photo stills use this as Image 2 so beat outfits land on the Cast plate — same strip as
          Day / Outfit.
        </p>
        <div className="mt-3">
          <CustomGarmentPhotoControls
            accent={ACCENT}
            busy={busy}
            garmentUploading={garmentUploading}
            garmentScanStatus={garmentScanStatus}
            customGarmentImageUrl={toolSettings.customGarmentImageUrl}
            customGarmentImageFilename={toolSettings.customGarmentImageFilename}
            customGarmentDescription={toolSettings.customGarmentDescription}
            testIdPrefix="story"
            onApplyCustomGarment={applyCustomGarment}
            onClearCustomGarment={clearCustomGarment}
            onRescanCustomGarment={rescanCustomGarment}
            onSaveCustomGarment={saveCurrentCustomGarment}
            onApplySavedCustomGarment={applySavedCustomGarment}
            onRemoveSavedCustomGarment={removeSavedCustomGarment}
            onCustomGarmentDescriptionChange={value =>
              onUpdateToolSettings({ customGarmentDescription: value })
            }
            onError={onError}
          />
        </div>
        <FieldDivider />
        <label className="mt-3 space-y-2">
          <FieldLabel>Outfit kit</FieldLabel>
          {hasCustomGarment ? (
            <p className="type-caption text-[var(--text-muted)]" data-testid="story-byo-active">
              Using your clothing photo. Clear it above to pick a catalog kit again.
            </p>
          ) : null}
          {wardrobeKitDeck.length > 0 ? (
            <WardrobeKitPicker
              kits={wardrobeKitDeck}
              selectedId={selectedWardrobeId}
              disabled={!wardrobeReady || busy || hasCustomGarment}
              testId="story-wardrobe-kit-picker"
              onSelect={wardrobeId => selectWardrobe(wardrobeId)}
              onSwipe={delta => {
                const next = fittingSwipeNeighbor(wardrobeKitDeck, selectedWardrobeId, delta);
                if (next) {
                  selectWardrobe(next.id);
                }
              }}
              resolveThumb={kit => ({
                url: resolveWardrobeGarmentThumbUrl(kit.id),
              })}
            />
          ) : null}
          <CollapsibleSection
            title="Kit filters"
            summary="Clothing type and list picker."
            defaultOpen={false}
            persistKey="story-kit-filters"
            className="mt-3"
          >
            <label className="space-y-2">
              <FieldLabel>Clothing type</FieldLabel>
              <SelectInput
                value={wardrobeCategoryFilter}
                disabled={!wardrobeReady || busy}
                className={accentFocusClass(ACCENT)}
                onChange={event =>
                  onUpdateToolSettings({
                    wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(event.target.value),
                  })
                }
              >
                {wardrobeCategoryFilterOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </label>
          </CollapsibleSection>
        </label>
      </CollapsibleSection>
    </div>
  );
}
