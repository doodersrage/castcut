'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  buildFittingOutfitPrompt,
  clipFittingGarmentLabel,
  pushFittingCompareTryOn,
  type FittingCompareTryOn,
  type FittingSwipeKit,
} from '@/lib/fitting-room';
import {
  buildFittingGarmentReferenceExtras,
  loadWardrobeGarmentThumbManifest,
} from '@/lib/wardrobe-garment-thumbs';
import {
  countInFlightFittingKitPreviews,
  FITTING_KIT_PREVIEW_CONCURRENCY,
  FITTING_KIT_PREVIEW_HEIGHT,
  FITTING_KIT_PREVIEW_MAX,
  FITTING_KIT_PREVIEW_PROMPT_VERSION,
  FITTING_KIT_PREVIEW_WIDTH,
  fittingKitsNeedingPreview,
  getFittingKitPreview,
  mergeFittingKitPreviewsFromGallery,
  normalizeFittingKitPreviews,
  upsertFittingKitPreview,
  type FittingKitPreview,
} from '@/lib/fitting-kit-previews';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import type { FittingToolCache, SharedToolSettings } from '@/lib/settings-cache';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import type { CharacterRecord } from '@/lib/character-os';

const TOOL_ID = 'fitting' as const;

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

export type FittingRoomQueueInput = {
  mounted: boolean;
  actions: PromptResultActions;
  shared: SharedToolSettings;
  toolSettings: FittingToolCache;
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Partial<FittingToolCache>) => void;
  character: CharacterRecord | undefined;
  hasReference: boolean;
  isolateSubject: boolean;
  referenceImageFilename: string;
  referenceImageUrl: string;
  lockedWardrobeLabel: string | undefined;
  swipeDeck: FittingSwipeKit[];
  deckSelectionId: string | undefined;
  activeLookId: string;
  kitPreviews: Record<string, FittingKitPreview>;
  autoKitPreviews: boolean;
  inFlightPreviewCount: number;
  previewModel: string | null | undefined;
  previewQueueParams: WorkflowParamValues;
  previewQueueResolveOptions: Pick<
    import('@/lib/queue-params-settings').ResolveQueueParamsOptions,
    'resolutionSizeTier' | 'resolutionOrientation' | 'preserveInputAspect'
  >;
  swipeKit: (delta: number) => void;
  setOutput: (output: string) => void;
  setError: (error: string | null) => void;
  setCopied: (copied: boolean) => void;
  setSaveStatus: (status: string | null) => void;
  setContinueDayHref: (href: string | null) => void;
};

export function useFittingRoomQueueCore(input: FittingRoomQueueInput) {
  const [busy, setBusy] = useState(false);
  const [compareTryOns, setCompareTryOns] = useState<FittingCompareTryOn[]>([]);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const pendingTryOnRef = useRef<{
    promptId: string;
    wardrobeId: string;
    wardrobeLabel?: string;
  } | null>(null);
  const previewQueueBusyRef = useRef(false);
  const kitPreviewsRef = useRef(normalizeFittingKitPreviews(input.toolSettings.kitPreviews));

  useEffect(() => {
    kitPreviewsRef.current = input.kitPreviews;
  }, [input.kitPreviews]);

  const buildPrompt = useCallback(() => {
    const customGarmentUrl = input.toolSettings.customGarmentImageUrl?.trim();
    const customGarmentFilename = input.toolSettings.customGarmentImageFilename?.trim();
    const garmentDescription = input.toolSettings.customGarmentDescription?.trim();
    const hasCustomGarment = Boolean(customGarmentUrl || customGarmentFilename);
    const outfitLabel = hasCustomGarment
      ? garmentDescription || 'uploaded clothing reference'
      : input.lockedWardrobeLabel?.trim() || input.shared.lockedWardrobeId?.trim() || '';
    if (!outfitLabel) {
      throw new Error('Pick a wardrobe kit or upload a clothing photo first.');
    }
    if (!input.hasReference) {
      throw new Error('Add a plate — Cast look, upload, or Gallery still.');
    }
    const garmentExtras = buildFittingGarmentReferenceExtras({
      wardrobeId: hasCustomGarment ? undefined : input.shared.lockedWardrobeId,
      customGarmentUrl,
      customGarmentFilename,
    });
    return buildFittingOutfitPrompt({
      outfitLabel: hasCustomGarment
        ? garmentDescription
          ? clipFittingGarmentLabel(garmentDescription)
          : 'uploaded clothing reference'
        : outfitLabel,
      characterName: input.character?.name,
      characterDescriptor: input.character?.descriptor || input.character?.hints,
      notes: input.toolSettings.notes,
      isolated: input.toolSettings.referenceIsolated === true,
      hasGarmentReference: Boolean(garmentExtras),
      garmentDescription: hasCustomGarment ? garmentDescription : undefined,
    });
  }, [
    input.character?.descriptor,
    input.character?.hints,
    input.character?.name,
    input.hasReference,
    input.lockedWardrobeLabel,
    input.shared.lockedWardrobeId,
    input.toolSettings.customGarmentDescription,
    input.toolSettings.customGarmentImageFilename,
    input.toolSettings.customGarmentImageUrl,
    input.toolSettings.notes,
    input.toolSettings.referenceIsolated,
  ]);

  const queueTryOn = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    input.setError(null);
    input.setCopied(false);
    input.actions.resetStatuses();
    try {
      const customGarmentUrl = input.toolSettings.customGarmentImageUrl?.trim();
      const customGarmentFilename = input.toolSettings.customGarmentImageFilename?.trim();
      const garmentDescription = input.toolSettings.customGarmentDescription?.trim();
      const hasCustomGarment = Boolean(customGarmentUrl || customGarmentFilename);
      await loadWardrobeGarmentThumbManifest();
      const garmentExtras = buildFittingGarmentReferenceExtras({
        wardrobeId: hasCustomGarment ? undefined : input.shared.lockedWardrobeId,
        customGarmentUrl,
        customGarmentFilename,
      });
      const prompt = buildPrompt();
      const finalized = await input.actions.finalizePrompt(
        prompt,
        input.character?.name || 'Fitting'
      );
      input.setOutput(finalized);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Outfit',
        href: '/fitting',
        fields: [
          input.character?.name ?? '',
          hasCustomGarment ? 'custom-garment' : (input.shared.lockedWardrobeId ?? ''),
          finalized,
        ],
      });
      const queueOptions = buildRoleplayQueueStillOptions({
        photoMode: true,
        isolateSubject: input.isolateSubject,
        referenceIsolated: input.toolSettings.referenceIsolated === true,
        filename: input.referenceImageFilename,
        imageUrl: input.referenceImageUrl,
        identityLockStrength: input.shared.ipAdapterStrength,
        identityKind: input.shared.identityKind,
      });
      const promptId = await input.actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        ...(garmentExtras
          ? {
              ...(garmentExtras.inputImageUrls
                ? { inputImageUrls: [...garmentExtras.inputImageUrls] }
                : {}),
              ...(garmentExtras.inputImageFilenames
                ? {
                    inputImageFilenames: garmentExtras.inputImageFilenames.map(
                      name => name?.trim() || ''
                    ),
                  }
                : {}),
            }
          : {}),
        characterId: input.shared.activeCharacterId,
        lookId: input.shared.activeLookId ?? input.character?.activeLookId,
      });
      if (typeof promptId === 'string' && promptId.trim()) {
        pendingTryOnRef.current = {
          promptId: promptId.trim(),
          wardrobeId: hasCustomGarment
            ? 'custom-garment'
            : input.shared.lockedWardrobeId?.trim() || '',
          wardrobeLabel: hasCustomGarment
            ? clipFittingGarmentLabel(garmentDescription || 'Uploaded clothing')
            : input.lockedWardrobeLabel,
        };
      }
      return true;
    } catch (err) {
      input.setError(err instanceof Error ? err.message : 'Could not queue the try-on.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    buildPrompt,
    input.actions,
    input.character,
    input.isolateSubject,
    input.lockedWardrobeLabel,
    input.referenceImageFilename,
    input.referenceImageUrl,
    input.setCopied,
    input.setError,
    input.setOutput,
    input.shared.activeCharacterId,
    input.shared.activeLookId,
    input.shared.identityKind,
    input.shared.ipAdapterStrength,
    input.shared.lockedWardrobeId,
    input.toolSettings.customGarmentDescription,
    input.toolSettings.customGarmentImageFilename,
    input.toolSettings.customGarmentImageUrl,
    input.toolSettings.referenceIsolated,
  ]);

  useEffect(() => {
    const syncGallery = () => {
      const pending = pendingTryOnRef.current;
      if (pending?.promptId) {
        const entry = loadComfyGallery().find(item => item.promptId === pending.promptId);
        if (entry?.status === 'completed') {
          const imageUrl = galleryEntryPrimaryViewUrl(entry);
          if (imageUrl) {
            pendingTryOnRef.current = null;
            setCompareTryOns(current =>
              pushFittingCompareTryOn(current, {
                promptId: pending.promptId,
                wardrobeId: pending.wardrobeId,
                wardrobeLabel: pending.wardrobeLabel,
                imageUrl,
                galleryEntryId: entry.id,
              })
            );
          }
        }
      }

      const currentPreviews = kitPreviewsRef.current;
      const wanted = new Set(
        Object.values(currentPreviews)
          .map(entry => entry.promptId?.trim())
          .filter(Boolean) as string[]
      );
      if (wanted.size === 0) {
        return;
      }
      const gallery = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryThumbUrl(entry) || galleryEntryPrimaryViewUrl(entry),
        }));
      const merged = mergeFittingKitPreviewsFromGallery(currentPreviews, gallery);
      if (merged.changed) {
        input.updateToolSettings({ kitPreviews: merged.previews });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
    syncGallery();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
  }, [input.updateToolSettings]);

  return {
    busy,
    compareTryOns,
    previewStatus,
    setPreviewStatus,
    pendingTryOnRef,
    previewQueueBusyRef,
    kitPreviewsRef,
    queueTryOn,
    buildPrompt,
  };
}

export type FittingRoomQueueCore = ReturnType<typeof useFittingRoomQueueCore>;
