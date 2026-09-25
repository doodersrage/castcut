'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import DayMoodStrip from '@/components/day-planner/DayMoodStrip';
import DayRemixMenu from '@/components/day-planner/DayRemixMenu';
import DaySeriesPanel from '@/components/day-planner/DaySeriesPanel';
import DayPlayPhaseStrip from '@/components/day-planner/DayPlayPhaseStrip';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import DayGetStartedCard from '@/components/day-planner/DayGetStartedCard';
import DayStatusStrip from '@/components/day-planner/DayStatusStrip';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import SharedToolControls from '@/components/SharedToolControls';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import {
  ChipButton,
  FieldDivider,
  FieldError,
  FieldLabel,
  SelectInput,
  TextArea,
} from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import WardrobeKitPicker from '@/components/wardrobe/WardrobeKitPicker';
import CustomGarmentPhotoControls from '@/components/fitting/CustomGarmentPhotoControls';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import {
  buildDayProgressLightboxState,
  daySessionStatusLine,
  type DaySlotId,
} from '@/lib/day-planner';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import {
  resolveFilmFailurePlaybook,
  resolveQueueFailureGuideLabel,
} from '@/lib/queue-failure-playbook';
import { toMobileStudioHref } from '@/lib/mobile-studio';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { deriveDayPhase } from '@/lib/play-step-machine';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

function subscribePlayMetrics(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
}

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;

export default function MobileDayToolSections(vm: ViewModel) {
  useWardrobeGarmentThumbManifestGeneration();
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    setError,
    filmGuideHref,
    busy,
    activeSlotId,
    setActiveSlotId,
    assemblingFilm,
    filmStatus,
    season,
    seasonStitching,
    seasonStatus,
    stitchSeason,
    startNewSeason,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    hasPlate,
    plate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
    allowCompanions,
    setAllowCompanions,
    dayLength,
    setDayLength,
    autoReviewStills,
    setAutoReviewStills,
    posePriority,
    setPosePriority,
    qualityStatus,
    qualityLedger,
    clipChecks,
    hideStickyCutCoach,
    setHideStickyCutCoach,
    dayMood,
    setDayMood,
    intimateEnabled,
    intimateMix,
    setIntimateMix,
    suggestDayScenes,
    rerollActiveSlotScene,
    queueBlockReason,
    poseGuideLine,
    poseGuidePreviews,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    updateSlot,
    wardrobeLabelFor,
    queueSlot,
    queueAll,
    animateSlot,
    animateAllClips,
    cutDayFilm,
    saveFilmToCast,
    completedShotCount,
    fittingWardrobe,
    firstCutCelebrate,
    shareLastCut,
    saveFilmPoster,
    posterBusy,
    remixSameLookDay,
    remixThemeDay,
    remixNewOutfitDay,
    seedDemoStills,
    leanChrome,
    goRoleplay,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectSlotWardrobe,
  } = vm;

  const hasCustomGarment = Boolean(toolSettings.customGarmentImageUrl?.trim());
  const [sampleWatch, setSampleWatch] = useState(false);
  const [jumpInMode, setJumpInMode] = useState(false);
  const [progressLightbox, setProgressLightbox] = useState<ImageLightboxState | null>(null);
  const [progressLightboxSlotIds, setProgressLightboxSlotIds] = useState<DaySlotId[]>([]);
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance({ mobile: true });
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const wardrobeKitDeck = useMemo(
    () => buildWardrobeKitPickerDeck(filteredWardrobeOptions, activeSlot.wardrobeId),
    [activeSlot.wardrobeId, filteredWardrobeOptions]
  );
  const slotTotal = slots.length || 4;
  const completedClipCount = useMemo(
    () =>
      stills.filter(entry => entry.clipStatus === 'completed' && Boolean(entry.clipUrl?.trim()))
        .length,
    [stills]
  );
  const dayStatusLine = daySessionStatusLine({
    hasPlate,
    dayMood,
    intimateMix,
    completedStills: completedShotCount,
    completedClips: completedClipCount,
    slotTotal,
    kitLabel: wardrobeLabelFor(activeSlot.wardrobeId),
  });
  const collapseEditors =
    leanChrome && (jumpInMode || busy || assemblingFilm || completedShotCount > 0);
  const showCutCoach =
    completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm && !hideStickyCutCoach;
  const cutCoachEligible = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;
  const queueBlocked = Boolean(queueBlockReason);
  const showAnimateCoach =
    completedShotCount > 0 &&
    completedClipCount < completedShotCount &&
    !firstCutCelebrate &&
    !assemblingFilm;
  const showDemoEscape = completedShotCount === 0;
  const showSampleEscape = watchPlaylist.length === 0;
  const setupDefaultOpen = !character || !hasPlate;
  const editDefaultOpen = true;
  const playbookHref =
    filmGuideHref ?? (error ? resolveFilmFailurePlaybook(error).href : undefined);
  const firstFilmDone = useSyncExternalStore(
    subscribePlayMetrics,
    () => hasCompletedFirstFilm(loadPlayMetrics()),
    () => false
  );
  const dayPhase = deriveDayPhase({
    completedStills: completedShotCount,
    completedClips: completedClipCount,
    firstFilmDone,
    filmNeedsCast,
    campaignCompleted: firstCutCelebrate || firstFilmDone,
    slotCount: slots.length,
  });
  const showFinalPass = leanChrome;
  const galleryFilmHref = character
    ? toMobileStudioHref(`/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`)
    : toMobileStudioHref('/gallery');
  const watchCastHref = character
    ? toMobileStudioHref(`/characters/${encodeURIComponent(character.id)}?media=films`)
    : toMobileStudioHref('/characters');

  const openProgressLightbox = useCallback(
    (slotId: string) => {
      const next = buildDayProgressLightboxState(slots, stills, slotId);
      if (!next) {
        return;
      }
      setProgressLightboxSlotIds(next.slotIds);
      setProgressLightbox({
        images: next.images,
        titles: next.titles,
        originalImages: next.images,
        index: next.index,
        title: next.title,
      });
    },
    [slots, stills]
  );

  const progressLightboxSlideChrome = useMemo((): ImageLightboxSlideChrome | null => {
    if (!progressLightbox || progressLightboxSlotIds.length === 0) {
      return null;
    }
    const slotId = progressLightboxSlotIds[progressLightbox.index];
    const slot = slotId ? slots.find(entry => entry.id === slotId) : undefined;
    if (!slot) {
      return null;
    }
    return {
      showRequeue: true,
      showSeedVariation: false,
      showImprove: false,
      showCompose: false,
      showInpaint: false,
      showUseStack: false,
      showUsePromptStack: false,
      showUseFace: false,
      onRequeue: () => {
        void queueSlot(slot);
      },
    };
  }, [progressLightbox, progressLightboxSlotIds, queueSlot, slots]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (cancelled) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      setJumpInMode(
        params.get('starter') === '1' ||
          params.get('remix') === '1' ||
          params.get('autocut') === '1' ||
          params.get('autoqueue') === '1'
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4" data-testid="mobile-day">
      <div className="space-y-1">
        <h1 className="type-display text-2xl tracking-tight">Day</h1>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Tap a time of day → Queue day → Cut film.
        </p>
      </div>

      <PlayFilmEngineBanner />
      <PlaySoftAdvanceBanner
        key={softAdvance?.nonce ?? 'idle'}
        target={softAdvance}
        onCancel={cancelSoftAdvance}
      />

      {!firstCutCelebrate ? (
        <div className="space-y-2">
          <DayPlayPhaseStrip
            activePhase={dayPhase ?? 'queue'}
            completedStills={completedShotCount}
            completedClips={completedClipCount}
            slotTotal={slotTotal}
          />
          <DayGetStartedCard
            hasCharacter={Boolean(character)}
            hasPlate={hasPlate}
            characterId={character?.id}
            mobile
          />
          <DayStatusStrip
            statusLine={dayStatusLine}
            // The get-started card already says what's missing.
            queueBlockReason={character && hasPlate ? queueBlockReason : null}
            poseGuideLine={poseGuideLine}
            poseGuidePreviews={poseGuidePreviews}
          />
        </div>
      ) : null}

      {firstCutCelebrate ? (
        <div
          className="rounded-2xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
          data-testid="day-first-cut-celebrate"
        >
          <p className="type-overline text-[var(--tint-success-text)]">First film</p>
          <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
          <p className="type-caption mt-1 text-[var(--text-muted)]">
            {filmNeedsCast
              ? 'Save the cut to Cast first — then Watch or open Gallery.'
              : 'Watch on Cast, browse Gallery, or extend this character’s film with Story.'}
          </p>
          <div className="mt-3 grid gap-2">
            {filmNeedsCast ? (
              <Button
                variant="primary"
                className="w-full justify-center"
                disabled={busy || assemblingFilm}
                onClick={saveFilmToCast}
                data-testid="day-save-film-cast"
              >
                Save film to Cast
              </Button>
            ) : null}
            {filmNeedsCast && !character ? (
              <Link
                href="/m"
                className="ui-btn-secondary w-full justify-center text-center text-sm"
                data-testid="day-pick-cast"
              >
                Pick Cast character
              </Link>
            ) : null}
            {character && !filmNeedsCast ? (
              <Link
                href={watchCastHref}
                className="ui-btn-primary w-full justify-center text-center text-sm"
                data-testid="day-first-cut-watch"
              >
                Watch on Cast
              </Link>
            ) : null}
            {character && !filmNeedsCast ? (
              <Link
                href={galleryFilmHref}
                className="ui-btn-secondary w-full justify-center text-center text-sm"
                data-testid="day-first-cut-gallery"
              >
                Open in Gallery
              </Link>
            ) : null}
            <Button
              variant="secondary"
              className="w-full justify-center"
              data-testid="day-first-cut-share"
              onClick={() => void shareLastCut()}
            >
              Share cut
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-center"
              loading={posterBusy}
              loadingLabel="Saving"
              data-testid="day-first-cut-poster"
              onClick={() => void saveFilmPoster()}
            >
              Save poster
            </Button>
            {character ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                data-testid="day-first-cut-remix"
                onClick={remixSameLookDay}
              >
                Same look, new Day
              </Button>
            ) : null}
            {character ? (
              <DayRemixMenu
                stacked
                testIdPrefix="day-first-cut"
                onNewOutfit={remixNewOutfitDay}
                onTheme={remixThemeDay}
              />
            ) : null}
            {character ? (
              <Button
                variant="secondary"
                className="w-full justify-center"
                data-testid="day-first-cut-story"
                onClick={() => {
                  cancelSoftAdvance();
                  goRoleplay();
                }}
              >
                Story unlocked
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCutCoach ? (
        <div
          className="rounded-2xl border border-[var(--accent-border)] bg-[var(--bg-elevated)] px-4 py-3"
          data-testid="day-cut-coach"
          role="status"
        >
          <p className="type-overline text-[var(--accent-text)]">Ready to cut</p>
          <p className="type-heading text-[var(--text-primary)]">
            Cut film · {completedShotCount} of {slotTotal}
          </p>
          <p className="type-caption text-[var(--text-muted)]">
            {completedShotCount < slotTotal
              ? 'Cut with what you have, or wait for the rest.'
              : 'All stills ready — cut the reel.'}
          </p>
          <div className="mt-3 grid gap-2">
            <PrimaryButton
              disabled={busy || assemblingFilm}
              loading={assemblingFilm}
              loadingLabel="Cutting film"
              className="w-full justify-center"
              data-testid="day-cut-coach-cut"
              onClick={() => void cutDayFilm()}
            >
              Cut film
            </PrimaryButton>
            {completedShotCount < slotTotal ? (
              <Button
                variant="ghost"
                disabled={busy || queueBlocked}
                className="w-full justify-center"
                data-testid="day-cut-coach-queue"
                onClick={() => void queueAll()}
              >
                Queue rest
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="w-full justify-center"
              data-testid="day-cut-coach-hide"
              onClick={() => setHideStickyCutCoach(true)}
            >
              Hide
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="type-caption text-[var(--text-muted)]">Day</p>
          <p className="type-caption text-[var(--accent-text)]">Editing {activeSlot.label}</p>
        </div>
        <DaySlotBoard
          slots={slots}
          stills={stills}
          activeSlotId={activeSlotId}
          busy={busy}
          queueBlocked={queueBlocked}
          compact
          onSelectSlot={setActiveSlotId}
          onOpenStill={openProgressLightbox}
          onRetrySlot={slot => void queueSlot(slot)}
          onAnimateSlot={slot => void animateSlot(slot)}
          onRerollSlot={slot => {
            rerollActiveSlotScene({ slotId: slot.id });
          }}
          qualityLedger={qualityLedger}
          clipChecks={clipChecks}
        />
        <DayMoodStrip
          busy={busy}
          allowCompanions={allowCompanions}
          onAllowCompanionsChange={setAllowCompanions}
          posePriority={posePriority}
          onPosePriorityChange={setPosePriority}
          autoReviewStills={autoReviewStills}
          onAutoReviewStillsChange={setAutoReviewStills}
          qualityStatus={qualityStatus}
          dayMood={dayMood}
          onDayMoodChange={setDayMood}
          intimateMix={intimateMix}
          onIntimateMixChange={setIntimateMix}
          intimateEnabled={intimateEnabled}
          dayLength={dayLength}
          onDayLengthChange={setDayLength}
        />
        <div className="grid gap-2" data-testid="day-active-plan">
          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Setting · {activeSlot.label}</FieldLabel>
            <TextArea
              rows={2}
              data-testid="day-slot-location"
              value={activeSlot.location ?? ''}
              placeholder="e.g. sunlit café, rainy commute"
              onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <FieldLabel>Beat · {activeSlot.label}</FieldLabel>
            <TextArea
              rows={2}
              data-testid="day-slot-beat"
              value={activeSlot.sceneHints ?? ''}
              placeholder="What happens in this part of the day?"
              onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
            />
          </label>
        </div>
        <div className="grid gap-2" data-testid="day-queue-actions">
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="day-suggest"
            onClick={() => suggestDayScenes()}
            className="w-full justify-center"
          >
            Suggest day
          </Button>
          <PrimaryButton
            disabled={busy || queueBlocked}
            loading={busy}
            data-testid="day-queue-all"
            onClick={() => void queueAll()}
            className="w-full justify-center"
          >
            {leanChrome && !firstFilmDone && !firstCutCelebrate ? 'Queue day · draft' : 'Queue day'}
          </PrimaryButton>
          {showFinalPass ? (
            <Button
              variant="secondary"
              disabled={busy || queueBlocked}
              data-testid="day-queue-final"
              onClick={() => void queueAll({ qualityProfile: 'final' })}
              className="w-full justify-center"
            >
              Final pass
            </Button>
          ) : null}
          <Button
            variant="ghost"
            disabled={busy || queueBlocked}
            data-testid="day-slot-queue"
            onClick={() => void queueSlot(activeSlot)}
            className="w-full justify-center"
          >
            Queue {activeSlot.label.toLowerCase()} only
          </Button>
          {showDemoEscape ? (
            <Button
              variant="ghost"
              disabled={busy}
              data-testid="day-demo-stills"
              onClick={seedDemoStills}
              className="w-full justify-center"
            >
              Demo stills
            </Button>
          ) : null}
        </div>
        {queueBlockReason ? (
          <p
            className="type-caption text-[var(--accent-text)]"
            data-testid="day-queue-block-reason"
          >
            {queueBlockReason}
          </p>
        ) : null}
        {leanChrome ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="day-draft-hint">
            {firstFilmDone || firstCutCelebrate
              ? 'Queue day uses final quality after your first cut.'
              : 'First film queues as draft — or tap Final pass.'}
          </p>
        ) : null}
      </div>

      <div className="space-y-2" data-testid="day-reel">
        <p className="type-caption text-[var(--text-muted)]">Day reel</p>
        <FilmWatchPlayer
          shots={sampleWatch ? sampleShots : watchPlaylist}
          emptyLabel="Queue day, then Cut film."
        />
        {sampleWatch ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="day-sample-cut-hint">
            Sample reel — queue your own Day when Comfy is ready.
          </p>
        ) : null}
        {firstCutCelebrate ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid="day-reel-celebrate-hint"
          >
            Use Save / Watch above when you are ready — the reel stays here to replay.
          </p>
        ) : null}
        {!firstCutCelebrate ? (
          <div className="grid gap-2">
            {!showCutCoach ? (
              <PrimaryButton
                disabled={busy || assemblingFilm || completedShotCount === 0}
                loading={assemblingFilm}
                loadingLabel="Cutting film"
                onClick={() => void cutDayFilm()}
                className="w-full justify-center"
                data-testid="mobile-day-cut"
              >
                Cut film
              </PrimaryButton>
            ) : null}
            {cutCoachEligible && hideStickyCutCoach ? (
              <Button
                variant="ghost"
                className="w-full justify-center"
                data-testid="day-cut-coach-show"
                onClick={() => setHideStickyCutCoach(false)}
              >
                Show cut banner
              </Button>
            ) : null}
            {showSampleEscape ? (
              <Button
                variant="ghost"
                className="w-full justify-center"
                data-testid="day-watch-sample-cut"
                onClick={() => setSampleWatch(prev => !prev)}
              >
                {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
              </Button>
            ) : null}
          </div>
        ) : null}
        {filmStatus && !firstCutCelebrate ? (
          <CollapsibleSection
            title="After cut"
            summary="Save, share, remix, Cast."
            defaultOpen={false}
            persistKey="mobile-day-after-cut"
          >
            <div className="grid gap-2">
              {filmNeedsCast ? (
                <Button
                  variant="secondary"
                  disabled={busy || assemblingFilm}
                  onClick={saveFilmToCast}
                  className="w-full justify-center"
                  data-testid="day-save-film-cast"
                >
                  Save film to Cast
                </Button>
              ) : null}
              {character && !assemblingFilm ? (
                <>
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    data-testid="day-share-cut"
                    onClick={() => void shareLastCut()}
                  >
                    Share cut
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    data-testid="day-remix-day"
                    onClick={remixSameLookDay}
                  >
                    Same look, new Day
                  </Button>
                  <DayRemixMenu
                    stacked
                    testIdPrefix="day-remix"
                    onNewOutfit={remixNewOutfitDay}
                    onTheme={remixThemeDay}
                  />
                  <Link
                    href={toMobileStudioHref(
                      `/characters/${encodeURIComponent(character.id)}?media=films`
                    )}
                    className="ui-btn-primary w-full justify-center text-center text-sm"
                    data-testid="day-open-cast-film"
                  >
                    Watch on Cast
                  </Link>
                </>
              ) : null}
            </div>
          </CollapsibleSection>
        ) : null}
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
        <DaySeriesPanel
          stacked
          season={season}
          stitching={seasonStitching}
          status={seasonStatus}
          onStitch={() => void stitchSeason()}
          onNewSeason={startNewSeason}
        />
      </div>
      {showAnimateCoach ? (
        <div className="space-y-2" data-testid="day-animate">
          <p className="type-caption text-[var(--text-muted)]">
            Next · Animate → Cut — stills ready; clips preferred for a motion reel.
          </p>
          <PrimaryButton
            disabled={busy}
            data-testid="day-animate-all"
            onClick={() => void animateAllClips()}
            className="w-full justify-center"
          >
            Animate all ready stills
          </PrimaryButton>
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="day-animate-active"
            onClick={() => void animateSlot(activeSlot)}
            className="w-full justify-center"
          >
            Animate {activeSlot.label.toLowerCase()}
          </Button>
          <Button
            variant="ghost"
            disabled={busy || assemblingFilm}
            data-testid="day-animate-cut"
            onClick={() => void cutDayFilm()}
            className="w-full justify-center"
          >
            Skip to Cut film
          </Button>
        </div>
      ) : completedShotCount > 0 && !firstCutCelebrate ? (
        <div className="space-y-2" data-testid="day-animate">
          <p className="type-caption text-[var(--text-muted)]">
            Motion — re-animate or Cut when clips are ready.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void animateSlot(activeSlot)}
            className="w-full justify-center"
          >
            Animate {activeSlot.label.toLowerCase()}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void animateAllClips()}
            className="w-full justify-center"
          >
            Animate all ready stills
          </Button>
        </div>
      ) : null}

      <CollapsibleSection
        title={`Edit · ${activeSlot.label}`}
        summary="Presets, clothing, and notes for this time of day."
        defaultOpen={editDefaultOpen && !collapseEditors}
        persistKey="mobile-day-slots-lean"
      >
        <div className="space-y-2" data-testid="day-slots">
          <CollapsibleSection
            title="Setting presets"
            summary="Insert a canned location into Setting above."
            defaultOpen={false}
            persistKey="mobile-day-setting-presets"
          >
            <SelectInput
              value=""
              disabled={busy}
              data-testid="day-setting-preset"
              onChange={event => {
                const preset = ROLEPLAY_SETTING_PRESETS.find(
                  entry => entry.id === event.target.value
                );
                if (preset) {
                  updateSlot(activeSlot.id, { location: preset.setting });
                }
              }}
            >
              <option value="">Insert preset…</option>
              {ROLEPLAY_SETTING_PRESETS.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </SelectInput>
          </CollapsibleSection>

          <CollapsibleSection
            title="Clothing"
            summary={
              hasCustomGarment
                ? 'BYO clothing photo'
                : wardrobeLabelFor(activeSlot.wardrobeId) || 'Outfit kit for this slot'
            }
            defaultOpen={false}
            persistKey="mobile-day-clothing"
          >
            <div className="space-y-2" data-testid="day-clothing">
              <CustomGarmentPhotoControls
                accent="teal"
                busy={busy}
                garmentUploading={garmentUploading}
                garmentScanStatus={garmentScanStatus}
                customGarmentImageUrl={toolSettings.customGarmentImageUrl}
                customGarmentImageFilename={toolSettings.customGarmentImageFilename}
                customGarmentDescription={toolSettings.customGarmentDescription}
                testIdPrefix="day"
                onApplyCustomGarment={applyCustomGarment}
                onClearCustomGarment={clearCustomGarment}
                onRescanCustomGarment={rescanCustomGarment}
                onSaveCustomGarment={saveCurrentCustomGarment}
                onApplySavedCustomGarment={applySavedCustomGarment}
                onRemoveSavedCustomGarment={removeSavedCustomGarment}
                onCustomGarmentDescriptionChange={value =>
                  updateToolSettings({ customGarmentDescription: value })
                }
                onError={message => setError(message)}
              />
              <FieldDivider />
              <label className="block space-y-1.5 text-sm">
                <FieldLabel>Outfit kit</FieldLabel>
                {hasCustomGarment ? (
                  <p className="type-caption text-[var(--text-muted)]" data-testid="day-byo-active">
                    Using your clothing photo. Clear it above to pick a catalog kit again.
                  </p>
                ) : null}
                {wardrobeKitDeck.length > 0 ? (
                  <WardrobeKitPicker
                    kits={wardrobeKitDeck}
                    selectedId={activeSlot.wardrobeId}
                    disabled={!wardrobeReady || busy || hasCustomGarment}
                    size="sm"
                    testId="mobile-day-wardrobe-kit-picker"
                    onSelect={wardrobeId => selectSlotWardrobe(activeSlot.id, wardrobeId)}
                    onSwipe={delta => {
                      const next = fittingSwipeNeighbor(
                        wardrobeKitDeck,
                        activeSlot.wardrobeId,
                        delta
                      );
                      if (next) {
                        selectSlotWardrobe(activeSlot.id, next.id);
                      }
                    }}
                    resolveThumb={kit => ({
                      url: resolveWardrobeGarmentThumbUrl(kit.id),
                    })}
                  />
                ) : null}
                <CollapsibleSection
                  title="Kit filters"
                  summary="Clothing type and list."
                  defaultOpen={false}
                  persistKey="mobile-day-kit-filters"
                  className="mt-2"
                >
                  <label className="block space-y-1.5 text-sm">
                    <FieldLabel>Clothing type</FieldLabel>
                    <SelectInput
                      value={wardrobeCategoryFilter}
                      disabled={!wardrobeReady || busy}
                      onChange={event =>
                        updateToolSettings({
                          wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(
                            event.target.value
                          ),
                        })
                      }
                    >
                      {wardrobeCategoryFilterOptions().map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                          {option.value !== 'all' && wardrobeReady
                            ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                            : option.value === 'all' && wardrobeReady
                              ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, 'all')})`
                              : ''}
                        </option>
                      ))}
                    </SelectInput>
                  </label>
                  <label className="mt-2 block space-y-1.5 text-sm">
                    <FieldLabel>List picker</FieldLabel>
                    <SelectInput
                      value={activeSlot.wardrobeId ?? ''}
                      disabled={!wardrobeReady || busy || hasCustomGarment}
                      onChange={event => {
                        const value = event.target.value.trim();
                        selectSlotWardrobe(activeSlot.id, value || undefined);
                      }}
                    >
                      {filteredWardrobeOptions.map(option => (
                        <option key={option.value || 'default'} value={option.value}>
                          {option.group ? `${option.label} · ${option.group}` : option.label}
                        </option>
                      ))}
                    </SelectInput>
                  </label>
                </CollapsibleSection>
              </label>
            </div>
          </CollapsibleSection>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Setup"
        summary={
          hasPlate ? `${character?.name?.trim() || 'Cast'} · plate ready` : 'Character and plate.'
        }
        defaultOpen={setupDefaultOpen}
        persistKey="mobile-day-setup-lean"
        className="day-character-section"
      >
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
          <div data-testid="day-character">
            <CharacterOsPicker
              shared={shared}
              hints={character?.hints}
              onApply={patch => {
                try {
                  updateShared(patch);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not apply that character.');
                }
              }}
            />
          </div>
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            {hasPlate
              ? isolateSubject && isolatePending
                ? 'Isolating plate on white…'
                : 'Plate ready.'
              : 'No plate — Keep in Outfit or add a Cast look.'}
          </p>
          {hasPlate ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <ChipButton
                active={isolateSubject}
                disabled={busy || isolateBusy || !hasPlate}
                data-testid="day-plate-isolate"
                onClick={() => setIsolateSubject(!isolateSubject)}
              >
                Isolate on white
              </ChipButton>
              {isolateStatus ? (
                <p
                  className="type-caption mt-2 w-full text-[var(--text-muted)]"
                  data-testid="day-plate-isolate-status"
                >
                  {isolateStatus}
                </p>
              ) : null}
            </div>
          ) : null}
          {platePreviewUrl || plate?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={platePreviewUrl || plate?.imageUrl}
              alt="Day plate"
              className="mt-3 max-h-48 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
              data-testid="mobile-day-plate-preview"
              data-source={plate?.source}
              data-isolated={plate?.isolated === true ? 'true' : 'false'}
            />
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Advanced"
        summary="Day-wide notes."
        defaultOpen={false}
        persistKey="mobile-day-advanced"
      >
        <label className="block space-y-1.5 text-sm">
          <FieldLabel>Day notes</FieldLabel>
          <TextArea
            rows={2}
            value={toolSettings.notes ?? ''}
            placeholder="Optional notes for every slot"
            onChange={event => updateToolSettings({ notes: event.target.value })}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        title="Engine"
        summary="Model, detail, and workflow."
        defaultOpen={false}
        persistKey="mobile-day-engine"
      >
        <div data-testid="mobile-day-engine">
          <SharedToolControls
            shared={shared}
            onModelChange={model => updateShared({ model })}
            onDetailChange={detail => updateShared({ detail })}
            onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
            showWardrobeOption={false}
            seedLlmWithIngredients={false}
            autoFixRules={shared.autoFixRules !== false}
            onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
            recommendFromText=""
            toolId="day"
            preferEditModels={hasPlate}
            onSharedSettingsChange={updateShared}
            variant="roleplay"
          />
        </div>
      </CollapsibleSection>

      {!firstCutCelebrate ? (
        leanChrome ? (
          <CollapsibleSection
            title="More"
            summary="Outfit, Look, Story"
            defaultOpen={false}
            persistKey="mobile-day-more-links"
          >
            <div className="grid gap-2">
              {character ? (
                <>
                  <Link
                    href={`/m/fitting?character=${encodeURIComponent(character.id)}${
                      fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                    }`}
                    className="ui-btn-ghost w-full justify-center text-center text-sm"
                  >
                    Open Outfit
                  </Link>
                  <Link
                    href={`/m/moodboard?character=${encodeURIComponent(character.id)}`}
                    className="ui-btn-ghost w-full justify-center text-center text-sm"
                  >
                    Open Look
                  </Link>
                </>
              ) : null}
              <Button
                variant="secondary"
                className="w-full justify-center"
                disabled={busy}
                data-testid="day-after-cut-story"
                onClick={goRoleplay}
              >
                Story unlocked
              </Button>
            </div>
          </CollapsibleSection>
        ) : (
          <div className="grid gap-2">
            {character ? (
              <>
                <Link
                  href={`/m/fitting?character=${encodeURIComponent(character.id)}${
                    fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                  }`}
                  className="ui-btn-ghost w-full justify-center text-center text-sm"
                >
                  Open Outfit
                </Link>
                <Link
                  href={`/m/moodboard?character=${encodeURIComponent(character.id)}`}
                  className="ui-btn-ghost w-full justify-center text-center text-sm"
                >
                  Open Look
                </Link>
                {firstFilmDone ? (
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={goRoleplay}
                    data-testid="mobile-day-story"
                  >
                    Story unlocked
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        )
      ) : null}

      {error ? (
        <div className="space-y-2">
          <FieldError>{error}</FieldError>
          <div className="grid gap-2">
            <Button
              variant="primary"
              disabled={busy}
              data-testid="day-error-demo-stills"
              onClick={seedDemoStills}
              className="w-full justify-center"
            >
              Use demo stills
            </Button>
            <Button
              variant="secondary"
              data-testid="day-error-watch-sample"
              onClick={() => setSampleWatch(true)}
              className="w-full justify-center"
            >
              Watch sample cut
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              data-testid="day-error-retry-queue"
              onClick={() => void queueAll()}
              className="w-full justify-center"
            >
              Retry queue
            </Button>
            {playbookHref ? (
              <ButtonLink
                href={playbookHref}
                size="sm"
                variant="ghost"
                className="justify-center"
                data-testid="film-failure-playbook-link"
              >
                {resolveQueueFailureGuideLabel(playbookHref)}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      ) : null}
      <ImageLightbox
        state={progressLightbox}
        onClose={() => {
          setProgressLightbox(null);
          setProgressLightboxSlotIds([]);
        }}
        onIndexChange={index => {
          const slotId = progressLightboxSlotIds[index];
          if (slotId) {
            setActiveSlotId(slotId);
          }
          setProgressLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: previous.titles?.[index] ?? previous.title,
                }
              : previous
          );
        }}
        slideChrome={progressLightboxSlideChrome}
      />
    </div>
  );
}
