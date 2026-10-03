'use client';

import { realKitId } from '@/lib/outfit-handoff';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import {
  applyCharacterRecord,
  getCharacter,
  getCharacterLookPack,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character-os';
import { roleplayLookPlateFieldsFromCharacter } from '@/lib/fitting-room';
import { applyLookPackToRoleplaySettings, loadLookPack, saveLookPack } from '@/lib/look-pack';
import {
  persistRoleplayLibraryFromCache,
  resolveRoleplayContinueFromCharacter,
  startNewRoleplaySession,
  roleplayLibraryIdForCharacter,
  shouldSyncRoleplaySessionToCharacter,
  withRoleplayCacheFromCastCharacter,
} from '@/lib/roleplay-library';
import { resolvePlayLoopEntryCharacterId } from '@/lib/play-campaign';
import {
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  loadToolSettings,
  type SharedToolSettings,
  type RoleplayToolCache,
} from '@/lib/settings-cache';

type UseRoleplayLookPackDeepLinkOptions = {
  mounted: boolean;
  activeCharacterId?: string | null;
  activeSessionId?: string | null;
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  onMessage?: (message: string) => void;
};

/**
 * Point Story at a Cast lead: its own library session (or one made from the Cast), its bible,
 * Part and picture. A reel in progress for this lead is kept; a reel that belongs to another lead
 * is saved to the library first and replaced, so the new lead never inherits the old one's bible
 * or picture.
 */
function bindStoryToCast(
  record: NonNullable<ReturnType<typeof getCharacter>>,
  options: {
    activeSessionId?: string | null;
    fromQuery: boolean;
    updateShared: (patch: Partial<SharedToolSettings>) => void;
    updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
    onMessage?: (message: string) => void;
  }
): void {
  const { updateShared, updateToolSettings } = options;
  const characterId = record.id;
  const liveStory = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);
  if (!shouldSyncRoleplaySessionToCharacter(characterId, options.activeSessionId)) {
    // Same Cast session — still refresh bible/persona from Cast (source of truth).
    updateShared(applyCharacterRecord(record));
    updateToolSettings(withRoleplayCacheFromCastCharacter(liveStory, record));
    return;
  }
  const expectedSession = roleplayLibraryIdForCharacter(characterId);
  // The live draft is another lead's when it is tied to another session and its bible names
  // someone else. Without this check a new Cast took over the previous lead's bible and picture.
  const liveName = liveStory.bio?.name?.trim().toLowerCase() || '';
  const castNames = [record.name, record.characterName, record.bio?.name]
    .map(name => name?.trim().toLowerCase())
    .filter(Boolean);
  const liveIsAnotherLead =
    Boolean(liveStory.activeSessionId?.trim()) &&
    liveStory.activeSessionId !== expectedSession &&
    Boolean(liveName) &&
    !castNames.includes(liveName);
  if (liveIsAnotherLead) {
    persistRoleplayLibraryFromCache(liveStory);
  }
  const result = resolveRoleplayContinueFromCharacter(characterId);
  if (result.ok) {
    // Don't wipe an in-progress Story reel when binding Cast identity —
    // synthesize-from-Cast returns bio-only with an empty story.
    const liveHasReel =
      !liveIsAnotherLead && roleplayWatchPlaylist(liveStory.story ?? []).length > 0;
    if (liveHasReel) {
      const sessionId =
        result.cache.activeSessionId ?? expectedSession ?? liveStory.activeSessionId;
      updateToolSettings({
        ...withRoleplayCacheFromCastCharacter(liveStory, record),
        activeSessionId: sessionId,
      });
    } else {
      updateToolSettings(result.cache);
    }
    // Not the "fresh" variant: binding the Cast that is already active must keep its face lock
    // and strength (they were cleared on every Story visit); a switch clears them anyway.
    updateShared(applyCharacterRecord(record));
    return;
  }
  const base = liveIsAnotherLead
    ? { ...startNewRoleplaySession(liveStory), activeSessionId: expectedSession ?? undefined }
    : liveStory;
  if (options.fromQuery) {
    options.onMessage?.(result.message);
    updateShared(applyCharacterRecord(record));
  } else {
    // Nav entry: still bind shared Cast identity even if Story bio can’t synthesize yet.
    updateShared(applyCharacterRecord(record));
  }
  updateToolSettings(withRoleplayCacheFromCastCharacter(base, record));
}

export function useRoleplayLookPackDeepLink({
  mounted,
  activeCharacterId,
  activeSessionId,
  updateShared,
  updateToolSettings,
  onMessage,
}: UseRoleplayLookPackDeepLinkOptions) {
  const deepLinkHandled = useRef(false);
  const boundCastRef = useRef<string | null>(null);
  // The Cast list can load a moment after the page. Binding Story to the active Cast before it
  // had loaded found no record, gave up for good, and left the previous lead's bible and picture
  // in place under the new lead's name ("Continue as Gloovi" with Tomas active).
  const castRoster = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const queryCharacterId = params.get('character')?.trim() || '';
    const pendingCastId = queryCharacterId || activeCharacterId?.trim() || '';
    if (pendingCastId && castRoster.length === 0 && !getCharacter(pendingCastId)) {
      // Not loaded yet — this runs again when the Cast list arrives.
      return;
    }
    deepLinkHandled.current = true;
    // 'custom-garment' (a clothing-photo try-on) is not a kit.
    const wardrobeId = realKitId(params.get('wardrobe')) || undefined;
    const lookPackId = params.get('lookPack')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';
    const characterId = resolvePlayLoopEntryCharacterId({
      queryCharacterId,
      activeCharacterId,
    });

    if (characterId) {
      const record = getCharacter(characterId);
      if (!record) {
        if (queryCharacterId) {
          onMessage?.(
            'That Cast character isn’t on this device — pick one here or open Film to create one.'
          );
        }
      } else {
        boundCastRef.current = characterId;
        bindStoryToCast(record, {
          activeSessionId,
          fromQuery: Boolean(queryCharacterId),
          updateShared,
          updateToolSettings,
          onMessage,
        });
      }
    }

    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
      updateToolSettings({ wardrobeId });
    }

    let pack = fromLook ? loadLookPack({ clear: true }) : null;
    if (!pack && lookPackId && characterId) {
      pack = getCharacterLookPack(characterId, lookPackId)?.pack ?? null;
      if (pack) {
        saveLookPack(pack);
      } else {
        onMessage?.('Look pack from the link wasn’t found — continue with defaults.');
      }
    }
    if (fromLook && !pack && !lookPackId) {
      onMessage?.('No staged look found — extract one on Look, or continue with defaults.');
    }
    if (pack) {
      const applied = applyLookPackToRoleplaySettings(pack);
      updateShared(applied.shared);
      updateToolSettings(applied.tool);
      if (pack.wardrobeId?.trim() && !wardrobeId) {
        updateShared({ lockedWardrobeId: pack.wardrobeId.trim() });
      }
    }

    // Look → Story: seed Cast look/outfit plate as From photo (not Look tiles).
    if (fromLook) {
      const plateCharacterId = characterId || pack?.characterId?.trim();
      if (plateCharacterId) {
        const plate = roleplayLookPlateFieldsFromCharacter(getCharacter(plateCharacterId));
        if (plate) {
          updateToolSettings(plate);
        }
      }
    }
  }, [
    mounted,
    activeCharacterId,
    activeSessionId,
    castRoster,
    onMessage,
    updateShared,
    updateToolSettings,
  ]);

  // The active Cast can change after the page opened: picked on another tab, or (on a fresh
  // browser or a phone) arriving from the server a moment after the first render, when this page
  // had already bound Story to no one. Bind again whenever it changes.
  useEffect(() => {
    if (!mounted || !deepLinkHandled.current) {
      return;
    }
    const id = activeCharacterId?.trim();
    if (!id || id === boundCastRef.current) {
      return;
    }
    const record = getCharacter(id);
    if (!record) {
      return;
    }
    boundCastRef.current = id;
    bindStoryToCast(record, {
      activeSessionId,
      fromQuery: false,
      updateShared,
      updateToolSettings,
      onMessage,
    });
  }, [
    mounted,
    activeCharacterId,
    activeSessionId,
    castRoster,
    onMessage,
    updateShared,
    updateToolSettings,
  ]);
}
