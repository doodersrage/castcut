'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseCharacterHints } from '@/lib/character-hints';
import { getCharacter } from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import { fetchClothingSelectOptions } from '@/lib/clothing-catalog-client';
import { applyCustomGarmentUpload } from '@/lib/fitting-custom-garment-apply';
import {
  removeSavedFittingGarment,
  saveFittingGarment,
  loadSavedFittingGarments,
} from '@/lib/fitting-saved-garments';
import { collectIsolateSourceUrls } from '@/lib/isolate-subject';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolveStillFileForVisionScan } from '@/lib/vision-scan-still';
import { scanStillWithVision } from '@/lib/vision-still-scan-client';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import type { RoleplayToolCache, SharedToolSettings } from '@/lib/settings-cache';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';

type PromptActions = ReturnType<typeof usePromptResultActions>;
type ClothingOption = { value: string; label: string; group?: string };

type UseRoleplayWardrobeOptions = {
  shared: SharedToolSettings;
  toolSettings: RoleplayToolCache;
  updateShared: (partial: Partial<SharedToolSettings>) => void;
  updateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  actions: PromptActions;
  setError: (message: string | null) => void;
};

export function useRoleplayWardrobe({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  actions,
  setError,
}: UseRoleplayWardrobeOptions) {
  const character = useMemo(() => {
    const id = shared.activeCharacterId?.trim();
    return id ? getCharacter(id) : undefined;
  }, [shared.activeCharacterId]);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Default kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const [garmentUploading, setGarmentUploading] = useState(false);
  const [garmentScanStatus, setGarmentScanStatus] = useState<string | null>(null);

  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const wardrobeCategoryFilter = normalizeWardrobeCategoryFilter(
    toolSettings.wardrobeCategoryFilter
  );
  const selectedWardrobeId =
    toolSettings.wardrobeId?.trim() || shared.lockedWardrobeId?.trim() || '';
  const hasCustomGarment = Boolean(
    toolSettings.customGarmentImageUrl?.trim() || toolSettings.customGarmentImageFilename?.trim()
  );

  const filteredWardrobeOptions = useMemo(
    () => filterWardrobeSelectOptions(wardrobeOptions, wardrobeCategoryFilter, selectedWardrobeId),
    [selectedWardrobeId, wardrobeCategoryFilter, wardrobeOptions]
  );
  const wardrobeKitCount = useMemo(
    () => countWardrobeOptionsForFilter(wardrobeOptions, wardrobeCategoryFilter),
    [wardrobeCategoryFilter, wardrobeOptions]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchClothingSelectOptions('wardrobeCatalog', clothingGender).then(next => {
      if (cancelled) {
        return;
      }
      setWardrobeOptions(next);
      setWardrobeLoadedKey(wardrobeOptionsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [clothingGender, wardrobeOptionsKey]);

  // Seed Story kit from shared Look/Day lock when unset.
  useEffect(() => {
    const locked = shared.lockedWardrobeId?.trim();
    if (!toolSettings.wardrobeId?.trim() && locked && !hasCustomGarment) {
      updateToolSettings({ wardrobeId: locked });
    }
  }, [hasCustomGarment, shared.lockedWardrobeId, toolSettings.wardrobeId, updateToolSettings]);

  const scanCustomGarmentDescription = useCallback(
    async (image: File) => {
      setGarmentScanStatus('Scanning clothing with vision…');
      try {
        return await scanStillWithVision({
          image,
          purpose: 'fitting-garment',
          model: shared.model,
          detail: shared.detail,
          shared,
        });
      } finally {
        setGarmentScanStatus(null);
      }
    },
    [shared]
  );

  const applyCustomGarment = useCallback(
    async (input: {
      file?: File | null;
      imageUrl?: string;
      filename?: string;
      asPackshot?: boolean;
    }) => {
      setGarmentUploading(true);
      setGarmentScanStatus(null);
      setError(null);
      try {
        const result = await applyCustomGarmentUpload(input, {
          model: shared.model,
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
          sendComfyUi: (prompt, _a, _b, options) =>
            actions.sendComfyUi(prompt, undefined, undefined, options),
          scanDescription: scanCustomGarmentDescription,
          onStatus: setGarmentScanStatus,
          onSoftError: setError,
        });
        updateToolSettings({
          customGarmentImageFilename: result.filename,
          customGarmentImageUrl: result.previewUrl,
          customGarmentDescription: result.description,
          wardrobeId: undefined,
        });
        updateShared({ lockedWardrobeId: undefined });
      } finally {
        setGarmentUploading(false);
        setGarmentScanStatus(null);
      }
    },
    [
      actions,
      character?.activeLookId,
      scanCustomGarmentDescription,
      setError,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.model,
      updateShared,
      updateToolSettings,
    ]
  );

  const clearCustomGarment = useCallback(() => {
    const previousUrl = toolSettings.customGarmentImageUrl?.trim();
    if (previousUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previousUrl);
    }
    updateToolSettings({
      customGarmentImageUrl: undefined,
      customGarmentImageFilename: undefined,
      customGarmentDescription: undefined,
    });
    setGarmentScanStatus(null);
  }, [toolSettings.customGarmentImageUrl, updateToolSettings]);

  const rescanCustomGarment = useCallback(async () => {
    const preview = toolSettings.customGarmentImageUrl?.trim();
    const filename = toolSettings.customGarmentImageFilename?.trim();
    if (!preview && !filename) {
      throw new Error('Upload a clothing photo first.');
    }
    setGarmentUploading(true);
    setGarmentScanStatus('Loading clothing photo…');
    setError(null);
    try {
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const urls = collectIsolateSourceUrls({
        imageUrl: preview,
        filename,
        comfyUrl,
      });
      const file = await resolveStillFileForVisionScan({
        urls,
        fallbackName: filename || 'story-garment.png',
      });
      const description = await scanCustomGarmentDescription(file);
      if (!description?.trim()) {
        throw new Error('Vision returned an empty garment description. Try Rescan again.');
      }
      updateToolSettings({ customGarmentDescription: description.trim() });
    } finally {
      setGarmentUploading(false);
      setGarmentScanStatus(null);
    }
  }, [
    scanCustomGarmentDescription,
    setError,
    toolSettings.customGarmentImageFilename,
    toolSettings.customGarmentImageUrl,
    updateToolSettings,
  ]);

  const saveCurrentCustomGarment = useCallback(() => {
    const filename = toolSettings.customGarmentImageFilename?.trim();
    if (!filename) {
      throw new Error('Upload a clothing photo first.');
    }
    return saveFittingGarment({
      imageFilename: filename,
      imageUrl: toolSettings.customGarmentImageUrl,
      description: toolSettings.customGarmentDescription,
    });
  }, [
    toolSettings.customGarmentDescription,
    toolSettings.customGarmentImageFilename,
    toolSettings.customGarmentImageUrl,
  ]);

  const applySavedCustomGarment = useCallback(
    (garmentId: string) => {
      const id = garmentId.trim();
      const entry = loadSavedFittingGarments().find(item => item.id === id);
      if (!entry) {
        throw new Error('That saved clothing photo is gone.');
      }
      const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
      const previewUrl =
        entry.imageUrl?.trim() ||
        collectIsolateSourceUrls({
          filename: entry.imageFilename,
          comfyUrl,
        }).find(url => url.includes('/api/comfyui/view?')) ||
        '';
      if (!previewUrl) {
        throw new Error('Could not resolve that saved clothing photo — re-upload it.');
      }
      updateToolSettings({
        customGarmentImageFilename: entry.imageFilename,
        customGarmentImageUrl: previewUrl,
        customGarmentDescription: entry.description,
        wardrobeId: undefined,
      });
      updateShared({ lockedWardrobeId: undefined });
    },
    [updateShared, updateToolSettings]
  );

  const removeSavedCustomGarment = useCallback((garmentId: string) => {
    removeSavedFittingGarment(garmentId);
  }, []);

  const selectWardrobe = useCallback(
    (wardrobeId: string | undefined) => {
      const id = wardrobeId?.trim() || undefined;
      if (id) {
        const previousUrl = toolSettings.customGarmentImageUrl?.trim();
        if (previousUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(previousUrl);
        }
        updateToolSettings({
          wardrobeId: id,
          customGarmentImageUrl: undefined,
          customGarmentImageFilename: undefined,
          customGarmentDescription: undefined,
        });
        updateShared({ lockedWardrobeId: id });
        return;
      }
      updateToolSettings({ wardrobeId: undefined });
      updateShared({ lockedWardrobeId: undefined });
    },
    [toolSettings.customGarmentImageUrl, updateShared, updateToolSettings]
  );

  return {
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
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
  };
}
