'use client';

/**
 * The browser side of the script store (scene-script-store.ts): kept under its own key, and
 * synced with `/api/scene-scripts` one script at a time — a change sends only the scripts it
 * touched; a page's first read pulls the server's, merges them in and sends back what the server
 * lacks (so a change made offline, or with the server down, goes once it is back).
 */
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import type { SettingsCache } from '../settings/cache';
import type { ScriptsCache } from './scene-scripts';
import {
  EMPTY_SCENE_SCRIPT_STORE,
  mergeSceneScriptStores,
  normalizeSceneScriptStore,
  sceneScriptChanges,
  SCENE_SCRIPTS_CHANGED_EVENT,
  SCENE_SCRIPTS_KEY,
  withScriptsPatch,
  withServerAnswer,
  type SceneScriptStore,
} from './scene-script-store';

/** The last store read or written, and the stored value it came from (read again only when new). */
let last: { raw: unknown; store: SceneScriptStore } | null = null;

export function loadSceneScriptStore(): SceneScriptStore {
  if (typeof window === 'undefined') return EMPTY_SCENE_SCRIPT_STORE;
  const raw = readBrowserValue(SCENE_SCRIPTS_KEY);
  if (last && last.raw === raw) return last.store;
  last = { raw, store: normalizeSceneScriptStore(raw) };
  return last.store;
}

function saveSceneScriptStore(store: SceneScriptStore): void {
  const raw = { version: 1, ...store };
  writeBrowserValue(SCENE_SCRIPTS_KEY, raw);
  last = { raw, store };
  window.dispatchEvent(new Event(SCENE_SCRIPTS_CHANGED_EVENT));
}

const changed = (before: SceneScriptStore, after: SceneScriptStore) => {
  const changes = sceneScriptChanges(before, after);
  return changes.put.length > 0 || changes.remove.length > 0;
};

async function send(changes: ReturnType<typeof sceneScriptChanges>): Promise<boolean> {
  let ok = true;
  for (const script of changes.put) {
    try {
      const response = await fetch('/api/scene-scripts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      if (!response.ok) {
        ok = false;
        continue;
      }
      // The server kept a newer copy, or deleted it since: that wins here too.
      const current = loadSceneScriptStore();
      const answered = withServerAnswer(current, script.id, await response.json());
      if (changed(current, answered)) saveSceneScriptStore(answered);
    } catch {
      ok = false;
    }
  }
  for (const { id, at } of changes.remove) {
    try {
      const params = new URLSearchParams({ id, at: String(at) });
      const response = await fetch(`/api/scene-scripts?${params.toString()}`, { method: 'DELETE' });
      if (!response.ok) ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
}

/** A Script-section patch saved here, and its scripts sent to the server. */
export function applySceneScriptsPatch(patch: ScriptsCache): void {
  const before = loadSceneScriptStore();
  const after = withScriptsPatch(before, patch);
  const changes = sceneScriptChanges(before, after);
  if (!changes.put.length && !changes.remove.length) return;
  saveSceneScriptStore(after);
  void send(changes);
}

/**
 * Scripts still in the Scene tool's settings (saved before they had their own store, or by an
 * older version on another device): merged in here and sent. True when there were any, so the
 * caller clears them from the settings.
 */
export function adoptLegacySceneScripts(legacy: ScriptsCache | undefined): boolean {
  const scripts = legacy?.scripts ?? [];
  const removed = legacy?.removedScriptAt ?? {};
  if (!scripts.length && !Object.keys(removed).length) return false;
  const before = loadSceneScriptStore();
  const after = mergeSceneScriptStores(
    before,
    normalizeSceneScriptStore({ scripts, removedAt: removed })
  );
  if (changed(before, after)) {
    saveSceneScriptStore(after);
    void send(sceneScriptChanges(before, after));
  }
  return true;
}

let synced: Promise<void> | null = null;

/**
 * Once per page load: the server's scripts merged in, and what it lacks (or holds older) sent.
 * Server storage off or out of reach: the browser's copy stands, and is sent next time.
 */
export function syncSceneScriptsWithServer(): Promise<void> {
  synced ??= (async () => {
    let server: SceneScriptStore;
    try {
      const response = await fetch('/api/scene-scripts');
      if (!response.ok) return;
      server = normalizeSceneScriptStore(await response.json());
    } catch {
      return;
    }
    const local = loadSceneScriptStore();
    const merged = mergeSceneScriptStores(local, server);
    if (changed(local, merged)) saveSceneScriptStore(merged);
    await send(sceneScriptChanges(server, merged));
  })();
  return synced;
}

/**
 * The settings with the screenplays back in the Scene tool, where they were before they had their
 * own store: a backup made here restores on any version, and on this one the Scene page moves
 * them back into the store (useSceneScripts).
 */
export function settingsWithSceneScripts(settings: SettingsCache): SettingsCache {
  const { scripts, removedAt } = loadSceneScriptStore();
  if (!scripts.length && !Object.keys(removedAt).length) return settings;
  const tools = settings.tools ?? {};
  const scene = (tools.scene ?? {}) as Record<string, unknown>;
  return {
    ...settings,
    tools: { ...tools, scene: { ...scene, scripts, removedScriptAt: removedAt } },
  };
}

/** "Clear all local data": the scripts go with the rest of this browser's copy. */
export function clearLocalSceneScripts(): void {
  saveSceneScriptStore(EMPTY_SCENE_SCRIPT_STORE);
}
