'use client';

import { useCallback } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import {
  applyCharacterRecord,
  castLoraSessionIds,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import { buildRoleplayQueueStillOptions, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import { buildStoryRapidDuoRecipe } from '@/lib/rapid-duo-recipe';
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
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { snapshotRoleplaySession } from '@/lib/roleplay-library';
import { syncSharedIdentityToCast, withCastFaceQueueParams } from '@/lib/look-outfit-plate';
import { loadWardrobeGarmentThumbManifest } from '@/lib/wardrobe-garment-thumbs';
import { buildStoryPoseGuide } from '@/lib/day-pose-guide';
import { loadPoseGuideControlNetEnabled } from '@/lib/pose-guide-controlnet';
import { fetchComfyObjectInfoModelsCached } from '@/lib/comfyui-object-info-cache';
import { mergePickedPose } from '@/lib/day-slot-pose';
import { cuePoseLayouts, poseLayoutFromKey, weakPoseLayouts } from '@/lib/play-metrics';
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
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { MutableRefObject } from 'react';

/** The Cast face pin must not be the underwear plate on a nude beat either. */
function nudeFaceIdentityParams(nudeFace: string | null): Record<string, unknown> {
  return nudeFace ? { ipAdapterImageFilename: nudeFace, ipAdapterImageFilenames: [nudeFace] } : {};
}

const TOOL_ID = 'roleplay';

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
  const hasOutfitImage = Boolean(
    toolSettings.wardrobeId ||
    shared.lockedWardrobeId ||
    toolSettings.customGarmentImageFilename ||
    toolSettings.customGarmentImageUrl
  );
  /** Clean-rated still with no outfit image: name everyday clothes when the writer named none. */
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
   * Rapid AIO duo sex beats: a compact placement recipe instead of the long Story prompt —
   * the locks buried the pose (see rapid-duo-recipe.ts). Null keeps the normal prompt.
   */
  const storyRapidDuoRecipeFor = useCallback(
    (
      beat: RoleplayStoryBeat,
      stillOpts: ReturnType<typeof buildRoleplayQueueStillOptions>,
      extra?: string
    ) => {
      if (!adult) {
        return null;
      }
      const recipe = buildStoryRapidDuoRecipe({
        model: stillOpts?.queueModel ?? shared.model,
        title: beat.title,
        blurb: beat.blurb,
        omitGarment: storyBeatOmitsGarmentPackshot(beat),
        hasGarmentImage: Boolean(
          stillOpts?.inputImageFilenames?.[1]?.trim() || stillOpts?.inputImageUrls?.[1]
        ),
        hasPoseGuide: Boolean(
          stillOpts?.inputImageFilenames?.[2]?.trim() || stillOpts?.inputImageUrls?.[2]
        ),
      });
      return recipe && extra?.trim() ? `${recipe} ${extra.trim()}` : recipe;
    },
    [adult, shared.model]
  );

  const queueStillOptions = useCallback(
    (
      poseGuide?: {
        filename?: string;
        imageUrl?: string;
        prompt?: { style?: PoseGuideStylePreference };
      },
      beat?: RoleplayStoryBeat,
      nudeFaceFilename?: string | null
    ) =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        // Nude beats: face-only Image 1 so the plate's underwear never reaches the reference.
        filename: nudeFaceFilename || referenceImageFilename,
        imageUrl: nudeFaceFilename ? undefined : referenceImageUrl,
        identityLockStrength: storyIdentityLockStrengthForBeat(shared.ipAdapterStrength, {
          beat,
          hasPoseGuide: Boolean(poseGuide?.filename || poseGuide?.imageUrl),
          adult,
        }),
        identityKind: shared.identityKind,
        wardrobeId: toolSettings.wardrobeId || shared.lockedWardrobeId,
        customGarmentUrl: toolSettings.customGarmentImageUrl,
        customGarmentFilename: toolSettings.customGarmentImageFilename,
        poseGuideFilename: poseGuide?.filename,
        poseGuideUrl: poseGuide?.imageUrl,
        poseGuideStyle: poseGuide?.prompt?.style,
        omitGarment: storyBeatOmitsGarmentPackshot(beat, adult),
        model: shared.model,
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
        const stylePreference = loadPoseGuideStylePreference();
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
        const poseBuild = await buildStoryPoseGuide({
          title: beat.title,
          blurb: beat.blurb,
          prompt: beat.prompt,
          storyIndex: storyIndex >= 0 ? storyIndex : 0,
          model: shared.model,
          stylePreference,
          // A pose picked on the beat card wins over the writer's; it's drawn even if Edit has
          // a poor record with it (weak layouts are only routed around when nothing was picked).
          pose: mergePickedPose(beat.poseLayout, beat.pose),
          variant: (options?.variant ?? 0) + (beat.poseVariant ?? 0),
          ...(beat.poseLayout ? {} : { avoidLayouts: weakPoseLayouts() }),
          ...(beat.posePhoto ? { photoPose: beat.posePhoto } : {}),
          ...(beat.poseCamera ? { camera: beat.poseCamera } : {}),
          ...(beat.poseLead ? { leadSide: beat.poseLead } : {}),
          ...(beat.poseLook ? { look: beat.poseLook } : {}),
          aspect,
          library: openPose ? loadPoseLibrary() : [],
          allowIntimate: adult,
        });
        const poseFile = poseBuild.file;
        // The pose lock reads ComfyUI's ControlNet list from the object_info cache — fill it.
        if (loadPoseGuideControlNetEnabled()) {
          await fetchComfyObjectInfoModelsCached().catch(() => null);
        }
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
        const drawnLayout = poseLayoutFromKey(poseBuild.poseKey);
        const cueLine =
          (drawnLayout &&
          (options?.afterPoseMiss ||
            ALWAYS_CUED_DUO_LAYOUTS.has(drawnLayout) ||
            cuePoseLayouts().has(drawnLayout))
            ? poseLayoutCueLine(drawnLayout)
            : '') || postureCueLine(poseBuild.poseKey);
        return {
          cueLine: [cueLine, poseLookLine(beat.poseLook, poseBuild.figureCount)]
            .filter(Boolean)
            .join('\n'),
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
    [adult, playAs, referenceImageFilename, referenceImageUrl, shared.model, storyRef]
  );

  const skipStillForClip = beatOutput === 'clip' && autoQueue;

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[],
      options?: { queueStill?: boolean }
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
      });
      const promptWithPose = [
        withRoleplayPoseGuidePrompt(
          dressForRating(promptSource, poseGuide?.prompt.headcount),
          Boolean(poseGuide) || (!queueStill && playAs === 'photo'),
          shared.renderRealismMode,
          shared.model,
          poseGuide?.prompt ?? { style: loadPoseGuideStylePreference() },
          adult
        ),
        poseGuide?.cueLine ?? '',
      ]
        .filter(Boolean)
        .join('\n');
      const prompt = await actions.finalizePrompt(promptWithPose, beat.title);
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
        ...(stillBrief ? { stillBrief } : {}),
      };
      if (queueStill) {
        await loadWardrobeGarmentThumbManifest();
        const nudeFace = await resolveNudeFaceForBeat(beat);
        const stillOpts = queueStillOptions(poseGuide, beat, nudeFace);
        const rapidRecipe = storyRapidDuoRecipeFor(beat, stillOpts, poseGuide?.cueLine);
        const charOpts = roleplayCharacterQueueFields(
          { bio: nextBio, story: currentStory },
          stillOpts?.queueParamsBase,
          {
            beat,
            hasPoseGuide: Boolean(poseGuide),
          }
        );
        const promptId = await actions.sendComfyUi(rapidRecipe ?? prompt, undefined, undefined, {
          ...(stillOpts ?? {}),
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
        });
        stillPatch = {
          ...stillPatch,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
          ...(poseGuide?.imageUrl ? { poseGuideUrl: poseGuide.imageUrl } : {}),
          ...(poseGuide?.expect && promptId
            ? { poseGuideExpect: { ...poseGuide.expect, promptId } }
            : {}),
        };
      } else {
        // Prompt is ready — clear writing so the reel does not say "Queueing…" with no Comfy job.
        stillPatch = { ...stillPatch, stillStatus: undefined };
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, stillPatch);
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [
      actions,
      adult,
      dressForRating,
      resolveNudeFaceForBeat,
      storyRapidDuoRecipeFor,
      autoQueue,
      playAs,
      queueStillOptions,
      resolvePoseGuideForBeat,
      roleplayCharacterQueueFields,
      shared.model,
      shared.renderRealismMode,
      updateToolSettings,
    ]
  );

  const queueBeat = useCallback(
    async (beat: RoleplayStoryBeat, options?: { retry?: boolean }) => {
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
        const promptSource = storyStillPromptSource({
          llmPrompt: prompt,
          blurb: latest.blurb,
          title: latest.title,
          adult,
        });
        const queuePrompt = [
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
        const stillOpts = queueStillOptions(poseGuide, latest, nudeFace);
        const rapidRecipe = storyRapidDuoRecipeFor(
          latest,
          stillOpts,
          [
            poseGuide?.cueLine ?? '',
            afterPoseMiss && poseGuide ? `QUALITY FIX: ${POSE_MISMATCH_NUDGE}` : '',
          ]
            .filter(Boolean)
            .join(' ')
        );
        const charOpts = roleplayCharacterQueueFields(
          undefined,
          {
            ...stillOpts?.queueParamsBase,
            ...(retry ? storyStillRetryQueueParamsBase() : {}),
          },
          { beat: latest, hasPoseGuide: Boolean(poseGuide) }
        );
        promptId = await actions.sendComfyUi(rapidRecipe ?? queuePrompt, undefined, undefined, {
          ...(stillOpts ?? {}),
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
      dressForRating,
      resolveNudeFaceForBeat,
      storyRapidDuoRecipeFor,
      queueStillOptions,
      resolvePoseGuideForBeat,
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
