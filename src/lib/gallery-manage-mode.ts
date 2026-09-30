import { useSyncExternalStore } from 'react';

/**
 * Gallery Browse / Manage. Browse (default) is the grid, runs, review and a small filter set;
 * Manage adds bulk selection, clean-up / purge, duplicates, the vision inbox, derived-kind
 * chips and the import tools — rare admin work that used to sit above every visit's grid.
 */
const KEY = 'comfy-gallery-manage-v1';
const EVENT = 'comfy-gallery-manage-changed';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setGalleryManageMode(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* per-browser preference only */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useGalleryManageMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
