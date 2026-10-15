'use client';

import { getCharacter } from '@/lib/character-os';
import { PLAY_CAMPAIGN_STEPS, playCampaignHref } from '@/lib/play-campaign';
import { remixDayFilmHref } from '@/lib/play-starter';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignActionsSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  | 'status'
  | 'durableCampaign'
  | 'campaignCharacterMismatch'
  | 'savedCampaign'
  | 'campaignComplete'
  | 'characterId'
  | 'resumeStep'
  | 'nextAction'
  | 'journey'
  | 'activeLookPack'
  | 'goToStep'
  | 'startNewCampaign'
  | 'mapHref'
> & {
  /** When true, hide the primary Continue (shown in the resume card above). */
  compact?: boolean;
  /** Post-cut habit home: Watch / remix / Story primary. */
  firstFilmDone?: boolean;
  onOpenStory?: () => void;
};

export default function PlayCampaignActionsSection({
  status,
  durableCampaign,
  campaignCharacterMismatch,
  savedCampaign,
  campaignComplete,
  characterId,
  resumeStep,
  nextAction,
  journey,
  activeLookPack,
  goToStep,
  startNewCampaign,
  mapHref,
  compact = false,
  firstFilmDone = false,
  onOpenStory,
}: PlayCampaignActionsSectionProps) {
  // One block: as a fragment each line took a full section gap on Film (UI review 2026-10-15).
  return (
    <div className="space-y-3">
      {status ? <p className="type-caption text-[var(--text-muted)]">{status}</p> : null}

      {durableCampaign && campaignCharacterMismatch
        ? (() => {
            const other =
              getCharacter(durableCampaign.characterId)?.name?.trim() || 'another Cast member';
            const step = PLAY_CAMPAIGN_STEPS[durableCampaign.stepIndex]?.label;
            // A small notice with its own button — "Switch back" sat mid-sentence before.
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2"
                data-testid="play-campaign-resume-mismatch"
              >
                <p className="type-caption text-[var(--text-secondary)]">
                  Your saved film is {other}’s{step ? `, at ${step}` : ''}.
                </p>
                <ButtonLink
                  href={mapHref(
                    playCampaignHref(durableCampaign.characterId, durableCampaign.lookPackId)
                  )}
                  size="sm"
                  variant="secondary"
                >
                  Back to {other}
                </ButtonLink>
              </div>
            );
          })()
        : null}

      <div className="flex flex-wrap gap-2" data-testid="play-campaign-actions">
        {campaignComplete ? (
          <>
            <div
              className="w-full rounded-[var(--radius-md)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2.5"
              data-testid="play-campaign-complete"
            >
              <p className="type-caption text-[var(--tint-success-text)]">
                Film complete
                {savedCampaign?.completedAt
                  ? ` · ${new Date(savedCampaign.completedAt).toLocaleString()}`
                  : ''}{' '}
                — watch it, cut another Day, or unlock Story.
              </p>
            </div>
            {characterId ? (
              <ButtonLink
                href={mapHref(`/characters/${encodeURIComponent(characterId)}?media=films`)}
                size="sm"
                variant="primary"
                data-testid="play-campaign-open-cast-film"
              >
                Watch film on Cast
              </ButtonLink>
            ) : null}
            {characterId ? (
              <ButtonLink
                href={mapHref(remixDayFilmHref(characterId))}
                size="sm"
                variant="secondary"
                data-testid="play-campaign-cut-another"
              >
                Same look, new Day
              </ButtonLink>
            ) : null}
            {firstFilmDone && characterId && onOpenStory ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="play-campaign-open-story"
                onClick={onOpenStory}
              >
                Continue in Story
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={!characterId}
              data-testid="play-campaign-start-new"
              onClick={startNewCampaign}
            >
              Start new film
            </Button>
          </>
        ) : (
          <>
            {/* One next step, the same one the header names (resolveNextPlayAction): this
                page offered "Start at Day" under a header "Continue to Day" while the Steps list
                highlighted the optional Look (UI audit 2026-10-11). With no film yet it is Day. */}
            {characterId &&
            savedCampaign &&
            !campaignCharacterMismatch &&
            nextAction &&
            (!compact || !resumeStep) ? (
              <ButtonLink
                href={mapHref(nextAction.href)}
                size="sm"
                variant="primary"
                data-testid="play-campaign-continue"
              >
                {nextAction.label}
              </ButtonLink>
            ) : characterId && !savedCampaign ? (
              <Button
                size="sm"
                variant="primary"
                data-testid="play-campaign-start-day"
                onClick={() => goToStep('day', activeLookPack)}
              >
                {/* Their Day already has its stills: the next step is the cut, on Day. */}
                {journey?.current === 'cut' ? 'Cut film on Day' : 'Start at Day'}
              </Button>
            ) : null}
          </>
        )}
        <ButtonLink href={mapHref('/characters')} size="sm" variant="ghost">
          Cast roster
        </ButtonLink>
      </div>
    </div>
  );
}
