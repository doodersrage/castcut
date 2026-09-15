'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useFittingRoomQueue } from '@/hooks/useFittingRoomQueue';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  activeLook,
  applyCharacterRecord,
  characterFromShared,
  getCharacter,
  upsertCharacter,
} from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import {
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  resolveFittingDeckWardrobeId,
  resolveFittingPlateFromCharacter,
} from '@/lib/fitting-room';
import {
  countInFlightFittingKitPreviews,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  getFittingKitPreview,
  normalizeFittingKitPreviews,
  resolveFittingKitPreviewModel,
} from '@/lib/fitting-kit-previews';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  cacheBustIdentityMediaUrl,
  isIdentityMediaUrl,
  persistIdentityImage,
} from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import {
  applyLookPackToFittingState,
  loadLookPack,
  lookPackDayHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { EMPTY_WARDROBE_OPTIONS, type FittingClothingOption } from '@/lib/fitting-clothing-options';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

import type { FittingRoomToolOrchestrationCore } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationCore';

export function useFittingRoomToolOrchestrationPart2(ctx: FittingRoomToolOrchestrationCore) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    router,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    referenceUploading,
    setReferenceUploading,
    isolateStatus,
    setIsolateStatus,
    referencePreviewUrl,
    setReferencePreviewUrl,
    lockedWardrobeLabel,
    setLockedWardrobeLabel,
    saveStatus,
    setSaveStatus,
    continueDayHref,
    setContinueDayHref,
    isolateSubject,
    isolateGenRef,
    autoKitPreviews,
    kitPreviews,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    hasReference,
    character,
    selectedModel,
    clothingGender,
    wardrobeReady,
    wardrobeCategoryFilter,
    wardrobeOptions,
    setWardrobeOptions,
    wardrobeLoadedKey,
    setWardrobeLoadedKey,
    wardrobeOptionsKey,
    wardrobeKitCount,
    filteredWardrobeOptions,
    prevCategoryFilterRef,
    swipeDeck,
    activeSwipeKit,
    deckSelectionId,
    deckSelectionIndex,
    activeThumbRef,
    activeLookId,
    previewModel,
    previewModelLabel,
    previewQueueParams,
    previewQueueResolveOptions,
    completedPreviewCount,
    inFlightPreviewCount,
    deepLinkHandled,
    clearReferencePreview,
    actions,
    applyReference,
    leanChrome,
  } = ctx;

  const clearReference = useCallback(() => {
    clearReferencePreview();
    updateToolSettings({
      referenceImageUrl: '',
      referenceImageFilename: '',
      referenceOriginalUrl: '',
      referenceOriginalFilename: '',
      referenceIsolated: false,
      previewPlateFilename: undefined,
      previewPlateUrl: undefined,
      previewPlateSourceKey: undefined,
    });
  }, [clearReferencePreview, updateToolSettings]);

  useGalleryHandoff('fitting', handoff => {
    void applyReference({
      file: handoff.file,
      imageUrl: handoff.previewUrl || handoff.payload.imageUrl,
      filename: handoff.payload.imageFilename,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not use that still.');
    });
  });

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get('character')?.trim();
    const wardrobeId = params.get('wardrobe')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';

    if (characterId) {
      const record = getCharacter(characterId);
      if (record) {
        try {
          updateShared(applyCharacterRecord(record));
        } catch (err) {
          scheduleAfterCommit(() =>
            setError(err instanceof Error ? err.message : 'Could not apply that character.')
          );
        }
        try {
          const resolvedPlate = resolveFittingPlateFromCharacter(record);
          if (resolvedPlate?.filename || resolvedPlate?.imageUrl) {
            scheduleAfterCommit(() => {
              void applyReference({
                imageUrl: resolvedPlate.imageUrl,
                filename: resolvedPlate.filename,
                isolate: resolvedPlate.isolateSubject !== false,
              }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not load character plate.');
              });
            });
          }
        } catch (err) {
          scheduleAfterCommit(() =>
            setError(err instanceof Error ? err.message : 'Could not resolve character plate.')
          );
        }
        if (record.lockedWardrobeId?.trim() && !wardrobeId) {
          updateShared({ lockedWardrobeId: record.lockedWardrobeId.trim() });
        }
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
    }
    if (fromLook) {
      // Keep the session pack for Day / Roleplay handoffs; Roleplay clears on apply.
      const pack = loadLookPack();
      if (pack) {
        const applied = applyLookPackToFittingState(pack);
        if (applied.shared.lockedWardrobeId && !wardrobeId) {
          updateShared({ lockedWardrobeId: applied.shared.lockedWardrobeId });
        }
        if (applied.tool.notes) {
          updateToolSettings({ notes: applied.tool.notes });
        }
        scheduleAfterCommit(() => setSaveStatus('Applied Moodboard look pack.'));
      }
    }
  }, [applyReference, mounted, updateShared, updateToolSettings]);

  useEffect(() => {
    if (!mounted || hasReference || !shared.activeCharacterId) {
      return;
    }
    const record = getCharacter(shared.activeCharacterId);
    let resolvedPlate;
    try {
      resolvedPlate = resolveFittingPlateFromCharacter(record);
    } catch {
      return;
    }
    if (!resolvedPlate?.filename && !resolvedPlate?.imageUrl) {
      return;
    }
    scheduleAfterCommit(() => {
      void applyReference({
        imageUrl: resolvedPlate.imageUrl,
        filename: resolvedPlate.filename,
        isolate: resolvedPlate.isolateSubject !== false,
      }).catch(() => {
        /* plate may be missing — user can upload */
      });
    });
  }, [applyReference, hasReference, mounted, shared.activeCharacterId]);

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

  useEffect(() => {
    const id = shared.lockedWardrobeId?.trim();
    if (!id) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(undefined));
      return;
    }
    const cached = getCachedClothingLabel(id);
    if (cached) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(cached));
      return;
    }
    let cancelled = false;
    void fetchClothingLabels([id]).then(labels => {
      if (cancelled) {
        return;
      }
      setLockedWardrobeLabel(labels.get(id) ?? id);
    });
    return () => {
      cancelled = true;
    };
  }, [shared.lockedWardrobeId]);

  useEffect(() => {
    if (!referenceImageUrl) {
      return;
    }
    if (referenceImageUrl.startsWith('blob:')) {
      scheduleAfterCommit(() => setReferencePreviewUrl(referenceImageUrl));
      return;
    }
    scheduleAfterCommit(() => setReferencePreviewUrl(cacheBustIdentityMediaUrl(referenceImageUrl)));
  }, [referenceImageUrl]);

  const selectKit = useCallback(
    (wardrobeId: string) => {
      updateShared({ lockedWardrobeId: wardrobeId.trim() || undefined });
    },
    [updateShared]
  );

  const swipeKit = useCallback(
    (delta: number) => {
      const next = fittingSwipeNeighbor(swipeDeck, shared.lockedWardrobeId, delta);
      if (next) {
        selectKit(next.id);
      }
    },
    [selectKit, shared.lockedWardrobeId, swipeDeck]
  );

  const {
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
  } = useFittingRoomQueue({
    mounted,
    actions,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    character,
    hasReference,
    isolateSubject,
    referenceImageFilename,
    referenceImageUrl,
    lockedWardrobeLabel,
    swipeDeck,
    deckSelectionId,
    activeLookId,
    kitPreviews,
    autoKitPreviews,
    inFlightPreviewCount,
    previewModel,
    previewQueueParams,
    previewQueueResolveOptions,
    swipeKit,
    setOutput,
    setError,
    setCopied,
    setSaveStatus,
    setContinueDayHref,
  });

  useEffect(() => {
    if (prevCategoryFilterRef.current === wardrobeCategoryFilter) {
      return;
    }
    prevCategoryFilterRef.current = wardrobeCategoryFilter;
    if (!wardrobeReady || swipeDeck.length === 0) {
      return;
    }
    const locked = shared.lockedWardrobeId?.trim();
    if (locked && swipeDeck.some(kit => kit.id === locked)) {
      return;
    }
    const first = swipeDeck[0]?.id;
    if (first) {
      updateShared({ lockedWardrobeId: first });
    }
  }, [shared.lockedWardrobeId, swipeDeck, updateShared, wardrobeCategoryFilter, wardrobeReady]);

  const skipKit = useCallback(() => {
    swipeKit(1);
    setSaveStatus('Skipped to next kit.');
  }, [swipeKit]);

  const saveKitToCast = useCallback(() => {
    setSaveStatus(null);
    const wardrobeId = shared.lockedWardrobeId?.trim();
    if (!wardrobeId) {
      setError('Pick a kit before saving to Cast.');
      return;
    }
    const activeId = shared.activeCharacterId?.trim();
    if (!activeId) {
      setError('Select a Cast character first.');
      return;
    }
    const existing = getCharacter(activeId);
    const base =
      existing ??
      characterFromShared(shared, {
        name: character?.name || 'Untitled character',
        hints: character?.hints,
        notes: character?.notes,
      });
    if (existing) {
      base.id = existing.id;
    }
    base.lockedWardrobeId = wardrobeId;
    const look = activeLook(base);
    base.looks = (base.looks ?? [look]).map(entry =>
      entry.id === look.id ? { ...entry, lockedWardrobeId: wardrobeId } : entry
    );
    base.activeLookId = look.id;
    upsertCharacter(base);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(getCharacter(base.id) ?? base),
    });
    setSaveStatus(`Saved kit on ${base.name}.`);
  }, [character?.hints, character?.name, character?.notes, shared]);
  return {
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
    clearReference,
    selectKit,
    swipeKit,
    skipKit,
    saveKitToCast,
  };
}
