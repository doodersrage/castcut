'use client';

import { useRenderBackend } from '@/lib/engine/render-backend-status';
import { useCallback, useMemo } from 'react';
import { fittingQueueBlockReason } from '@/lib/fitting/room';
import { applyCharacterRecord } from '@/lib/character/os';
import { loadLookPack, lookPackDayHref, lookPackRoleplayHref, saveLookPack } from '@/lib/look/pack';
import { bumpPlayCampaignStep } from '@/lib/play/campaign';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings/cache';
import { type FittingClothingOption } from '@/lib/fitting/clothing-options';

import type { FittingRoomToolOrchestrationCore } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationCore';
import type { useFittingRoomToolOrchestrationPart2 } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationPart2';

export function useFittingRoomToolOrchestrationPart3(
  ctx: FittingRoomToolOrchestrationCore & ReturnType<typeof useFittingRoomToolOrchestrationPart2>
) {
  const {
    shared,
    toolSettings,
    router,
    error,
    referenceUploading,
    isolateSubject,
    hasReference,
    character,
    filteredWardrobeOptions,
    busy,
    garmentUploading,
    dismissTryOn,
    applyFixedTryOn,
    requeueTryOn,
  } = ctx;

  const goRoleplay = useCallback(() => {
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
      bumpPlayCampaignStep({ characterId: character.id, stepId: 'roleplay' });
      const pack = loadLookPack();
      if (pack) {
        const staged = { ...pack, characterId: character.id };
        saveLookPack(staged);
        router.push(lookPackRoleplayHref(staged));
        return;
      }
      router.push(`/story?character=${encodeURIComponent(character.id)}`);
      return;
    }
    router.push('/story');
  }, [character, router]);

  const dayPlannerHref = (() => {
    if (typeof window === 'undefined') {
      return character ? `/day?character=${encodeURIComponent(character.id)}` : '/day';
    }
    const pack = loadLookPack();
    if (pack && character) {
      return lookPackDayHref({
        ...pack,
        characterId: character.id,
        wardrobeId: shared.lockedWardrobeId?.trim() || pack.wardrobeId,
      });
    }
    if (!character) {
      return '/day';
    }
    const params = new URLSearchParams();
    params.set('character', character.id);
    if (shared.lockedWardrobeId?.trim()) {
      params.set('wardrobe', shared.lockedWardrobeId.trim());
    }
    return `/day?${params.toString()}`;
  })();

  const wardrobeGroups = useMemo(() => {
    const groups = new Map<string, FittingClothingOption[]>();
    for (const option of filteredWardrobeOptions) {
      if (!option.group) {
        continue;
      }
      if (!groups.has(option.group)) {
        groups.set(option.group, []);
      }
      groups.get(option.group)!.push(option);
    }
    return groups;
  }, [filteredWardrobeOptions]);

  const hasGarmentSource = Boolean(
    shared.lockedWardrobeId?.trim() ||
    toolSettings.customGarmentImageUrl?.trim() ||
    toolSettings.customGarmentImageFilename?.trim()
  );
  const isolatePending = isolateSubject && toolSettings.referenceIsolated !== true && !error;
  const renderOffline = useRenderBackend().state === 'offline';
  const queueBlockReason = fittingQueueBlockReason({
    hasCharacter: Boolean(character),
    hasPlate: hasReference,
    hasGarmentSource,
    referenceUploading,
    garmentUploading,
    isolateSubject,
    isolatePending,
    busy,
    renderOffline,
  });
  const queueBlocked = Boolean(queueBlockReason);

  return {
    goRoleplay,
    dayPlannerHref,
    wardrobeGroups,
    queueBlocked,
    queueBlockReason,
    dismissTryOn,
    applyFixedTryOn,
    requeueTryOn,
  };
}
