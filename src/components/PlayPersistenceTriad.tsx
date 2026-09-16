'use client';

import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadLookPack } from '@/lib/look-pack';
import {
  loadPlayCampaignState,
  PLAY_CAMPAIGN_UPDATED_EVENT,
  playCampaignProgressLabel,
} from '@/lib/play-campaign';
import { getCharacter, lookPacksOf } from '@/lib/character-os';
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

  useEffect(() => {
    const refresh = () => {
      scheduleAfterCommit(() => {
        const pack = loadLookPack();
        setSessionLook(Boolean(pack?.vibePrompt?.trim() || pack?.savedAt));
        const campaign = loadPlayCampaignState();
        setResume(playCampaignProgressLabel(campaign));
        const characterId =
          campaign?.characterId?.trim() ||
          pack?.characterId?.trim() ||
          loadSettingsCache().shared.activeCharacterId?.trim() ||
          '';
        const character = characterId ? getCharacter(characterId) : null;
        setSavedCount(character ? lookPacksOf(character).length : 0);
      });
    };
    refresh();
    window.addEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const line = [
    sessionLook ? 'This session’s look' : 'No session look yet',
    savedCount > 0 ? `${savedCount} saved on Cast` : 'None saved on Cast',
    resume,
  ].join(' · ');

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
