/**
 * Settings saved just before leaving the page were lost: the server push waits 5 s, and is only
 * scheduled after the IndexedDB flush resolves, so a quick navigation dropped it and the next
 * load's sync restored the server's older copy (live: workflow remaps reverted on reload).
 *
 * saveSettingsCache marks settings dirty synchronously; on pagehide / hidden we POST the
 * in-memory copy with keepalive, which the browser completes after the page is gone. The
 * debounced push clears the mark when it lands.
 */

/** keepalive request bodies are capped (~64 KB); larger settings fall back to the next sync. */
const KEEPALIVE_BODY_LIMIT = 60_000;

let dirty = false;
/** A fresh profile's copy has no maps until the first sync — never flush it over the server's. */
let syncedWithServer = false;
let listenersAttached = false;
let readSettings: (() => unknown) | null = null;

function flush(): void {
  if (!dirty || !readSettings || !syncedWithServer) {
    return;
  }
  dirty = false;
  try {
    const body = JSON.stringify({ namespace: 'settings-cache', data: readSettings() });
    if (body.length > KEEPALIVE_BODY_LIMIT || typeof fetch !== 'function') {
      return;
    }
    void fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best effort — the next load's sync still merges.
  }
}

function attachListeners(): void {
  if (listenersAttached || typeof window === 'undefined') {
    return;
  }
  if (typeof window.addEventListener !== 'function') {
    return;
  }
  listenersAttached = true;
  window.addEventListener('pagehide', flush);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });
  }
}

/**
 * Called synchronously from saveSettingsCache. `read` must return the settings as they are when
 * the flush fires (not a snapshot from this save).
 */
export function markSettingsPushPending(read: () => unknown): void {
  readSettings = read;
  // Saves before this page's first sync are merged by that sync — only later edits need this.
  if (!syncedWithServer) {
    return;
  }
  dirty = true;
  attachListeners();
}

/** Called once a settings push has reached the server. */
export function clearSettingsPushPending(): void {
  dirty = false;
}

/** Called when this page's startup sync with the server has finished. */
export const SETTINGS_SYNCED_WITH_SERVER_EVENT = 'settings-synced-with-server';

export function markSettingsSyncedWithServer(): void {
  if (syncedWithServer) return;
  syncedWithServer = true;
  // Readers that hid "you haven't set this up" until the server copy arrived recheck now.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SETTINGS_SYNCED_WITH_SERVER_EVENT));
  }
}

/** Whether this page has pulled the server's settings — pushes of settings wait for it. */
export function isSettingsSyncedWithServer(): boolean {
  return syncedWithServer;
}
