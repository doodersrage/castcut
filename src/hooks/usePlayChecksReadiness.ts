'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import type { PlayChecksReadiness } from '@/lib/play-checks-readiness';

/**
 * Which Play checks (DWPose pose match, FaceAnalysis face match) and Cut extras (server titles)
 * this setup supports. Probes on mount and whenever `refreshKey` changes (e.g. after Heal).
 */
export function usePlayChecksReadiness(
  refreshKey?: unknown,
  options?: { enabled?: boolean }
): {
  readiness: PlayChecksReadiness | null;
  checking: boolean;
  recheck: () => void;
} {
  const [readiness, setReadiness] = useState<PlayChecksReadiness | null>(null);
  const [nonce, setNonce] = useState(0);
  const enabled = options?.enabled !== false;
  // A probe is in flight while the latest request key hasn't completed yet (derived, so no
  // synchronous setState inside the effect).
  const requestKey = `${nonce}:${String(refreshKey)}`;
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const checking = enabled && completedKey !== requestKey;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const comfyUrl = loadComfyUiSettings().apiUrl?.trim();
    // A session vision model (Settings → LLM) outranks the server's.
    const visionModel = loadSettingsCache().shared.sessionLlmVisionModel?.trim();
    const params = new URLSearchParams();
    if (comfyUrl) params.set('comfyUrl', comfyUrl);
    if (visionModel) params.set('visionModel', visionModel);
    const query = params.size ? `?${params.toString()}` : '';
    fetch(`/api/play-checks${query}`, { credentials: 'same-origin' })
      .then(response => (response.ok ? (response.json() as Promise<PlayChecksReadiness>) : null))
      .then(data => {
        if (!cancelled && data && typeof data.comfyReachable === 'boolean') {
          setReadiness(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCompletedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, requestKey]);

  const recheck = useCallback(() => setNonce(value => value + 1), []);
  return { readiness, checking, recheck };
}
