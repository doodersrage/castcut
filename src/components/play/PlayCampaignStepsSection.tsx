'use client';

import { PLAY_CAMPAIGN_STEPS } from '@/lib/play-campaign';
import { canEnterPlayStep } from '@/lib/play-step-machine';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignStepsSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  'activeStep' | 'characterId' | 'activeLookPack' | 'setStepOverride' | 'goToStep' | 'pushPlay'
> & {
  firstFilmDone?: boolean;
};

export default function PlayCampaignStepsSection({
  activeStep,
  characterId,
  activeLookPack,
  setStepOverride,
  goToStep,
  pushPlay,
  firstFilmDone = false,
}: PlayCampaignStepsSectionProps) {
  const steps = PLAY_CAMPAIGN_STEPS;

  return (
    <ToolSection
      title="Steps"
      description="Open any film step — primary path stays the Continue card above."
      data-testid="play-campaign-steps"
    >
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const isActive = step.id === activeStep;
          const isOptional = Boolean(step.optional);
          const gate = canEnterPlayStep(step.id, {
            metrics: firstFilmDone ? { version: 1, firstFilmCutAt: 1 } : { version: 1 },
            campaign: characterId ? { characterId, stepIndex: 0 } : null,
            lookPack: activeLookPack,
          });
          const storyLocked = isOptional && !gate.ok;
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
                    {isOptional ? 'Optional' : `Step ${index + 1}`}
                  </p>
                  <p className="type-heading">
                    {step.label}
                    {isOptional ? (
                      <span className="type-caption ml-2 font-normal text-[var(--text-muted)]">
                        {firstFilmDone ? 'unlocked' : 'after first film'}
                      </span>
                    ) : null}
                  </p>
                  <p className="type-caption text-[var(--text-muted)]">
                    {storyLocked
                      ? (gate.reason ??
                        'Cut your first Day film first — Story stays optional after that.')
                      : step.description}
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
