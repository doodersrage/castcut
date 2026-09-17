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
import { buildStoryPoseGuideFile } from '@/lib/day-pose-guide';
import { collectIsolateSourceUrls } from '@/lib/isolate-subject';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { MutableRefObject } from 'react';

const TOOL_ID = 'roleplay';

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
    (cache?: Partial<RoleplayToolCache>, queueParamsBase?: Record<string, unknown>) => {
      const character = stampRoleplayCharacter(cache);
      if (!character) {
        return queueParamsBase ? { queueParamsBase } : {};
      }
      // 2.0: pin Cast face + LoRAs on Story stills/clips so identity survives session drift.
      syncSharedIdentityToCast(character);
      const merged = withCastFaceQueueParams(
        queueParamsBase,
        character,
        shared.ipAdapterStrength ?? 0.75
      );
      const castLoras = castLoraSessionIds(character);
      return {
        characterId: character.id,
        lookId: character.activeLookId,
        ...(merged ? { queueParamsBase: merged } : {}),
        ...(castLoras ? { sessionActiveLoraIds: castLoras } : {}),
      };
    },
    [shared.ipAdapterStrength, stampRoleplayCharacter]
  );

  const queueStillOptions = useCallback(
    (poseGuide?: { filename?: string; imageUrl?: string }) =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
        wardrobeId: toolSettings.wardrobeId || shared.lockedWardrobeId,
        customGarmentUrl: toolSettings.customGarmentImageUrl,
        customGarmentFilename: toolSettings.customGarmentImageFilename,
        poseGuideFilename: poseGuide?.filename,
        poseGuideUrl: poseGuide?.imageUrl,
      }),
    [
      isolateSubject,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.identityKind,
      shared.ipAdapterStrength,
      shared.lockedWardrobeId,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.referenceIsolated,
      toolSettings.wardrobeId,
    ]
  );

  const resolvePoseGuideForBeat = useCallback(
    async (beat: RoleplayStoryBeat) => {
      if (playAs !== 'photo') {
        return undefined;
      }
      try {
        const storyIndex = Math.max(
          0,
          storyRef.current.findIndex(entry => entry.id === beat.id && entry.at === beat.at)
        );
        const poseFile = await buildStoryPoseGuideFile({
          title: beat.title,
          blurb: beat.blurb,
          prompt: beat.prompt,
          storyIndex: storyIndex >= 0 ? storyIndex : 0,
        });
        const uploaded = await resolveQueueInputImage({
          file: poseFile,
          filename: poseFile.name,
          model: shared.model,
        });
        const poseGuideFilename = uploaded?.filename?.trim() || undefined;
        if (!poseGuideFilename) {
          return undefined;
        }
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const poseGuideUrl =
          collectIsolateSourceUrls({
            filename: poseGuideFilename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) || undefined;
        return { filename: poseGuideFilename, imageUrl: poseGuideUrl };
      } catch {
        // Pose guide is best-effort — Story still queues without Image 3.
        return undefined;
      }
    },
    [playAs, shared.model, storyRef]
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
      // When saving prompt only, still name Image 3 — Queue later attaches the stick figure.
      const promptWithPose = withRoleplayPoseGuidePrompt(
        data.prompt,
        Boolean(poseGuide) || (!queueStill && playAs === 'photo'),
        shared.renderRealismMode
      );
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
      let stillPatch: Partial<RoleplayStoryBeat> = { prompt };
      if (queueStill) {
        await loadWardrobeGarmentThumbManifest();
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueStillOptions(poseGuide) ?? {}),
          ...roleplayCharacterQueueFields({ bio: nextBio, story: currentStory }),
        });
        stillPatch = {
          prompt,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
        };
      } else {
        // Prompt is ready — clear writing so the reel does not say "Queueing…" with no Comfy job.
        stillPatch = { prompt, stillStatus: undefined };
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
      try {
        await loadWardrobeGarmentThumbManifest();
        const poseGuide = await resolvePoseGuideForBeat(latest);
        const queuePrompt = withRoleplayPoseGuidePrompt(
          prompt,
          Boolean(poseGuide),
          shared.renderRealismMode
        );
        promptId = await actions.sendComfyUi(queuePrompt, undefined, undefined, {
          ...(queueStillOptions(poseGuide) ?? {}),
          ...roleplayCharacterQueueFields(),
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
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          roleplayStillQueueResultPatch(after, promptId)
        ),
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
