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
  queueBlockReason?: string | null;
  swipeDeckLength: number;
  /** A catalog kit is picked — Skip kit has something to step from. */
  hasKit?: boolean;
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
  /**
   * `panel`: the fitting room's Clothes column — Try it on first, no "Skip outfit · Day" (the
   * header's Continue to Day is the way on).
   */
  variant?: 'row' | 'panel';
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
  queueBlockReason = null,
  swipeDeckLength,
  hasKit = true,
  busy,
  character,
  compareActive = false,
  softAdvanceActive = false,
  onSkipKit,
  onQueueTryOn,
  onQueueTryOnAndSwipe,
  onSaveKitToCast,
  onGoRoleplay,
  variant = 'row',
}: FittingActionRowProps) {
  const panel = variant === 'panel';
  const storyLocked = useSyncExternalStore(
    subscribePlayMetrics,
    () => isPlayStoryLocked(loadPlayMetrics()),
    () => true
  );
  // In the panel Try it on stays the main button: Keep is on the stage, Day in the header.
  const demoteQueue = panel
    ? Boolean(continueDayHref)
    : compareActive || softAdvanceActive || Boolean(continueDayHref);
  return (
    <div className="space-y-2">
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
          title={queueBlockReason || undefined}
          data-testid="fitting-queue-try-on"
          onClick={onQueueTryOn}
        >
          {busy ? 'Queueing…' : panel ? 'Try it on' : 'Queue try-on'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={swipeDeckLength < 2 || busy || !hasKit}
          title="Advance to the next wardrobe kit (does not dismiss try-ons)"
          data-testid="fitting-skip-kit"
          onClick={onSkipKit}
        >
          Skip kit
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={queueBlocked || swipeDeckLength < 2}
          title={queueBlockReason || 'Queue this kit, then advance to the next'}
          data-testid="fitting-queue-and-next"
          onClick={onQueueTryOnAndSwipe}
        >
          {panel ? 'Try it on, then next kit' : 'Queue & next'}
        </Button>
        {character && !continueDayHref && !panel ? (
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
                title="Finish a Day first — every still rendered"
              >
                Story · after a full Day
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
      {queueBlockReason ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="fitting-queue-block-reason"
        >
          {queueBlockReason}
        </p>
      ) : null}
    </div>
  );
}
