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
  fittingGarmentPackshotQueueParams,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  getFittingKitPreview,
  normalizeFittingKitPreviews,
  resolveFittingGarmentPackshotModel,
  resolveFittingKitPreviewModel,
} from '@/lib/fitting-kit-previews';
import {
  buildFittingSwipeDeck,
  buildFittingGarmentPackshotExtractPrompt,
  FITTING_GARMENT_PACKSHOT_EXTRACT_NEGATIVE,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  isPlausibleFittingGarmentDescription,
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
  lookPackNotesForCharacter,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  clearCharacterLookPlate,
  tryAttachPendingOutfitPlate,
} from '@/lib/look-outfit-plate';
import { bumpPlayCampaignStep, resolvePlayLoopEntryCharacterId } from '@/lib/play-campaign';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { waitForGalleryPromptIds } from '@/lib/best-of-n-vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
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
    async (input: { file?: File | null; imageUrl?: string; filename?: string }) => {
      const file = input.file ?? null;
      const imageUrl = input.imageUrl?.trim() || '';
      if (!file && !imageUrl) {
        throw new Error('Choose a clothing photo first.');
      }
      setGarmentUploading(true);
      setGarmentScanStatus(null);
      setError(null);
      try {
        const originalName = input.filename || file?.name || `fitting-garment-${Date.now()}.png`;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const sourceFile =
          file ??
          (await (async () => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl,
                filename: originalName,
                comfyUrl,
              })
            );
            return new File([blob], originalName, {
              type: blob.type || 'image/png',
              lastModified: Date.now(),
            });
          })());

        // 1) White cutout first (helps the edit model ignore busy scenes).
        let garmentFile = sourceFile;
        setGarmentScanStatus('Extracting clothing onto white…');
        try {
          garmentFile = await isolateSubjectOnWhite(sourceFile, originalName);
        } catch {
          garmentFile = sourceFile;
        }

        const uploadName = garmentFile.name || originalName.replace(/\.[^.]+$/, '') + '-cutout.png';
        let uploaded = await resolveQueueInputImage({
          file: garmentFile,
          filename: uploadName,
          model: shared.model,
        });
        let filename = uploaded?.filename?.trim();
        if (!filename) {
          throw new Error('Upload did not return a filename.');
        }
        // Do NOT persistIdentityImage — that overwrites the shared face/plate lock file.
        let previewUrl =
          collectIsolateSourceUrls({
            filename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ||
          (imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : '') ||
          URL.createObjectURL(garmentFile);

        // Snapshot the white cutout — packshot edit can collapse into pattern walls;
        // we fall back to this when the result fails a garment plausibility check.
        const cutoutFile = garmentFile;
        const cutoutFilename = filename;
        const cutoutPreviewUrl = previewUrl;

        // 2) Ghost-mannequin / flat-lay packshot via a real edit pass (not swipe-thumb draft-lite).
        const packshotModel = resolveFittingGarmentPackshotModel(shared.model);
        if (packshotModel) {
          setGarmentScanStatus('Building clothing-only packshot…');
          try {
            const promptId = await actions.sendComfyUi(
              buildFittingGarmentPackshotExtractPrompt(),
              undefined,
              undefined,
              {
                inputImageFilename: filename,
                inputImageUrl: previewUrl,
                identityLock: false,
                queueModel: packshotModel,
                qualityProfile: 'draft',
                turboEditStrength: 'strong',
                explicitNegative: FITTING_GARMENT_PACKSHOT_EXTRACT_NEGATIVE,
                queueParamsBase: fittingGarmentPackshotQueueParams(),
                queueHints: '',
                characterId: shared.activeCharacterId,
                lookId: shared.activeLookId ?? character?.activeLookId,
              }
            );
            const id = typeof promptId === 'string' ? promptId.trim() : '';
            if (id) {
              const completed = await waitForGalleryPromptIds([id], {
                timeoutMs: 3 * 60_000,
                pollMs: 2_500,
              });
              const entry = completed[0];
              const packshotUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
              if (packshotUrl) {
                const packshotBlob = await loadImageBlobFromUrls([packshotUrl]);
                const packshotFile = new File(
                  [packshotBlob],
                  `fitting-garment-packshot-${Date.now()}.png`,
                  {
                    type: packshotBlob.type || 'image/png',
                    lastModified: Date.now(),
                  }
                );
                // Reject tiled/glyph collapses before they become Image 2.
                const probeDescription = await scanCustomGarmentDescription(packshotFile).catch(
                  () => null
                );
                if (!isPlausibleFittingGarmentDescription(probeDescription)) {
                  throw new Error('Packshot edit collapsed — keeping clothing cutout.');
                }
                uploaded = await resolveQueueInputImage({
                  file: packshotFile,
                  filename: packshotFile.name,
                  model: shared.model,
                });
                const packshotFilename = uploaded?.filename?.trim();
                if (packshotFilename) {
                  filename = packshotFilename;
                  garmentFile = packshotFile;
                  previewUrl =
                    collectIsolateSourceUrls({
                      filename: packshotFilename,
                      comfyUrl,
                    }).find(url => url.includes('/api/comfyui/view?')) ?? packshotUrl;
                  // Reuse the probe scan as the description when it looks good.
                  if (probeDescription?.trim()) {
                    updateToolSettings({
                      customGarmentImageFilename: filename,
                      customGarmentImageUrl: previewUrl,
                      customGarmentDescription: probeDescription.trim(),
                    });
                    updateShared({ lockedWardrobeId: undefined });
                    return;
                  }
                }
              }
            }
          } catch {
            // Keep the white cutout / original — try-on still works.
            garmentFile = cutoutFile;
            filename = cutoutFilename;
            previewUrl = cutoutPreviewUrl;
          }
        }

        updateToolSettings({
          customGarmentImageFilename: filename,
          customGarmentImageUrl: previewUrl,
          customGarmentDescription: undefined,
        });
        // BYO clothing and catalog kit are mutually exclusive.
        updateShared({ lockedWardrobeId: undefined });

        try {
          setGarmentScanStatus('Scanning clothing packshot with vision…');
          const description = await scanCustomGarmentDescription(garmentFile);
          if (description?.trim()) {
            updateToolSettings({ customGarmentDescription: description.trim() });
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? `${err.message} Clothing photo kept — try-on will rely on Image 2 until you rescan.`
              : 'Vision scan failed. Clothing photo kept — try-on will rely on Image 2 until you rescan.'
          );
        }
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

  // Outfit notes are a single tool field — reset them when Cast changes so Char A's
  // styling cues never stick on Char B. Re-seed from a matching look pack when present.
  const prevNotesCharacterIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const nextId = shared.activeCharacterId?.trim() || '';
    const prevId = prevNotesCharacterIdRef.current;
    if (prevId === undefined) {
      prevNotesCharacterIdRef.current = nextId;
      return;
    }
    if (prevId === nextId) {
      return;
    }
    prevNotesCharacterIdRef.current = nextId;
    const nextNotes = lookPackNotesForCharacter(loadLookPack(), nextId);
    const currentNotes = toolSettings.notes ?? '';
    if (currentNotes === nextNotes) {
      return;
    }
    updateToolSettings({ notes: nextNotes });
  }, [mounted, shared.activeCharacterId, toolSettings.notes, updateToolSettings]);

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
    clearKit,
    selectKit,
    swipeKit,
    skipKit,
    saveKitToCast,
  };
}
