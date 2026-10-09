'use client';

import { useEffect } from 'react';
import { applyCharacterRecord, upsertCharacterFromRoleplaySession } from '@/lib/character-os';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { type RoleplayToolCache } from '@/lib/play-settings';
import { persistRoleplayLibraryFromCache } from '@/lib/roleplay-library';

type UseRoleplayLibraryPersistOptions = {
  mounted: boolean;
  toolSettings: RoleplayToolCache;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
};

export function useRoleplayLibraryPersist({
  mounted,
  toolSettings,
  updateToolSettings,
}: UseRoleplayLibraryPersistOptions) {
  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (!persisted) {
        return;
      }
      const character = upsertCharacterFromRoleplaySession(persisted.session);
      const shared = loadSettingsCache().shared;
      const activeCastId = shared.activeCharacterId?.trim();
      // Keep the Cast record in step with its Story session, but only make it the active Cast
      // when no other one is: saving a story used to switch the active Cast back to this
      // session's lead, overriding a lead picked on Film (on a fresh browser or a phone, where
      // the new lead's record loaded a moment later, Story then continued as the old one).
      if (character && (!activeCastId || activeCastId === character.id)) {
        saveSharedSettings({
          ...shared,
          ...applyCharacterRecord(character),
        });
      }
      if (
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);
}
