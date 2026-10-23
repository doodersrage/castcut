'use client';

import { useMemo } from 'react';
import ClothingPicker from '@/components/wardrobe/ClothingPickerLazy';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { fittingSwipeNeighbor } from '@/lib/fitting/room';
import type { ToolAccent } from '@/lib/app/tool-theme';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe/catalog-ui';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe/garment-thumbs';

type DayEngineView = ReturnType<typeof useDayPlannerToolOrchestration>;

/** What the picker reads from Day's engine. */
export type DayClothingPickerVm = Pick<
  DayEngineView,
  | 'shared'
  | 'toolSettings'
  | 'updateToolSettings'
  | 'busy'
  | 'activeSlot'
  | 'filteredWardrobeOptions'
  | 'wardrobeOptions'
  | 'wardrobeReady'
  | 'wardrobeCategoryFilter'
  | 'garmentUploading'
  | 'garmentScanStatus'
  | 'applyCustomGarment'
  | 'applyFootwearPhoto'
  | 'clearCustomGarment'
  | 'rescanCustomGarment'
  | 'saveCurrentCustomGarment'
  | 'applySavedCustomGarment'
  | 'removeSavedCustomGarment'
  | 'selectSlotWardrobe'
  | 'selectDayWardrobe'
  | 'setError'
>;

/**
 * The Clothing picker for the active slot (its own kit) or, from the Look & clothing row, for the
 * whole Day (the session's outfit lock). The photo and the shoes are the Day's either way. Day's
 * slot sheet and Scene's shot both use it.
 */
export default function DayClothingPicker({
  vm,
  scope = 'slot',
  accent,
}: {
  vm: DayClothingPickerVm;
  scope?: 'slot' | 'day';
  accent: ToolAccent;
}) {
  const {
    shared,
    toolSettings,
    updateToolSettings,
    busy,
    activeSlot,
    filteredWardrobeOptions,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    applyFootwearPhoto,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectSlotWardrobe,
    selectDayWardrobe,
    setError,
  } = vm;
  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, activeSlot.wardrobeId),
    [activeSlot.wardrobeId, filteredWardrobeOptions]
  );
  const dayScope = scope === 'day';
  const selectedKitId = dayScope ? shared.lockedWardrobeId : activeSlot.wardrobeId;
  const selectKit = (wardrobeId: string | undefined) =>
    dayScope ? selectDayWardrobe(wardrobeId) : selectSlotWardrobe(activeSlot.id, wardrobeId);
  return (
    <div data-testid={dayScope ? 'day-outfit-clothing' : 'day-clothing'}>
      <ClothingPicker
        accent={accent}
        busy={busy}
        testIdPrefix="day"
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
          onDescriptionChange: value => updateToolSettings({ customGarmentDescription: value }),
        }}
        footwear={{
          value: toolSettings.footwear,
          imageUrl: toolSettings.footwearImageUrl,
          imageFilename: toolSettings.footwearImageFilename,
          onChange: patch => updateToolSettings(patch),
          onApplyPhoto: applyFootwearPhoto,
        }}
        kits={wardrobeKitDeck}
        kitsReady={wardrobeReady}
        selectedKitId={selectedKitId}
        kitPickerTestId={dayScope ? 'day-outfit-kit-picker' : 'day-wardrobe-kit-picker'}
        onSelectKit={wardrobeId => selectKit(wardrobeId)}
        onSwipeKit={delta => {
          const next = fittingSwipeNeighbor(wardrobeKitDeck, selectedKitId, delta);
          if (next) {
            selectKit(next.id);
          }
        }}
        onClearKit={() => selectKit(undefined)}
        resolveKitThumb={kit => ({ url: resolveWardrobeGarmentThumbUrl(kit.id) })}
        category={{
          value: wardrobeCategoryFilter,
          options: wardrobeCategoryFilterOptions().map(option => ({
            value: option.value,
            label: wardrobeReady
              ? `${option.label} (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
              : option.label,
          })),
          onChange: value =>
            updateToolSettings({
              wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(value),
            }),
        }}
        onError={message => setError(message)}
      />
    </div>
  );
}
