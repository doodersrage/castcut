'use client';

import { useCallback, useEffect, useState } from 'react';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  PROMPT_HISTORY_LIMIT,
  type PromptHistoryEntry,
} from '@/lib/prompt-history';
import { USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import { scheduleUserAnalyticsSync } from '@/lib/user-analytics-sync';

export type { PromptHistoryEntry } from '@/lib/prompt-history';
export { PROMPT_HISTORY_KEY, LOCATION_BLOCKLIST_KEY } from '@/lib/prompt-history';
export {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  loadLocationBlocklist,
  saveLocationBlocklist,
} from '@/lib/prompt-history';

function loadHistory(): PromptHistoryEntry[] {
  return loadPromptHistoryStore();
}

function saveHistory(entries: PromptHistoryEntry[]): void {
  savePromptHistoryStore(entries);
  scheduleUserAnalyticsSync();
}

export function usePromptHistory() {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    setEntries(loadHistory());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      refresh();
      setMounted(true);
    });

    const onScopeChanged = () => refresh();
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    // Startup sync / another tab brought in entries (dispatched by AutoStorageSyncInit, TabSyncInit).
    window.addEventListener('prompt-history-updated', onScopeChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
      window.removeEventListener('prompt-history-updated', onScopeChanged);
    };
  }, [refresh]);

  const persist = useCallback((next: PromptHistoryEntry[]) => {
    setEntries(next);
    saveHistory(next);
  }, []);

  const addEntry = useCallback(
    (
      entry: Omit<PromptHistoryEntry, 'id' | 'timestamp' | 'userId'> & {
        id?: string;
      }
    ) => {
      const next: PromptHistoryEntry = {
        ...entry,
        id: entry.id?.trim() || crypto.randomUUID(),
        timestamp: Date.now(),
      };
      persist([next, ...loadHistory()].slice(0, PROMPT_HISTORY_LIMIT));
      return next.id;
    },
    [persist]
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      persist(
        loadHistory().map(entry =>
          entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
        )
      );
    },
    [persist]
  );

  const setRating = useCallback(
    (id: string, rating: PromptHistoryEntry['rating']) => {
      persist(loadHistory().map(entry => (entry.id === id ? { ...entry, rating } : entry)));
    },
    [persist]
  );

  const removeEntry = useCallback(
    (id: string) => {
      persist(loadHistory().filter(entry => entry.id !== id));
    },
    [persist]
  );

  const clearHistory = useCallback(() => {
    persist([]);
  }, [persist]);

  const setTags = useCallback(
    (id: string, tags: string[]) => {
      const normalized = [...new Set(tags.map(tag => tag.trim()).filter(Boolean))].slice(0, 12);
      persist(
        loadHistory().map(entry => (entry.id === id ? { ...entry, tags: normalized } : entry))
      );
    },
    [persist]
  );

  const addTag = useCallback(
    (id: string, tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) {
        return;
      }
      persist(
        loadHistory().map(entry => {
          if (entry.id !== id) {
            return entry;
          }
          const tags = [...new Set([...(entry.tags ?? []), trimmed])].slice(0, 12);
          return { ...entry, tags };
        })
      );
    },
    [persist]
  );

  const addTagToEntries = useCallback(
    (ids: string[], tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || ids.length === 0) {
        return;
      }
      const idSet = new Set(ids);
      persist(
        loadHistory().map(entry => {
          if (!idSet.has(entry.id)) {
            return entry;
          }
          const tags = [...new Set([...(entry.tags ?? []), trimmed])].slice(0, 12);
          return { ...entry, tags };
        })
      );
    },
    [persist]
  );

  const removeEntries = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      const idSet = new Set(ids);
      persist(loadHistory().filter(entry => !idSet.has(entry.id)));
    },
    [persist]
  );

  return {
    mounted,
    entries,
    addEntry,
    toggleFavorite,
    setRating,
    setTags,
    addTag,
    addTagToEntries,
    removeEntry,
    removeEntries,
    clearHistory,
    refresh,
  };
}
