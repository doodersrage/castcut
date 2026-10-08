'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useEngineWarmUp } from '@/hooks/useEngineWarmUp';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRoleplayBeatQueue } from '@/hooks/useRoleplayBeatQueue';
import { useRoleplayLookPackDeepLink } from '@/hooks/useRoleplayLookPackDeepLink';
import { useRoleplayReferenceImage } from '@/hooks/useRoleplayReferenceImage';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import { useRoleplayLibraryPersist } from '@/hooks/useRoleplayLibraryPersist';
import { useRoleplayBioFlow } from '@/hooks/useRoleplayBioFlow';
import { useRoleplaySceneFlow } from '@/hooks/useRoleplaySceneFlow';
import { useRoleplaySessionActions } from '@/hooks/useRoleplaySessionActions';
import { useRoleplayRequestBody } from '@/hooks/useRoleplayRequestBody';
import { useRoleplayWardrobe } from '@/hooks/useRoleplayWardrobe';
import { useStoryBeatEdit } from '@/hooks/roleplay/useStoryBeatEdit';
import { useStorySessionGuard } from '@/hooks/roleplay/useStorySessionGuard';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getCharacter } from '@/lib/character-os';
import { roleplayLookPlateFieldsFromCharacter } from '@/lib/fitting-room';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/settings-cache';
import {
  ROLEPLAY_ARCHETYPES,
  formatRoleplayStoryProgress,
  resolveRoleplayToneAndContent,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { lastRoleplayMotionSource, normalizeRoleplayBeatOutput } from '@/lib/roleplay-film';
import { useNsfwGeneratorStatus } from '@/hooks/useNsfwGeneratorEnabled';

const TOOL_ID = 'roleplay';

export function useRoleplayToolOrchestration() {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings: updateToolSettingsUnguarded,
  } = useCachedSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  useEngineWarmUp({ mounted, model: shared.model });
  const [error, setError] = useState<string | null>(null);
  const [ownBibleOpen, setOwnBibleOpen] = useState(false);

  const personaId = toolSettings.personaId ?? '';
  const { enabled: adultEnabled, ready: adultGateReady } = useNsfwGeneratorStatus();
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content, {
    adultEnabled,
  });
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? [];
  const storyProgress = formatRoleplayStoryProgress(story);
  const rejectedScenesMemory = useMemo(
    () => toolSettings.rejectedScenes ?? [],
    [toolSettings.rejectedScenes]
  );
  const autoQueue = toolSettings.autoQueue === true;
  const beatOutput = normalizeRoleplayBeatOutput(toolSettings.beatOutput);
  const storyRef = useRef<RoleplayStoryBeat[]>(toolSettings.story ?? []);
  const scenesRef = useRef<RoleplayScene[]>([]);

  useEffect(() => {
    storyRef.current = toolSettings.story ?? [];
  }, [toolSettings.story]);
  // Scene cards live here (not in the scene flow) so a Cast switch can drop the old lead's.
  const scenesState = useState<RoleplayScene[]>([]);
  const setScenesState = scenesState[1];
  const clearScenes = useCallback(() => setScenesState([]), [setScenesState]);
  // One Cast's scenes never land in another Cast's session (story-session-guard.ts).
  const { updateToolSettings, sessionRef } = useStorySessionGuard({
    activeSessionId: toolSettings.activeSessionId,
    storyRef,
    updateToolSettings: updateToolSettingsUnguarded,
    onSessionChange: clearScenes,
  });

  const film = useRoleplayFilmActions({
    toolSettings,
    storyRef,
    bioName: bio?.name,
  });

  useRoleplayLibraryPersist({ mounted, toolSettings, updateToolSettings });
  useRoleplayLookPackDeepLink({
    mounted,
    activeCharacterId: shared.activeCharacterId,
    activeSessionId: toolSettings.activeSessionId,
    updateShared,
    updateToolSettings,
    onMessage: message => setError(message),
  });

  const reference = useRoleplayReferenceImage({
    mounted,
    story,
    shared,
    toolSettings,
    updateToolSettings,
    setError,
  });

  // After Cast switch, Play scrub clears Story refs — reseed From-photo from the new Cast. A photo
  // of another Cast is re-seeded too: Loose Lana's Story kept Tomas's cutout (UI review
  // 2026-10-08) because only an empty photo was filled.
  const seededCastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const characterId = shared.activeCharacterId?.trim();
    if (!characterId) {
      return;
    }
    const previousCast = seededCastRef.current;
    seededCastRef.current = characterId;
    const hasPhoto = Boolean(
      toolSettings.referenceImageUrl?.trim() || toolSettings.referenceImageFilename?.trim()
    );
    const owner = toolSettings.referenceCharacterId?.trim();
    const otherCast =
      (Boolean(owner) && owner !== characterId) ||
      (Boolean(previousCast) && previousCast !== characterId);
    if (hasPhoto && !otherCast) {
      return;
    }
    const fields = roleplayLookPlateFieldsFromCharacter(getCharacter(characterId));
    if (!fields) {
      return;
    }
    updateToolSettings(fields);
  }, [
    mounted,
    shared.activeCharacterId,
    toolSettings.referenceCharacterId,
    toolSettings.referenceImageFilename,
    toolSettings.referenceImageUrl,
    updateToolSettings,
  ]);

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Story',
    href: '/story',
    fields: [bio?.name, toolSettings.customPersona, toolSettings.extraHints, toolSettings.setting],
  });

  const playAsResolved = reference.playAs;

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: [bio?.name, toolSettings.extraHints, toolSettings.setting].filter(Boolean).join(' · '),
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const lastPrompt = [...story].reverse().find(beat => beat.prompt?.trim())?.prompt;

  const requestBody = useRoleplayRequestBody({
    shared,
    personaId,
    toolSettings,
    tone,
    content,
    playAsResolved,
    hasReferenceImage: reference.hasReferenceImage,
    bio,
    rejectedScenesMemory,
    scenesRef,
  });

  const beatQueue = useRoleplayBeatQueue({
    storyRef,
    toolSettings,
    updateToolSettings,
    shared,
    actions,
    playAs: playAsResolved,
    referenceImageUrl: reference.referenceImageUrl,
    isolateSubject: reference.isolateSubject,
    referenceImageFilename: reference.referenceImageFilename,
    autoQueue,
    beatOutput,
    content,
    setError,
  });

  const wardrobe = useRoleplayWardrobe({
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    actions,
    setError,
  });

  useRoleplayStorySync(storyRef, patch => updateToolSettings(patch));

  const sceneFlow = useRoleplaySceneFlow({
    storyRef,
    toolSettings,
    updateToolSettings,
    bio,
    rejectedScenesMemory,
    requestBody,
    commitStill: beatQueue.commitStill,
    skipStillForClip: beatQueue.skipStillForClip,
    autoQueue,
    playAsResolved,
    hasReferenceImage: reference.hasReferenceImage,
    setError,
    scenesState,
    sessionRef,
  });

  useEffect(() => {
    scenesRef.current = sceneFlow.scenes;
  }, [sceneFlow.scenes]);

  const bioFlow = useRoleplayBioFlow({
    storyRef,
    updateToolSettings,
    requestBody,
    commitStill: beatQueue.commitStill,
    skipStillForClip: beatQueue.skipStillForClip,
    autoQueue,
    playAsResolved,
    hasReferenceImage: reference.hasReferenceImage,
    setError,
    setScenes: sceneFlow.setScenes,
    setOwnBibleOpen,
    sessionRef,
  });

  const session = useRoleplaySessionActions({
    storyRef,
    toolSettings,
    updateToolSettings,
    bio,
    personaId,
    tone,
    content,
    assembledFilmRef: film.assembledFilmRef,
    setScenes: sceneFlow.setScenes,
    setOwnBibleOpen,
    setError,
  });

  const beatEdit = useStoryBeatEdit({
    storyRef,
    updateToolSettings,
    bio,
    requestBody,
    commitStill: beatQueue.commitStill,
    referenceMissingMessage:
      playAsResolved === 'photo' && !reference.hasReferenceImage
        ? 'Upload a photo or pick a gallery still first.'
        : null,
    setError,
  });

  const extendBeat = useCallback(
    (beat: RoleplayStoryBeat) => {
      const source =
        beat.clipStatus === 'completed' && beat.clipUrl?.trim()
          ? {
              imageUrl: beat.clipUrl.trim(),
              parentPromptId: beat.clipPromptId?.trim() || beat.promptId?.trim(),
              fromClip: true,
            }
          : (lastRoleplayMotionSource(storyRef.current) ?? undefined);
      void beatQueue.queueBeatMotion(beat, source ? { source } : undefined);
    },
    [beatQueue]
  );

  const busy =
    bioFlow.bioLoading ||
    sceneFlow.scenesLoading ||
    Boolean(sceneFlow.playingId) ||
    // One scene is written at a time: picking a card mid-rewrite would save over its result.
    Boolean(beatEdit.rewritingKey) ||
    session.exporting ||
    film.assemblingFilm ||
    reference.scanning ||
    reference.referenceUploading ||
    wardrobe.garmentUploading;

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    ownBibleOpen,
    setOwnBibleOpen,
    setError,
    personaId,
    adultEnabled,
    adultGateReady,
    tone,
    content,
    bio,
    story,
    storyProgress,
    autoQueue,
    beatOutput,
    storyRef,
    playAsResolved,
    selectedModel,
    lastPrompt,
    busy,
    reference,
    film,
    beatQueue,
    sceneFlow,
    bioFlow,
    session,
    beatEdit,
    extendBeat,
    wardrobe,
  };
}
