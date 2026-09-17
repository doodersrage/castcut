'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRoleplayBeatQueue } from '@/hooks/useRoleplayBeatQueue';
import { useRoleplayLookPackDeepLink } from '@/hooks/useRoleplayLookPackDeepLink';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { useRoleplayWardrobe } from '@/hooks/useRoleplayWardrobe';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { IDENTITY_MEDIA_URL, persistIdentityImage } from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import { normalizeCharacterPlates, type CharacterPlate } from '@/lib/mobile-studio';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import {
  appendRoleplayStoryBeat,
  formatRoleplayStoryProgress,
  mergeRoleplayRejectedScenes,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { normalizeRoleplayBeatOutput } from '@/lib/roleplay-film';
import { persistRoleplayLibraryFromCache } from '@/lib/roleplay-library';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
} from '@/lib/settings-cache';
import {
  buildRoleplayRequestBody,
  resolveRoleplayWardrobeFields,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import { getCachedClothingLabel } from '@/lib/clothing-catalog-client';

const TOOL_ID = 'roleplay';
const EMPTY_STORY: RoleplayStoryBeat[] = [];

function loadPlates(): CharacterPlate[] {
  return normalizeCharacterPlates(
    loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE).plates
  );
}

function loadActivePlate(): CharacterPlate | null {
  const cache = loadToolSettings('mobileStudio', DEFAULT_MOBILE_STUDIO_TOOL_CACHE);
  const plates = normalizeCharacterPlates(cache.plates);
  return plates.find(plate => plate.id === cache.activePlateId) ?? plates[0] ?? null;
}

export function useMobilePlayToolOrchestrationCore() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'roleplay',
    DEFAULT_ROLEPLAY_TOOL_CACHE
  );
  const [plates, setPlates] = useState<CharacterPlate[]>([]);
  const [activePlate, setActivePlate] = useState<CharacterPlate | null>(null);
  const [scenes, setScenes] = useState<RoleplayScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isolating, setIsolating] = useState(false);
  const [ownBibleOpen, setOwnBibleOpen] = useState(false);
  const autoIsolateAttemptedRef = useRef(false);

  useRoleplayLookPackDeepLink({
    mounted,
    activeCharacterId: shared.activeCharacterId,
    activeSessionId: toolSettings.activeSessionId,
    updateShared,
    updateToolSettings,
    onMessage: message => setError(message),
  });

  const personaId = toolSettings.personaId ?? 'raccoon-pirate';
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content);
  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const isolateSubject = normalizeRoleplayIsolateSubject(toolSettings.isolateSubject);
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? EMPTY_STORY;
  const storyProgress = formatRoleplayStoryProgress(story);
  const autoQueue = toolSettings.autoQueue === true;
  const beatOutput = normalizeRoleplayBeatOutput(toolSettings.beatOutput);
  const storyRef = useRef(story);
  useEffect(() => {
    storyRef.current = story;
  }, [story]);
  const {
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate,
    cutRoleplayFilm,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
  } = useRoleplayFilmActions({
    toolSettings,
    storyRef,
    bioName: bio?.name,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (
        persisted &&
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);

  const referenceImageUrl = toolSettings.referenceImageUrl?.trim() || '';
  const referenceImageFilename = toolSettings.referenceImageFilename?.trim() || '';
  const referenceOriginalUrl = toolSettings.referenceOriginalUrl?.trim() || '';
  const referenceOriginalFilename = toolSettings.referenceOriginalFilename?.trim() || '';
  const hasReferenceImage = Boolean(referenceImageUrl || referenceImageFilename);

  useEffect(() => {
    const refresh = () => {
      setPlates(loadPlates());
      setActivePlate(loadActivePlate());
    };
    refresh();
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!mounted || isolating) {
      return;
    }
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (toolSettings.referenceIsolated === true) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    const originalUrl = referenceOriginalUrl || referenceImageUrl;
    const originalFilename = referenceOriginalFilename || referenceImageFilename;
    if (!originalUrl && !originalFilename) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (autoIsolateAttemptedRef.current) {
      return;
    }
    autoIsolateAttemptedRef.current = true;
    setIsolating(true);
    void (async () => {
      try {
        const originalName = originalFilename || 'roleplay-ref.png';
        const blob = await loadImageBlobFromUrls(
          collectIsolateSourceUrls({
            imageUrl: originalUrl || IDENTITY_MEDIA_URL,
            filename: originalName,
            comfyUrl: loadComfyUiSettings().apiUrl?.trim() || undefined,
          })
        );
        const source = new File([blob], originalName, {
          type: blob.type || 'image/png',
          lastModified: Date.now(),
        });
        const originalUploaded = await resolveQueueInputImage({
          file: source,
          filename: originalName,
          model: shared.model,
        });
        const originalNameOnHost = originalUploaded?.filename?.trim() || originalName;
        const cutout = await isolateSubjectOnWhite(source, originalName);
        const cutoutUploaded = await resolveQueueInputImage({
          file: cutout,
          filename: cutout.name,
          model: shared.model,
        });
        const cutoutFilename = cutoutUploaded?.filename?.trim();
        if (!cutoutFilename) {
          throw new Error('Cut-out upload did not return a filename.');
        }
        const cutoutDurable = await persistIdentityImage({
          file: cutout,
          filename: cutoutFilename,
        });
        updateToolSettings({
          playAs: 'photo',
          isolateSubject: true,
          referenceIsolated: true,
          referenceOriginalFilename: originalNameOnHost,
          referenceOriginalUrl: originalUrl || referenceOriginalUrl,
          referenceImageFilename: cutoutFilename,
          referenceImageUrl: cutoutDurable || referenceImageUrl,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? `${err.message} ${ISOLATE_QUEUE_BLOCKED_MESSAGE}`
            : ISOLATE_QUEUE_BLOCKED_MESSAGE
        );
      } finally {
        setIsolating(false);
      }
    })();
  }, [
    isolateSubject,
    isolating,
    mounted,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    shared.model,
    toolSettings.referenceIsolated,
    updateToolSettings,
  ]);

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: [bio?.name, toolSettings.setting].filter(Boolean).join(' · '),
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const beatQueue = useRoleplayBeatQueue({
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
  });

  const wardrobe = useRoleplayWardrobe({
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    actions,
    setError,
  });

  const requestBody = useCallback(
    (action: 'bio' | 'scenes' | 'prompt', situation?: RoleplayScene) => {
      const wardrobeFields = resolveRoleplayWardrobeFields({
        wardrobeId: toolSettings.wardrobeId,
        lockedWardrobeId: shared.lockedWardrobeId,
        wardrobeLabel: toolSettings.wardrobeId
          ? getCachedClothingLabel(toolSettings.wardrobeId) || undefined
          : undefined,
        customGarmentUrl: toolSettings.customGarmentImageUrl,
        customGarmentFilename: toolSettings.customGarmentImageFilename,
        customGarmentDescription: toolSettings.customGarmentDescription,
      });
      return buildRoleplayRequestBody({
        action,
        situation,
        shared,
        personaId,
        customPersona: toolSettings.customPersona,
        characterName: toolSettings.characterName,
        extraHints: toolSettings.extraHints,
        setting: toolSettings.setting,
        tone,
        content,
        allowGore: toolSettings.allowGore,
        hasReferenceImage,
        isolatedSubject:
          isolateSubject && hasReferenceImage && toolSettings.referenceIsolated === true,
        bio,
        story: toolSettings.story,
        rejectedScenes: mergeRoleplayRejectedScenes(toolSettings.rejectedScenes, scenes),
        wardrobeLabel: wardrobeFields.wardrobeLabel,
        garmentDescription: wardrobeFields.garmentDescription,
        hasGarmentReference: wardrobeFields.hasGarmentReference,
      });
    },
    [
      bio,
      content,
      hasReferenceImage,
      isolateSubject,
      personaId,
      shared,
      tone,
      toolSettings.allowGore,
      toolSettings.customGarmentDescription,
      toolSettings.customGarmentImageFilename,
      toolSettings.customGarmentImageUrl,
      toolSettings.customPersona,
      toolSettings.characterName,
      toolSettings.extraHints,
      toolSettings.referenceIsolated,
      toolSettings.setting,
      toolSettings.story,
      toolSettings.rejectedScenes,
      toolSettings.wardrobeId,
      scenes,
    ]
  );

  const queueStillOptions = beatQueue.queueStillOptions;

  useRoleplayStorySync(storyRef, patch => updateToolSettings(patch));

  // 2.0: reuse desk Story beat queue so mobile stills get Cast face + LoRA pins.
  const commitStill = beatQueue.commitStill;

  const beginStoryFromBio = useCallback(
    async (nextBio: RoleplayBio) => {
      const intro = roleplayIntroScene(nextBio);
      const writingStory = appendRoleplayStoryBeat([], intro, { stillStatus: 'writing' });
      const introBeat = writingStory[writingStory.length - 1];
      updateToolSettings({
        playAs: 'photo',
        bio: nextBio,
        story: writingStory,
      });
      if (!introBeat) {
        return;
      }
      try {
        const [stillResponse, scenesResponse] = await Promise.all([
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('prompt', intro),
              bio: nextBio,
              story: [],
            }),
          }),
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('scenes'),
              bio: nextBio,
              story: writingStory,
            }),
          }).catch(() => null),
        ]);
        const stillData = (await stillResponse.json()) as RoleplayApiPayload;
        if (!stillResponse.ok || !stillData.prompt?.trim()) {
          throw new Error(stillData.error ?? 'Bio saved, but the first still failed.');
        }
        await commitStill(stillData, introBeat, nextBio, writingStory);
        if (scenesResponse) {
          const scenesData = (await scenesResponse.json()) as RoleplayApiPayload;
          setScenes(scenesResponse.ok && Array.isArray(scenesData.scenes) ? scenesData.scenes : []);
        }
      } catch (err) {
        updateToolSettings({
          story: patchRoleplayStoryBeat(writingStory, introBeat, { stillStatus: 'error' }),
        });
        throw err;
      }
    },
    [commitStill, requestBody, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
    if (!hasReferenceImage) {
      setError('Capture a plate first.');
      return;
    }
    setBioLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('bio')),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok || !data.bio) {
        throw new Error(data.error ?? 'Could not write a bio.');
      }
      await beginStoryFromBio(data.bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a bio.');
    } finally {
      setBioLoading(false);
    }
  }, [beginStoryFromBio, hasReferenceImage, requestBody]);
  return {
    mounted,
    shared,
    toolSettings,
    updateToolSettings,
    plates,
    activePlate,
    scenes,
    setScenes,
    error,
    setError,
    bioLoading,
    setBioLoading,
    playingId,
    setPlayingId,
    isolating,
    ownBibleOpen,
    setOwnBibleOpen,
    personaId,
    tone,
    content,
    playAs,
    isolateSubject,
    bio,
    story,
    storyRef,
    storyProgress,
    autoQueue,
    beatOutput,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate,
    cutRoleplayFilm,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
    actions,
    beatQueue,
    wardrobe,
    requestBody,
    queueStillOptions,
    commitStill,
    beginStoryFromBio,
    hasReferenceImage,
    referenceImageUrl,
    writeBio,
    autoIsolateAttemptedRef,
    setPlates,
    setActivePlate,
  };
}

export type MobilePlayToolOrchestrationCore = ReturnType<typeof useMobilePlayToolOrchestrationCore>;
