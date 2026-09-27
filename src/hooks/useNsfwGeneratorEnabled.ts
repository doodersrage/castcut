'use client';

import { useEffect, useState } from 'react';
import { fetchNsfwGeneratorEnabled } from '@/lib/nsfw-generator-nav';
import { isNsfwGeneratorEnabledClient } from '@/lib/nsfw-generator-env';

/**
 * Resolves env-gated adult content from the build-time public flag, or from
 * PROMPT_NSFW_GENERATOR_ENABLED via /api/health when that flag was not inlined.
 * `ready` is true once the answer will not change (client flag already on, or the health check settled).
 */
export function useNsfwGeneratorStatus(): { enabled: boolean; ready: boolean } {
  const clientOn = isNsfwGeneratorEnabledClient();
  const [enabled, setEnabled] = useState(clientOn);
  const [ready, setReady] = useState(clientOn);

  useEffect(() => {
    if (clientOn) {
      return;
    }

    let cancelled = false;
    void fetchNsfwGeneratorEnabled().then(next => {
      if (!cancelled) {
        setEnabled(next);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clientOn]);

  return { enabled, ready };
}

/** Resolves env-gated adult generator visibility from client env or /api/health. */
export function useNsfwGeneratorEnabled(): boolean {
  return useNsfwGeneratorStatus().enabled;
}
