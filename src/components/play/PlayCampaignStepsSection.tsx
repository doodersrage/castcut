'use client';

import { PLAY_CAMPAIGN_STEPS } from '@/lib/play/campaign';
import { canEnterPlayStep, derivePlayJourney, type PlayJourney } from '@/lib/play/step-machine';
import { Button } from '@/components/ui/Button';
import type { ReactNode } from 'react';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignStepsSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  'activeStep' | 'characterId' | 'activeLookPack' | 'setStepOverride' | 'goToStep' | 'pushPlay'
> & {
  /** Story is open: a film was cut or a whole Day has rendered (isPlayStoryLocked). */
  storyOpen?: boolean;
  /** The film's steps (derivePlayJourney) — the same count and next step as the header. */
  journey?: PlayJourney | null;
  /** A picture per step (the plate, the kept outfit, the Day's stills, the film). */
  thumbs?: Partial<Record<string, ReactNode>>;
};

const CUT_DESCRIPTION = 'Cut the Short’s stills and clips into one film — once its stills are in.';

export default function PlayCampaignStepsSection({
  activeStep,
  characterId,
  activeLookPack,
  setStepOverride,
  goToStep,
  pushPlay,
  storyOpen = false,
  journey,
  thumbs = {},
}: PlayCampaignStepsSectionProps) {
  const steps = (journey ?? derivePlayJourney({})).steps;
  const anyThumb = Object.values(thumbs).some(Boolean);

  return (
    // One row of small cards, each with what it made (2026-11-05) — five tall rows repeated the
    // tabs and filled the page.
    <section className="space-y-2" data-testid="play-campaign-steps">
      <h2 className="type-overline text-[var(--text-muted)]">Steps</h2>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map(step => {
          // The film's next step (the header's Continue points at it too); not the page's own
          // default — that highlighted the optional Look under "Continue to Day".
          const isActive = journey ? step.state === 'current' : step.id === activeStep;
          const isOptional = step.optional;
          const campaignStep =
            step.id === 'cut' ? null : PLAY_CAMPAIGN_STEPS.find(s => s.id === step.id);
          const gate =
            step.id === 'cut'
              ? { ok: true as const, reason: undefined }
              : canEnterPlayStep(step.id, {
                  metrics: storyOpen ? { version: 1, firstFullDayAt: 1 } : { version: 1 },
                  campaign: characterId ? { characterId, stepIndex: 0 } : null,
                  lookPack: activeLookPack,
                });
          // Story is the step that unlocks after the first film; Outfit is optional but open.
          const isStory = step.id === 'roleplay';
          const storyLocked = isStory && !gate.ok;
          const coreNumber = step.number;
          const openDisabled = (!characterId && step.id !== 'character') || !gate.ok;
          return (
            <li
              key={step.id}
              data-testid={`play-campaign-step-${step.id}`}
              className={`flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border ${
                isActive
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[inset_0_3px_0_0_var(--accent)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]'
              }`}
            >
              {anyThumb ? (
                <div className="h-20 overflow-hidden bg-[var(--bg-muted)]" aria-hidden>
                  {thumbs[step.id] ?? null}
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="type-overline mb-1 text-[var(--text-muted)]">
                    {isOptional ? 'Optional' : `Step ${coreNumber}`}
                    {step.state === 'done' ? ' · done' : ''}
                  </p>
                  <p className="type-heading">
                    {step.label}
                    {isStory && !storyOpen ? (
                      <span className="type-caption ml-2 font-normal text-[var(--text-muted)]">
                        after a full Day
                      </span>
                    ) : null}
                  </p>
                  <p
                    className="type-caption line-clamp-2 text-[var(--text-muted)]"
                    title={campaignStep?.description ?? CUT_DESCRIPTION}
                  >
                    {storyLocked
                      ? (gate.reason ??
                        'Finish a Day first (every still rendered) — Story stays optional after that.')
                      : (campaignStep?.description ?? CUT_DESCRIPTION)}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  variant={isActive ? 'primary' : 'secondary'}
                  disabled={openDisabled}
                  data-testid={storyLocked ? 'play-campaign-step-roleplay-locked' : undefined}
                  onClick={() => {
                    if (openDisabled) {
                      return;
                    }
                    if (step.id === 'cut') {
                      goToStep('day', activeLookPack);
                      return;
                    }
                    setStepOverride(step.id);
                    if (step.id === 'character' && characterId) {
                      pushPlay(`/characters/${encodeURIComponent(characterId)}`);
                      return;
                    }
                    goToStep(step.id, activeLookPack);
                  }}
                >
                  {storyLocked ? 'Locked' : isActive ? 'Continue' : 'Open'}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
