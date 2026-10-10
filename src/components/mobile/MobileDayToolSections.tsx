'use client';

import { clipUrlIsVideo } from '@/lib/clip-media-kind';
import DayEndPoseControl from '@/components/day-planner/DayEndPoseControl';
import PlateStanceNudge from '@/components/character/PlateStanceNudge';
import { continueDayAsStoryHref } from '@/lib/day-story-seed';
import { FilmCutOptionsDisclosure } from '@/components/FilmCutOptionsControls';
import type { KeyedShot } from '@/lib/film-cut-plan';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import CharacterOsPicker from '@/components/shared-tool-controls/CharacterOsPicker';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import DayAdvancedDrawer, {
  DayQualityStatusLines,
} from '@/components/day-planner/DayAdvancedDrawer';
import DayPartnerRow from '@/components/day-planner/DayPartnerRow';
import DayPlanBar, { DayMoodHints } from '@/components/day-planner/DayPlanBar';
import DayRemixMenu from '@/components/day-planner/DayRemixMenu';
import DaySeriesPanel from '@/components/day-planner/DaySeriesPanel';
import DayPlayPhaseStrip from '@/components/day-planner/DayPlayPhaseStrip';
import DaySetupChip from '@/components/day-planner/DaySetupChip';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import DaySlotSheet from '@/components/day-planner/DaySlotSheet';
import DayOutfitRow, { dayClothingView } from '@/components/day-planner/DayOutfitRow';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import UploadButton from '@/components/ui/UploadButton';
import DayStatusStrip from '@/components/day-planner/DayStatusStrip';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import SharedToolControls from '@/components/SharedToolControls';
import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import DayIdeaRow from '@/components/day-planner/DayIdeaRow';
import { ChipButton, FieldError } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';
import SideSheet from '@/components/ui/SideSheet';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import ClothingPicker from '@/components/wardrobe/ClothingPickerLazy';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import { useDayQualityPreset } from '@/hooks/day-planner/useDayQualityPreset';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import {
  buildDayProgressLightboxState,
  daySessionStatusLine,
  type DaySlotId,
  isDayAdultMood,
} from '@/lib/day-planner';
import { dayQualityPresetLabel } from '@/lib/day-quality-preset';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
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

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});

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

/**
 * Phone Day — the same sections as desk (plan bar, Advanced drawer, slot board, slot sheet,
 * Setup sheet) in a single column, with the phone's own cut card, reel and Engine fold.
 */
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
    filmCutOptions,
    setFilmCutOptions,
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
    addVoiceToSlot,
    voicingSlotId,
    extendSlotClip,
    extendRequestFor,
    extending,
    hasPlate,
    plate,
    isolateSubject,
    isolatePending,
    isolateBusy,
    isolateStatus,
    platePreviewUrl,
    setIsolateSubject,
    allowCompanions,
    dayLength,
    setDayLength,
    autoReviewStills,
    setAutoReviewStills,
    redoPoseMisses,
    setRedoPoseMisses,
    poseRedoStatus,
    poseRedoMarks,
    bestOfTwoHardPoses,
    setBestOfTwoHardPoses,
    twoTakesIntimate,
    setTwoTakesIntimate,
    bestOfTwoStatus,
    twoTakesOrderStatus,
    bestEnginePerPose,
    setBestEnginePerPose,
    posePriority,
    setPosePriority,
    identityBoost,
    setIdentityBoost,
    faceFinish,
    setFaceFinish,
    faceFinishStatus,
    qualityStatus,
    qualityLedger,
    clipChecks,
    flaggedRetryCount,
    retryFlagged,
    uploadCastPlate,
    redoSlotSameSeed,
    keepPreviousTake,
    dropPreviousTake,
    pickTwoTake,
    looksWrongSlot,
    fixAreaTargetForSlot,
    plateUploading,
    plateUploadError,
    hideStickyCutCoach,
    setHideStickyCutCoach,
    dayMood,
    setDayMood,
    partnerCharacterId,
    partnerOptions,
    setPartnerCharacterId,
    partnerTwoWomen,
    leadNoun,
    partnerStandInUrl,
    partnerSentFaceUrl,
    newPartnerStandIn,
    keepPartnerAsCast,
    dayWeather,
    setDayWeather,
    people,
    setPeople,
    intimateEnabled,
    intimateMix,
    suggestDayScenes,
    writeDayFromIdea,
    rerollActiveSlotScene,
    queueBlockReason,
    poseGuideLine,
    dressPlateStatus,
    dressPlatePreviewUrl,
    redoDressPlate,
    poseGuidePreviews,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    updateSlot,
    poseMissViews,
    wardrobeLabelFor,
    queueSlot,
    queueAll,
    animateSlot,
    animateAllClips,
    endPoseStatus,
    endPoseReposingSlotId,
    endPoseSupportedFor,
    activeEndPoseFor,
    pickEndPoseStill,
    clearEndPose,
    reposeEndPose,
    cutDayFilm,
    cutProblems,
    resolveCutProblems,
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
    startTomorrow,
    writingTomorrow,
    seedDemoStills,
    leanChrome,
    goRoleplay,
    garmentUploading,
    garmentScanStatus,
    applyCustomGarment,
    applyFootwearPhoto,
    clearCustomGarment,
    rescanCustomGarment,
    saveCurrentCustomGarment,
    applySavedCustomGarment,
    removeSavedCustomGarment,
    selectSlotWardrobe,
    differingSlotIds,
    handoffKeptSlotIds,
    slotDiffers,
    applyDayOutfitEverywhere,
    applyHandoffOutfitEverywhere,
    dismissHandoffNotice,
    applyDayOutfitToSlot,
    chooseDayLook,
    selectDayWardrobe,
  } = vm;

  const hasCustomGarment = Boolean(toolSettings.customGarmentImageUrl?.trim());
  const [sampleWatch, setSampleWatch] = useState(false);
  const [progressLightbox, setProgressLightbox] = useState<ImageLightboxState | null>(null);
  const [fixAreaTarget, setFixAreaTarget] = useState<FixAreaTarget | null>(null);
  const [progressLightboxSlotIds, setProgressLightboxSlotIds] = useState<DaySlotId[]>([]);
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance({ mobile: true });
  const sampleShots = useMemo(() => welcomeSampleFilmShots(), []);
  const quality = useDayQualityPreset({ shared, updateShared, toolSettings, updateToolSettings });
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
  const cutCoachEligible = completedShotCount > 0 && !firstCutCelebrate && !assemblingFilm;
  const showCutCoach = cutCoachEligible && !hideStickyCutCoach;
  const queueBlocked = Boolean(queueBlockReason);
  const canAnimateAll =
    completedShotCount > 0 &&
    completedClipCount < completedShotCount &&
    !firstCutCelebrate &&
    !assemblingFilm;
  // End pose in the slot sheet — only when this ComfyUI can pin a last frame on the clip engine.
  const endPoseControl = endPoseSupportedFor(activeSlot.id) ? (
    <DayEndPoseControl
      key={activeSlot.id}
      slot={activeSlot}
      slots={slots}
      stills={stills}
      endPose={activeEndPoseFor(activeSlot.id)}
      busy={busy}
      reposing={endPoseReposingSlotId === activeSlot.id}
      status={endPoseStatus}
      onPick={fromSlotId => pickEndPoseStill(activeSlot.id, fromSlotId)}
      onRepose={words => void reposeEndPose(activeSlot.id, words)}
      onClear={() => clearEndPose(activeSlot.id)}
    />
  ) : null;
  const showDemoEscape = completedShotCount === 0;
  const showSampleEscape = watchPlaylist.length === 0;
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
  const galleryFilmHref = character
    ? toMobileStudioHref(`/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`)
    : toMobileStudioHref('/gallery');
  const watchCastHref = character
    ? toMobileStudioHref(`/characters/${encodeURIComponent(character.id)}?media=films`)
    : toMobileStudioHref('/characters');
  // What is worn, readable without opening a sheet: the whole Day's, and this slot's.
  const clothingView = dayClothingView({
    dayKitId: shared.lockedWardrobeId,
    slotKitId: activeSlot.wardrobeId,
    photoUrl: hasCustomGarment ? toolSettings.customGarmentImageUrl : null,
    footwear: toolSettings.footwear,
    footwearImageUrl: toolSettings.footwearImageUrl,
    labelFor: wardrobeLabelFor,
  });

  const openSlotSheet = useCallback(
    (slotId: DaySlotId) => {
      setActiveSlotId(slotId);
      setSlotSheetOpen(true);
    },
    [setActiveSlotId]
  );

  const openProgressLightbox = useCallback(
    (slotId: string) => {
      const next = buildDayProgressLightboxState(slots, stills, slotId, (url, still) =>
        clipUrlIsVideo(url, { promptId: still.clipPromptId })
      );
      if (!next) {
        return;
      }
      setProgressLightboxSlotIds(next.slotIds);
      setProgressLightbox({
        images: next.images,
        titles: next.titles,
        originalImages: next.images,
        mediaKinds: next.mediaKinds,
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
    const fixTarget = fixAreaTargetForSlot(slot.id);
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
      fixArea: fixTarget
        ? {
            ...fixTarget,
            // The lightbox's slides were built from the old picture: close it once swapped.
            onUse: async result => {
              await fixTarget.onUse(result);
              setProgressLightbox(null);
              setProgressLightboxSlotIds([]);
            },
          }
        : null,
    };
  }, [fixAreaTargetForSlot, progressLightbox, progressLightboxSlotIds, queueSlot, slots, stills]);

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
      if (params.get('edit') === '1') {
        setSlotSheetOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The Clothing picker for this slot (its own kit) or, from the Look & clothing row, for the
  // whole Day (the session's outfit lock). The photo and the shoes are the Day's either way.
  const clothingPicker = (scope: 'slot' | 'day' = 'slot') => {
    const dayScope = scope === 'day';
    const selectedKitId = dayScope ? shared.lockedWardrobeId : activeSlot.wardrobeId;
    const selectKit = (wardrobeId: string | undefined) =>
      dayScope ? selectDayWardrobe(wardrobeId) : selectSlotWardrobe(activeSlot.id, wardrobeId);
    return (
      <div data-testid={dayScope ? 'day-outfit-clothing' : 'day-clothing'}>
        <ClothingPicker
          accent="teal"
          busy={busy}
          testIdPrefix="day"
          garment={{
            uploading: garmentUploading,
            scanStatus: garmentScanStatus,
            imageUrl: toolSettings.customGarmentImageUrl,
            imageFilename: toolSettings.customGarmentImageFilename,
            description: toolSettings.customGarmentDescription,
            onApply: applyCustomGarment,
            onClear: clearCustomGarment,
            onRescan: rescanCustomGarment,
            onSave: saveCurrentCustomGarment,
            onApplySaved: applySavedCustomGarment,
            onRemoveSaved: removeSavedCustomGarment,
            onDescriptionChange: value => updateToolSettings({ customGarmentDescription: value }),
          }}
          footwear={{
            value: toolSettings.footwear,
            imageUrl: toolSettings.footwearImageUrl,
            imageFilename: toolSettings.footwearImageFilename,
            onChange: patch => updateToolSettings(patch),
            onApplyPhoto: applyFootwearPhoto,
          }}
          kits={wardrobeKitDeck}
          kitsReady={wardrobeReady}
          selectedKitId={selectedKitId}
          kitSize="sm"
          kitPickerTestId={
            dayScope ? 'mobile-day-outfit-kit-picker' : 'mobile-day-wardrobe-kit-picker'
          }
          onSelectKit={wardrobeId => selectKit(wardrobeId)}
          onSwipeKit={delta => {
            const next = fittingSwipeNeighbor(wardrobeKitDeck, selectedKitId, delta);
            if (next) {
              selectKit(next.id);
            }
          }}
          onClearKit={() => selectKit(undefined)}
          resolveKitThumb={kit => ({ url: resolveWardrobeGarmentThumbUrl(kit.id) })}
          category={{
            value: wardrobeCategoryFilter,
            options: wardrobeCategoryFilterOptions().map(option => ({
              value: option.value,
              label: wardrobeReady
                ? `${option.label} (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                : option.label,
            })),
            onChange: value =>
              updateToolSettings({
                wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(value),
              }),
          }}
          onError={message => setError(message)}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="mobile-day">
      <CutProblemsDialog
        problems={cutProblems}
        onResolve={action => void resolveCutProblems(action)}
      />
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h1 className="type-display text-2xl tracking-tight">Day</h1>
          <DaySetupChip
            character={character}
            hasPlate={hasPlate}
            className="max-w-[60%] text-xs"
            onClick={() => setSetupOpen(true)}
          />
        </div>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Plan the day → Queue day → Cut film. Tap a card to open that time of day.
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
          <PlayGetStartedCard
            hasCharacter={Boolean(character)}
            hasPlate={hasPlate}
            characterId={character?.id}
            mobile
            onOpenSetup={() => setSetupOpen(true)}
          />
          <DayStatusStrip
            statusLine={dayStatusLine}
            // The get-started card already says what's missing.
            queueBlockReason={character && hasPlate ? queueBlockReason : null}
            poseGuideLine={poseGuideLine}
            dressPlateStatus={dressPlateStatus}
            dressPlatePreviewUrl={dressPlatePreviewUrl}
            onRedoDressPlate={redoDressPlate}
            onOpenDressPlate={url =>
              setProgressLightbox({ images: [url], index: 0, title: 'Dressed plate' })
            }
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
                onTomorrow={() => void startTomorrow()}
                tomorrowBusy={writingTomorrow}
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
            {/* Same cut options as desk Day (vertical, crossfade, titles, length, music). */}
            <FilmCutOptionsDisclosure
              scoreBrief={{ mood: dayMood }}
              value={filmCutOptions}
              onChange={setFilmCutOptions}
              disabled={assemblingFilm}
              testIdPrefix="mobile-day-cut"
              shots={watchPlaylist as KeyedShot[]}
            />
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

      <div className="space-y-2" data-testid="day-slot-board">
        <TaskRequirementsCard
          task="This Day"
          testId="day-task-requirements"
          input={{
            model: shared.model,
            adult: isDayAdultMood(dayMood) && intimateEnabled,
            faceFinish,
            autoReview: autoReviewStills,
          }}
        />
        <DayPlanBar
          busy={busy}
          dayLength={dayLength}
          onDayLengthChange={setDayLength}
          dayMood={dayMood}
          onDayMoodChange={setDayMood}
          intimateEnabled={intimateEnabled}
          people={people}
          onPeopleChange={setPeople}
          leadNoun={leadNoun}
          dayWeather={dayWeather}
          onDayWeatherChange={setDayWeather}
          qualityPreset={quality.preset}
          onQualityPresetChange={quality.setPreset}
          qualitySummary={quality.summary}
          advancedOpen={advancedOpen}
          onAdvancedToggle={() => setAdvancedOpen(open => !open)}
          advancedId={advancedId}
        />
        <DayOutfitRow
          character={character}
          slots={slots}
          busy={busy}
          clothingSummary={clothingView.day.summary}
          clothingThumbs={clothingView.day.thumbs}
          differingSlotIds={differingSlotIds}
          handoffKeptSlotIds={handoffKeptSlotIds}
          onChooseLook={chooseDayLook}
          onUseForEverySlot={applyDayOutfitEverywhere}
          onUseHandoffEverywhere={applyHandoffOutfitEverywhere}
          onDismissHandoff={dismissHandoffNotice}
          renderClothingPicker={() => clothingPicker('day')}
        />
        <DayMoodHints
          dayMood={dayMood}
          intimateMix={intimateMix}
          intimateEnabled={intimateEnabled}
        />
        <DayPartnerRow
          busy={busy}
          dayMood={dayMood}
          people={people}
          partnerId={partnerCharacterId}
          partnerOptions={partnerOptions}
          onPartnerChange={setPartnerCharacterId}
          partnerTwoWomen={partnerTwoWomen}
          leadNoun={leadNoun}
          partnerStandInUrl={partnerStandInUrl}
          partnerSentFaceUrl={partnerSentFaceUrl}
          onNewPartnerStandIn={newPartnerStandIn}
          onKeepPartnerAsCast={keepPartnerAsCast}
        />
        <DayQualityStatusLines
          faceFinish={faceFinish}
          autoReviewStills={autoReviewStills}
          redoPoseMisses={redoPoseMisses}
          bestOfTwoHardPoses={bestOfTwoHardPoses}
          faceFinishStatus={faceFinishStatus}
          qualityStatus={qualityStatus}
          poseRedoStatus={poseRedoStatus}
          bestOfTwoStatus={bestOfTwoStatus}
          twoTakesIntimate={twoTakesIntimate}
          twoTakesOrderStatus={twoTakesOrderStatus}
        />
        {advancedOpen ? (
          <DayAdvancedDrawer
            id={advancedId}
            busy={busy}
            renderQuality={quality.renderQuality}
            onRenderQualityChange={quality.setRenderQuality}
            posePriority={posePriority}
            onPosePriorityChange={setPosePriority}
            identityBoost={identityBoost}
            onIdentityBoostChange={setIdentityBoost}
            faceFinish={faceFinish}
            onFaceFinishChange={setFaceFinish}
            autoReviewStills={autoReviewStills}
            onAutoReviewStillsChange={setAutoReviewStills}
            redoPoseMisses={redoPoseMisses}
            onRedoPoseMissesChange={setRedoPoseMisses}
            bestOfTwoHardPoses={bestOfTwoHardPoses}
            onBestOfTwoHardPosesChange={setBestOfTwoHardPoses}
            twoTakesIntimate={twoTakesIntimate}
            onTwoTakesIntimateChange={setTwoTakesIntimate}
            bestEnginePerPose={bestEnginePerPose}
            onBestEnginePerPoseChange={setBestEnginePerPose}
            slots={slots}
            dayMood={dayMood}
            intimateEnabled={intimateEnabled}
            intimateMix={intimateMix}
            allowCompanions={allowCompanions}
            model={shared.model}
            onSlotsChange={next => updateToolSettings({ slots: next })}
            notes={toolSettings.notes ?? ''}
            onNotesChange={next => updateToolSettings({ notes: next })}
          />
        ) : null}
        <DaySlotBoard
          slots={slots}
          stills={stills}
          activeSlotId={activeSlotId}
          busy={busy}
          queueBlocked={queueBlocked}
          compact
          onSelectSlot={setActiveSlotId}
          onEditSlot={openSlotSheet}
          onOpenStill={openProgressLightbox}
          onRetrySlot={slot => void queueSlot(slot)}
          onAnimateSlot={slot => void animateSlot(slot)}
          onAddVoice={addVoiceToSlot}
          voicingSlotId={voicingSlotId}
          onExtendClip={extendSlotClip}
          extendRequestFor={extendRequestFor}
          extending={extending}
          onQueueSlot={slot => void queueSlot(slot)}
          onRerollSlot={slot => {
            rerollActiveSlotScene({ slotId: slot.id });
          }}
          qualityLedger={qualityLedger}
          poseRedoMarks={poseRedoMarks}
          clipChecks={clipChecks}
          onPickTwoTake={pickTwoTake}
          onLooksWrong={slot => void looksWrongSlot(slot.id)}
          onFixArea={slot => setFixAreaTarget(fixAreaTargetForSlot(slot.id))}
        />
        <DayIdeaRow
          dayMood={dayMood}
          busy={busy}
          slotCount={slots.length}
          onWrite={writeDayFromIdea}
        />
        <div className="grid gap-2" data-testid="day-queue-actions">
          <PrimaryButton
            disabled={busy || queueBlocked}
            loading={busy}
            data-testid="day-queue-all"
            onClick={() => void queueAll()}
            className="w-full justify-center"
          >
            {completedShotCount > 0 ? 'Queue the rest' : 'Queue day'}
          </PrimaryButton>
          {canAnimateAll ? (
            <Button
              variant={dayPhase === 'animate' ? 'primary' : 'secondary'}
              disabled={busy}
              data-testid="day-animate-all"
              onClick={() => void animateAllClips()}
              className="w-full justify-center"
            >
              Animate all
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="day-suggest"
            onClick={() => suggestDayScenes()}
            className="w-full justify-center"
          >
            Suggest day
          </Button>
          {flaggedRetryCount > 0 ? (
            <Button
              variant="secondary"
              disabled={busy || queueBlocked}
              data-testid="day-retry-flagged"
              onClick={() => void retryFlagged()}
              className="w-full justify-center"
            >
              Retry {flaggedRetryCount} flagged
            </Button>
          ) : null}
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
      </div>

      <div className="space-y-2" data-testid="day-reel">
        <p className="type-caption text-[var(--text-muted)]">Day reel</p>
        <TaskRequirementsCard
          task="Animate"
          testId="day-animate-requirements"
          input={{ animate: true, adult: isDayAdultMood(dayMood) && intimateEnabled }}
        />
        <FilmWatchPlayer
          shots={sampleWatch ? sampleShots : watchPlaylist}
          onOpenShot={sampleWatch ? undefined : shot => shot.key && openProgressLightbox(shot.key)}
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
            {character && completedShotCount > 0 ? (
              <Link
                href={toMobileStudioHref(continueDayAsStoryHref(character.id))}
                className="ui-btn-secondary w-full justify-center text-center text-sm"
                data-testid="day-continue-story"
              >
                Continue as a story
              </Link>
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
          <div className="grid gap-2" data-testid="day-after-cut">
            {filmNeedsCast ? (
              <Button
                variant="primary"
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
                <Link
                  href={toMobileStudioHref(
                    `/characters/${encodeURIComponent(character.id)}?media=films`
                  )}
                  className={`${filmNeedsCast ? 'ui-btn-secondary' : 'ui-btn-primary'} w-full justify-center text-center text-sm`}
                  data-testid="day-open-cast-film"
                >
                  Watch on Cast
                </Link>
                <DayRemixMenu
                  stacked
                  testIdPrefix="day-remix"
                  onTomorrow={() => void startTomorrow()}
                  tomorrowBusy={writingTomorrow}
                  onNewOutfit={remixNewOutfitDay}
                  onTheme={remixThemeDay}
                />
                <ActionMenu
                  label="After cut"
                  align="left"
                  testId="day-after-cut-menu"
                  summaryClassName="ui-btn-ghost w-full justify-center text-sm"
                >
                  <button
                    type="button"
                    className={ACTION_MENU_ITEM_CLASS}
                    data-testid="day-share-cut"
                    onClick={() => void shareLastCut()}
                  >
                    Share cut
                  </button>
                  <button
                    type="button"
                    className={ACTION_MENU_ITEM_CLASS}
                    disabled={posterBusy}
                    data-testid="day-poster"
                    onClick={() => void saveFilmPoster()}
                  >
                    {posterBusy ? 'Saving poster…' : 'Save poster'}
                  </button>
                  <button
                    type="button"
                    className={ACTION_MENU_ITEM_CLASS}
                    data-testid="day-remix-day"
                    onClick={remixSameLookDay}
                  >
                    Same look, new Day
                  </button>
                </ActionMenu>
              </>
            ) : null}
          </div>
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
            qualitySetBy={{
              label: dayQualityPresetLabel(quality.preset),
              hint: 'Change it in the plan bar above the board; Good / Best by hand under Advanced.',
            }}
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
      <DaySlotSheet
        open={slotSheetOpen}
        onClose={() => setSlotSheetOpen(false)}
        slot={activeSlot}
        slots={slots}
        stills={stills}
        onSelectSlot={setActiveSlotId}
        character={character}
        busy={busy}
        queueBlocked={queueBlocked}
        dayMood={dayMood}
        intimateEnabled={intimateEnabled}
        intimateMix={intimateMix}
        allowCompanions={allowCompanions}
        model={shared.model}
        poseMiss={poseMissViews[activeSlot.id]}
        plateUrl={platePreviewUrl || plate?.imageUrl}
        updateSlot={updateSlot}
        clothingSummary={clothingView.slot.summary}
        clothingThumbs={clothingView.slot.thumbs}
        differsFromDay={slotDiffers(activeSlot)}
        onUseDayOutfit={() => applyDayOutfitToSlot(activeSlot.id)}
        renderClothingPicker={() => clothingPicker('slot')}
        onRedoSameSeed={() => void redoSlotSameSeed(activeSlot.id)}
        onKeepOldTake={() => keepPreviousTake(activeSlot.id)}
        onKeepNewTake={() => dropPreviousTake(activeSlot.id)}
        onPickTwoTake={keep => pickTwoTake(activeSlot.id, keep)}
        endPose={endPoseControl}
        onQueueSlot={() => void queueSlot(activeSlot)}
        onAnimateSlot={() => void animateSlot(activeSlot)}
        compact
      />
      <SideSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Setup"
        description={
          hasPlate ? `${character?.name?.trim() || 'Cast'} · plate ready` : 'Character and plate.'
        }
        testId="day-setup-sheet"
      >
        <div className="day-character-section space-y-3">
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
          <p className="type-caption text-[var(--text-muted)]">
            {hasPlate
              ? isolateSubject && isolatePending
                ? 'Isolating plate on white…'
                : 'Plate ready.'
              : 'No plate — upload one (it becomes the Cast look plate) or Keep in Outfit.'}
          </p>
          {!hasPlate && character ? (
            <div className="flex flex-wrap gap-2">
              <UploadButton
                label={plateUploading ? 'Uploading…' : 'Upload plate'}
                variant="primary"
                disabled={busy || plateUploading}
                ariaLabel="Upload a look plate for this Cast"
                testId="day-plate-upload"
                onFile={file => void uploadCastPlate(file)}
              />
            </div>
          ) : null}
          {plateUploadError ? (
            <p className="type-caption text-[var(--danger-text)]">{plateUploadError}</p>
          ) : null}
          {hasPlate ? (
            <div className="flex flex-wrap gap-2">
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
                  className="type-caption w-full text-[var(--text-muted)]"
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
              className="max-h-48 w-full rounded-xl border border-[var(--border-subtle)] object-contain"
              data-testid="mobile-day-plate-preview"
              data-source={plate?.source}
              data-isolated={plate?.isolated === true ? 'true' : 'false'}
            />
          ) : null}
          {hasPlate ? (
            <PlateStanceNudge characterId={shared.activeCharacterId} lookId={activeSlot.lookId} />
          ) : null}
        </div>
      </SideSheet>
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
      {fixAreaTarget ? (
        <FixAreaDialog target={fixAreaTarget} onClose={() => setFixAreaTarget(null)} />
      ) : null}
    </div>
  );
}
