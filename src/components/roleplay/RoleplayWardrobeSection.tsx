'use client';

import { useMemo } from 'react';
import ClothingPicker from '@/components/wardrobe/ClothingPicker';
import { formatWardrobeKitLabel } from '@/lib/wardrobe-kit-picker';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
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
              ? formatWardrobeKitLabel(
                  wardrobeKitDeck.find(kit => kit.id === selectedWardrobeId)?.label ??
                    selectedWardrobeId
                )
              : 'Kit or clothing photo'
        }
        defaultOpen={hasCustomGarment || Boolean(selectedWardrobeId)}
        persistKey="roleplay-wardrobe"
      >
        <p className="type-caption text-[var(--text-muted)]">
          Photo stills use this as Image 2 so beat outfits land on the Cast plate.
        </p>
        <div className="mt-3">
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
        </div>
      </CollapsibleSection>
    </div>
  );
}
