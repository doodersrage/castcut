'use client';

import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import PlayCampaignCharacterSection from '@/components/play/PlayCampaignCharacterSection';
import PlayCampaignShareLookPackSection from '@/components/play/PlayCampaignShareLookPackSection';
import PlayCampaignSavedLookPacksSection from '@/components/play/PlayCampaignSavedLookPacksSection';
import PlayCampaignStepsSection from '@/components/play/PlayCampaignStepsSection';
import PlayCampaignActionsSection from '@/components/play/PlayCampaignActionsSection';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import PlayPersistenceTriad from '@/components/PlayPersistenceTriad';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import PlayIdentityReadyBanner from '@/components/PlayIdentityReadyBanner';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';
import { startStarterPlayFilm } from '@/lib/play-starter';
import { hasCompletedFirstFilm, loadPlayMetrics } from '@/lib/play-metrics';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
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
  const midFilm = Boolean(props.resumeStep && props.characterId && !props.campaignComplete);
  const emptyHub = !props.characterId && !props.campaignComplete;
  const showPersistence =
    Boolean(props.activeLookPack) ||
    midFilm ||
    props.campaignComplete ||
    Boolean(props.characterId);

  const runStarter = (existingCharacterId?: string) => {
    const result = startStarterPlayFilm({
      existingCharacterId: existingCharacterId || undefined,
    });
    props.pushPlay(result.href);
  };

  const characterBlock = (
    <PlayCampaignCharacterSection
      shared={props.shared}
      updateShared={props.updateShared}
      character={props.character}
      activeLookPack={props.activeLookPack}
      persistCharacter={props.persistCharacter}
      createCharacter={props.createCharacter}
      setStatus={props.setStatus}
    />
  );

  const stepsBlock = (
    <PlayCampaignStepsSection
      activeStep={props.activeStep}
      characterId={props.characterId}
      activeLookPack={props.activeLookPack}
      setStepOverride={props.setStepOverride}
      goToStep={props.goToStep}
      pushPlay={props.pushPlay}
      firstFilmDone={firstFilmDone}
    />
  );

  return (
    <div data-testid="play-campaign" data-mobile-studio={props.mobileStudio ? 'true' : 'false'}>
      <ToolLayout
        accent={ACCENT}
        badge={<ToolBadge accent={ACCENT}>Film</ToolBadge>}
        title={props.campaignComplete ? 'Film complete' : 'Your film'}
        description={
          props.campaignComplete
            ? 'Watch on Cast, cut another Day with the same look, or continue in Story.'
            : 'Create a Cast lead, then Look → Outfit → Day → Cut. Or jump straight to a starter Day film.'
        }
      >
        {/* Shell already mounts habit on /m/* — avoid stacking on phone Film. */}
        {!props.mobileStudio ? <PlayHabitNudgeBanner /> : null}
        <PlayFilmEngineBanner />
        <PlayIdentityReadyBanner />
        {showPersistence ? <PlayPersistenceTriad compact /> : null}

        {props.campaignComplete ? (
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
            mapHref={props.mapHref}
            firstFilmDone={firstFilmDone}
            onOpenStory={() => props.goToStep('roleplay', props.activeLookPack)}
          />
        ) : null}

        {midFilm ? (
          <div
            className="rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-4"
            data-testid="play-campaign-resume-card"
          >
            <p className="type-overline text-[var(--accent-text)]">Continue</p>
            <p className="type-heading mt-1 text-[var(--text-primary)]">
              Pick up at {props.resumeStep!.label}
            </p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              {props.resumeStep!.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                data-testid="play-campaign-continue"
                onClick={() => props.goToStep(props.resumeStep!.id, props.activeLookPack)}
              >
                Continue to {props.resumeStep!.label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="play-campaign-start-moodboard"
                onClick={() => props.goToStep('moodboard', props.activeLookPack)}
              >
                Restart at Look
              </Button>
            </div>
            <details className="mt-3">
              <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
                More · jump to starter Day
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="play-campaign-jump-starter"
                  onClick={() => runStarter(props.characterId || undefined)}
                >
                  Jump to starter Day
                </Button>
              </div>
            </details>
          </div>
        ) : null}

        {emptyHub ? (
          <>
            <div
              className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-4"
              data-testid="play-campaign-sample-reel"
            >
              <p className="type-overline text-[var(--text-muted)]">What you&apos;re making</p>
              <p className="type-caption mt-1 mb-3 text-[var(--text-secondary)]">
                Four stills — morning to night — cut into a short reel you can watch on Cast.
              </p>
              <FilmWatchPlayer
                shots={welcomeSampleFilmShots()}
                emptyLabel="Sample reel unavailable."
              />
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="play-campaign-sample-starter"
                  onClick={() => runStarter()}
                >
                  Make one like this
                </Button>
              </div>
            </div>

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
                  onClick={() => runStarter()}
                >
                  Make a starter film
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {!props.campaignComplete ? (
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
            mapHref={props.mapHref}
            compact={midFilm}
            firstFilmDone={firstFilmDone}
          />
        ) : null}

        {/* Mission-control chips — shell skips funnel on /m/film to avoid stacking. */}
        <div className="mt-1" data-testid="play-campaign-mission-control">
          <PlayFunnelStrip compact />
        </div>

        {midFilm || props.campaignComplete ? (
          <details
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
            data-testid="play-campaign-edit-details"
          >
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Edit cast &amp; steps
            </summary>
            <div className="mt-3 space-y-4">
              {characterBlock}
              {stepsBlock}
            </div>
          </details>
        ) : (
          <>
            {characterBlock}
            {stepsBlock}
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
                replacePlay={props.replacePlay}
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
