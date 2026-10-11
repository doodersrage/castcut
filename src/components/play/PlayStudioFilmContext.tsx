'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCharacter } from '@/lib/character-os';
import { loadLocalObservability } from '@/lib/local-observability';
import { loadLookPack } from '@/lib/look-pack';
import {
  loadActivePlayCampaign,
  PLAY_CAMPAIGN_UPDATED_EVENT,
  playEffectiveProgressLabel,
} from '@/lib/play-campaign';
import {
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
  resolveNextPlayAction,
} from '@/lib/play-metrics';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadSettingsCache } from '@/lib/settings-cache';
import { SETTINGS_SYNCED_WITH_SERVER_EVENT } from '@/lib/settings-push-flush';
import { saveWorkspaceMode } from '@/lib/workspace-mode';

type FilmContext = { cast: string; progress: string; next: { label: string; href: string } | null };

/**
 * Studio's sidebar keeps the film in view: who it is about, where it is, and its next step, with
 * a way back to Film. UI/UX review (2026-10-11): "keep project context consistent across
 * advanced views" — Studio showed none of it.
 */
export default function PlayStudioFilmContext({ onNavigate }: { onNavigate?: () => void }) {
  const [context, setContext] = useState<FilmContext | null>(null);
  useEffect(() => {
    const refresh = () =>
      scheduleAfterCommit(() => {
        const castId = loadSettingsCache().shared.activeCharacterId?.trim() || '';
        const character = castId ? getCharacter(castId) : null;
        if (!character) {
          setContext(null);
          return;
        }
        const artifacts = {
          metrics: loadPlayMetrics(),
          funnel: loadLocalObservability(),
          campaign: loadActivePlayCampaign(castId),
          lookPack: loadLookPack(),
          activeCharacterId: castId,
        };
        const next = resolveNextPlayAction(artifacts);
        setContext({
          cast: character.name?.trim() || 'Your Cast',
          progress: playEffectiveProgressLabel(artifacts),
          next: next ? { label: next.label, href: next.href } : null,
        });
      });
    refresh();
    const events = [
      PLAY_CAMPAIGN_UPDATED_EVENT,
      PLAY_METRICS_UPDATED_EVENT,
      SETTINGS_SYNCED_WITH_SERVER_EVENT,
      'focus',
    ];
    for (const name of events) window.addEventListener(name, refresh);
    return () => {
      for (const name of events) window.removeEventListener(name, refresh);
    };
  }, []);

  if (!context) return null;
  return (
    <div
      className="mx-2 space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-2"
      data-testid="studio-film-context"
    >
      <p className="type-caption truncate font-medium text-[var(--text-primary)]">{context.cast}</p>
      <p className="type-caption truncate text-[var(--text-muted)]">{context.progress}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {context.next ? (
          <Link
            href={context.next.href}
            onClick={onNavigate}
            className="ui-text-link type-caption"
            data-testid="studio-film-context-next"
          >
            {context.next.label}
          </Link>
        ) : null}
        <button
          type="button"
          className="ui-text-link type-caption"
          data-testid="studio-film-context-back"
          onClick={() => {
            saveWorkspaceMode('play');
            onNavigate?.();
          }}
        >
          Back to Film
        </button>
      </div>
    </div>
  );
}
