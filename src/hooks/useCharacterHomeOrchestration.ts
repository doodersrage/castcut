'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BROWSER_STORAGE_HEALTH_EVENT, whenBrowserStorageReady } from '@/lib/browser-storage';
import { isAssembledFilmEntry } from '@/lib/character-film';
import {
  activateLook,
  activeLook,
  addLookFromShared,
  addCharacterLookPack,
  applyCharacterRecord,
  applyCharacterRecordFresh,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  lookPacksOf,
  looksOf,
  forgetCharacterRecord,
  removeLook,
  removeCharacterLookPack,
  subscribeCharacters,
  toggleLookKeeper,
} from '@/lib/character-os';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  clearGalleryCharacterStamp,
  filterComfyGalleryEntries,
  galleryEntryPrimaryMediaKind,
  getGalleryCache,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { unstampForeignCharacterGalleryEntries } from '@/lib/gallery-character-stamp';
import { buildGalleryHandoff, galleryHandoffPath, saveGalleryHandoff } from '@/lib/gallery-handoff';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { selectCharacterKeepers } from '@/lib/gallery-lora-dataset-export';
import {
  deleteRoleplayLibrarySession,
  resolveRoleplayContinueFromCharacter,
} from '@/lib/roleplay-library';
import { loadSettingsCache, saveSharedSettings, saveToolSettings } from '@/lib/settings-cache';
import {
  downloadLookPackFile,
  lookPackDayHref,
  lookPackFittingHref,
  parseLookPackFile,
  saveLookPack,
} from '@/lib/look-pack';
import { applyCastLookPlateFromSource, clearCharacterLookPlate } from '@/lib/look-outfit-plate';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { playCampaignHref } from '@/lib/play-campaign';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { buildCastHomeStatus } from '@/lib/cast-home-status';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { useHydrated } from '@/hooks/useHydrated';

export type MediaTab = 'all' | 'stills' | 'clips' | 'films' | 'keepers';

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

/** Cast home tabs — the page was nine stacked sections (about 5,000px on a phone). */
export const CHARACTER_HOME_TABS = ['overview', 'bible', 'film', 'more'] as const;
export type CharacterHomeTab = (typeof CHARACTER_HOME_TABS)[number];

export function isCharacterHomeTab(value: string | null | undefined): value is CharacterHomeTab {
  return (CHARACTER_HOME_TABS as readonly string[]).includes(value ?? '');
}

export function useCharacterHomeOrchestration(characterId: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  const [lookName, setLookName] = useState('');
  const [mediaTab, setMediaTab] = useState<MediaTab>('all');
  const [homeTab, setHomeTab] = useState<CharacterHomeTab>('overview');
  const [continueError, setContinueError] = useState<string | null>(null);
  const [lookPackStatus, setLookPackStatus] = useState<string | null>(null);
  const [plateUploading, setPlateUploading] = useState(false);
  const [plateStatus, setPlateStatus] = useState<string | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);
  const lookPackFileRef = useRef<HTMLInputElement | null>(null);
  const { softAdvance, cancelSoftAdvance, softAdvanceHref } = usePlaySoftAdvance();

  useEffect(() => {
    const media = searchParams.get('media')?.trim().toLowerCase();
    if (
      media === 'all' ||
      media === 'stills' ||
      media === 'clips' ||
      media === 'films' ||
      media === 'keepers'
    ) {
      scheduleAfterCommit(() => {
        setMediaTab(media);
        // Media lives on the Film & media tab.
        setHomeTab('film');
      });
      return;
    }
    const tab = searchParams.get('tab')?.trim().toLowerCase();
    if (isCharacterHomeTab(tab)) {
      scheduleAfterCommit(() => setHomeTab(tab));
    }
  }, [searchParams]);

  // The Cast store lives in browser storage: the server (and the hydration pass) can't see it,
  // so hold the page until mounted instead of rendering "Character not found" then swapping.
  const hydrated = useHydrated();
  const character = hydrated
    ? (characters.find(entry => entry.id === characterId) ?? getCharacter(characterId))
    : undefined;

  // Opening a Cast profile activates that Cast so nav → Story/Film/Outfit matches profile CTAs.
  useEffect(() => {
    const id = characterId.trim();
    if (!id) {
      return;
    }
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      const record = getCharacter(id);
      if (!record) {
        return;
      }
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(record),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    unstampForeignCharacterGalleryEntries();
  }, []);

  const looks = character ? looksOf(character) : [];
  const savedLookPacks = character ? lookPacksOf(character) : [];
  const currentLook = character ? activeLook(character) : undefined;
  const lookPlate = resolveFittingPlateFromCharacter(character);
  const entries = useMemo(
    () => filterComfyGalleryEntries(gallery, { characterId }),
    [gallery, characterId]
  );
  const lookKeeperIds = currentLook?.keeperEntryIds;
  const keepers = selectCharacterKeepers(
    gallery,
    characterId,
    lookKeeperIds !== undefined ? { keeperIds: lookKeeperIds } : undefined
  );
  const fallbackKeeperIds = selectCharacterKeepers(gallery, characterId).map(entry => entry.id);
  const lastClip = useMemo(
    () =>
      [...entries]
        .reverse()
        .find(
          entry =>
            entry.status === 'completed' &&
            isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) }) &&
            !isAssembledFilmEntry(entry)
        ),
    [entries]
  );
  const filmEntries = useMemo(
    () => entries.filter(entry => isAssembledFilmEntry(entry)),
    [entries]
  );
  const clipEntries = useMemo(
    () =>
      entries.filter(entry => {
        const kind = galleryEntryPrimaryMediaKind(entry);
        return isGalleryClipEntry({ ...entry, mediaKind: kind }) && !isAssembledFilmEntry(entry);
      }),
    [entries]
  );
  const stillEntries = useMemo(
    () =>
      entries.filter(entry => {
        const kind = galleryEntryPrimaryMediaKind(entry);
        return !isGalleryClipEntry({ ...entry, mediaKind: kind });
      }),
    [entries]
  );
  const visible =
    mediaTab === 'keepers'
      ? keepers
      : mediaTab === 'films'
        ? filmEntries
        : mediaTab === 'stills'
          ? stillEntries
          : mediaTab === 'clips'
            ? clipEntries
            : entries;

  const persistApply = (next = character) => {
    if (!next) {
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(next),
    });
  };

  const go = (href: string) => {
    persistApply();
    router.push(href);
  };

  const removeFromCast = () => {
    if (!character) {
      return;
    }
    if (
      !window.confirm(
        `Remove ${character.name} from the cast? Looks on this record go with it. Gallery stills stay in the gallery.`
      )
    ) {
      return;
    }
    const { roleplaySessionId } = forgetCharacterRecord(character.id);
    if (roleplaySessionId) {
      deleteRoleplayLibrarySession(roleplaySessionId);
    }
    router.push('/characters');
  };

  const importLookPack = (file: File) => {
    if (!character) {
      return;
    }
    void parseLookPackFile(file).then(portable => {
      if (!portable) {
        setLookPackStatus('That file is not a Castcut look pack.');
        return;
      }
      addCharacterLookPack(character.id, portable.name || 'Imported look', portable.pack);
      setLookPackStatus(`Imported "${portable.name || 'look pack'}".`);
    });
  };

  const continueRoleplay = () => {
    if (!character) {
      return;
    }
    persistApply();
    const result = resolveRoleplayContinueFromCharacter(character.id);
    if (!result.ok) {
      setContinueError(result.message);
      return;
    }
    setContinueError(null);
    saveToolSettings('roleplay', result.cache);
    go(`/story?character=${encodeURIComponent(character.id)}`);
  };

  const extendReel = () => {
    if (!lastClip) {
      return;
    }
    persistApply();
    saveGalleryHandoff(buildGalleryHandoff(lastClip, 'video'));
    router.push(galleryHandoffPath('video'));
  };

  const animateStill = (entry: ComfyGalleryEntry) => {
    persistApply();
    saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
    router.push(galleryHandoffPath('video'));
  };

  const toggleKeeper = (entryId: string) => {
    if (!character || !currentLook) {
      return;
    }
    persistApply(
      toggleLookKeeper(character.id, currentLook.id, entryId, {
        fallbackIds: fallbackKeeperIds,
      })
    );
  };

  const removeFromCharacter = (entry: ComfyGalleryEntry) => {
    if (currentLook && keepers.some(keeper => keeper.id === entry.id)) {
      toggleKeeper(entry.id);
    }
    clearGalleryCharacterStamp([entry.id]);
  };

  const applyLookPlate = useCallback(
    async (input: { file?: File | null; imageUrl?: string; filename?: string }) => {
      if (!character) {
        return false;
      }
      setPlateUploading(true);
      setPlateError(null);
      setPlateStatus(input.file ? 'Uploading look plate…' : 'Applying look plate…');
      try {
        const result = await applyCastLookPlateFromSource({
          characterId: character.id,
          file: input.file,
          imageUrl: input.imageUrl,
          filename: input.filename,
          isolate: true,
          model: loadSettingsCache().shared.model,
        });
        persistApply(result.character);
        setPlateStatus(
          result.isolated ? 'Look plate saved (isolated on white).' : 'Look plate saved.'
        );
        softAdvanceHref(
          `/fitting?character=${encodeURIComponent(character.id)}`,
          'Outfit',
          'Look plate ready — continuing to Outfit (or stay on Cast)',
          [
            {
              href: `/day?character=${encodeURIComponent(character.id)}`,
              label: 'Go to Day instead',
            },
          ]
        );
        return true;
      } catch (err) {
        setPlateStatus(null);
        setPlateError(err instanceof Error ? err.message : 'Could not update the look plate.');
        return false;
      } finally {
        setPlateUploading(false);
      }
    },
    [character, softAdvanceHref]
  );

  const clearLookPlate = useCallback(() => {
    if (!characterId) {
      return;
    }
    const record = getCharacter(characterId);
    if (!record) {
      return;
    }
    if (
      !window.confirm(
        `Remove the look plate for ${record.name}? Outfit and Day will need a new plate.`
      )
    ) {
      return;
    }
    const cleared = clearCharacterLookPlate(characterId);
    if (cleared) {
      const next = getCharacter(characterId);
      if (next) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecordFresh(next),
        });
      }
      setPlateStatus('Look plate removed.');
      setPlateError(null);
    } else {
      setPlateError('Nothing to remove — no look plate on this Cast.');
    }
  }, [characterId]);

  const onGalleryPlateHandoff = useCallback(
    async (handoff: {
      file: File | null;
      previewUrl: string | null;
      payload: { imageUrl?: string; imageFilename?: string; characterId?: string };
    }) => {
      // Wrong Cast page — consume so we do not retry forever.
      if (handoff.payload.characterId && handoff.payload.characterId !== characterId) {
        return true;
      }
      if (!characterId || !getCharacter(characterId)) {
        return false;
      }
      return applyLookPlate({
        file: handoff.file,
        imageUrl: handoff.payload.imageUrl || handoff.previewUrl || undefined,
        filename: handoff.payload.imageFilename,
      });
    },
    [applyLookPlate, characterId]
  );

  useGalleryHandoff('cast', onGalleryPlateHandoff, { ready: Boolean(characterId) });

  const hasLookPlate = Boolean(
    lookPlate?.imageUrl?.trim() ||
    lookPlate?.filename?.trim() ||
    character?.reference?.originalUrl?.trim() ||
    character?.reference?.isolatedUrl?.trim()
  );
  const castStatus = buildCastHomeStatus({
    hasPlate: hasLookPlate,
    personaId: character?.personaId,
    customPersona: character?.customPersona,
    lookCount: looks.length,
    filmCount: filmEntries.length,
    stillCount: stillEntries.length,
    plateStatus,
    plateError,
  });

  return {
    hydrated,
    homeTab,
    setHomeTab,
    character,
    router,
    lookName,
    setLookName,
    mediaTab,
    setMediaTab,
    continueError,
    lookPackStatus,
    lookPackFileRef,
    looks,
    savedLookPacks,
    currentLook,
    lookPlate,
    hasLookPlate,
    castStatus,
    softAdvance,
    cancelSoftAdvance,
    plateUploading,
    plateStatus,
    plateError,
    applyLookPlate,
    clearLookPlate,
    entries,
    keepers,
    fallbackKeeperIds,
    lastClip,
    filmEntries,
    clipEntries,
    stillEntries,
    visible,
    persistApply,
    go,
    removeFromCast,
    importLookPack,
    continueRoleplay,
    extendReel,
    animateStill,
    toggleKeeper,
    removeFromCharacter,
    downloadLookPackFile,
    lookPackFittingHref,
    lookPackDayHref,
    saveLookPack,
    playCampaignHref,
    continueClipActionLabel,
    loadEngineSettings,
    galleryEntryPrimaryViewUrl,
    removeCharacterLookPack,
    activateLook,
    removeLook,
    addLookFromShared,
    loadSettingsCache,
  };
}
