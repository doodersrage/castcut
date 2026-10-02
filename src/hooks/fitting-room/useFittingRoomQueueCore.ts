'use client';

import { footwearIsBarefoot, footwearPromptLine } from '@/lib/footwear';
import {
  buildFootwearReferenceImage,
  footwearImageSuitsModel,
  hasFootwearImage,
} from '@/lib/footwear-image';
import { buildDayPoseGuide } from '@/lib/day-pose-guide';
import { dayPartnerNoun } from '@/lib/day-partner';
import { poseFirstLine } from '@/lib/pose-starters';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
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
  withFittingCustomPose,
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
import { withCastIdentityQueueFields } from '@/lib/look-outfit-plate';
import type { FittingToolCache, SharedToolSettings } from '@/lib/settings-cache';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import type { CharacterRecord } from '@/lib/character-os';

const TOOL_ID = 'fitting' as const;

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

/** Image 1 plate, Image 2 garment (or empty), Image 3 the custom pose guide. */
function withPoseGuideSlot(filenames: string[], poseGuide: string | undefined): string[] {
  if (!poseGuide) return filenames;
  const next = [...filenames];
  while (next.length < 2) next.push('');
  next[2] = poseGuide;
  return next;
}

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

  const buildPrompt = useCallback(
    (footwearImage?: 'combined' | 'alone' | null) => {
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
        // Deliberately omit Cast descriptor/hints — clothing in look notes fights the kit.
        notes: input.toolSettings.notes,
        isolated: input.toolSettings.referenceIsolated === true,
        hasGarmentReference: Boolean(garmentExtras),
        garmentDescription: hasCustomGarment ? garmentDescription : undefined,
        footwearLine: footwearPromptLine(input.toolSettings.footwear, 'she', footwearImage),
        footwearImage,
      });
    },
    [
      input.character?.name,
      input.hasReference,
      input.lockedWardrobeLabel,
      input.shared.lockedWardrobeId,
      input.toolSettings.customGarmentDescription,
      input.toolSettings.customGarmentImageFilename,
      input.toolSettings.customGarmentImageUrl,
      input.toolSettings.footwear,
      input.toolSettings.notes,
      input.toolSettings.referenceIsolated,
    ]
  );

  const queueTryOn = useCallback(
    async (options?: { wardrobeId?: string }): Promise<boolean> => {
      setBusy(true);
      input.setError(null);
      input.setCopied(false);
      input.actions.resetStatuses();
      try {
        const customGarmentUrl = input.toolSettings.customGarmentImageUrl?.trim();
        const customGarmentFilename = input.toolSettings.customGarmentImageFilename?.trim();
        const garmentDescription = input.toolSettings.customGarmentDescription?.trim();
        const hasCustomGarment = Boolean(customGarmentUrl || customGarmentFilename);
        const overrideWardrobeId = options?.wardrobeId?.trim();
        const wardrobeIdForQueue =
          !hasCustomGarment && overrideWardrobeId && overrideWardrobeId !== 'custom-garment'
            ? overrideWardrobeId
            : input.shared.lockedWardrobeId;
        if (
          !hasCustomGarment &&
          overrideWardrobeId &&
          overrideWardrobeId !== 'custom-garment' &&
          overrideWardrobeId !== input.shared.lockedWardrobeId?.trim()
        ) {
          input.updateShared({ lockedWardrobeId: overrideWardrobeId });
        }
        await loadWardrobeGarmentThumbManifest();
        const garmentOnly = buildFittingGarmentReferenceExtras({
          wardrobeId: hasCustomGarment ? undefined : wardrobeIdForQueue,
          customGarmentUrl,
          customGarmentFilename,
        });
        // Footwear with a picture (a kit's, or your own photo) shares Image 2 with the clothing.
        let garmentExtras: {
          inputImageUrls?: [undefined, string];
          inputImageFilenames?: [undefined, string];
        } | null = garmentOnly;
        let footwearImage: 'combined' | 'alone' | null = null;
        const footwearRef = {
          imageUrl: input.toolSettings.footwearImageUrl,
          imageFilename: input.toolSettings.footwearImageFilename,
        };
        if (
          footwearImageSuitsModel(input.shared.model) &&
          hasFootwearImage(footwearRef) &&
          !footwearIsBarefoot(input.toolSettings.footwear)
        ) {
          try {
            const reference = await buildFootwearReferenceImage({
              garment: garmentOnly
                ? {
                    imageUrl: garmentOnly.inputImageUrls?.[1],
                    imageFilename: garmentOnly.inputImageFilenames?.[1],
                  }
                : null,
              footwear: footwearRef,
              model: input.shared.model,
            });
            if (reference) {
              garmentExtras = { inputImageFilenames: [undefined, reference.filename] };
              footwearImage = reference.combined ? 'combined' : 'alone';
            }
          } catch (footwearError) {
            // The shoes still go out in words.
            console.warn('Outfit footwear image could not be attached:', footwearError);
          }
        }
        // Pose → Custom: the joint editor's skeleton rides as Image 3 (VL-only, like Day's guide).
        const customPose = input.toolSettings.tryOnPose;
        let poseGuideFilename: string | undefined;
        if (customPose?.people.length) {
          try {
            const build = await buildDayPoseGuide('afternoon', 'custom pose', input.shared.model, {
              photoPose: customPose,
              forcePeople: 1,
            });
            const uploaded = await resolveQueueInputImage({
              file: build.file,
              filename: build.file.name,
              model: input.shared.model,
            });
            poseGuideFilename = uploaded?.filename?.trim() || undefined;
          } catch (poseError) {
            console.warn('Outfit custom pose could not be attached:', poseError);
          }
        }
        const builtPrompt = buildPrompt(footwearImage);
        const prompt =
          poseGuideFilename && customPose?.people[0]
            ? `${poseFirstLine(
                customPose.people[0],
                dayPartnerNoun(input.character ?? {}) === 'man' ? 'he' : 'she',
                customPose.aspect,
                customPose.words
              )}\n${withFittingCustomPose(builtPrompt)}`
            : builtPrompt;
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
            hasCustomGarment ? 'custom-garment' : (wardrobeIdForQueue ?? ''),
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
        const identityFields = withCastIdentityQueueFields(
          input.character,
          input.shared.ipAdapterStrength ?? 0.75
        );
        const promptId = await input.actions.sendComfyUi(finalized, undefined, undefined, {
          ...(queueOptions ?? {}),
          ...(queueOptions ? { castPlateReference: true } : {}),
          ...identityFields,
          ...(garmentExtras
            ? {
                ...(garmentExtras.inputImageUrls
                  ? { inputImageUrls: [...garmentExtras.inputImageUrls] }
                  : {}),
                // A garment sent by URL has no filename list — the pose guide still needs Image 3.
                ...(garmentExtras.inputImageFilenames || poseGuideFilename
                  ? {
                      inputImageFilenames: withPoseGuideSlot(
                        (garmentExtras.inputImageFilenames ?? []).map(name => name?.trim() || ''),
                        poseGuideFilename
                      ),
                    }
                  : {}),
              }
            : poseGuideFilename
              ? { inputImageFilenames: withPoseGuideSlot([], poseGuideFilename) }
              : {}),
          characterId: input.shared.activeCharacterId,
          lookId: input.shared.activeLookId ?? input.character?.activeLookId,
        });
        if (typeof promptId === 'string' && promptId.trim()) {
          pendingTryOnRef.current = {
            promptId: promptId.trim(),
            wardrobeId: hasCustomGarment ? 'custom-garment' : wardrobeIdForQueue?.trim() || '',
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
    },
    [
      buildPrompt,
      input.actions,
      input.character,
      input.toolSettings.tryOnPose,
      input.toolSettings.footwear,
      input.toolSettings.footwearImageFilename,
      input.toolSettings.footwearImageUrl,
      input.isolateSubject,
      input.lockedWardrobeLabel,
      input.referenceImageFilename,
      input.referenceImageUrl,
      input.setCopied,
      input.setError,
      input.setOutput,
      input.updateShared,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.shared.identityKind,
      input.shared.ipAdapterStrength,
      input.shared.lockedWardrobeId,
      input.toolSettings.customGarmentDescription,
      input.toolSettings.customGarmentImageFilename,
      input.toolSettings.customGarmentImageUrl,
      input.toolSettings.referenceIsolated,
    ]
  );

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
    setCompareTryOns,
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
