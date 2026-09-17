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
  countInFlightFittingKitPreviews,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  getFittingKitPreview,
  normalizeFittingKitPreviews,
  resolveFittingKitPreviewModel,
} from '@/lib/fitting-kit-previews';
import { applyCustomGarmentUpload } from '@/lib/fitting-custom-garment-apply';
import {
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  resolveFittingDeckWardrobeId,
  resolveFittingPlateFromCharacter,
} from '@/lib/fitting-room';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { cacheBustIdentityMediaUrl } from '@/lib/gallery-media-client';
import { collectIsolateSourceUrls, ISOLATE_QUEUE_BLOCKED_MESSAGE } from '@/lib/isolate-subject';
import {
  applyLookPackToFittingState,
  loadLookPack,
  lookPackDayHref,
  lookPackNotesForCharacter,
  fittingNotesBelongToCharacter,
  fittingNotesCachePatch,
  shouldRetainFittingNotesForLookPack,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  clearCharacterLookPlate,
  tryAttachPendingOutfitPlate,
} from '@/lib/look-outfit-plate';
import {
  loadSavedFittingGarments,
  removeSavedFittingGarment,
  saveFittingGarment,
} from '@/lib/fitting-saved-garments';
import { bumpPlayCampaignStep, resolvePlayLoopEntryCharacterId } from '@/lib/play-campaign';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { EMPTY_WARDROBE_OPTIONS, type FittingClothingOption } from '@/lib/fitting-clothing-options';
import { scanStillWithVision } from '@/lib/vision-still-scan-client';
import { resolveStillFileForVisionScan } from '@/lib/vision-scan-still';

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
    // Abort in-flight isolate/upload so a late applyReference cannot restore the plate.
    isolateGenRef.current += 1;
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
      pendingOutfitPlatePromptId: undefined,
      // Stop Cast auto-reseed; Look Extract can queue a fresh plate.
      suppressAutoPlateSeed: true,
    });
    clearCharacterLookPlate(shared.activeCharacterId);
  }, [clearReferencePreview, isolateGenRef, shared.activeCharacterId, updateToolSettings]);

  const [garmentUploading, setGarmentUploading] = useState(false);
  const [garmentScanStatus, setGarmentScanStatus] = useState<string | null>(null);

  const scanCustomGarmentDescription = useCallback(
    async (image: File): Promise<string | null> => {
      setGarmentScanStatus('Scanning clothing with vision…');
      try {
        const description = await scanStillWithVision({
          image,
          purpose: 'fitting-garment',
          model: shared.model,
          detail: shared.detail,
          shared,
        });
        setGarmentScanStatus(null);
        return description;
      } catch (err) {
        setGarmentScanStatus(null);
        throw err;
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
      // Prefer preview URL, then Comfy input/output view URLs from the uploaded filename.
      // Preview is often a relative `/api/comfyui/view?…` after upload — that must resolve.
      const urls = collectIsolateSourceUrls({
        imageUrl: preview,
        filename,
        comfyUrl,
      });
      const image = await resolveStillFileForVisionScan({
        urls,
        fallbackName: filename || 'fitting-garment.png',
      });
      const description = await scanCustomGarmentDescription(image);
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

  const saveCurrentCustomGarment = useCallback(() => {
    const filename = toolSettings.customGarmentImageFilename?.trim();
    if (!filename) {
      throw new Error('Upload a clothing photo first.');
    }
    const entry = saveFittingGarment({
      imageFilename: filename,
      imageUrl: toolSettings.customGarmentImageUrl,
      description: toolSettings.customGarmentDescription,
    });
    setSaveStatus(`Saved “${entry.label}” for later.`);
    return entry;
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
      });
      updateShared({ lockedWardrobeId: undefined });
      setSaveStatus(`Using saved “${entry.label}”.`);
    },
    [updateShared, updateToolSettings]
  );

  const removeSavedCustomGarment = useCallback((garmentId: string) => {
    removeSavedFittingGarment(garmentId);
  }, []);

  const clearKit = useCallback(() => {
    updateShared({ lockedWardrobeId: undefined });
  }, [updateShared]);

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
    if (!mounted) {
      return;
    }
    const attachPending = () => {
      const pendingId = toolSettings.pendingOutfitPlatePromptId?.trim();
      if (!pendingId) {
        return;
      }
      const attached = tryAttachPendingOutfitPlate(shared.activeCharacterId);
      if (!attached) {
        return;
      }
      const next = loadSettingsCache().tools?.fitting;
      const imageUrl = next?.referenceImageUrl?.trim();
      const filename = next?.referenceImageFilename?.trim();
      if (!imageUrl && !filename) {
        return;
      }
      scheduleAfterCommit(() => {
        void applyReference({
          imageUrl,
          filename,
          isolate: true,
        })
          .then(() => {
            setSaveStatus('Applied Look Outfit plate.');
          })
          .catch(err => {
            setError(err instanceof Error ? err.message : 'Could not load Look Outfit plate.');
          });
      });
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, attachPending);
    attachPending();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, attachPending);
  }, [
    applyReference,
    mounted,
    setError,
    setSaveStatus,
    shared.activeCharacterId,
    toolSettings.pendingOutfitPlatePromptId,
  ]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const queryCharacterId = params.get('character')?.trim() || '';
    const wardrobeId = params.get('wardrobe')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';
    const characterId = resolvePlayLoopEntryCharacterId({
      queryCharacterId,
      activeCharacterId: shared.activeCharacterId,
    });

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
      } else {
        // Deep-link Cast id without a roster row — still pin active so notes ownership
        // matches the look pack (e2e / first-run handoffs).
        updateShared({ activeCharacterId: characterId });
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
        const notesOwner = characterId || pack.characterId?.trim() || '';
        if (notesOwner && !shared.activeCharacterId?.trim() && !characterId) {
          updateShared({ activeCharacterId: notesOwner });
        }
        if (applied.tool.notes) {
          updateToolSettings(fittingNotesCachePatch(applied.tool.notes, notesOwner || null));
        }
        scheduleAfterCommit(() => setSaveStatus('Applied Moodboard look pack.'));
      }
    }
  }, [applyReference, mounted, shared.activeCharacterId, updateShared, updateToolSettings]);

  useEffect(() => {
    if (!mounted || hasReference || !shared.activeCharacterId) {
      return;
    }
    // User cleared the plate — do not pull Cast look back in.
    if (toolSettings.suppressAutoPlateSeed === true) {
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
  }, [
    applyReference,
    hasReference,
    mounted,
    shared.activeCharacterId,
    toolSettings.suppressAutoPlateSeed,
  ]);

  // Outfit notes are tool-session state with Cast ownership. Remount + Cast swap both
  // must re-seed (in-memory prev-id refs miss remounts after switching Cast elsewhere).
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const nextId = shared.activeCharacterId?.trim() || '';
    if (fittingNotesBelongToCharacter(toolSettings.notesCharacterId, nextId, toolSettings.notes)) {
      return;
    }
    // Deep-link apply can stamp notes before activeCharacterId commits — keep pack-owned
    // notes instead of wiping them on the empty-Cast frame.
    if (
      shouldRetainFittingNotesForLookPack(
        toolSettings.notesCharacterId,
        nextId,
        loadLookPack()?.characterId
      )
    ) {
      return;
    }
    const nextNotes = lookPackNotesForCharacter(loadLookPack(), nextId);
    updateToolSettings(fittingNotesCachePatch(nextNotes, nextId));
  }, [
    mounted,
    shared.activeCharacterId,
    toolSettings.notes,
    toolSettings.notesCharacterId,
    updateToolSettings,
  ]);

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
      const nextId = wardrobeId.trim() || undefined;
      updateShared({ lockedWardrobeId: nextId });
      if (nextId) {
        const previousUrl = toolSettings.customGarmentImageUrl?.trim();
        if (previousUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(previousUrl);
        }
        updateToolSettings({
          customGarmentImageUrl: undefined,
          customGarmentImageFilename: undefined,
          customGarmentDescription: undefined,
        });
      }
    },
    [toolSettings.customGarmentImageUrl, updateShared, updateToolSettings]
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
    // Unlocked (BYO clothing or cleared) — never force a kit back on.
    if (!locked) {
      return;
    }
    if (swipeDeck.some(kit => kit.id === locked)) {
      return;
    }
    // Locked kit left the filtered deck — move to the first visible kit.
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
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    rescanCustomGarment,
    clearCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    clearKit,
    selectKit,
    swipeKit,
    skipKit,
    saveKitToCast,
  };
}
