'use client';

import { useEffect, useRef } from 'react';
import { applyCharacterRecord, getCharacter, getCharacterLookPack } from '@/lib/character-os';
import { roleplayLookPlateFieldsFromCharacter } from '@/lib/fitting-room';
import { applyLookPackToRoleplaySettings, loadLookPack, saveLookPack } from '@/lib/look-pack';
import type { SharedToolSettings, RoleplayToolCache } from '@/lib/settings-cache';

type UseRoleplayLookPackDeepLinkOptions = {
  mounted: boolean;
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  onMessage?: (message: string) => void;
};

export function useRoleplayLookPackDeepLink({
  mounted,
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
    const characterId = params.get('character')?.trim();
    const wardrobeId = params.get('wardrobe')?.trim();
    const lookPackId = params.get('lookPack')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';

    if (characterId) {
      const record = getCharacter(characterId);
      if (record) {
        updateShared(applyCharacterRecord(record));
      } else {
        onMessage?.(
          'That Cast character isn’t on this device — pick one here or open Film to create one.'
        );
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
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
  }, [mounted, onMessage, updateShared, updateToolSettings]);
}
