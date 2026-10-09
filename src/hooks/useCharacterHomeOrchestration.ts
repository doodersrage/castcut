'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BROWSER_STORAGE_HEALTH_EVENT, whenBrowserStorageReady } from '@/lib/browser-storage';
import { isAssembledFilmEntry } from '@/lib/character-film';
import {
  activeLook,
  applyCharacterRecord,
  applyCharacterRecordFresh,
  getCharacter,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  looksOf,
  forgetCharacterRecord,
  renameLook,
  subscribeCharacters,
  toggleLookKeeper,
} from '@/lib/character-os';
import { addCharacterLookPack, lookPacksOf, removeCharacterLookPack } from '@/lib/play-cast';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  clearGalleryCharacterStamp,
  filterComfyGalleryEntries,
  galleryEntryPrimaryMediaKind,
  getGalleryCache,
  initGalleryStore,
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
  getRoleplayLibrarySession,
  resolveRoleplayContinueFromCharacter,
  roleplayLibraryIdForCharacter,
} from '@/lib/roleplay-library';
import {
  SETTINGS_CACHE_UPDATED_EVENT,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
} from '@/lib/settings-cache';
import { DEFAULT_DAY_TOOL_CACHE } from '@/lib/play-settings';
import {
  downloadLookPackFile,
  lookPackDayHref,
  lookPackFittingHref,
  parseLookPackFile,
  saveLookPack,
} from '@/lib/look-pack';
import { applyCastLookPlateFromSource, clearCharacterLookPlate } from '@/lib/look-outfit-plate';
import { addBlankCastLook, removeCastPlate, switchCastPlate } from '@/lib/cast-plate-switch';
import { castPlateTiles, nextCastLookName } from '@/lib/character-plate-thumb';
import { fetchClothingLabels } from '@/lib/clothing-catalog-client';
import {
  prepareCastPlate,
  restoreCastPlateSnapshot,
  type CastPlatePrepareOptions,
  type CastPlateSnapshot,
} from '@/lib/cast-plate-prepare';
import { dayPartnerNoun } from '@/lib/day-partner';
import { usePlateStance } from '@/hooks/usePlateStance';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { playCampaignHref } from '@/lib/play-campaign';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { buildCastHomeStatus } from '@/lib/cast-home-status';
import { castChecklist, countCastDayStills } from '@/lib/cast-checklist';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { useHydrated } from '@/hooks/useHydrated';
import {
  isSettingsSyncedWithServer,
  SETTINGS_SYNCED_WITH_SERVER_EVENT,
} from '@/lib/settings-push-flush';

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
  /** Bumped when outfit-lock labels arrive from the catalog (tiles read them from its cache). */
  const [, setOutfitLabelsLoaded] = useState(0);
  const [mediaTab, setMediaTab] = useState<MediaTab>('all');
  const [homeTab, setHomeTab] = useState<CharacterHomeTab>('overview');
  const [continueError, setContinueError] = useState<string | null>(null);
  const [lookPackStatus, setLookPackStatus] = useState<string | null>(null);
  const [plateUploading, setPlateUploading] = useState(false);
  const [plateStatus, setPlateStatus] = useState<string | null>(null);
  const [plateError, setPlateError] = useState<string | null>(null);
  /** The plate as it was before "Prepare plate" — offered back as Undo. */
  const [plateUndo, setPlateUndo] = useState<CastPlateSnapshot | null>(null);
  /** The prepared plate's face scored under the bar against the one before. */
  const [plateFaceDrift, setPlateFaceDrift] = useState(false);
  const lookPackFileRef = useRef<HTMLInputElement | null>(null);
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance();

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
  // A fresh browser (new phone, cleared site data) gets its Cast from the first server pull —
  // keep loading until that lands (or a short timeout) instead of flashing "not found".
  const [serverSyncSettled, setServerSyncSettled] = useState(() => isSettingsSyncedWithServer());
  useEffect(() => {
    if (serverSyncSettled) {
      return;
    }
    const settle = () => setServerSyncSettled(true);
    window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, settle);
    const timer = window.setTimeout(settle, 8000);
    return () => {
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, settle);
      window.clearTimeout(timer);
    };
  }, [serverSyncSettled]);
  const castReady = hydrated && (Boolean(character) || serverSyncSettled);
  // The checklist reads Day's and Story's saved state, which loads from browser storage after
  // the first render — recount when it arrives or changes (it read the empty defaults before).
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const bump = () => setSettingsTick(tick => tick + 1);
    void whenBrowserStorageReady().then(() => {
      if (!cancelled) bump();
    });
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
    };
  }, []);

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

  // This page reads the gallery from memory (getGalleryCache), so it must load it: nothing else
  // here did, and the media list stayed empty ("Nothing stamped yet") until an unrelated save
  // happened to load it — never without server storage. The clean-up waits for the load too, so
  // it edits the real gallery rather than an empty cache.
  useEffect(() => {
    let cancelled = false;
    void initGalleryStore().then(() => {
      if (!cancelled) {
        unstampForeignCharacterGalleryEntries();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const looks = character ? looksOf(character) : [];
  const lookWardrobeIds = [
    ...new Set(looks.map(look => look.lockedWardrobeId?.trim() || '').filter(Boolean)),
  ].join(',');
  useEffect(() => {
    if (!lookWardrobeIds) {
      return;
    }
    let cancelled = false;
    void fetchClothingLabels(lookWardrobeIds.split(',')).then(() => {
      if (!cancelled) {
        setOutfitLabelsLoaded(count => count + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lookWardrobeIds]);
  const savedLookPacks = character ? lookPacksOf(character) : [];
  const currentLook = character ? activeLook(character) : undefined;
  const lookPlate = resolveFittingPlateFromCharacter(character);
  const plateStance = usePlateStance({
    characterId: character?.id,
    look: currentLook,
    plate: lookPlate,
    paused: plateUploading,
  });
  const plateSubjectNoun = character ? dayPartnerNoun(character) : 'person';
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
    async (input: {
      file?: File | null;
      imageUrl?: string;
      filename?: string;
      /** Keep the current plate and add this one as a new look (made active). */
      newPlate?: { name?: string };
    }) => {
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
          ...(input.newPlate ? { newPlate: input.newPlate } : {}),
        });
        persistApply(result.character);
        setPlateUndo(null);
        setPlateFaceDrift(false);
        const saved = input.newPlate
          ? `New look “${input.newPlate.name || 'look'}” made and in use`
          : 'Look plate saved';
        // Stay here to look it over (and Prepare plate) — the upload used to move on to Outfit
        // by itself. The checklist's Next step points onward.
        setPlateStatus(
          `${result.isolated ? `${saved} (isolated on white)` : saved} — look it over, Prepare plate if it needs it, then try outfits.`
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
    [character]
  );

  const prepareLookPlate = async (
    sendComfyUi: Parameters<typeof prepareCastPlate>[0]['sendComfyUi'],
    options: CastPlatePrepareOptions
  ) => {
    if (!character || !lookPlate) {
      return;
    }
    setPlateUploading(true);
    setPlateError(null);
    setPlateFaceDrift(false);
    try {
      const {
        character: next,
        before,
        faceDrift,
      } = await prepareCastPlate({
        characterId: character.id,
        lookId: character.activeLookId,
        plate: lookPlate,
        options,
        noun: plateSubjectNoun,
        model: loadSettingsCache().shared.model,
        sendComfyUi,
        onStatus: setPlateStatus,
      });
      persistApply(next);
      setPlateUndo(before);
      setPlateFaceDrift(faceDrift);
      setPlateStatus('Plate prepared — Undo puts the previous one back.');
    } catch (err) {
      setPlateStatus(null);
      setPlateError(err instanceof Error ? err.message : 'Could not prepare the plate.');
    } finally {
      setPlateUploading(false);
    }
  };

  const undoLookPlatePrepare = async () => {
    if (!character || !plateUndo) {
      return;
    }
    setPlateUploading(true);
    setPlateError(null);
    try {
      persistApply(
        await restoreCastPlateSnapshot({
          characterId: character.id,
          snapshot: plateUndo,
          model: loadSettingsCache().shared.model,
        })
      );
      setPlateUndo(null);
      setPlateFaceDrift(false);
      setPlateStatus('Look plate restored.');
    } catch (err) {
      setPlateError(err instanceof Error ? err.message : 'Could not restore the previous plate.');
    } finally {
      setPlateUploading(false);
    }
  };

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
      setPlateUndo(null);
      setPlateFaceDrift(false);
      setPlateStatus('Look plate removed.');
      setPlateError(null);
    } else {
      setPlateError('Nothing to remove — no look plate on this Cast.');
    }
  }, [characterId]);

  const plateTiles = character ? castPlateTiles(character) : [];

  /** A plate change re-applies the Cast fresh: the old plate's face lock must not stay. */
  const applyPlateChange = (next: ReturnType<typeof getCharacter>, message: string) => {
    if (!next) {
      return;
    }
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecordFresh(next),
    });
    // Undo restored the plate as it was before Prepare — onto whichever plate is active.
    setPlateUndo(null);
    setPlateFaceDrift(false);
    setPlateError(null);
    setPlateStatus(message);
  };

  /** The name a look shows on its tile ("Look 3" for an unnamed one). */
  const lookLabel = (record: NonNullable<typeof character>, lookId: string) =>
    castPlateTiles(record).find(tile => tile.id === lookId)?.label ?? '';

  const selectPlate = (lookId: string) => {
    if (!character || lookId === character.activeLookId) {
      return;
    }
    const next = switchCastPlate(character.id, lookId);
    applyPlateChange(next, `Using the look “${next ? lookLabel(next, activeLook(next).id) : ''}”.`);
  };

  const removeActivePlate = () => {
    if (!character || looks.length < 2) {
      return;
    }
    const target = activeLook(character);
    const label = lookLabel(character, target.id);
    if (
      !window.confirm(
        `Remove the look “${label}” and its plate from ${character.name}? The other looks stay.`
      )
    ) {
      return;
    }
    const next = removeCastPlate(character.id, target.id);
    applyPlateChange(next, `Look “${label}” removed.`);
  };

  /**
   * "New look": a copy of the active look — its outfit lock and description, and its plate as a
   * file of its own (so replacing either plate later leaves the other alone). A look with no
   * plate makes a plate-less copy whose tile offers Add plate.
   */
  const newLookFromCurrent = async () => {
    if (!character || plateUploading) {
      return;
    }
    const name = nextCastLookName(character);
    const source = lookPlate;
    const sourceUrl = source?.imageUrl?.trim() || '';
    if (!source || (!sourceUrl && !source.filename?.trim())) {
      const next = addBlankCastLook(character.id, name);
      applyPlateChange(next, `New look “${name}” made — add its plate.`);
      return;
    }
    setPlateUploading(true);
    setPlateError(null);
    setPlateStatus('Making a new look from this one…');
    try {
      const result = await applyCastLookPlateFromSource({
        characterId: character.id,
        imageUrl: sourceUrl || undefined,
        filename: source.filename,
        // The plate is already what this look uses — copy it as it is.
        isolate: false,
        alreadyIsolated: source.isolated === true,
        model: loadSettingsCache().shared.model,
        newPlate: { name },
      });
      applyPlateChange(result.character, `New look “${name}” made and in use.`);
    } catch (err) {
      setPlateStatus(null);
      setPlateError(err instanceof Error ? err.message : 'Could not make the new look.');
    } finally {
      setPlateUploading(false);
    }
  };

  const renameActivePlate = (name: string) => {
    if (!character) {
      return;
    }
    const target = activeLook(character);
    const nextName = name.trim();
    if (!nextName || nextName === target.name || nextName === lookLabel(character, target.id)) {
      return;
    }
    persistApply(renameLook(character.id, target.id, nextName));
  };

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

  const checklist = useMemo(() => {
    if (!character) {
      return null;
    }
    const traits = Object.values(character.traits ?? {}).some(value =>
      typeof value === 'string' ? value.trim() !== '' : value != null
    );
    const bio = character.bio;
    const storyId = roleplayLibraryIdForCharacter(character.id);
    return castChecklist({
      characterId: character.id,
      plateReady: hasLookPlate,
      // Prepare plate saves its result as read 'prepared' (standing, base layer, white).
      platePrepared: activeLook(character).plateStance?.reason === 'prepared',
      traitsSet: traits,
      bibleWritten: Boolean(bio?.look?.trim() || bio?.personality?.trim()),
      keeperCount: activeLook(character).keeperEntryIds?.length ?? 0,
      dayStillCount: countCastDayStills({
        characterId: character.id,
        activeCharacterId: loadSettingsCache().shared.activeCharacterId,
        // The Day board (and the Cast's parked Days): gallery entries carry no Day marker —
        // Day stills are stored as image-prompt jobs.
        day: loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE),
      }),
      filmCount: filmEntries.length,
      cutShotCount: character.filmCut?.items.filter(item => item.included).length ?? 0,
      storyBeatCount: storyId ? (getRoleplayLibrarySession(storyId)?.beatCount ?? 0) : 0,
    });
  }, [character, hasLookPlate, stillEntries, filmEntries, settingsTick]);

  return {
    hydrated: castReady,
    homeTab,
    setHomeTab,
    character,
    router,
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
    checklist,
    softAdvance,
    cancelSoftAdvance,
    plateUploading,
    plateStatus,
    plateError,
    applyLookPlate,
    clearLookPlate,
    plateTiles,
    selectPlate,
    removeActivePlate,
    renameActivePlate,
    newLookFromCurrent,
    prepareLookPlate,
    undoLookPlatePrepare,
    canUndoPlatePrepare: plateUndo !== null,
    plateFaceDrift,
    plateStance,
    plateSubjectNoun,
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
  };
}
