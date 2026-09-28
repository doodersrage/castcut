'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { ModelFilesSummary } from '@/lib/model-files';

/** Files under COMFYUI_ROOT/models with usage, plus guarded delete. */
export function useModelFiles() {
  const [summary, setSummary] = useState<ModelFilesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const comfyUrl = () => loadComfyUiSettings().apiUrl?.trim() || undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = comfyUrl();
      const response = await fetch(
        `/api/comfyui/model-files${url ? `?comfyUrl=${encodeURIComponent(url)}` : ''}`,
        { credentials: 'same-origin' }
      );
      const data = (await response.json().catch(() => ({}))) as ModelFilesSummary & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setSummary(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not list model files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  /** Delete one file; resolves to freed bytes or throws the server's reason. */
  const remove = useCallback(async (path: string, confirmName: string): Promise<number> => {
    const url = comfyUrl();
    const response = await fetch('/api/comfyui/model-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        action: 'delete',
        path,
        confirmName,
        ...(url ? { comfyUrl: url } : {}),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      freedBytes?: number;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? `Delete failed (HTTP ${response.status}).`);
    setSummary(current =>
      current ? { ...current, files: current.files.filter(file => file.path !== path) } : current
    );
    // ComfyUI's model lists are cached in the browser — refresh so pickers drop the file.
    void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
    return data.freedBytes ?? 0;
  }, []);

  return { summary, loading, error, load, remove };
}
