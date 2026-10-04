'use client';

import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { repairStillPrompt, stillPromptIssuesLine } from '@/lib/still-prompt-audit';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { normalizeFootwear } from '@/lib/footwear';
import { dayDressPlateRequestKey } from '@/lib/day-dress-plate-client';
import { footwearIsBarefoot, footwearPromptLine } from '@/lib/footwear';
import {
  buildFootwearReferenceImage,
  footwearImageSuitsModel,
  hasFootwearImage,
} from '@/lib/footwear-image';
import { buildDayPoseGuide } from '@/lib/day-pose-guide';
import { dayPartnerNoun } from '@/lib/day-partner';
import { customPoseWords } from '@/lib/pose-describe';
import { poseFirstLine, poseFramingLine } from '@/lib/pose-starters';
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
  buildFittingBackViewPrompt,
  buildFittingFeetPassPrompt,
  buildFittingOutfitPrompt,
  clipFittingGarmentLabel,
  FITTING_COMPARE_LIMIT,
  fittingFeetPassPlan,
  fittingNextChainStep,
  fittingStepAfterShoeCheck,
  pushFittingCompareTryOn,
  replaceFittingCompareTryOnImage,
  setFittingCompareTryOnBackImage,
  shouldFollowFittingPending,
  withFittingCustomPose,
  type FittingCompareTryOn,
  type FittingPendingTryOn,
  type FittingSwipeKit,
} from '@/lib/fitting-room';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import { footwearCheckNote, footwearNeedsFeetPass } from '@/lib/footwear-check';
import { cachedInstalledModelCheck, checkStillFootwear } from '@/lib/footwear-check-client';
import { loadImageBlobFromUrls } from '@/lib/isolate-subject';
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
import type { ComfyImageModel } from '@/lib/comfy-models/client';

const TOOL_ID = 'fitting' as const;

const SHOE_CHECK_STATUS = 'Checking her shoes…';
const FEET_PASS_STATUS = 'Putting the shoes on…';
const FEET_PASS_FAILED_STATUS =
  'The shoe pass did not work — the try-on is kept as it came (the feet may be bare).';
const backViewStatus = (subject: 'she' | 'he' | undefined) =>
  `Turning ${subject === 'he' ? 'him' : 'her'} around…`;
const BACK_VIEW_FAILED_STATUS = 'The back view did not work — the try-on is kept, front only.';

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

/**
 * Image 2 of the feet pass: the picked shoe picture on its own (large — under the clothing it is a
 * small strip), else the try-on's own Image 2, else none (words alone).
 */
async function feetPassShoeImage(
  feetPass: NonNullable<FittingPendingTryOn['feetPass']>,
  model: string
): Promise<{ filename: string; placement: 'combined' | 'alone' } | null> {
  if (feetPass.shoePicture && hasFootwearImage(feetPass.shoePicture)) {
    try {
      const alone = await buildFootwearReferenceImage({
        garment: null,
        footwear: feetPass.shoePicture,
        model,
      });
      if (alone?.filename) return { filename: alone.filename, placement: 'alone' };
    } catch (error) {
      console.warn('Shoe pass: the shoe picture could not be staged alone:', error);
    }
  }
  const own = feetPass.shoeImageFilename?.trim();
  return own && feetPass.imagePlacement
    ? { filename: own, placement: feetPass.imagePlacement }
    : null;
}

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
  const pendingTryOnRef = useRef<FittingPendingTryOn | null>(null);
  // Jobs that already landed (or failed) here: never followed again, whatever the settings say.
  const handledPromptIdsRef = useRef(new Set<string>());
  // Compare and the try-on in flight are saved with Outfit's settings: they lived in page memory
  // only, and a reload (or another device) lost the try-ons the player was choosing between.
  const compareRestoredRef = useRef(false);
  useEffect(() => {
    if (!input.mounted) {
      return;
    }
    compareRestoredRef.current = true;
    // Also when the saved list arrives after the page opened (a fresh browser pulls it from the
    // server a moment later) — but never over try-ons this page already has.
    const saved = (input.toolSettings.compareTryOns ?? []).filter(
      entry => entry?.promptId && entry.imageUrl
    );
    if (saved.length > 0) {
      scheduleAfterCommit(() =>
        setCompareTryOns(current =>
          current.length === 0 ? saved.slice(-FITTING_COMPARE_LIMIT) : current
        )
      );
    }
    const restored = input.toolSettings.pendingTryOn;
    if (
      shouldFollowFittingPending(restored, pendingTryOnRef.current, handledPromptIdsRef.current)
    ) {
      pendingTryOnRef.current = restored;
      if (restored.backOfPromptId) {
        // A reload while the back view renders: still in ComfyUI, keep saying so.
        scheduleAfterCommit(() => input.setSaveStatus(backViewStatus(restored.backView?.subject)));
      } else if (restored.replacesPromptId) {
        // A reload while the shoes go on: the pass is still in ComfyUI, keep saying so.
        scheduleAfterCommit(() => input.setSaveStatus(FEET_PASS_STATUS));
      }
    }
  }, [
    input.mounted,
    input.setSaveStatus,
    input.toolSettings.compareTryOns,
    input.toolSettings.pendingTryOn,
  ]);
  useEffect(() => {
    if (!compareRestoredRef.current) {
      return;
    }
    const saved = input.toolSettings.compareTryOns ?? [];
    if (JSON.stringify(saved) !== JSON.stringify(compareTryOns)) {
      input.updateToolSettings({
        compareTryOns: compareTryOns.length > 0 ? compareTryOns : undefined,
      });
    }
    // Only the list itself decides a save; the settings echo back the same value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTryOns]);
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
        // A man's try-on said "on her feet she wears".
        footwearLine: footwearPromptLine(
          input.toolSettings.footwear,
          dayPartnerNoun(input.character ?? {}) === 'man' ? 'he' : 'she',
          footwearImage
        ),
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
        const posePronoun: 'he' | 'she' =
          dayPartnerNoun(input.character ?? {}) === 'man' ? 'he' : 'she';
        // A limb drawn near the edge of the pose map needs a wider frame than the plate's.
        const framing = poseFramingLine(customPose?.people[0], posePronoun);
        const prompt =
          poseGuideFilename && customPose?.people[0]
            ? [
                poseFirstLine(
                  customPose.people[0],
                  posePronoun,
                  customPose.aspect,
                  customPose.words,
                  // Stance first, then the limb facts that make it this pose (pose-describe.ts).
                  customPoseWords({
                    photo: { ...customPose, people: customPose.people.slice(0, 1) },
                    lead: posePronoun,
                  })
                ),
                framing,
                withFittingCustomPose(
                  framing
                    ? builtPrompt.replace(
                        'single full-body or three-quarter fashion still',
                        'single full-body fashion still'
                      )
                    : builtPrompt
                ),
              ]
                .filter(Boolean)
                .join('\n')
            : builtPrompt;
        const drafted = await input.actions.finalizePrompt(
          prompt,
          input.character?.name || 'Fitting'
        );
        // The same check Day and Story run at queue time: a try-on is one person, with the
        // clothing as Image 2 and a custom pose as Image 3 when they are attached.
        // A custom pose with no clothing image: the queue moves the pose map up into the second
        // slot, so the text must call it Image 2 (it always said "Image 3").
        const numbered =
          poseGuideFilename && !garmentExtras
            ? drafted.replace(/\bImage 3\b/g, 'Image 2')
            : drafted;
        const checked = repairStillPrompt(numbered, {
          people: 1,
          imageCount: 1 + Number(Boolean(garmentExtras)) + Number(Boolean(poseGuideFilename)),
        });
        const finalized = checked.prompt;
        if (checked.remaining.length > 0) {
          console.warn('Outfit prompt check:', checked.remaining, finalized);
          pushSystemTrayMessage({
            text: stillPromptIssuesLine(checked.remaining, 'try-on'),
            tone: 'warning',
            ttlMs: 20_000,
          });
        }
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
          // Shoes picked: once the try-on lands, a vision check looks at her feet and a short
          // second edit (on Edit 2511) puts the shoes on when they are missing or wrong. A posed
          // 2511 try-on gets that pass even unchecked (the pose map's figure is drawn barefoot).
          const hasShoePicture = hasFootwearImage(footwearRef);
          const feetPlan = fittingFeetPassPlan({
            model: input.shared.model,
            hasCustomPose: Boolean(poseGuideFilename),
            footwear: input.toolSettings.footwear,
            hasShoeImage: Boolean(footwearImage) || hasShoePicture,
            installed: cachedInstalledModelCheck(input.shared.modelCheckpointMap),
          });
          const feetPass = feetPlan
            ? {
                shoeWords: normalizeFootwear(input.toolSettings.footwear),
                ...(footwearImage && garmentExtras?.inputImageFilenames?.[1]
                  ? {
                      imagePlacement: footwearImage,
                      shoeImageFilename: garmentExtras.inputImageFilenames[1],
                    }
                  : {}),
                ...(hasShoePicture
                  ? {
                      shoePicture: {
                        imageUrl: footwearRef.imageUrl?.trim() || undefined,
                        imageFilename: footwearRef.imageFilename?.trim() || undefined,
                      },
                    }
                  : {}),
                subject: posePronoun,
                model: feetPlan.model,
                whenUnchecked: feetPlan.whenUnchecked,
              }
            : null;
          const pending: FittingPendingTryOn = {
            promptId: promptId.trim(),
            wardrobeId: hasCustomGarment ? 'custom-garment' : wardrobeIdForQueue?.trim() || '',
            wardrobeLabel: hasCustomGarment
              ? clipFittingGarmentLabel(garmentDescription || 'Uploaded clothing')
              : input.lockedWardrobeLabel,
            // What it was rendered with, for Keep (a posed try-on is no base plate).
            ...(!customPose?.people.length &&
            (hasCustomGarment
              ? Boolean(input.toolSettings.customGarmentImageFilename?.trim())
              : Boolean(wardrobeIdForQueue?.trim()))
              ? {
                  dressPlateKey: dayDressPlateRequestKey({
                    model: input.shared.model,
                    plate: {
                      filename: input.referenceImageFilename,
                      imageUrl: input.referenceImageUrl,
                    },
                    clothing: hasCustomGarment
                      ? { imageFilename: input.toolSettings.customGarmentImageFilename?.trim() }
                      : null,
                    clothingKey: hasCustomGarment ? undefined : `kit:${wardrobeIdForQueue?.trim()}`,
                    clothingLabel: '',
                    clothingDescription: hasCustomGarment
                      ? input.toolSettings.customGarmentDescription
                      : undefined,
                    footwear: normalizeFootwear(input.toolSettings.footwear),
                    footwearImage: {
                      imageUrl: input.toolSettings.footwearImageUrl,
                      imageFilename: input.toolSettings.footwearImageFilename,
                    },
                    subject: 'she',
                  }),
                }
              : {}),
            ...(feetPass ? { feetPass } : {}),
            // Front and back (on unless switched off): a back view follows the finished front.
            ...(input.toolSettings.tryOnFrontBack !== false
              ? { backView: { subject: posePronoun } }
              : {}),
          };
          if (
            pendingTryOnRef.current?.replacesPromptId ||
            pendingTryOnRef.current?.backOfPromptId
          ) {
            // Only one job is followed: the shoe pass or back view in flight is let go, its
            // try-on stays.
            input.setSaveStatus(null);
          }
          pendingTryOnRef.current = pending;
          input.updateToolSettings({ pendingTryOn: pending });
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
      input.toolSettings.tryOnFrontBack,
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
      input.setSaveStatus,
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
      input.shared.modelCheckpointMap,
    ]
  );

  /**
   * The next edit of a try-on that just landed, queued from that picture (re-uploaded as Image 1,
   * no pose map) with the same Cast identity and queue options:
   * - the feet pass of a posed try-on (Edit 2511): Image 2 the shoe picture it was given;
   * - the back view (Front and back): Image 1 alone, the same outfit seen from behind.
   * The try-on is already in Compare — on any failure it simply stays there, said once.
   */
  const queueChainPass = useCallback(
    async (
      step: 'feet-pass' | 'back-view',
      landedJob: FittingPendingTryOn,
      landed: { imageUrl: string; galleryEntryId: string }
    ): Promise<void> => {
      let activeStep: 'feet-pass' | 'back-view' = step;
      let checkNote: string | null = null;
      if (step === 'feet-pass' && landedJob.feetPass) {
        // Look at her feet first: the pass runs only when the shoes are missing or wrong (or,
        // with no vision model, where they are known to go missing).
        input.setSaveStatus(SHOE_CHECK_STATUS);
        const verdict = await checkStillFootwear({
          imageUrl: landed.imageUrl,
          shoeWords: landedJob.feetPass.shoeWords,
          shared: input.shared,
        });
        if (pendingTryOnRef.current) {
          // Another try-on was queued meanwhile; follow that one.
          input.setSaveStatus(null);
          return;
        }
        const next = fittingStepAfterShoeCheck(
          landedJob,
          footwearNeedsFeetPass(verdict, landedJob.feetPass.whenUnchecked !== false)
        );
        if (!next) {
          input.setSaveStatus(null);
          return;
        }
        activeStep = next;
        if (verdict && !verdict.ok) checkNote = footwearCheckNote(verdict);
      }
      const feetPass = activeStep === 'feet-pass' ? landedJob.feetPass : undefined;
      const backView = activeStep === 'back-view' ? landedJob.backView : undefined;
      if (!feetPass && !backView) return;
      const failedStatus = feetPass ? FEET_PASS_FAILED_STATUS : BACK_VIEW_FAILED_STATUS;
      input.setSaveStatus(
        feetPass
          ? checkNote
            ? `Shoe check: ${checkNote} — putting the shoes on…`
            : FEET_PASS_STATUS
          : backViewStatus(backView?.subject)
      );
      // The pass runs on Edit 2511 even after a Rapid AIO or Qwen-Image 2.1 try-on.
      const passModel = feetPass?.model?.trim() || input.shared.model;
      try {
        const blob = await loadImageBlobFromUrls([landed.imageUrl]);
        const name = `outfit-${feetPass ? 'feet-pass' : 'back-view'}-${Date.now()}.png`;
        const uploaded = await resolveQueueInputImage({
          file: new File([blob], name, {
            type: blob.type || 'image/png',
            lastModified: Date.now(),
          }),
          filename: name,
          model: passModel,
        });
        const filename = uploaded?.filename?.trim();
        if (!filename) {
          throw new Error(
            `The try-on could not be staged for the ${feetPass ? 'shoe pass' : 'back view'}.`
          );
        }
        const shoe = feetPass ? await feetPassShoeImage(feetPass, passModel) : null;
        const shoeImage = shoe?.filename;
        const prompt = feetPass
          ? buildFittingFeetPassPrompt({
              shoeWords: feetPass.shoeWords,
              imagePlacement: shoe?.placement ?? null,
              subject: feetPass.subject,
            })
          : buildFittingBackViewPrompt({ subject: backView?.subject });
        const queueOptions = buildRoleplayQueueStillOptions({
          photoMode: true,
          // The try-on is the plate now; it was rendered from the (isolated) plate already.
          isolateSubject: false,
          referenceIsolated: false,
          filename,
          imageUrl: comfyInputViewUrl(filename) ?? undefined,
          identityLockStrength: input.shared.ipAdapterStrength,
          identityKind: input.shared.identityKind,
        });
        const promptId = await input.actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueOptions ?? {}),
          castPlateReference: true,
          // Same picture, small change: the still options' strong opener ("…even if lighting,
          // wardrobe, or background must change. Keep facial likeness only:") fought both
          // passes. Balanced wraps as "Edit Image 1: … Keep facial identity and camera framing."
          turboEditStrength: 'balanced' as const,
          ...withCastIdentityQueueFields(input.character, input.shared.ipAdapterStrength ?? 0.75),
          ...(shoeImage ? { inputImageFilenames: ['', shoeImage] } : {}),
          ...(feetPass && passModel !== input.shared.model
            ? { queueModel: passModel as ComfyImageModel }
            : {}),
          // A short edit: Outfit's tool notes (clothing swaps) would fight "change nothing else".
          queueHints: '',
          parentGalleryEntryId: landed.galleryEntryId,
          characterId: input.shared.activeCharacterId,
          lookId: input.shared.activeLookId ?? input.character?.activeLookId,
        });
        if (typeof promptId !== 'string' || !promptId.trim()) {
          throw new Error(`The ${feetPass ? 'shoe pass' : 'back view'} was not queued.`);
        }
        if (pendingTryOnRef.current) {
          // Another try-on was queued meanwhile; follow that one, this card keeps its picture.
          input.setSaveStatus(null);
          return;
        }
        const pending: FittingPendingTryOn = {
          promptId: promptId.trim(),
          wardrobeId: landedJob.wardrobeId,
          wardrobeLabel: landedJob.wardrobeLabel,
          // The landed job's card: a try-on's id, or its feet pass's (which took the card).
          ...(feetPass
            ? { replacesPromptId: landedJob.promptId, verifyShoes: feetPass.shoeWords }
            : { backOfPromptId: landedJob.promptId }),
          // The feet pass hands the back view on; the back view keeps its subject for the status.
          ...(landedJob.backView ? { backView: landedJob.backView } : {}),
        };
        pendingTryOnRef.current = pending;
        input.updateToolSettings({ pendingTryOn: pending });
      } catch (error) {
        console.warn(`Outfit ${feetPass ? 'shoe pass' : 'back view'} failed:`, error);
        input.setSaveStatus(failedStatus);
      }
    },
    [
      input.actions,
      input.character,
      input.setSaveStatus,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.shared.identityKind,
      input.shared,
      input.updateToolSettings,
    ]
  );
  // The gallery listener below is registered once; it reaches the current queue through this.
  const queueChainPassRef = useRef(queueChainPass);
  useEffect(() => {
    queueChainPassRef.current = queueChainPass;
  }, [queueChainPass]);
  // The shoe re-check after a pass reads the current LLM settings through this.
  const sharedRef = useRef(input.shared);
  useEffect(() => {
    sharedRef.current = input.shared;
  }, [input.shared]);

  useEffect(() => {
    const syncGallery = () => {
      const pending = pendingTryOnRef.current;
      if (pending?.promptId && handledPromptIdsRef.current.has(pending.promptId)) {
        // Already landed here (put back by a late settings echo): never a second time.
        pendingTryOnRef.current = null;
      } else if (pending?.promptId) {
        const entry = loadComfyGallery().find(item => item.promptId === pending.promptId);
        const replaces = pending.replacesPromptId?.trim();
        const backOf = pending.backOfPromptId?.trim();
        if ((replaces || backOf) && entry?.status === 'error') {
          // Said once: the pending pass is cleared with it.
          handledPromptIdsRef.current.add(pending.promptId);
          pendingTryOnRef.current = null;
          input.updateToolSettings({ pendingTryOn: undefined });
          input.setSaveStatus(backOf ? BACK_VIEW_FAILED_STATUS : FEET_PASS_FAILED_STATUS);
        } else if (entry?.status === 'completed') {
          const imageUrl = galleryEntryPrimaryViewUrl(entry);
          if (imageUrl) {
            handledPromptIdsRef.current.add(pending.promptId);
            pendingTryOnRef.current = null;
            input.updateToolSettings({ pendingTryOn: undefined });
            if (backOf) {
              // Turned around: the back goes beside the front on its card.
              setCompareTryOns(current =>
                setFittingCompareTryOnBackImage(current, backOf, {
                  promptId: pending.promptId,
                  imageUrl,
                  galleryEntryId: entry.id,
                })
              );
              input.setSaveStatus(null);
            } else if (replaces) {
              // The shoes are on: the pass takes the try-on's card (a posed try-on has no
              // dressPlateKey, and neither does this).
              setCompareTryOns(current =>
                replaceFittingCompareTryOnImage(current, replaces, {
                  promptId: pending.promptId,
                  imageUrl,
                  galleryEntryId: entry.id,
                })
              );
              input.setSaveStatus(null);
              const shoes = pending.verifyShoes;
              if (shoes !== undefined) {
                // Checked once more and said — never a second pass.
                void checkStillFootwear({
                  imageUrl,
                  shoeWords: shoes,
                  shared: sharedRef.current,
                }).then(verdict => {
                  if (verdict && !verdict.ok) {
                    pushSystemTrayMessage({
                      text: `Shoe pass done, but ${footwearCheckNote(verdict)} — try the outfit again or use a clearer shoe photo.`,
                      tone: 'warning',
                      ttlMs: 20_000,
                    });
                  }
                });
              }
            } else {
              setCompareTryOns(current =>
                pushFittingCompareTryOn(current, {
                  promptId: pending.promptId,
                  wardrobeId: pending.wardrobeId,
                  wardrobeLabel: pending.wardrobeLabel,
                  imageUrl,
                  galleryEntryId: entry.id,
                  ...(pending.dressPlateKey ? { dressPlateKey: pending.dressPlateKey } : {}),
                })
              );
            }
            // try-on → (feet pass) → back view. Cleared above first: a reload while the next
            // pass is being staged keeps the card in Compare and nothing half-done in flight.
            const step = fittingNextChainStep(pending);
            if (step) {
              void queueChainPassRef.current(step, pending, {
                imageUrl,
                galleryEntryId: entry.id,
              });
            }
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
  }, [input.setSaveStatus, input.updateToolSettings]);

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
