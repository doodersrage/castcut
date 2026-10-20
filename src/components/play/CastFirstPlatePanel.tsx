'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { queueCastLookPlate } from '@/lib/cast/plate-queue';
import { castPlateThumbUrl } from '@/lib/character/plate-thumb';
import {
  characterHomeHref,
  getCharactersSnapshot,
  getServerCharactersSnapshot,
  subscribeCharacters,
} from '@/lib/character/os';
import { loadSettingsCache } from '@/lib/settings/cache';

/**
 * Right after Film creates a Cast: render its first plate (UltraReal, from the description —
 * cast-plate-queue.ts) without leaving Film, show it when it lands, and offer where to go next.
 * A Cast made from a photo already has its plate and only gets the choices. Loaded lazily — it
 * owns a ComfyUI queue hook.
 */
export default function CastFirstPlatePanel({
  characterId,
  mapHref,
}: {
  characterId: string;
  /** Desk → phone route mapping on the phone Film page. */
  mapHref?: (href: string) => string;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const characters = useSyncExternalStore(
    subscribeCharacters,
    getCharactersSnapshot,
    getServerCharactersSnapshot
  );
  const character = characters.find(entry => entry.id === characterId);
  const plateUrl = character ? castPlateThumbUrl(character) : '';
  const [status, setStatus] = useState<'queueing' | 'rendering' | 'failed' | null>(null);
  const started = useRef(false);

  const queue = async () => {
    setStatus('queueing');
    try {
      const { result } = await queueCastLookPlate({
        characterId,
        sendComfyUi: actions.sendComfyUi,
      });
      setStatus(result === 'queued' ? 'rendering' : result === 'failed' ? 'failed' : null);
    } catch {
      setStatus('failed');
    }
  };

  // Once, when the new Cast has no plate (no photo).
  useEffect(() => {
    if (started.current || !character || plateUrl) return;
    started.current = true;
    void queue();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queue once per Cast
  }, [character, plateUrl]);

  if (!character) return null;
  const href = (path: string) => (mapHref ? mapHref(path) : path);
  const id = encodeURIComponent(character.id);
  const name = character.name?.trim() || 'your Cast';
  return (
    <div
      className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3"
      data-testid="play-campaign-first-plate"
    >
      <div className="flex aspect-[3/4] w-24 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-muted)]">
        {plateUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ComfyUI / gallery media URL
          <img
            src={plateUrl}
            alt={`${name}'s plate`}
            className="h-full w-full object-cover"
            data-testid="play-campaign-first-plate-image"
          />
        ) : (
          <span className="type-caption px-2 text-center text-[var(--text-muted)]">
            {status === 'failed' ? 'No plate yet' : 'Rendering…'}
          </span>
        )}
      </div>
      <div className="min-w-[12rem] flex-1 space-y-2">
        <p
          className="type-caption text-[var(--text-secondary)]"
          role="status"
          data-testid="play-campaign-first-plate-status"
        >
          {plateUrl
            ? `${name}'s plate is ready — every picture of ${name} starts from it.`
            : status === 'failed'
              ? 'Could not queue the plate — check ComfyUI, then try again.'
              : `Making ${name}'s first plate from the description (about a minute). You can go on — it lands on its own.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            size="sm"
            variant="primary"
            href={href(`/day?character=${id}`)}
            data-testid="play-campaign-first-plate-day"
          >
            Plan the Day
          </ButtonLink>
          <ButtonLink
            size="sm"
            variant="secondary"
            href={href(`/fitting?character=${id}`)}
            data-testid="play-campaign-first-plate-outfit"
          >
            Try on outfits
          </ButtonLink>
          <ButtonLink
            size="sm"
            variant="ghost"
            href={characterHomeHref(character.id)}
            data-testid="play-campaign-first-plate-cast"
          >
            Cast home
          </ButtonLink>
          {status === 'failed' ? (
            <button
              type="button"
              className="ui-text-link type-caption"
              onClick={() => void queue()}
              data-testid="play-campaign-first-plate-retry"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
