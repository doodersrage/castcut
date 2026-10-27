'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScriptsCache } from '@/lib/day/scene-scripts';
import {
  EMPTY_SCENE_SCRIPT_STORE,
  SCENE_SCRIPTS_CHANGED_EVENT,
  scriptsCacheOf,
  type SceneScriptStore,
} from '@/lib/day/scene-script-store';
import {
  adoptLegacySceneScripts,
  applySceneScriptsPatch,
  loadSceneScriptStore,
  syncSceneScriptsWithServer,
} from '@/lib/day/scene-script-store-client';

/**
 * The Cast's screenplays from their own store (M6 V6, scene-script-store.ts), in the shape the
 * Script section works with. Scripts still in the Scene tool's settings — saved before the move,
 * or by an older version on another device — move into the store and leave the settings.
 */
export function useSceneScripts(sceneTool: {
  mounted: boolean;
  toolSettings: ScriptsCache;
  updateToolSettings: (patch: ScriptsCache) => void;
}) {
  const { mounted, toolSettings, updateToolSettings } = sceneTool;
  const [store, setStore] = useState<SceneScriptStore>(EMPTY_SCENE_SCRIPT_STORE);

  useEffect(() => {
    if (!mounted) return;
    const read = () => setStore(loadSceneScriptStore());
    read();
    window.addEventListener(SCENE_SCRIPTS_CHANGED_EVENT, read);
    void syncSceneScriptsWithServer();
    return () => window.removeEventListener(SCENE_SCRIPTS_CHANGED_EVENT, read);
  }, [mounted]);

  const { scripts: legacy, removedScriptAt: legacyRemoved } = toolSettings;
  useEffect(() => {
    if (!mounted) return;
    if (adoptLegacySceneScripts({ scripts: legacy, removedScriptAt: legacyRemoved })) {
      updateToolSettings({ scripts: undefined, removedScriptAt: undefined });
    }
  }, [legacy, legacyRemoved, mounted, updateToolSettings]);

  const cache = useMemo(() => scriptsCacheOf(store), [store]);
  const update = useCallback((patch: ScriptsCache) => applySceneScriptsPatch(patch), []);
  return { scripts: cache.scripts, cache, update };
}
