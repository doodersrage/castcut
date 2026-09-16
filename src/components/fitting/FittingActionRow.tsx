'use client';

import { useSyncExternalStore } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { CharacterRecord } from '@/lib/character-os';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { isPlayStoryLocked } from '@/lib/play-step-machine';
import { loadPlayMetrics, PLAY_METRICS_UPDATED_EVENT } from '@/lib/play-metrics';

export type FittingActionRowProps = {
  continueDayHref: string | null;
  dayPlannerHref: string;
  queueBlocked: boolean;
  swipeDeckLength: number;
  busy: boolean;
  character: CharacterRecord | undefined;
  /** Try-ons waiting for Keep — demote Queue. */
  compareActive?: boolean;
  /** Soft-advance countdown owns Day — demote Queue. */
  softAdvanceActive?: boolean;
  onSkipKit: () => void;
  onQueueTryOn: () => void;
  onQueueTryOnAndSwipe: () => void;
  onSaveKitToCast: () => void;
  onGoRoleplay: () => void;
};

function subscribePlayMetrics(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export default function FittingActionRow({
  continueDayHref,
  dayPlannerHref,
  queueBlocked,
  swipeDeckLength,
  busy,
  character,
  compareActive = false,
  softAdvanceActive = false,
  onSkipKit,
  onQueueTryOn,
  onQueueTryOnAndSwipe,
  onSaveKitToCast,
  onGoRoleplay,
}: FittingActionRowProps) {
  const storyLocked = useSyncExternalStore(
    subscribePlayMetrics,
    () => isPlayStoryLocked(loadPlayMetrics()),
    () => true
  );
  const demoteQueue = compareActive || softAdvanceActive || Boolean(continueDayHref);
  return (
    <ToolActionRow>
      {continueDayHref && !softAdvanceActive ? (
        <ButtonLink
          href={continueDayHref}
          size="sm"
          variant="primary"
          data-testid="fitting-continue-day"
        >
          Continue to Day
        </ButtonLink>
      ) : null}
      <Button
        size="sm"
        variant={demoteQueue ? 'secondary' : 'primary'}
        disabled={queueBlocked}
        onClick={onQueueTryOn}
      >
        {busy ? 'Queueing…' : 'Queue try-on'}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={queueBlocked || swipeDeckLength < 2}
        onClick={onSkipKit}
      >
        Skip kit
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={queueBlocked || swipeDeckLength < 2}
        onClick={onQueueTryOnAndSwipe}
      >
        Queue & next
      </Button>
      {character && !continueDayHref ? (
        <ButtonLink
          href={dayPlannerHref}
          size="sm"
          variant="secondary"
          data-testid="fitting-skip-day"
          onClick={() => {
            bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
          }}
        >
          Skip outfit · Day
        </ButtonLink>
      ) : null}
      <details className="w-full">
        <summary className="type-caption cursor-pointer text-[var(--text-muted)]">More</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onSaveKitToCast}>
            Save kit to Cast
          </Button>
          {!storyLocked ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onGoRoleplay}
              data-testid="fitting-continue-story"
            >
              Continue in Story
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled
              data-testid="fitting-continue-story-locked"
              title="Cut your first Day film first"
            >
              Story · after first film
            </Button>
          )}
          {character ? (
            <>
              {!continueDayHref ? (
                <ButtonLink
                  href={dayPlannerHref}
                  size="sm"
                  variant="ghost"
                  data-testid="fitting-plan-day"
                  onClick={() => {
                    bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
                  }}
                >
                  Open Day
                </ButtonLink>
              ) : null}
              <ButtonLink
                href={`/moodboard?character=${encodeURIComponent(character.id)}`}
                size="sm"
                variant="ghost"
              >
                Back to Look
              </ButtonLink>
              <ButtonLink
                href={`/gallery?character=${encodeURIComponent(character.id)}`}
                size="sm"
                variant="ghost"
              >
                Open in Gallery
              </ButtonLink>
            </>
          ) : null}
        </div>
      </details>
    </ToolActionRow>
  );
}
