'use client';

import { releaseInterruptedStoryWrites } from '@/hooks/roleplay/story-beat-edit';
import { storyPoseForcePeople } from '@/lib/story-scene-people';

import { composedPoseForScene } from '@/lib/pose-compose';
import { queuedDayStillPrompt } from '@/lib/day-still-prompt';
import {
  repairStillPrompt,
  stillPromptCheckRecord,
  stillPromptIssuesLine,
  type StillPromptCheck,
} from '@/lib/still-prompt-audit';
import { storyLeadIsMan, storyPromptForManLead } from '@/lib/story-lead-gender';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';
import {
  beatOwnsFootwear,
  footwearIsBarefoot,
  footwearPromptLine,
  normalizeFootwear,
} from '@/lib/footwear';
import {
  DRESS_PLATE_SHOE_PASS_STATUS,
  dayDressPlateStatus,
  DRESS_PLATE_OUTFIT_LINE,
  storyDressPlateApplies,
  storyDressPlatePrompt,
  stripOutfitLeadLines,
} from '@/lib/day-dress-plate';
import { setDressPlateActivity } from '@/lib/dress-plate-status';
import { pushSystemTrayMessage } from '@/lib/system-tray-messages';
import { checkStillReferences } from '@/lib/reference-check-client';
import { getCachedClothingLabel, humanizeClothingId } from '@/lib/clothing-catalog-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import {
  applyCharacterRecord,
  castLoraSessionIds,
  getCharacter,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import { buildRoleplayQueueStillOptions, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import { buildStoryClothedDuoRecipe, buildStoryRapidDuoRecipe } from '@/lib/rapid-duo-recipe';
import {
  loadSettingsCache,
  saveSharedSettings,
  type RoleplayToolCache,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import {
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  patchRoleplayStoryBeat,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  storyBeatOmitsGarmentPackshot,
  storyIdentityLockStrengthForBeat,
  storyIntimateSnofsStrengthOverrides,
  storyStillPromptSource,
  storyStillRetryQueueParamsBase,
  roleplayStillBrief,
  withRoleplayPoseGuidePrompt,
  withStoryEverydayWardrobe,
  isRoleplayAdultContent,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import { withStoryAdultAges } from '@/lib/story-adult-ages';
import { isAdultContentPrompt } from '@/lib/adult-age-safeguard';
import { storyRatingNeedsAdultSafeguards } from '@/lib/adult-appearance-gate';
import type { CharacterAgeBand } from '@/lib/character-appearance';
import { roleplaySceneWritePlan, storyHasBeat } from '@/lib/roleplay-story-write';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { snapshotRoleplaySession } from '@/lib/roleplay-library';
import { syncSharedIdentityToCast, withCastFaceQueueParams } from '@/lib/look-outfit-plate';
import {
  loadWardrobeGarmentThumbManifest,
  resolveWardrobeGarmentThumbQueueUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { buildStoryPoseGuide, photoPoseForStill } from '@/lib/day-pose-guide';
import { customPoseFirstLine, customPoseWords } from '@/lib/pose-describe';
import { mergeAvoidedPoseLayouts, modelPlainPostureBase } from '@/lib/pose-guide-prompt';
import {
  KLEIN_FACE_REFERENCE_LINE,
  shouldAppendKleinFaceReference,
} from '@/lib/klein-face-reference';
import { mergePickedPose } from '@/lib/day-slot-pose';
import { cuePoseLayouts, poseLayoutFromKey, weakPoseLayouts } from '@/lib/play-metrics';
import { notePoseTakeQueued } from '@/lib/pose-outcome-stats';
import {
  ALWAYS_CUED_DUO_LAYOUTS,
  poseLayoutCueLine,
  poseLimbFixNudge,
  poseLookLine,
  postureCueLine,
} from '@/lib/pose-coaching';
import { DEFAULT_MIN_POSE_MATCH, POSE_MISMATCH_NUDGE } from '@/lib/pose-score';
import { probeImageUrlDimensions } from '@/lib/browser-image-dimensions';
import { loadPoseLibrary } from '@/lib/pose-library';
import { isOpenPoseStyle } from '@/lib/pose-guide-prompt';
import { describePoseLeadPosition } from '@/lib/pose-guide-openpose';
import type { StoryPoseGuideExpect } from '@/lib/roleplay-pose-check';
import type { PoseGuideStylePreference } from '@/lib/pose-guide-prompt';
import { loadPoseGuideStylePreference } from '@/lib/render-realism-settings';
import { poseGuideFailureReason } from '@/lib/pose-guide-status';
import { collectIsolateSourceUrls } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { resolveStoryNudeFaceFilename } from '@/lib/story-nude-face';
import { PLAY_FACE_CROP_CANVAS } from '@/lib/plate-render-size';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { MutableRefObject } from 'react';

/** The pose guide's forcePeople option, when Story's words settle the headcount. */
const withForcedPeople = (people: 1 | 2 | undefined) => (people ? { forcePeople: people } : {});

/** The Cast face pin must not be the underwear plate on a nude beat either. */
function nudeFaceIdentityParams(nudeFace: string | null): Record<string, unknown> {
  return nudeFace ? { ipAdapterImageFilename: nudeFace, ipAdapterImageFilenames: [nudeFace] } : {};
}

const TOOL_ID = 'roleplay';

/** Whether the story's lead reads as a man (Cast record first, then the bible's look). */
function leadIsMan(): boolean {
  const cache = loadSettingsCache();
  const castId = cache.shared.activeCharacterId?.trim();
  const cast = castId ? getCharacter(castId) : null;
  return storyLeadIsMan({
    look: cache.tools.roleplay?.bio?.look,
    descriptor: cast?.descriptor,
    hints: cast?.hints,
    traits: cast?.traits,
  });
}

/** The story lead's age for the adult age sentence: the Cast's picked age, else its look. */
function storyLeadAge(): { leadAgeBand?: CharacterAgeBand; leadDescriptor?: string } {
  const cache = loadSettingsCache();
  const castId = cache.shared.activeCharacterId?.trim();
  const cast = castId ? getCharacter(castId) : null;
  return {
    leadAgeBand: cast?.traits?.ageBand,
    leadDescriptor: cast?.descriptor || cache.tools.roleplay?.bio?.look || undefined,
  };
}

/**
 * Text contradictions in a still's prompt (still-prompt-audit): what can be repaired without
 * guessing is repaired, the rest raises a notice. Never a block — returns the prompt to queue
 * and the record the beat card shows (undefined when the prompt was clean). On an adult-rated
 * story the adult safeguards go on last (story-adult-ages.ts): everyone's age, no youth words.
 */
function checkedStoryPrompt(
  prompt: string,
  label: string | undefined,
  people?: number,
  manLead = false,
  adult?: { content: RoleplayContentId; strong?: boolean },
  /** Which extra images go with it (clothing = 2, pose map = 3); omitted for a text-only check. */
  images?: { second: boolean; third: boolean }
): { prompt: string; promptCheck: StillPromptCheck | undefined } {
  const voiced = manLead ? storyPromptForManLead(prompt) : prompt;
  // No clothing image: the queue moves the pose map into the second slot, so "Image 3" pointed
  // at a picture that was not there (101 of the user's Story stills, 2026-10-08) — as Day does.
  const numbered = images ? queuedDayStillPrompt(voiced, images).prompt : voiced;
  const repaired = repairStillPrompt(numbered, {
    people: people || undefined,
    ...(images ? { imageCount: 1 + Number(images.second) + Number(images.third) } : {}),
  });
  const checked = adult
    ? {
        ...repaired,
        prompt: withStoryAdultAges(repaired.prompt, {
          content: adult.content,
          manLead,
          people,
          strong: adult.strong,
          ...storyLeadAge(),
        }),
      }
    : repaired;
  if (checked.remaining.length > 0) {
    console.warn('Story prompt check:', label, checked.remaining, checked.prompt);
    pushSystemTrayMessage({
      text: stillPromptIssuesLine(checked.remaining, label),
      tone: 'warning',
      ttlMs: 20_000,
    });
  }
  return { prompt: checked.prompt, promptCheck: stillPromptCheckRecord(checked) };
}

/** The extra images a Story still queues with: clothing in the second slot, pose map in the third. */
function storyStillImages(
  stillOpts:
    | { inputImageFilenames?: (string | undefined)[]; inputImageUrls?: (string | undefined)[] }
    | null
    | undefined
): { second: boolean; third: boolean } | undefined {
  if (!stillOpts) return undefined;
  const has = (index: number) =>
    Boolean(
      stillOpts.inputImageFilenames?.[index]?.trim() || stillOpts.inputImageUrls?.[index]?.trim()
    );
  return { second: has(1), third: has(2) };
}

/** What the Story still prompt needs to know about the Image 3 guide that was drawn. */
type StoryPoseGuidePromptMeta = {
  style: PoseGuideStylePreference;
  headcount: number;
  leadPosition: string | null;
  camera: 'overhead' | 'side' | 'low' | null;
};

type PromptActions = ReturnType<typeof usePromptResultActions>;

export type UseRoleplayBeatQueueOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  shared: SharedToolSettings;
  actions: PromptActions;
  playAs: import('@/lib/roleplay').RoleplayPlayAs;
  referenceImageUrl: string;
  isolateSubject: boolean;
  referenceImageFilename: string;
  autoQueue: boolean;
  beatOutput: RoleplayBeatOutput;
  /** Resolved Story rating — only adult ratings get sex pose layouts, locks and recipes. */
  content: RoleplayContentId;
  setError: (message: string | null) => void;
};

export function useRoleplayBeatQueueCore(options: UseRoleplayBeatQueueOptions) {
  const {
    storyRef,
    toolSettings,
    updateToolSettings,
    shared,
    actions,
    playAs,
    referenceImageUrl,
    isolateSubject,
    referenceImageFilename,
    autoQueue,
    beatOutput,
    content,
    setError,
  } = options;
  // Clean / PG-13 / Suggestive: "leans against a brick wall" must not become a wall-sex duo.
  const adult = isRoleplayAdultContent(content);
  // Suggestive and the adult ratings: photo stills wait for the adult-appearance gate.
  const adultGated = playAs === 'photo' && storyRatingNeedsAdultSafeguards(content);
  const hasOutfitImage = Boolean(
    toolSettings.wardrobeId ||
    shared.lockedWardrobeId ||
    toolSettings.customGarmentImageFilename ||
    toolSettings.customGarmentImageUrl
  );
  /** Clean-rated still with no outfit image: name everyday clothes when the writer named none. */
  // A scene left "Writing still…" by a page that closed mid-write is released once, so Retry
  // can write it again (story-beat-edit: releaseInterruptedStoryWrites).
  const [openedAt] = useState(() => Date.now());
  const releasedWritesRef = useRef(false);
  useEffect(() => {
    if (releasedWritesRef.current || storyRef.current.length === 0) {
      return;
    }
    releasedWritesRef.current = true;
    const released = releaseInterruptedStoryWrites(storyRef.current, openedAt);
    if (released) {
      storyRef.current = released;
      updateToolSettings({ story: released });
    }
  }, [openedAt, storyRef, toolSettings.story, updateToolSettings]);

  const dressForRating = useCallback(
    (prompt: string, headcount?: number) =>
      adult || hasOutfitImage ? prompt : withStoryEverydayWardrobe(prompt, headcount),
    [adult, hasOutfitImage]
  );

  const stampRoleplayCharacter = useCallback(
    (cache?: Partial<RoleplayToolCache>) => {
      const session = snapshotRoleplaySession({
        ...toolSettings,
        ...cache,
        story: cache?.story ?? storyRef.current,
        bio: cache?.bio ?? toolSettings.bio,
      });
      if (!session) {
        return undefined;
      }
      const character = upsertCharacterFromRoleplaySession(session);
      if (character) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecord(character),
        });
      }
      return character;
    },
    [storyRef, toolSettings]
  );

  const roleplayCharacterQueueFields = useCallback(
    (
      cache?: Partial<RoleplayToolCache>,
      queueParamsBase?: Record<string, unknown>,
      options?: { beat?: RoleplayStoryBeat; hasPoseGuide?: boolean }
    ) => {
      const character = stampRoleplayCharacter(cache);
      const identityStrength = storyIdentityLockStrengthForBeat(shared.ipAdapterStrength ?? 0.75, {
        beat: options?.beat,
        hasPoseGuide: options?.hasPoseGuide,
        adult,
      });
      if (!character) {
        return queueParamsBase ? { queueParamsBase } : {};
      }
      // 2.0: pin Cast face + LoRAs on Story stills/clips so identity survives session drift.
      syncSharedIdentityToCast(character);
      const merged = withCastFaceQueueParams(queueParamsBase, character, identityStrength);
      const castLoras = castLoraSessionIds(character);
      const snofsOverrides = storyIntimateSnofsStrengthOverrides({
        beat: options?.beat,
        hasPoseGuide: options?.hasPoseGuide,
        sessionActiveLoraIds: castLoras ?? shared.sessionActiveLoraIds,
        adult,
      });
      return {
        characterId: character.id,
        lookId: character.activeLookId,
        ...(merged ? { queueParamsBase: merged } : {}),
        ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
        ...(snofsOverrides ? { sessionLoraStrengthOverrides: snofsOverrides } : {}),
      };
    },
    [adult, shared.ipAdapterStrength, shared.sessionActiveLoraIds, stampRoleplayCharacter]
  );

  /**
   * Face-only Image 1, as Day Intimate/Raunchy do: nude beats (garment dropped), and clean-rated
   * stills with no outfit image — the Cast plate is underwear, and Rapid kept it on a PG-13 hug
   * however the prompt dressed her (live 2026-09-27; the face crop dressed both seeds).
   */
  const resolveNudeFaceForBeat = useCallback(
    async (beat: RoleplayStoryBeat): Promise<string | null> => {
      const needsFaceOnly = adult ? storyBeatOmitsGarmentPackshot(beat, adult) : !hasOutfitImage;
      if (playAs !== 'photo' || !needsFaceOnly) {
        return null;
      }
      return resolveStoryNudeFaceFilename({
        character: stampRoleplayCharacter(),
        referenceFilename: referenceImageFilename,
        referenceUrl: referenceImageUrl,
        model: shared.model,
        comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
      }).catch(() => null);
    },
    [
      adult,
      hasOutfitImage,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.model,
      stampRoleplayCharacter,
    ]
  );

  /**
   * FLUX.2 Klein: when Image 1 is the full plate, the same head crop rides along as the last
   * reference (see klein-face-reference.ts). Null when Image 1 already is the face crop.
   */
  const resolveKleinFaceReferenceForBeat = useCallback(
    async (nudeFace: string | null, headcount?: number): Promise<string | null> => {
      if (
        playAs !== 'photo' ||
        !shouldAppendKleinFaceReference({
          model: shared.model,
          imageOneIsFaceCrop: Boolean(nudeFace),
          headcount,
        })
      ) {
        return null;
      }
      return resolveStoryNudeFaceFilename({
        character: stampRoleplayCharacter(),
        referenceFilename: referenceImageFilename,
        referenceUrl: referenceImageUrl,
        model: shared.model,
        comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
      }).catch(() => null);
    },
    [playAs, referenceImageFilename, referenceImageUrl, shared.model, stampRoleplayCharacter]
  );

  /**
   * Rapid AIO duo sex beats: a compact placement recipe instead of the long Story prompt —
   * the locks buried the pose (see rapid-duo-recipe.ts). Null keeps the normal prompt.
   */
  const storyRapidDuoRecipeFor = useCallback(
    (
      beat: RoleplayStoryBeat,
      stillOpts: ReturnType<typeof buildRoleplayQueueStillOptions>,
      extra?: string,
      clothed?: { people?: number; fromDressedPlate: boolean },
      /** The pose map's layout (its pose key), so the recipe places the bodies the map draws. */
      guideLayout?: string | null
    ) => {
      const hasGarmentImage = Boolean(
        stillOpts?.inputImageFilenames?.[1]?.trim() || stillOpts?.inputImageUrls?.[1]
      );
      const hasPoseGuide = Boolean(
        stillOpts?.inputImageFilenames?.[2]?.trim() || stillOpts?.inputImageUrls?.[2]
      );
      if (!adult) {
        // A clothed two-person still on Rapid: the compact couple recipe holds the headcount.
        if (!clothed || (clothed.people ?? 0) < 2) {
          return null;
        }
        const recipe = buildStoryClothedDuoRecipe({
          model: stillOpts?.queueModel ?? shared.model,
          title: beat.title,
          blurb: beat.blurb,
          fromDressedPlate: clothed.fromDressedPlate,
          hasGarmentImage,
          hasPoseGuide,
          lead: leadIsMan() ? 'man' : 'woman',
        });
        return recipe && extra?.trim() ? `${recipe} ${extra.trim()}` : recipe;
      }
      const recipe = buildStoryRapidDuoRecipe({
        model: stillOpts?.queueModel ?? shared.model,
        title: beat.title,
        blurb: beat.blurb,
        omitGarment: storyBeatOmitsGarmentPackshot(beat),
        hasGarmentImage,
        hasPoseGuide,
        guideLayout,
      });
      return recipe && extra?.trim() ? `${recipe} ${extra.trim()}` : recipe;
    },
    [adult, shared.model]
  );

  // Story's clothed stills start from the full reference plate on every engine, so the dressed
  // plate simply takes its place (as the clothing image it would sit beside the undressed one).
  const dressAsPlate = Boolean(poseProfileForModel(shared.model).dressPlate);

  const queueStillOptions = useCallback(
    (
      poseGuide?: {
        filename?: string;
        imageUrl?: string;
        prompt?: { style?: PoseGuideStylePreference };
      },
      beat?: RoleplayStoryBeat,
      nudeFaceFilename?: string | null,
      kleinFaceFilename?: string | null,
      /** The dressed plate: Image 1 wears the outfit, so no clothing image rides along. */
      dressPlate?: { filename: string; imageUrl?: string } | null
    ) =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        // Nude beats: face-only Image 1 so the plate's underwear never reaches the reference.
        filename:
          nudeFaceFilename || (dressAsPlate ? dressPlate?.filename : '') || referenceImageFilename,
        imageUrl: nudeFaceFilename
          ? undefined
          : dressAsPlate && dressPlate
            ? dressPlate.imageUrl
            : referenceImageUrl,
        identityLockStrength: storyIdentityLockStrengthForBeat(shared.ipAdapterStrength, {
          beat,
          hasPoseGuide: Boolean(poseGuide?.filename || poseGuide?.imageUrl),
          adult,
        }),
        identityKind: shared.identityKind,
        wardrobeId: dressPlate ? undefined : toolSettings.wardrobeId || shared.lockedWardrobeId,
        customGarmentUrl: dressPlate ? undefined : toolSettings.customGarmentImageUrl,
        // Face-crop engines: the dressed plate rides in the clothing image's place.
        customGarmentFilename: dressPlate
          ? dressAsPlate
            ? undefined
            : dressPlate.filename
          : toolSettings.customGarmentImageFilename,
        poseGuideFilename: poseGuide?.filename,
        poseGuideUrl: poseGuide?.imageUrl,
        poseGuideStyle: poseGuide?.prompt?.style,
        omitGarment: storyBeatOmitsGarmentPackshot(beat, adult),
        model: shared.model,
        faceReferenceFilename: kleinFaceFilename,
      }),
    [
      adult,
      isolateSubject,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.identityKind,
      shared.ipAdapterStrength,
      shared.lockedWardrobeId,
      shared.model,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.referenceIsolated,
      dressAsPlate,
      toolSettings.wardrobeId,
    ]
  );

  const leadName = toolSettings.bio?.name;
  /**
   * Dress plate (day-dress-plate.ts): on a clothed photo story with clothing or shoes picked,
   * dress the Cast once and start each still from that plate. Null keeps the per-still outfit
   * image — also when the plate could not be rendered.
   */
  const resolveDressPlateForBeat = useCallback(
    async (beat: RoleplayStoryBeat): Promise<{ filename: string; imageUrl?: string } | null> => {
      const customPicked = Boolean(
        toolSettings.customGarmentImageUrl?.trim() ||
        toolSettings.customGarmentImageFilename?.trim()
      );
      const wardrobeId = (toolSettings.wardrobeId || shared.lockedWardrobeId)?.trim();
      const shoes = normalizeFootwear(toolSettings.footwear);
      const hasShoes = Boolean(shoes) && !footwearIsBarefoot(shoes);
      // A beat about the feet ("heels in one hand", "barefoot on the sand") cannot start from a
      // plate that has the shoes on.
      if (hasShoes && beatOwnsFootwear(beat.blurb)) {
        return null;
      }
      if (
        !storyDressPlateApplies({
          model: shared.model,
          adult,
          photoMode: playAs === 'photo',
          hasPlate: Boolean(referenceImageFilename?.trim() || referenceImageUrl?.trim()),
          clothingPicked: customPicked || Boolean(wardrobeId),
          footwearPicked: hasShoes,
          omitGarment: storyBeatOmitsGarmentPackshot(beat, adult),
        })
      ) {
        return null;
      }
      await loadWardrobeGarmentThumbManifest();
      const packshotUrl = customPicked
        ? undefined
        : resolveWardrobeGarmentThumbQueueUrl(wardrobeId);
      if (!customPicked && !packshotUrl) {
        // Shoes alone on the undressed plate are not an outfit.
        return null;
      }
      try {
        const { ensureDayDressPlate } = await import('@/lib/day-dress-plate-client');
        const { entry } = await ensureDayDressPlate(
          {
            model: shared.model,
            plate: { filename: referenceImageFilename, imageUrl: referenceImageUrl },
            clothing: customPicked
              ? {
                  imageUrl: toolSettings.customGarmentImageUrl?.trim() || undefined,
                  imageFilename: toolSettings.customGarmentImageFilename?.trim() || undefined,
                }
              : { imageUrl: packshotUrl ?? undefined },
            clothingKey: customPicked ? undefined : `kit:${wardrobeId ?? ''}`,
            clothingLabel: customPicked
              ? toolSettings.customGarmentDescription?.trim() || 'the outfit'
              : (wardrobeId &&
                  (getCachedClothingLabel(wardrobeId) ?? humanizeClothingId(wardrobeId))) ||
                'the outfit',
            clothingDescription: customPicked ? toolSettings.customGarmentDescription : undefined,
            footwear: shoes,
            footwearImage: {
              imageUrl: toolSettings.footwearImageUrl,
              imageFilename: toolSettings.footwearImageFilename,
            },
            subject: leadIsMan() ? 'he' : 'she',
            characterName: leadName,
            characterId: shared.activeCharacterId,
            lookId: shared.activeLookId,
          },
          {
            sendComfyUi: actions.sendComfyUi,
            // Shoes picked: the plate's feet are checked and fixed once (footwear-check.ts).
            visionShared: shared,
            onShoePass: () => {
              setDressPlateActivity({ text: DRESS_PLATE_SHOE_PASS_STATUS, busy: true });
              pushSystemTrayMessage({ text: DRESS_PLATE_SHOE_PASS_STATUS, tone: 'info' });
            },
            onRender: ({ change }) => {
              const text = dayDressPlateStatus({
                name: leadName,
                clothing: true,
                footwear: hasShoes,
                change,
              });
              setDressPlateActivity({ text, busy: true });
              pushSystemTrayMessage({ text, tone: 'info' });
            },
          }
        );
        setDressPlateActivity({
          text: 'Dressed plate ready — the clothed stills start from it.',
          busy: false,
          key: entry.key,
        });
        return { filename: entry.filename, imageUrl: entry.imageUrl };
      } catch (dressError) {
        setDressPlateActivity({
          text: `Dress plate skipped (${dressError instanceof Error ? dressError.message : 'it did not render'}) — the stills dress her from the clothing image instead.`,
          busy: false,
        });
        return null;
      }
    },
    [
      actions,
      adult,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.lockedWardrobeId,
      shared.model,
      leadName,
      toolSettings.customGarmentDescription,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.footwear,
      toolSettings.footwearImageFilename,
      toolSettings.footwearImageUrl,
      toolSettings.wardrobeId,
    ]
  );

  const resolvePoseGuideForBeat = useCallback(
    async (beat: RoleplayStoryBeat, options?: { variant?: number; afterPoseMiss?: boolean }) => {
      if (playAs !== 'photo') {
        return undefined;
      }
      try {
        const storyIndex = Math.max(
          0,
          storyRef.current.findIndex(entry => entry.id === beat.id && entry.at === beat.at)
        );
        const stylePreference = loadPoseGuideStylePreference(shared.model);
        const openPose = isOpenPoseStyle(stylePreference);
        // Story Image 1 is the reference photo; the still renders at its aspect.
        const referenceUrl =
          referenceImageUrl?.trim() ||
          collectIsolateSourceUrls({
            filename: referenceImageFilename?.trim() || undefined,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          })[0];
        const aspect =
          openPose && referenceUrl
            ? await probeImageUrlDimensions(referenceUrl).catch(() => null)
            : null;
        const writtenPose = mergePickedPose(beat.poseLayout, beat.pose, beat.blurb);
        // A pose that is none of the named layouts, described limb by limb by the writer and
        // composed into a skeleton — drawn exactly, like a pose from a photo.
        const composedPose = composedPoseForScene({
          pose: writtenPose,
          sceneText: beat.blurb,
          playerPosed: Boolean(beat.poseLayout || beat.posePhoto),
        });
        const poseBuild = await buildStoryPoseGuide({
          title: beat.title,
          blurb: beat.blurb,
          prompt: beat.prompt,
          // A fork's blurb quotes the beat before it ("…the fallout of milk pitcher duel"):
          // those titles are labels, not this still's pose.
          quotedTitles: storyRef.current
            .filter(entry => !(entry.id === beat.id && entry.at === beat.at))
            .map(entry => entry.title),
          storyIndex: storyIndex >= 0 ? storyIndex : 0,
          model: shared.model,
          stylePreference,
          // A pose picked on the beat card wins over the writer's; it's drawn even if Edit has
          // a poor record with it (weak layouts are only routed around when nothing was picked).
          pose: writtenPose,
          variant: (options?.variant ?? 0) + (beat.poseVariant ?? 0),
          ...(beat.poseLayout
            ? {}
            : { avoidLayouts: mergeAvoidedPoseLayouts(weakPoseLayouts(), shared.model) }),
          ...(modelPlainPostureBase(shared.model)
            ? { plainPostureBase: modelPlainPostureBase(shared.model) }
            : {}),
          // A two-figure custom pose is a duo; People → Solo draws its lead only.
          ...(beat.posePhoto
            ? {
                photoPose: photoPoseForStill(
                  beat.posePhoto,
                  adult && toolSettings.intimateMix === 'solo' ? 1 : undefined
                ),
              }
            : composedPose
              ? { photoPose: composedPose }
              : {}),
          ...(beat.poseCamera ? { camera: beat.poseCamera } : {}),
          ...(beat.poseLead ? { leadSide: beat.poseLead } : {}),
          ...(beat.poseLook ? { look: beat.poseLook } : {}),
          aspect,
          library: openPose ? loadPoseLibrary() : [],
          allowIntimate: adult,
          // People → Solo on an adult story: one figure, unless the player picked a pose.
          ...withForcedPeople(
            storyPoseForcePeople({
              text: beat.blurb,
              adult,
              solo: toolSettings.intimateMix === 'solo',
              playerPosed: Boolean(beat.poseLayout || beat.posePhoto),
            })
          ),
        });
        const poseFile = poseBuild.file;
        const uploaded = await resolveQueueInputImage({
          file: poseFile,
          filename: poseFile.name,
          model: shared.model,
        });
        const poseGuideFilename = uploaded?.filename?.trim() || undefined;
        if (!poseGuideFilename) {
          console.warn('Story pose guide upload returned no filename — queueing without Image 3.');
          return undefined;
        }
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const poseGuideUrl =
          collectIsolateSourceUrls({
            filename: poseGuideFilename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) || undefined;
        // Spell the pose out in words after a pose miss, and always for layouts Edit has a
        // poor record with (step one before the guide falls back to a plainer pose), for
        // two-person layouts (no extra face in a hug) and for a kneel (Rapid squats otherwise).
        // A custom pose (the player's own, or one composed from the writer's limbs) leads the
        // prompt with its stance in words — the engines pose from the words, not the map.
        const customPose = poseBuild.poseKey.startsWith('photo:')
          ? customPoseWords({
              photo: beat.posePhoto ?? composedPose,
              drawn: {
                keypoints: poseBuild.keypoints,
                aspect: poseBuild.canvas.width / poseBuild.canvas.height,
              },
              sceneText: beat.blurb,
              lead: leadIsMan() ? 'he' : 'she',
            })
          : '';
        const drawnLayout = poseLayoutFromKey(poseBuild.poseKey);
        const cueLine =
          (drawnLayout &&
          (options?.afterPoseMiss ||
            ALWAYS_CUED_DUO_LAYOUTS.has(drawnLayout) ||
            cuePoseLayouts().has(drawnLayout))
            ? poseLayoutCueLine(drawnLayout, poseBuild.figureCount)
            : '') || postureCueLine(poseBuild.poseKey);
        return {
          cueLine: [cueLine, poseLookLine(beat.poseLook, poseBuild.figureCount)]
            .filter(Boolean)
            .join('\n'),
          poseFirstLine: customPose
            ? customPoseFirstLine(customPose, leadIsMan() ? 'he' : 'she')
            : '',
          filename: poseGuideFilename,
          imageUrl: poseGuideUrl,
          prompt: {
            style: poseBuild.stylePreference,
            headcount: poseBuild.figureCount,
            leadPosition: poseBuild.leadPosition
              ? describePoseLeadPosition(poseBuild.leadPosition)
              : null,
            camera: poseBuild.camera,
          } satisfies StoryPoseGuidePromptMeta,
          expect: {
            keypoints: poseBuild.keypoints,
            aspect: poseBuild.canvas.width / poseBuild.canvas.height,
            style: poseBuild.stylePreference,
            poseKey: poseBuild.poseKey,
            ...(cueLine ? { cued: true } : {}),
          },
        };
      } catch (poseError) {
        // Pose guide is best-effort — Story still queues without Image 3 — but a silent drop
        // reads as "posing is broken", so say why in the console at least.
        console.warn(
          `Story pose guide could not be attached: ${poseGuideFailureReason(poseError)}`,
          poseError
        );
        return undefined;
      }
    },
    [
      adult,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.model,
      storyRef,
      toolSettings.intimateMix,
    ]
  );

  const skipStillForClip = roleplaySceneWritePlan({ beatOutput, autoQueue }).skipStill;

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[],
      options?: {
        queueStill?: boolean;
        /**
         * Patch the reel as it is when the write finishes, not `currentStory`. For a scene
         * written again mid-reel: while it was being written the other scenes kept moving
         * (stills finishing, pose checks landing), and a snapshot would put them back.
         */
        liveStory?: boolean;
      }
    ) => {
      if (!data.prompt?.trim()) {
        throw new Error(data.error ?? 'Could not write a still.');
      }
      const queueStill = options?.queueStill ?? autoQueue;
      const poseGuide =
        queueStill && playAs === 'photo' ? await resolvePoseGuideForBeat(beat) : undefined;
      const promptSource = storyStillPromptSource({
        llmPrompt: data.prompt,
        blurb: beat.blurb,
        title: beat.title,
        adult,
        guideLayout: poseLayoutFromKey(poseGuide?.expect.poseKey),
      });
      // Footwear picked beside the clothing: clothed stories only, and not a beat about the feet.
      const footwear =
        adult || beatOwnsFootwear(beat.blurb) ? '' : normalizeFootwear(toolSettings.footwear);
      // Dress plate: she is dressed once, and this still starts from that plate.
      const dressPlate = queueStill ? await resolveDressPlateForBeat(beat) : null;
      const promptWithPose = [
        poseGuide?.poseFirstLine ?? '',
        dressPlate && dressAsPlate ? DRESS_PLATE_OUTFIT_LINE : footwearPromptLine(footwear),
        withRoleplayPoseGuidePrompt(
          dressForRating(promptSource, poseGuide?.prompt.headcount),
          Boolean(poseGuide) || (!queueStill && playAs === 'photo'),
          shared.renderRealismMode,
          shared.model,
          poseGuide?.prompt ?? { style: loadPoseGuideStylePreference(shared.model) },
          adult
        ),
        poseGuide?.cueLine ?? '',
      ]
        .filter(Boolean)
        .join('\n');
      const prompt = await actions.finalizePrompt(promptWithPose, beat.title);
      // Taken back or started over while it was written: queue nothing, save nothing (the bible
      // too may have been replaced since).
      if (options?.liveStory && !storyHasBeat(storyRef.current, beat)) {
        return storyRef.current;
      }
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Story',
        href: '/story',
        fields: [nextBio.name, beat.title, prompt],
      });
      void dispatchWebhook({
        event: 'prompt.generated',
        tool: TOOL_ID,
        model: shared.model,
        prompt: prompt.slice(0, 500),
        completedAt: Date.now(),
      });
      // What the scene writer described (before locks) — the next still keeps its continuity.
      const stillBrief = roleplayStillBrief(promptSource);
      let stillPatch: Partial<RoleplayStoryBeat> = {
        prompt,
        // The prompt now says what the scene says — an edited scene is no longer waiting.
        textEdited: undefined,
        stillWriteInterrupted: undefined,
        // The last check was of the previous prompt; the queue below records this one's.
        promptCheck: undefined,
        ...(stillBrief ? { stillBrief } : {}),
      };
      if (queueStill) {
        await loadWardrobeGarmentThumbManifest();
        const nudeFace = await resolveNudeFaceForBeat(beat);
        const kleinFace = await resolveKleinFaceReferenceForBeat(
          nudeFace,
          poseGuide?.prompt.headcount
        );
        const stillOpts = queueStillOptions(
          poseGuide,
          beat,
          nudeFace,
          kleinFace,
          nudeFace ? null : dressPlate
        );
        // A face-crop Image 1 must be a face, the clothing image clothing (reference-check.ts);
        // a miss is said on the beat card. Cached per picture, so a Story checks each one once.
        const referenceNote = await checkStillReferences({
          face: nudeFace ? { filename: nudeFace } : null,
          clothing: stillOpts?.inputImageFilenames?.[1]?.trim()
            ? { filename: stillOpts.inputImageFilenames[1] }
            : null,
          subject: nextBio.name,
          comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        });
        const fromDressPlate = Boolean(dressPlate) && dressAsPlate && !nudeFace;
        const rapidRecipe = storyRapidDuoRecipeFor(
          beat,
          stillOpts,
          [poseGuide?.poseFirstLine, poseGuide?.cueLine].filter(Boolean).join(' ') || undefined,
          {
            people: poseGuide?.prompt.headcount,
            fromDressedPlate: fromDressPlate,
          },
          poseLayoutFromKey(poseGuide?.expect.poseKey)
        );
        const charOpts = roleplayCharacterQueueFields(
          { bio: nextBio, story: currentStory },
          stillOpts?.queueParamsBase,
          {
            beat,
            hasPoseGuide: Boolean(poseGuide),
          }
        );
        const { prompt: sentPrompt, promptCheck } = checkedStoryPrompt(
          rapidRecipe ?? (fromDressPlate ? storyDressPlatePrompt(prompt) : prompt),
          beat.title,
          poseGuide?.prompt.headcount,
          leadIsMan(),
          { content },
          storyStillImages(stillOpts)
        );
        const promptId = await actions.sendComfyUi(
          kleinFace ? `${sentPrompt}\n${KLEIN_FACE_REFERENCE_LINE}` : sentPrompt,
          undefined,
          undefined,
          {
            ...(stillOpts ?? {}),
            ...(stillOpts ? { castPlateReference: true } : {}),
            // The strong edit opener says the wardrobe may change — not from a dressed plate.
            ...(stillOpts && fromDressPlate ? { turboEditStrength: 'balanced' as const } : {}),
            // A face crop is filename-only (no size probe) — without this the latent fell back
            // to a square 1536², squeezed the 3:4 pose guide and flipped a bent pose upside down.
            ...(stillOpts && nudeFace ? { figurePixelSize: { ...PLAY_FACE_CROP_CANVAS } } : {}),
            ...charOpts,
            ...(stillOpts?.queueParamsBase || charOpts.queueParamsBase
              ? {
                  queueParamsBase: {
                    ...stillOpts?.queueParamsBase,
                    ...charOpts.queueParamsBase,
                    ...nudeFaceIdentityParams(nudeFace),
                  },
                }
              : {}),
            // Held until the adult-appearance gate passes it (useStoryAdultGate).
            ...(adultGated || (playAs === 'photo' && isAdultContentPrompt(sentPrompt))
              ? { adultGate: {} }
              : {}),
          }
        );
        notePoseTakeQueued({
          takeId: typeof promptId === 'string' ? promptId : null,
          poseKey: poseGuide?.expect.poseKey,
          model: shared.model,
          surface: 'story',
          replaces: beat.imageUrl?.trim() ? beat.promptId : null,
        });
        stillPatch = {
          ...stillPatch,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
          promptCheck,
          referenceNote,
          ...(poseGuide?.imageUrl ? { poseGuideUrl: poseGuide.imageUrl } : {}),
          ...(poseGuide?.expect && promptId
            ? { poseGuideExpect: { ...poseGuide.expect, promptId } }
            : {}),
        };
      } else {
        // Prompt is ready — clear writing so the reel does not say "Queueing…" with no Comfy job.
        stillPatch = { ...stillPatch, stillStatus: undefined };
      }
      if (options?.liveStory && !storyHasBeat(storyRef.current, beat)) {
        return storyRef.current;
      }
      const nextStory = patchRoleplayStoryBeat(
        options?.liveStory ? storyRef.current : currentStory,
        beat,
        stillPatch
      );
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [
      actions,
      adult,
      adultGated,
      content,
      dressForRating,
      resolveNudeFaceForBeat,
      resolveKleinFaceReferenceForBeat,
      storyRapidDuoRecipeFor,
      autoQueue,
      playAs,
      queueStillOptions,
      resolvePoseGuideForBeat,
      resolveDressPlateForBeat,
      dressAsPlate,
      roleplayCharacterQueueFields,
      shared.model,
      shared.renderRealismMode,
      storyRef,
      toolSettings.footwear,
      updateToolSettings,
    ]
  );

  const queueBeat = useCallback(
    async (
      beat: RoleplayStoryBeat,
      options?: {
        retry?: boolean;
        /** The adult-appearance gate withheld the last take: say the ages more strongly. */
        strongAgeLine?: boolean;
      }
    ) => {
      const prompt = beat.prompt?.trim();
      if (!prompt) {
        return;
      }
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = options?.retry === true || canRetryRoleplayStill(latest);
      setError(null);
      const startPatch = retry
        ? beginRoleplayStillRetryPatch(latest)
        : { stillStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });
      const parentPromptId = retry
        ? roleplayStillTakes(latest)
            .map(take => take.promptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : undefined;
      const parentEntry = parentPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentPromptId)
        : undefined;
      let promptId: string | undefined;
      let promptCheck: StillPromptCheck | undefined;
      let referenceNote: string | undefined;
      let poseGuideUrl: string | undefined;
      let poseGuideExpectBase: Omit<StoryPoseGuideExpect, 'promptId'> | undefined;
      try {
        await loadWardrobeGarmentThumbManifest();
        // A retry draws a different variant of the layout (reseeded / mirrored). After a pose
        // miss it also spells the pose out and names the limbs the last still got wrong.
        const lastMatch =
          latest.poseMatch && latest.poseMatch.imageUrl === latest.imageUrl?.trim()
            ? latest.poseMatch
            : undefined;
        const afterPoseMiss =
          retry && Boolean(lastMatch && lastMatch.score < DEFAULT_MIN_POSE_MATCH);
        const poseGuide = await resolvePoseGuideForBeat(latest, {
          variant: retry ? roleplayStillTakes(latest).length : 0,
          afterPoseMiss,
        });
        poseGuideUrl = poseGuide?.imageUrl;
        poseGuideExpectBase = poseGuide?.expect;
        // The stored prompt carries the outfit / footwear lines of its first queue — drop them
        // and say what is true now.
        const promptSource = stripOutfitLeadLines(
          storyStillPromptSource({
            llmPrompt: prompt,
            blurb: latest.blurb,
            title: latest.title,
            adult,
            guideLayout: poseLayoutFromKey(poseGuide?.expect.poseKey),
          })
        );
        const dressPlate = await resolveDressPlateForBeat(latest);
        const retryFootwear =
          adult || beatOwnsFootwear(latest.blurb) ? '' : normalizeFootwear(toolSettings.footwear);
        const queuePrompt = [
          poseGuide?.poseFirstLine ?? '',
          dressPlate && dressAsPlate ? DRESS_PLATE_OUTFIT_LINE : footwearPromptLine(retryFootwear),
          withRoleplayPoseGuidePrompt(
            dressForRating(promptSource, poseGuide?.prompt.headcount),
            Boolean(poseGuide),
            shared.renderRealismMode,
            shared.model,
            poseGuide?.prompt,
            adult
          ),
          poseGuide?.cueLine ?? '',
          afterPoseMiss && poseGuide
            ? `QUALITY FIX: ${[
                POSE_MISMATCH_NUDGE,
                poseLimbFixNudge(lastMatch?.missView?.misses ?? []),
              ]
                .filter(Boolean)
                .join(' ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        const nudeFace = await resolveNudeFaceForBeat(latest);
        const kleinFace = await resolveKleinFaceReferenceForBeat(
          nudeFace,
          poseGuide?.prompt.headcount
        );
        const stillOpts = queueStillOptions(
          poseGuide,
          latest,
          nudeFace,
          kleinFace,
          nudeFace ? null : dressPlate
        );
        referenceNote = await checkStillReferences({
          face: nudeFace ? { filename: nudeFace } : null,
          clothing: stillOpts?.inputImageFilenames?.[1]?.trim()
            ? { filename: stillOpts.inputImageFilenames[1] }
            : null,
          subject: toolSettings.bio?.name,
          comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
        });
        const rapidRecipe = storyRapidDuoRecipeFor(
          latest,
          stillOpts,
          [
            poseGuide?.poseFirstLine ?? '',
            poseGuide?.cueLine ?? '',
            afterPoseMiss && poseGuide ? `QUALITY FIX: ${POSE_MISMATCH_NUDGE}` : '',
          ]
            .filter(Boolean)
            .join(' '),
          {
            people: poseGuide?.prompt.headcount,
            fromDressedPlate: Boolean(dressPlate) && dressAsPlate && !nudeFace,
          },
          poseLayoutFromKey(poseGuide?.expect.poseKey)
        );
        const charOpts = roleplayCharacterQueueFields(
          undefined,
          {
            ...stillOpts?.queueParamsBase,
            ...(retry ? storyStillRetryQueueParamsBase() : {}),
          },
          { beat: latest, hasPoseGuide: Boolean(poseGuide) }
        );
        const fromDressPlate = Boolean(dressPlate) && dressAsPlate && !nudeFace;
        const checked = checkedStoryPrompt(
          rapidRecipe ?? (fromDressPlate ? storyDressPlatePrompt(queuePrompt) : queuePrompt),
          latest.title,
          poseGuide?.prompt.headcount,
          leadIsMan(),
          { content, strong: options?.strongAgeLine === true },
          storyStillImages(stillOpts)
        );
        const sentPrompt = checked.prompt;
        promptCheck = checked.promptCheck;
        promptId = await actions.sendComfyUi(
          kleinFace ? `${sentPrompt}\n${KLEIN_FACE_REFERENCE_LINE}` : sentPrompt,
          undefined,
          undefined,
          {
            ...(stillOpts ?? {}),
            ...(stillOpts ? { castPlateReference: true } : {}),
            ...(stillOpts && fromDressPlate ? { turboEditStrength: 'balanced' as const } : {}),
            // A face crop is filename-only (no size probe) — without this the latent fell back
            // to a square 1536², squeezed the 3:4 pose guide and flipped a bent pose upside down.
            ...(stillOpts && nudeFace ? { figurePixelSize: { ...PLAY_FACE_CROP_CANVAS } } : {}),
            ...charOpts,
            ...(stillOpts?.queueParamsBase || charOpts.queueParamsBase
              ? {
                  queueParamsBase: {
                    ...stillOpts?.queueParamsBase,
                    ...charOpts.queueParamsBase,
                    ...nudeFaceIdentityParams(nudeFace),
                  },
                }
              : {}),
            ...(retry
              ? {
                  derivedKind: 'variation' as const,
                  parentGalleryEntryId: parentEntry?.id,
                }
              : {}),
            // Held until the adult-appearance gate passes it (useStoryAdultGate).
            ...(adultGated || (playAs === 'photo' && isAdultContentPrompt(sentPrompt))
              ? { adultGate: { strong: options?.strongAgeLine === true } }
              : {}),
          }
        );
        // Pose × engine stats: a retry with the same pose redoes the last take.
        notePoseTakeQueued({
          takeId: promptId,
          poseKey: poseGuide?.expect.poseKey,
          model: shared.model,
          surface: 'story',
          replaces: parentPromptId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue a still.');
      }
      const after = storyRef.current.find(
        entry => entry.id === latest.id && entry.at === latest.at
      ) ?? {
        ...latest,
        ...startPatch,
      };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, {
          ...roleplayStillQueueResultPatch(after, promptId),
          promptCheck,
          referenceNote,
          ...(poseGuideUrl ? { poseGuideUrl } : {}),
          ...(poseGuideExpectBase && promptId
            ? { poseGuideExpect: { ...poseGuideExpectBase, promptId } }
            : {}),
        }),
      });
    },
    [
      actions,
      adult,
      adultGated,
      content,
      playAs,
      dressForRating,
      resolveNudeFaceForBeat,
      resolveKleinFaceReferenceForBeat,
      storyRapidDuoRecipeFor,
      queueStillOptions,
      resolvePoseGuideForBeat,
      resolveDressPlateForBeat,
      dressAsPlate,
      toolSettings.footwear,
      roleplayCharacterQueueFields,
      setError,
      shared.model,
      shared.renderRealismMode,
      storyRef,
      updateToolSettings,
    ]
  );

  return {
    skipStillForClip,
    commitStill,
    queueBeat,
    queueStillOptions,
    roleplayCharacterQueueFields,
    stampRoleplayCharacter,
  };
}

export type RoleplayBeatQueueCore = ReturnType<typeof useRoleplayBeatQueueCore>;
