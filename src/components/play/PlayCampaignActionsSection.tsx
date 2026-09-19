'use client';

import { playCampaignHref } from '@/lib/play-campaign';
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
  activeLookPack,
  goToStep,
  startNewCampaign,
  mapHref,
  compact = false,
  firstFilmDone = false,
  onOpenStory,
}: PlayCampaignActionsSectionProps) {
  return (
    <>
      {status ? <p className="type-caption text-[var(--text-muted)]">{status}</p> : null}

      {durableCampaign && campaignCharacterMismatch ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="play-campaign-resume-mismatch"
        >
          Saved film is for another Cast character.{' '}
          <ButtonLink
            href={mapHref(
              playCampaignHref(durableCampaign.characterId, durableCampaign.lookPackId)
            )}
            size="sm"
            variant="ghost"
          >
            Switch to that character
          </ButtonLink>{' '}
          or start a new film below.
        </p>
      ) : null}

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
            {!compact && resumeStep ? (
              <Button
                size="sm"
                variant="primary"
                disabled={!characterId}
                data-testid="play-campaign-continue"
                onClick={() => goToStep(resumeStep.id, activeLookPack)}
              >
                Continue to {resumeStep.label}
              </Button>
            ) : null}
            {!compact || !resumeStep ? (
              <Button
                size="sm"
                variant={resumeStep ? 'secondary' : 'primary'}
                disabled={!characterId}
                data-testid="play-campaign-start-moodboard"
                onClick={() => goToStep('moodboard', activeLookPack)}
              >
                {resumeStep ? 'Restart at Look' : 'Start at Look'}
              </Button>
            ) : null}
          </>
        )}
        <ButtonLink href={mapHref('/characters')} size="sm" variant="ghost">
          Cast roster
        </ButtonLink>
      </div>
    </>
  );
}
