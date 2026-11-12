'use client';

import { isPlayStoryLocked } from '@/lib/play/step-machine';

import { ToolLayout } from '@/components/ui/ToolPageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import dynamic from 'next/dynamic';
import PlayCampaignCharacterSection from '@/components/play/PlayCampaignCharacterSection';
import PlayCampaignShareLookPackSection from '@/components/play/PlayCampaignShareLookPackSection';
import PlayCampaignSavedLookPacksSection from '@/components/play/PlayCampaignSavedLookPacksSection';
import PlayCampaignStepsSection from '@/components/play/PlayCampaignStepsSection';
import PlayCampaignActionsSection from '@/components/play/PlayCampaignActionsSection';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import PlayPersistenceTriad from '@/components/PlayPersistenceTriad';
import PlayIdentityReadyBanner from '@/components/PlayIdentityReadyBanner';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

import { startStarterPlayFilm } from '@/lib/play/starter';
import { hasCompletedFirstFilm, loadPlayMetrics } from '@/lib/play/metrics';
import { welcomeSampleFilmShots } from '@/lib/film/welcome-sample-film';
import { useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import SideSheet from '@/components/ui/SideSheet';
import {
  PlayCastChip,
  PlayFilmHero,
  PlayFilmWaiting,
  PlayFilmsShelf,
} from '@/components/play/PlayFilmHome';
import { usePlayFilmHome } from '@/hooks/usePlayFilmHome';
import { filmHomeProgress } from '@/lib/play/film-home';
import { activeLook } from '@/lib/character/os';
import { loadSettingsCache, SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings/cache';
import { resolveFittingPlateFromCharacter } from '@/lib/character/plate';
import { galleryEntryPrimaryViewUrl, galleryEntryThumbUrls } from '@/lib/gallery/comfyui-gallery';

// Owns a ComfyUI queue hook — loaded only once a Cast was just created.
const CastFirstPlatePanel = dynamic(() => import('@/components/play/CastFirstPlatePanel'), {
  ssr: false,
});

const ACCENT = 'amber' as const;

type PlayCampaignWizardViewModel = ReturnType<typeof usePlayCampaignWizardOrchestration>;

function subscribeNever() {
  return () => undefined;
}

function subscribeSettings(onChange: () => void): () => void {
  window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onChange);
}

/** The finished stills on this Cast's Day, morning to night (JSON, for a stable snapshot). */
function dayStillsJson(characterId: string | null | undefined): string {
  const day = loadSettingsCache().tools?.day;
  if (!characterId || day?.stillsCharacterId !== characterId) return '[]';
  return JSON.stringify(
    (day.stills ?? [])
      .filter(still => still.status === 'completed' && still.imageUrl?.trim())
      .map(still => still.imageUrl!.trim())
  );
}

export default function PlayCampaignWizardSections(props: PlayCampaignWizardViewModel) {
  const firstFilmDone = useSyncExternalStore(
    subscribeNever,
    () => hasCompletedFirstFilm(loadPlayMetrics()),
    () => false
  );
  // Story's step: open after the first cut or a whole Day of stills.
  const storyOpen = useSyncExternalStore(
    subscribeNever,
    () => !isPlayStoryLocked(loadPlayMetrics()),
    () => false
  );
  const midFilm = Boolean(props.resumeStep && props.characterId && !props.campaignComplete);
  const emptyHub = !props.characterId && !props.campaignComplete;
  const showPersistence =
    Boolean(props.activeLookPack) ||
    midFilm ||
    props.campaignComplete ||
    Boolean(props.characterId);

  // The Film home (2026-11-05): the film up top, the Cast as a chip, steps as one row of cards.
  const searchParams = useSearchParams();
  const creating = searchParams.get('new') === '1';
  const home = usePlayFilmHome(props.characterId);
  const [castSheetOpen, setCastSheetOpen] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const shownFilm = home.films.find(film => film.id === watchId) ?? home.films[0] ?? null;
  const look = props.character ? activeLook(props.character) : undefined;
  const plate = resolveFittingPlateFromCharacter(props.character)?.imageUrl?.trim() || null;
  // With a Cast picked the picker folds into a chip; creating one (or none yet) keeps it open.
  const castAsChip = Boolean(props.characterId && props.character && !creating);
  const thumbImg = (url: string | null | undefined, key?: string) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element -- a step's picture
      <img
        key={key ?? url}
        src={url}
        alt=""
        className="h-full min-w-0 flex-1 object-cover object-top"
        loading="lazy"
      />
    ) : null;
  // The Day's own stills when the Gallery has none of theirs yet (or isn't loaded).
  const dayStills = useSyncExternalStore(
    subscribeSettings,
    () => dayStillsJson(props.characterId),
    () => '[]'
  );
  const dayStillUrls = JSON.parse(dayStills) as string[];
  const reel = home.stills.length
    ? home.stills
        .map(entry => galleryEntryPrimaryViewUrl(entry))
        .filter((url): url is string => Boolean(url))
        .reverse()
    : dayStillUrls;
  const stillThumbs = (
    home.stills.length
      ? home.stills.slice(0, 3).map(entry => galleryEntryThumbUrls(entry)[0] ?? null)
      : dayStillUrls.slice(-3)
  ).map((url, index) => thumbImg(url, `${index}-${url}`));
  const latestFilmUrl = home.films[0] ? galleryEntryPrimaryViewUrl(home.films[0]) : null;
  const stepThumbs = {
    character: thumbImg(plate),
    fitting: look?.lockedWardrobeId ? thumbImg(plate) : null,
    day: stillThumbs.length ? <div className="flex h-full gap-px">{stillThumbs}</div> : null,
    cut: latestFilmUrl ? (
      <video
        src={`${latestFilmUrl}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className="h-full w-full bg-black object-cover"
      />
    ) : null,
  };

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
      storyOpen={storyOpen}
      journey={props.journey}
      thumbs={castAsChip ? stepThumbs : undefined}
    />
  );

  // Mid-film: why, and the step itself on the button (in the hero, or above the steps when the
  // Cast record isn't loaded).
  const resumeCard = midFilm ? (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
      data-testid="play-campaign-resume-card"
    >
      <div className="min-w-0">
        <p className="type-overline text-[var(--accent-text)]">Continue</p>
        <p className="type-caption text-[var(--text-secondary)]">
          {props.nextAction?.reason ?? props.resumeStep!.description}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* The film's next step, the same one the header and the step strip name. */}
        {props.nextAction ? (
          <ButtonLink
            href={props.mapHref(props.nextAction.href)}
            size="sm"
            variant="primary"
            data-testid="play-campaign-continue"
          >
            {props.nextAction.label}
          </ButtonLink>
        ) : (
          <Button
            size="sm"
            variant="primary"
            data-testid="play-campaign-continue"
            onClick={() => props.goToStep(props.resumeStep!.id, props.activeLookPack)}
          >
            Continue to {props.resumeStep!.label}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          data-testid="play-campaign-start-day"
          onClick={() => props.goToStep('day', props.activeLookPack)}
        >
          Restart at Short
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="play-campaign-jump-starter"
          onClick={() => runStarter(props.characterId || undefined)}
        >
          Starter short
        </Button>
      </div>
    </div>
  ) : null;

  const lookPacksBlock =
    firstFilmDone || props.savedLookPacks.length > 0 || props.activeLookPack ? (
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
    ) : null;

  return (
    <div data-testid="play-campaign" data-mobile-studio={props.mobileStudio ? 'true' : 'false'}>
      <ToolLayout
        width="full"
        accent={ACCENT}
        title={props.campaignComplete ? 'Film complete' : 'Your film'}
        description={
          props.campaignComplete
            ? 'Watch it, cut another short, or carry on in Story.'
            : 'Pick who it’s about, plan their Short, then cut the film.'
        }
      >
        {/* Shell already mounts habit on /m/* — avoid stacking on phone Film. */}
        {!props.mobileStudio ? <PlayHabitNudgeBanner /> : null}
        <PlayIdentityReadyBanner />
        {/* The chip names who and which look once there's a Cast. */}
        {showPersistence && !castAsChip ? <PlayPersistenceTriad compact /> : null}

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
              {/* Compact: full width, the sample filled the first screen and hid Start. */}
              <FilmWatchPlayer
                compact
                shots={welcomeSampleFilmShots()}
                emptyLabel="Sample reel unavailable."
              />
              {/* One starter action: "Make one like this" and a separate Fast path card both ran
                  the starter film (UI review 2026-10-15). */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="primary"
                  data-testid="play-campaign-starter"
                  onClick={() => runStarter()}
                >
                  Make a starter film
                </Button>
                <span className="type-caption text-[var(--text-muted)]">
                  Makes a Cast called Nova and opens Day, ready to render.
                </span>
              </div>
            </div>
          </>
        ) : null}

        {/* The Cast just created: its first plate and where to go next, above everything else. */}
        {props.createdCastId && props.character?.id === props.createdCastId ? (
          <CastFirstPlatePanel characterId={props.createdCastId} mapHref={props.mapHref} />
        ) : null}

        {castAsChip ? (
          <>
            <PlayFilmHero
              who={
                <PlayCastChip
                  name={props.character!.name?.trim() || 'Cast'}
                  look={look?.name}
                  plate={plate}
                  onOpen={() => setCastSheetOpen(true)}
                />
              }
              film={shownFilm}
              reel={reel}
              progress={filmHomeProgress({
                ...home,
                stillCount: Math.max(home.stillCount, dayStillUrls.length),
              })}
              actions={
                <div className="space-y-3">
                  {resumeCard}
                  {props.activeLookPack ? (
                    <p
                      className="type-caption text-[var(--text-muted)]"
                      data-testid="play-film-look-pack"
                    >
                      Look pack staged — Outfit and Day use its style notes.
                    </p>
                  ) : null}
                  <PlayCampaignActionsSection
                    status={props.status}
                    durableCampaign={props.durableCampaign}
                    campaignCharacterMismatch={props.campaignCharacterMismatch}
                    savedCampaign={props.savedCampaign}
                    campaignComplete={props.campaignComplete}
                    characterId={props.characterId}
                    resumeStep={props.resumeStep}
                    nextAction={props.nextAction}
                    journey={props.journey}
                    activeLookPack={props.activeLookPack}
                    goToStep={props.goToStep}
                    startNewCampaign={props.startNewCampaign}
                    mapHref={props.mapHref}
                    firstFilmDone={firstFilmDone}
                    compact={midFilm}
                    onOpenStory={() => props.goToStep('roleplay', props.activeLookPack)}
                  />
                </div>
              }
              aside={
                <PlayFilmWaiting
                  jobs={home.jobs}
                  notes={home.openNotes}
                  notesHref={props.mapHref('/cut?from=day')}
                />
              }
            />
            {stepsBlock}
            <PlayFilmsShelf
              films={home.films}
              selectedId={shownFilm?.id}
              onWatch={setWatchId}
              allHref={props.mapHref(
                `/characters/${encodeURIComponent(props.characterId!)}?media=films`
              )}
            />
          </>
        ) : (
          <>
            {resumeCard}
            <PlayCampaignActionsSection
              compact={midFilm}
              status={props.status}
              durableCampaign={props.durableCampaign}
              campaignCharacterMismatch={props.campaignCharacterMismatch}
              savedCampaign={props.savedCampaign}
              campaignComplete={props.campaignComplete}
              characterId={props.characterId}
              resumeStep={props.resumeStep}
              nextAction={props.nextAction}
              journey={props.journey}
              activeLookPack={props.activeLookPack}
              goToStep={props.goToStep}
              startNewCampaign={props.startNewCampaign}
              mapHref={props.mapHref}
              firstFilmDone={firstFilmDone}
              onOpenStory={() => props.goToStep('roleplay', props.activeLookPack)}
            />
            {characterBlock}
            {stepsBlock}
          </>
        )}

        {castAsChip ? null : lookPacksBlock}
      </ToolLayout>
      {castAsChip ? (
        <SideSheet
          open={castSheetOpen}
          onClose={() => setCastSheetOpen(false)}
          title="Who the film is about"
          description="The Cast member and which of their looks — Day, Outfit and Story follow it."
          testId="play-cast-sheet"
          size="lg"
        >
          <div className="space-y-4">
            {characterBlock}
            {lookPacksBlock}
          </div>
        </SideSheet>
      ) : null}
    </div>
  );
}
