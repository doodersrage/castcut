'use client';

import { PLAY_CAMPAIGN_STEPS } from '@/lib/play-campaign';
import { canEnterPlayStep, derivePlayJourney, type PlayJourney } from '@/lib/play-step-machine';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignStepsSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  'activeStep' | 'characterId' | 'activeLookPack' | 'setStepOverride' | 'goToStep' | 'pushPlay'
> & {
  /** Story is open: a film was cut or a whole Day has rendered (isPlayStoryLocked). */
  storyOpen?: boolean;
  /** The film's steps (derivePlayJourney) — the same count and next step as the header. */
  journey?: PlayJourney | null;
};

const CUT_DESCRIPTION =
  'Cut the Day’s stills and clips into one film — on Day, once the stills are in.';

export default function PlayCampaignStepsSection({
  activeStep,
  characterId,
  activeLookPack,
  setStepOverride,
  goToStep,
  pushPlay,
  storyOpen = false,
  journey,
}: PlayCampaignStepsSectionProps) {
  const steps = (journey ?? derivePlayJourney({})).steps;

  return (
    <ToolSection
      title="Steps"
      description="Open any film step. The button at the top of the page is the next one."
      data-testid="play-campaign-steps"
    >
      <ol className="space-y-2">
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
              className={`rounded-[var(--radius-md)] border px-3 py-3 ${
                isActive
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[inset_3px_0_0_0_var(--accent)]'
                  : 'border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
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
                  <p className="type-caption text-[var(--text-muted)]">
                    {storyLocked
                      ? (gate.reason ??
                        'Finish a Day first (every still rendered) — Story stays optional after that.')
                      : (campaignStep?.description ?? CUT_DESCRIPTION)}
                  </p>
                </div>
                <Button
                  size="sm"
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
    </ToolSection>
  );
}
