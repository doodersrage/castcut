'use client';

import { playCampaignHref } from '@/lib/play-campaign';
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
> & {
  /** When true, hide the primary Continue (shown in the resume card above). */
  compact?: boolean;
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
  compact = false,
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
            href={playCampaignHref(durableCampaign.characterId, durableCampaign.lookPackId)}
            size="sm"
            variant="ghost"
          >
            Switch to that character
          </ButtonLink>{' '}
          or start a new film below.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
                — watch it on Cast, cut another Day film, or start another loop.
              </p>
            </div>
            {characterId ? (
              <ButtonLink
                href={`/characters/${encodeURIComponent(characterId)}?media=films`}
                size="sm"
                variant="primary"
                data-testid="play-campaign-open-cast-film"
                onClick={() => {
                  void import('@/lib/onboarding-hooks').then(({ markOnboardingWatchFirstFilm }) => {
                    markOnboardingWatchFirstFilm();
                  });
                }}
              >
                Watch film on Cast
              </ButtonLink>
            ) : null}
            {characterId ? (
              <ButtonLink
                href={`/day?character=${encodeURIComponent(characterId)}`}
                size="sm"
                variant="secondary"
                data-testid="play-campaign-cut-another"
              >
                Cut another Day film
              </ButtonLink>
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
            <Button
              size="sm"
              variant={compact ? 'ghost' : resumeStep ? 'secondary' : 'primary'}
              disabled={!characterId}
              data-testid="play-campaign-start-moodboard"
              onClick={() => goToStep('moodboard', activeLookPack)}
            >
              {resumeStep ? 'Restart at Look' : 'Start at Look'}
            </Button>
          </>
        )}
        <ButtonLink href="/characters" size="sm" variant="ghost">
          Cast roster
        </ButtonLink>
      </div>
    </>
  );
}
