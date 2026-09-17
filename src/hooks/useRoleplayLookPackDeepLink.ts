'use client';

import { useEffect, useRef } from 'react';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import {
  applyCharacterRecord,
  applyCharacterRecordFresh,
  getCharacter,
  getCharacterLookPack,
} from '@/lib/character-os';
import { roleplayLookPlateFieldsFromCharacter } from '@/lib/fitting-room';
import { applyLookPackToRoleplaySettings, loadLookPack, saveLookPack } from '@/lib/look-pack';
import {
  resolveRoleplayContinueFromCharacter,
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

export function useRoleplayLookPackDeepLink({
  mounted,
  activeCharacterId,
  activeSessionId,
  updateShared,
  updateToolSettings,
  onMessage,
}: UseRoleplayLookPackDeepLinkOptions) {
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const queryCharacterId = params.get('character')?.trim() || '';
    const wardrobeId = params.get('wardrobe')?.trim();
    const lookPackId = params.get('lookPack')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';
    const liveStory = loadToolSettings('roleplay', DEFAULT_ROLEPLAY_TOOL_CACHE);

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
      } else if (shouldSyncRoleplaySessionToCharacter(characterId, activeSessionId)) {
        const result = resolveRoleplayContinueFromCharacter(characterId);
        if (result.ok) {
          // Don't wipe an in-progress Story reel when binding Cast identity —
          // synthesize-from-Cast returns bio-only with an empty story.
          const liveHasReel = roleplayWatchPlaylist(liveStory.story ?? []).length > 0;
          if (liveHasReel) {
            const sessionId =
              result.cache.activeSessionId ??
              roleplayLibraryIdForCharacter(characterId) ??
              liveStory.activeSessionId;
            updateToolSettings({
              ...withRoleplayCacheFromCastCharacter(liveStory, record),
              activeSessionId: sessionId,
            });
          } else {
            updateToolSettings(result.cache);
          }
          updateShared(applyCharacterRecordFresh(record));
        } else if (queryCharacterId) {
          onMessage?.(result.message);
          updateShared(applyCharacterRecord(record));
          updateToolSettings(withRoleplayCacheFromCastCharacter(liveStory, record));
        } else {
          // Nav entry: still bind shared Cast identity even if Story bio can’t synthesize yet.
          updateShared(applyCharacterRecordFresh(record));
          updateToolSettings(withRoleplayCacheFromCastCharacter(liveStory, record));
        }
      } else {
        // Same Cast session — still refresh bible/persona from Cast (source of truth).
        updateShared(applyCharacterRecord(record));
        updateToolSettings(withRoleplayCacheFromCastCharacter(liveStory, record));
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
  }, [mounted, activeCharacterId, activeSessionId, onMessage, updateShared, updateToolSettings]);
}
