'use client';

import { SETTINGS_SYNCED_WITH_SERVER_EVENT } from '@/lib/settings-push-flush';
import { loadLocalObservability } from '@/lib/local-observability';
import { loadPlayMetrics } from '@/lib/play-metrics';
import { playEffectiveProgressLabel } from '@/lib/play-campaign';
import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadLookPack } from '@/lib/look-pack';
import {
  loadPlayCampaignState,
  PLAY_CAMPAIGN_UPDATED_EVENT,
  playCampaignProgressLabel,
} from '@/lib/play-campaign';
import { activeLook, getCharacter } from '@/lib/character-os';
import { lookPacksOf } from '@/lib/play-cast';
import { loadSettingsCache } from '@/lib/settings-cache';

type PlayPersistenceTriadProps = {
  /** Compact one-liner under Extract status. */
  compact?: boolean;
};

/**
 * One mental model for Film persistence:
 * this session's look · saved on Cast · resume step.
 */
export default function PlayPersistenceTriad({ compact = false }: PlayPersistenceTriadProps) {
  const [sessionLook, setSessionLook] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [resume, setResume] = useState('Film · start');
  const [castLook, setCastLook] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        const pack = loadLookPack();
        setSessionLook(Boolean(pack?.vibePrompt?.trim() || pack?.savedAt));
        const campaign = loadPlayCampaignState();
        // The Cast picked now; the saved film only counts when it is theirs (the line named last
        // week's lead and their film beside a different picked Cast — UI audit 2026-10-11).
        const characterId =
          loadSettingsCache().shared.activeCharacterId?.trim() ||
          campaign?.characterId?.trim() ||
          pack?.characterId?.trim() ||
          '';
        const theirs = !campaign || campaign.characterId === characterId;
        setResume(
          playEffectiveProgressLabel({
            metrics: loadPlayMetrics(),
            funnel: loadLocalObservability(),
            campaign: theirs ? campaign : null,
            lookPack: pack,
            activeCharacterId: characterId,
          })
        );
        const character = characterId ? getCharacter(characterId) : null;
        setSavedCount(character ? lookPacksOf(character).length : 0);
        setCastLook(character ? `${character.name} · ${activeLook(character).name}` : null);
      });
    };
    refresh();
    window.addEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
    return () => {
      window.removeEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
    };
  }, []);

  // The one-liner names the Cast and the look you see picked: "No session look yet · None saved
  // on Cast" sat under a selected Look 4 — it meant Look *packs* (Moodboard extracts), a
  // different thing with the same word (UI audit 2026-10-11). The full card below keeps them.
  const line = [castLook ?? 'No Cast picked yet', resume].join(' · ');

  if (compact) {
    return (
      <p className="type-caption text-[var(--text-muted)]" data-testid="play-persistence-triad">
        {line}
      </p>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-3"
      data-testid="play-persistence-triad"
    >
      <p className="type-overline text-[var(--text-muted)]">Where Film state lives</p>
      <ul className="mt-2 space-y-1 type-caption text-[var(--text-secondary)]">
        <li>
          <span className="font-medium text-[var(--text-primary)]">This session’s look</span>
          {' — '}
          {sessionLook
            ? 'Look pack on this device for Outfit / Day handoff'
            : 'Extract look to stage one'}
        </li>
        <li>
          <span className="font-medium text-[var(--text-primary)]">Saved on Cast</span>
          {' — '}
          {savedCount > 0
            ? `${savedCount} look pack${savedCount === 1 ? '' : 's'} on the active character`
            : 'Save on Cast to keep looks across sessions'}
        </li>
        <li>
          <span className="font-medium text-[var(--text-primary)]">Resume step</span>
          {' — '}
          {resume}
        </li>
      </ul>
    </div>
  );
}
