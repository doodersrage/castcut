'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BROWSER_STORAGE_HEALTH_EVENT } from '@/lib/browser-storage';
import { isAssembledFilmEntry } from '@/lib/character-film';
import {
  activateLook,
  activeLook,
  addLookFromShared,
  addCharacterLookPack,
  applyCharacterRecord,
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
import { playCampaignHref } from '@/lib/play-campaign';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';

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
  const [continueError, setContinueError] = useState<string | null>(null);
  const [lookPackStatus, setLookPackStatus] = useState<string | null>(null);
  const lookPackFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const media = searchParams.get('media')?.trim().toLowerCase();
    if (
      media === 'all' ||
      media === 'stills' ||
      media === 'clips' ||
      media === 'films' ||
      media === 'keepers'
    ) {
      scheduleAfterCommit(() => setMediaTab(media));
    }
  }, [searchParams]);

  const character = characters.find(entry => entry.id === characterId) ?? getCharacter(characterId);

  useEffect(() => {
    unstampForeignCharacterGalleryEntries();
  }, []);

  const looks = character ? looksOf(character) : [];
  const savedLookPacks = character ? lookPacksOf(character) : [];
  const currentLook = character ? activeLook(character) : undefined;
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
    go('/roleplay');
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

  return {
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
