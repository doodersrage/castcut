'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { settingsTabHref } from '@/lib/settings-nav';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings-cache';
import { normalizeEngineId } from '@/lib/engine/capabilities';

/**
 * Lean banner on Film tools when the active engine is not ComfyUI.
 * Film stills / Day / Story Cut queue on Comfy.
 */
export default function PlayFilmEngineBanner() {
  const [engine, setEngine] = useState<string>('comfyui');

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        setEngine(normalizeEngineId(loadSettingsCache().shared.inferenceEngine));
      });
    };
    refresh();
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (engine === 'comfyui') {
    return null;
  }

  return (
    <div
      className="mb-3 rounded-[var(--radius-lg)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2"
      data-testid="play-film-engine-banner"
      role="status"
    >
      <p className="type-caption text-[var(--tint-warning-text)]">
        Film stills queue on ComfyUI — switch the inference engine, or run Heal & ready.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <ButtonLink href={settingsTabHref('overview')} size="sm" variant="secondary">
          Heal & ready
        </ButtonLink>
        <ButtonLink
          href={`${settingsTabHref('comfyui')}&section=connection`}
          size="sm"
          variant="ghost"
          data-testid="play-film-engine-switch"
        >
          Engine settings
        </ButtonLink>
      </div>
    </div>
  );
}
