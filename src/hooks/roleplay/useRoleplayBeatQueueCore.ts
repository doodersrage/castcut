'use client';

import { useCallback } from 'react';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import {
  applyCharacterRecord,
  castLoraSessionIds,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import { buildRoleplayQueueStillOptions, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
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
  type RoleplayBio,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { snapshotRoleplaySession } from '@/lib/roleplay-library';
import { syncSharedIdentityToCast, withCastFaceQueueParams } from '@/lib/look-outfit-plate';
import { loadWardrobeGarmentThumbManifest } from '@/lib/wardrobe-garment-thumbs';
import { buildStoryPoseGuide } from '@/lib/day-pose-guide';
import { mergePickedPose } from '@/lib/day-slot-pose';
import { cuePoseLayouts, poseLayoutFromKey, weakPoseLayouts } from '@/lib/play-metrics';
import { poseLayoutCueLine, poseLimbFixNudge } from '@/lib/pose-coaching';
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
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { MutableRefObject } from 'react';

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
    setError,
  } = options;

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
      });
      return {
        characterId: character.id,
        lookId: character.activeLookId,
        ...(merged ? { queueParamsBase: merged } : {}),
        ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
        ...(snofsOverrides ? { sessionLoraStrengthOverrides: snofsOverrides } : {}),
      };
    },
    [shared.ipAdapterStrength, shared.sessionActiveLoraIds, stampRoleplayCharacter]
  );

  const queueStillOptions = useCallback(
    (poseGuide?: { filename?: string; imageUrl?: string }, beat?: RoleplayStoryBeat) =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: storyIdentityLockStrengthForBeat(shared.ipAdapterStrength, {
          beat,
          hasPoseGuide: Boolean(poseGuide?.filename || poseGuide?.imageUrl),
        }),
        identityKind: shared.identityKind,
        wardrobeId: toolSettings.wardrobeId || shared.lockedWardrobeId,
        customGarmentUrl: toolSettings.customGarmentImageUrl,
        customGarmentFilename: toolSettings.customGarmentImageFilename,
        poseGuideFilename: poseGuide?.filename,
        poseGuideUrl: poseGuide?.imageUrl,
        omitGarment: storyBeatOmitsGarmentPackshot(beat),
        model: shared.model,
      }),
    [
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
          aspect,
          library: openPose ? loadPoseLibrary() : [],
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
        // poor record with (step one before the guide falls back to a plainer pose).
        const drawnLayout = poseLayoutFromKey(poseBuild.poseKey);
        const cueLine =
          drawnLayout && (options?.afterPoseMiss || cuePoseLayouts().has(drawnLayout))
            ? poseLayoutCueLine(drawnLayout)
            : '';
        return {
          cueLine,
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
    [playAs, referenceImageFilename, referenceImageUrl, shared.model, storyRef]
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
      });
      const promptWithPose = [
        withRoleplayPoseGuidePrompt(
          promptSource,
          Boolean(poseGuide) || (!queueStill && playAs === 'photo'),
          shared.renderRealismMode,
          shared.model,
          poseGuide?.prompt ?? { style: loadPoseGuideStylePreference() }
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
        const stillOpts = queueStillOptions(poseGuide, beat);
        const charOpts = roleplayCharacterQueueFields(
          { bio: nextBio, story: currentStory },
          stillOpts?.queueParamsBase,
          {
            beat,
            hasPoseGuide: Boolean(poseGuide),
          }
        );
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(stillOpts ?? {}),
          ...charOpts,
          ...(stillOpts?.queueParamsBase || charOpts.queueParamsBase
            ? {
                queueParamsBase: {
                  ...stillOpts?.queueParamsBase,
                  ...charOpts.queueParamsBase,
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
        });
        const queuePrompt = [
          withRoleplayPoseGuidePrompt(
            promptSource,
            Boolean(poseGuide),
            shared.renderRealismMode,
            shared.model,
            poseGuide?.prompt
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
        const stillOpts = queueStillOptions(poseGuide, latest);
        const charOpts = roleplayCharacterQueueFields(
          undefined,
          {
            ...stillOpts?.queueParamsBase,
            ...(retry ? storyStillRetryQueueParamsBase() : {}),
          },
          { beat: latest, hasPoseGuide: Boolean(poseGuide) }
        );
        promptId = await actions.sendComfyUi(queuePrompt, undefined, undefined, {
          ...(stillOpts ?? {}),
          ...charOpts,
          ...(stillOpts?.queueParamsBase || charOpts.queueParamsBase
            ? {
                queueParamsBase: {
                  ...stillOpts?.queueParamsBase,
                  ...charOpts.queueParamsBase,
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
      queueStillOptions,
      resolvePoseGuideForBeat,
      roleplayCharacterQueueFields,
      setError,
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
