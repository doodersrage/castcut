'use client';

import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import PlayCampaignCharacterSection from '@/components/play/PlayCampaignCharacterSection';
import PlayCampaignShareLookPackSection from '@/components/play/PlayCampaignShareLookPackSection';
import PlayCampaignSavedLookPacksSection from '@/components/play/PlayCampaignSavedLookPacksSection';
import PlayCampaignStepsSection from '@/components/play/PlayCampaignStepsSection';
import PlayCampaignActionsSection from '@/components/play/PlayCampaignActionsSection';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';
import { startStarterPlayFilm } from '@/lib/play-starter';
import { hasCompletedFirstFilm, loadPlayMetrics } from '@/lib/play-metrics';
import { useSyncExternalStore } from 'react';

const ACCENT = 'amber' as const;

type PlayCampaignWizardViewModel = ReturnType<typeof usePlayCampaignWizardOrchestration>;

function subscribeNever() {
  return () => undefined;
}

export default function PlayCampaignWizardSections(props: PlayCampaignWizardViewModel) {
  const firstFilmDone = useSyncExternalStore(
    subscribeNever,
    () => hasCompletedFirstFilm(loadPlayMetrics()),
    () => false
  );

  return (
    <div data-testid="play-campaign">
      <ToolLayout
        accent={ACCENT}
        badge={<ToolBadge accent={ACCENT}>Film</ToolBadge>}
        title="Your film"
        description="Create a Cast lead, then Look → Outfit → Day → Cut film. Story is optional after your first cut."
      >
        {props.resumeStep && props.characterId && !props.campaignComplete ? (
          <div
            className="rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-4"
            data-testid="play-campaign-resume-card"
          >
            <p className="type-overline text-[var(--accent-text)]">Continue</p>
            <p className="type-heading mt-1 text-[var(--text-primary)]">
              Pick up at {props.resumeStep.label}
            </p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              {props.resumeStep.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                data-testid="play-campaign-continue"
                onClick={() => props.goToStep(props.resumeStep!.id, props.activeLookPack)}
              >
                Continue to {props.resumeStep.label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = startStarterPlayFilm({
                    existingCharacterId: props.characterId || undefined,
                  });
                  props.router.push(result.href);
                }}
              >
                Jump to starter Day
              </Button>
            </div>
          </div>
        ) : null}

        {!props.characterId && !props.campaignComplete ? (
          <div
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-4"
            data-testid="play-campaign-starter-card"
          >
            <p className="type-overline text-[var(--text-muted)]">Fast path</p>
            <p className="type-heading mt-1">Make a starter film</p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              Creates a Cast lead named Nova, seeds a day-in-the-life look, and opens Day ready to
              queue.
            </p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="primary"
                data-testid="play-campaign-starter"
                onClick={() => {
                  const result = startStarterPlayFilm();
                  props.router.push(result.href);
                }}
              >
                Make a starter film
              </Button>
            </div>
          </div>
        ) : null}

        <PlayCampaignActionsSection
          status={props.status}
          durableCampaign={props.durableCampaign}
          campaignCharacterMismatch={props.campaignCharacterMismatch}
          savedCampaign={props.savedCampaign}
          campaignComplete={props.campaignComplete}
          characterId={props.characterId}
          resumeStep={props.resumeStep}
          activeLookPack={props.activeLookPack}
          goToStep={props.goToStep}
          startNewCampaign={props.startNewCampaign}
          compact={!props.campaignComplete && Boolean(props.resumeStep)}
        />

        {props.resumeStep && props.characterId && !props.campaignComplete ? (
          <details
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
            data-testid="play-campaign-edit-details"
          >
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Edit cast &amp; steps
            </summary>
            <div className="mt-3 space-y-4">
              <PlayCampaignCharacterSection
                shared={props.shared}
                updateShared={props.updateShared}
                character={props.character}
                activeLookPack={props.activeLookPack}
                persistCharacter={props.persistCharacter}
                createCharacter={props.createCharacter}
                setStatus={props.setStatus}
              />
              <PlayCampaignStepsSection
                activeStep={props.activeStep}
                characterId={props.characterId}
                activeLookPack={props.activeLookPack}
                setStepOverride={props.setStepOverride}
                goToStep={props.goToStep}
                router={props.router}
                firstFilmDone={firstFilmDone}
              />
            </div>
          </details>
        ) : (
          <>
            <PlayCampaignCharacterSection
              shared={props.shared}
              updateShared={props.updateShared}
              character={props.character}
              activeLookPack={props.activeLookPack}
              persistCharacter={props.persistCharacter}
              createCharacter={props.createCharacter}
              setStatus={props.setStatus}
            />
            <PlayCampaignStepsSection
              activeStep={props.activeStep}
              characterId={props.characterId}
              activeLookPack={props.activeLookPack}
              setStepOverride={props.setStepOverride}
              goToStep={props.goToStep}
              router={props.router}
              firstFilmDone={firstFilmDone}
            />
          </>
        )}

        {firstFilmDone || props.savedLookPacks.length > 0 || props.activeLookPack ? (
          <details
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
            data-testid="play-campaign-look-packs"
          >
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Look packs · share &amp; import
            </summary>
            <div className="mt-3 space-y-4">
              <PlayCampaignShareLookPackSection
                lookPackFileRef={props.lookPackFileRef}
                character={props.character}
                characterId={props.characterId}
                activeLookPack={props.activeLookPack}
                effectiveLookPackId={props.effectiveLookPackId}
                portableShareLink={props.portableShareLink}
                shareCopyStatus={props.shareCopyStatus}
                setShareCopyStatus={props.setShareCopyStatus}
                setStatus={props.setStatus}
                persistCharacter={props.persistCharacter}
                router={props.router}
              />
              <PlayCampaignSavedLookPacksSection
                savedLookPacks={props.savedLookPacks}
                applySavedLookPack={props.applySavedLookPack}
              />
            </div>
          </details>
        ) : null}
      </ToolLayout>
    </div>
  );
}
