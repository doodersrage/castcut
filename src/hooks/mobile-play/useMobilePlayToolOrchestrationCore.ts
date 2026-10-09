'use client';

import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import {
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import { roleplayLookPlateFieldsFromCharacter } from '@/lib/fitting-room';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useStorySessionGuard } from '@/hooks/roleplay/useStorySessionGuard';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRoleplayBeatQueue } from '@/hooks/useRoleplayBeatQueue';
import { useRoleplayBioFlow } from '@/hooks/useRoleplayBioFlow';
import { useRoleplayLookPackDeepLink } from '@/hooks/useRoleplayLookPackDeepLink';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { useRoleplayWardrobe } from '@/hooks/useRoleplayWardrobe';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  IDENTITY_MEDIA_URL,
  persistOwnedPlateImage,
  sessionPlateMediaId,
} from '@/lib/gallery-media-client';
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
  formatRoleplayStoryProgress,
  mergeRoleplayRejectedScenes,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  resolveRoleplayToneAndContent,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { normalizeRoleplayBeatOutput } from '@/lib/roleplay-film';
import { persistRoleplayLibraryFromCache } from '@/lib/roleplay-library';
import {
  DEFAULT_MOBILE_STUDIO_TOOL_CACHE,
  loadToolSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
} from '@/lib/settings-cache';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/play-settings';
import { buildRoleplayRequestBody, resolveRoleplayWardrobeFields } from '@/lib/roleplay-play-core';
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
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings: updateToolSettingsUnguarded,
  } = useCachedSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  const [plates, setPlates] = useState<CharacterPlate[]>([]);
  const [activePlate, setActivePlate] = useState<CharacterPlate | null>(null);
  const [scenes, setScenes] = useState<RoleplayScene[]>([]);
  const story = toolSettings.story ?? EMPTY_STORY;
  const storyRef = useRef(story);
  useEffect(() => {
    storyRef.current = story;
  }, [story]);
  // One Cast's scenes never land in another Cast's session (as desk Story).
  const clearScenes = useCallback(() => setScenes([]), []);
  const { updateToolSettings, sessionRef } = useStorySessionGuard({
    activeSessionId: toolSettings.activeSessionId,
    storyRef,
    updateToolSettings: updateToolSettingsUnguarded,
    onSessionChange: clearScenes,
  });
  const [error, setError] = useState<string | null>(null);
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

  const personaId = toolSettings.personaId ?? '';
  // As on desk: with the adult gate off, a saved adult rating plays as the clean one.
  const adultEnabled = useNsfwGeneratorEnabled();
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content, {
    adultEnabled,
  });
  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const isolateSubject = normalizeRoleplayIsolateSubject(toolSettings.isolateSubject);
  const bio = toolSettings.bio;
  const storyProgress = formatRoleplayStoryProgress(story);
  const autoQueue = toolSettings.autoQueue === true;
  const beatOutput = normalizeRoleplayBeatOutput(toolSettings.beatOutput);
  const {
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    firstCutCelebrate,
    clearFirstCutCelebrate,
    cutRoleplayFilm,
    cutProblems,
    resolveCutProblems,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
    filmCutOptions,
    setFilmCutOptions,
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

  // Take the active Cast's look plate when Story has none (as desk Story does). Without this the
  // phone page said "no plate" and blocked rolling until desk Story had been opened once in the
  // same browser. Re-runs when the Cast roster arrives (it can hydrate after this page mounts).
  const castRoster = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  useEffect(() => {
    if (!mounted || hasReferenceImage) {
      return;
    }
    const characterId = shared.activeCharacterId?.trim();
    if (!characterId) {
      return;
    }
    const fields = roleplayLookPlateFieldsFromCharacter(getCharacter(characterId));
    if (fields) {
      updateToolSettings(fields);
    }
  }, [castRoster, hasReferenceImage, mounted, shared.activeCharacterId, updateToolSettings]);

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
        const cutoutDurable = await persistOwnedPlateImage({
          mediaId: sessionPlateMediaId('story'),
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
        intimateMix: toolSettings.intimateMix,
        lead: getCharacter(shared.activeCharacterId),
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
      toolSettings.intimateMix,
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

  // The bible flow desk Story uses: same guards, same still write (and its clip-only mode).
  const bioFlow = useRoleplayBioFlow({
    storyRef,
    updateToolSettings,
    requestBody,
    commitStill,
    skipStillForClip: beatQueue.skipStillForClip,
    autoQueue,
    // The phone page plays From photo only.
    playAsResolved: 'photo',
    photoOnly: true,
    hasReferenceImage,
    setError,
    setScenes,
    setOwnBibleOpen,
    referenceMissingMessage: 'Capture a plate first.',
    sessionRef,
  });
  const { bioLoading, writeBio, applyOwnBible } = bioFlow;

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
    sessionRef,
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
    cutProblems,
    resolveCutProblems,
    saveFilmToCast,
    shareLastCut,
    filmError,
    filmGuideHref,
    filmCutOptions,
    setFilmCutOptions,
    actions,
    beatQueue,
    wardrobe,
    requestBody,
    queueStillOptions,
    commitStill,
    hasReferenceImage,
    referenceImageUrl,
    writeBio,
    applyOwnBible,
    autoIsolateAttemptedRef,
    setPlates,
    setActivePlate,
  };
}

export type MobilePlayToolOrchestrationCore = ReturnType<typeof useMobilePlayToolOrchestrationCore>;
