'use client';

import { continueDayAsStoryHref } from '@/lib/day-story-seed';
import ClipEngineNote from '@/components/ClipEngineNote';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import type { KeyedShot } from '@/lib/film-cut-plan';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';
import { Button, ButtonLink } from '@/components/ui/Button';
import DayIdeaRow from '@/components/day-planner/DayIdeaRow';
import { FieldError } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { FixAreaTarget } from '@/lib/fix-area-client';
import SideSheet from '@/components/ui/SideSheet';
import {
  CollapsibleSection,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import ClothingPicker from '@/components/wardrobe/ClothingPickerLazy';
import { FilmCutOptionsDisclosure } from '@/components/FilmCutOptionsControls';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import {
  countWardrobeOptionsForFilter,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import {
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
} from '@/lib/wardrobe-garment-thumbs';
import { fittingSwipeNeighbor } from '@/lib/fitting-room';
import {
  buildDayProgressLightboxState,
  daySessionStatusLine,
  isDayAdultMood,
  normalizeDayIntimateMix,
  type DaySlotId,
} from '@/lib/day-planner';
import { dayQualityPresetLabel } from '@/lib/day-quality-preset';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useDayQualityPreset } from '@/hooks/day-planner/useDayQualityPreset';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';
import { useWardrobeGarmentThumbManifestGeneration } from '@/hooks/useWardrobeGarmentThumbManifest';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import DayAdvancedDrawer, {
  DayQualityStatusLines,
} from '@/components/day-planner/DayAdvancedDrawer';
import DayEndPoseControl from '@/components/day-planner/DayEndPoseControl';
import DayPartnerRow from '@/components/day-planner/DayPartnerRow';
import DayPlanBar, { DayMoodHints } from '@/components/day-planner/DayPlanBar';
import DayPlateSection from '@/components/day-planner/DayPlateSection';
import DayPlayPhaseStrip from '@/components/day-planner/DayPlayPhaseStrip';
import DayRemixMenu from '@/components/day-planner/DayRemixMenu';
import DaySeriesPanel from '@/components/day-planner/DaySeriesPanel';
import DaySetupChip from '@/components/day-planner/DaySetupChip';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import DaySlotSheet from '@/components/day-planner/DaySlotSheet';
import DayOutfitRow, { dayClothingView } from '@/components/day-planner/DayOutfitRow';
import DayStatusStrip from '@/components/day-planner/DayStatusStrip';
import PlaySoftAdvanceBanner from '@/components/PlaySoftAdvanceBanner';
import PlayFilmFunnelChrome from '@/components/PlayFilmFunnelChrome';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import PlayFilmEngineBanner from '@/components/PlayFilmEngineBanner';
import { usePlaySoftAdvance } from '@/hooks/usePlaySoftAdvance';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { deriveDayPhase } from '@/lib/play-step-machine';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

function subscribePlayMetrics(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
  return () => window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, onStoreChange);
}

type ViewModel = ReturnType<typeof useDayPlannerToolOrchestration>;
type Props = ViewModel & { description: string };

export default function DayPlannerToolSections({ description, ...vm }: Props) {
  useWardrobeGarmentThumbManifestGeneration();
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
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
    selectedModel,
    plate,
    hasPlate,
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
    makeCastPlate,
    makePlateStatus,
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
    actions,
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
    goRoleplay,
    completedShotCount,
    fittingWardrobe,
    leanChrome,
    seedDemoStills,
    firstCutCelebrate,
    shareLastCut,
    saveFilmPoster,
    posterBusy,
    remixSameLookDay,
    remixThemeDay,
    remixNewOutfitDay,
    startTomorrow,
    writingTomorrow,
    filmCutOptions,
    setFilmCutOptions,
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
  const { softAdvance, cancelSoftAdvance } = usePlaySoftAdvance();
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
  const showReelCut = !showCutCoach && !firstCutCelebrate;
  const showDemoEscape = completedShotCount === 0;
  const showSampleEscape = watchPlaylist.length === 0;
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
    ? `/gallery?character=${encodeURIComponent(character.id)}&derivedKind=film`
    : '/gallery';
  const watchCastHref = character
    ? `/characters/${encodeURIComponent(character.id)}?media=films`
    : '/characters';
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
      const next = buildDayProgressLightboxState(slots, stills, slotId);
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
        void queueSlot(slot, { byPlayer: true });
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

  // A deep link that lands with a plan to edit opens the first slot's sheet.
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

  const engineControls = (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      showWardrobeOption={false}
      seedLlmWithIngredients={false}
      autoFixRules={shared.autoFixRules !== false}
      onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
      recommendFromText={output}
      toolId={TOOL_ID}
      qualitySetBy={{
        label: dayQualityPresetLabel(quality.preset),
        hint: 'Change it in the plan bar above the board; Good / Best by hand under Advanced.',
      }}
      preferEditModels={hasPlate}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );

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
          accent={ACCENT}
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
          kitPickerTestId={dayScope ? 'day-outfit-kit-picker' : 'day-wardrobe-kit-picker'}
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
    <>
      <CutProblemsDialog
        problems={cutProblems}
        onResolve={action => void resolveCutProblems(action)}
      />
      <ToolLayout
        accent={ACCENT}
        badge={<ToolBadge accent={ACCENT}>Film</ToolBadge>}
        title="Day"
        description={description}
        headerActions={
          <DaySetupChip
            character={character}
            hasPlate={hasPlate}
            onClick={() => setSetupOpen(true)}
          />
        }
        sidebarPersistKey="day"
        sidebar={engineControls}
        sidebarTitle={leanChrome ? false : undefined}
      >
        <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.day} />
        <PlayFilmEngineBanner />
        <PlayFilmFunnelChrome />
        <PlaySoftAdvanceBanner
          key={softAdvance?.nonce ?? 'idle'}
          target={softAdvance}
          onCancel={cancelSoftAdvance}
        />
        {!firstCutCelebrate ? (
          <div className="mb-3 space-y-2">
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
            className="rounded-[var(--radius-lg)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-4 py-3"
            data-testid="day-first-cut-celebrate"
          >
            <p className="type-overline text-[var(--tint-success-text)]">First film</p>
            <p className="type-heading mt-1 text-[var(--text-primary)]">You cut your first reel</p>
            <p className="type-caption mt-1 text-[var(--text-muted)]">
              {filmNeedsCast
                ? 'Save the cut to Cast first — then Watch or open Gallery.'
                : 'Watch on Cast, browse Gallery, or extend this character’s film with Story.'}
            </p>
            <ToolActionRow className="mt-3">
              {filmNeedsCast ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm}
                  onClick={saveFilmToCast}
                  data-testid="day-save-film-cast"
                >
                  Save film to Cast
                </Button>
              ) : null}
              {filmNeedsCast && !character ? (
                <ButtonLink
                  href="/characters"
                  size="sm"
                  variant="secondary"
                  data-testid="day-pick-cast"
                >
                  Pick Cast character
                </ButtonLink>
              ) : null}
              {character && !filmNeedsCast ? (
                <ButtonLink
                  href={watchCastHref}
                  size="sm"
                  variant="primary"
                  data-testid="day-first-cut-watch"
                >
                  Watch on Cast
                </ButtonLink>
              ) : null}
              {character && !filmNeedsCast ? (
                <ButtonLink
                  href={galleryFilmHref}
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-gallery"
                >
                  Open in Gallery
                </ButtonLink>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-first-cut-share"
                onClick={() => void shareLastCut()}
              >
                Share cut
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={posterBusy}
                loadingLabel="Saving"
                data-testid="day-first-cut-poster"
                title="Save a poster frame from a finished still"
                onClick={() => void saveFilmPoster()}
              >
                Save poster
              </Button>
              {character ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-remix"
                  onClick={remixSameLookDay}
                >
                  Same look, new Day
                </Button>
              ) : null}
              {character ? (
                <DayRemixMenu
                  testIdPrefix="day-first-cut"
                  onTomorrow={() => void startTomorrow()}
                  tomorrowBusy={writingTomorrow}
                  onNewOutfit={remixNewOutfitDay}
                  onTheme={remixThemeDay}
                />
              ) : null}
              {character ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="day-first-cut-story"
                  onClick={() => {
                    cancelSoftAdvance();
                    goRoleplay();
                  }}
                >
                  Story unlocked
                </Button>
              ) : null}
            </ToolActionRow>
            {character ? (
              <p
                className="type-caption mt-2 text-[var(--text-muted)]"
                data-testid="day-story-unlock-hint"
              >
                Story is unlocked — optional beats that continue this character’s film.
              </p>
            ) : null}
          </div>
        ) : null}

        {showCutCoach ? (
          <div
            className="ui-sticky-surface sticky top-20 z-30 rounded-[var(--radius-lg)] border border-[var(--accent-border)] px-4 py-3 shadow-[var(--shadow-card)]"
            data-testid="day-cut-coach"
            role="status"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="type-overline text-[var(--accent-text)]">Ready to cut</p>
                <p className="type-heading text-[var(--text-primary)]">
                  Cut film · {completedShotCount} of {slotTotal}
                </p>
                <p className="type-caption text-[var(--text-muted)]">
                  {completedShotCount < slotTotal
                    ? 'Cut with what you have, or wait for the rest of the day.'
                    : 'All stills ready — cut the reel.'}
                </p>
                <div className="mt-2">
                  <FilmCutOptionsDisclosure
                    value={filmCutOptions}
                    onChange={setFilmCutOptions}
                    disabled={assemblingFilm}
                    testIdPrefix="day-cut"
                    shots={watchPlaylist as KeyedShot[]}
                  />
                </div>
              </div>
              <ToolActionRow>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm}
                  data-testid="day-cut-coach-cut"
                  onClick={() => void cutDayFilm()}
                >
                  {assemblingFilm ? 'Cutting…' : 'Cut film'}
                </Button>
                {completedShotCount < slotTotal ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    data-testid="day-cut-coach-queue"
                    onClick={() => void queueAll()}
                  >
                    Queue rest
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="day-cut-coach-hide"
                  onClick={() => setHideStickyCutCoach(true)}
                >
                  Hide
                </Button>
              </ToolActionRow>
            </div>
          </div>
        ) : null}

        {/* No heading: the page title already says Day. */}
        <ToolSection data-testid="day-slot-board">
          {/* The few files this Day needs, one Download all (hidden when installed). */}
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
          {/* The plan decides the board — chosen once, so it sits above the cards. */}
          <DayPlanBar
            className="mb-2"
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
          <div className="mb-3 space-y-1.5">
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
          </div>
          {advancedOpen ? (
            <DayAdvancedDrawer
              id={advancedId}
              className="mb-3"
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
            onSelectSlot={setActiveSlotId}
            onEditSlot={openSlotSheet}
            onOpenStill={openProgressLightbox}
            onRetrySlot={slot => void queueSlot(slot, { byPlayer: true })}
            onAnimateSlot={slot => void animateSlot(slot)}
            onQueueSlot={slot => void queueSlot(slot, { byPlayer: true })}
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
            className="mt-3"
            dayMood={dayMood}
            busy={busy}
            slotCount={slots.length}
            onWrite={writeDayFromIdea}
          />
          {/* One primary per phase: Queue day → Animate all → Cut (the banner) → Save. */}
          <ToolActionRow className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="day-suggest"
              title="Fill Setting & Beat for every slot — edit before Queue day"
              onClick={() => suggestDayScenes()}
            >
              Suggest day
            </Button>
            <Button
              size="sm"
              variant={dayPhase === 'animate' && canAnimateAll ? 'secondary' : 'primary'}
              disabled={busy || queueBlocked}
              data-testid="day-queue-all"
              onClick={() => void queueAll()}
            >
              {busy ? 'Queueing…' : completedShotCount > 0 ? 'Queue the rest' : 'Queue day'}
            </Button>
            {canAnimateAll ? (
              <Button
                size="sm"
                variant={dayPhase === 'animate' ? 'primary' : 'secondary'}
                disabled={busy}
                data-testid="day-animate-all"
                title="Animate every finished still into a clip — clips preferred, Cut works from stills alone"
                onClick={() => void animateAllClips()}
              >
                Animate all
              </Button>
            ) : null}
            {flaggedRetryCount > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || queueBlocked}
                data-testid="day-retry-flagged"
                title="Requeue every still and clip Auto-review flagged"
                onClick={() => void retryFlagged()}
              >
                Retry {flaggedRetryCount} flagged
              </Button>
            ) : null}
            {showDemoEscape ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                data-testid="day-demo-stills"
                onClick={seedDemoStills}
              >
                Demo stills
              </Button>
            ) : null}
          </ToolActionRow>
          {queueBlockReason ? (
            <p
              className="type-caption mt-2 text-[var(--tint-warning-text,var(--accent-text))]"
              data-testid="day-queue-block-reason"
            >
              {queueBlockReason}
            </p>
          ) : null}
          {completedShotCount > 0 && !firstCutCelebrate ? (
            <ClipEngineNote
              twoPersonAdultPossible={
                isDayAdultMood(dayMood) && normalizeDayIntimateMix(intimateMix) !== 'solo'
              }
            />
          ) : null}
        </ToolSection>

        <ToolSection
          title="Day reel"
          description="Stills and clips land here as you Queue — watch them in order."
          data-testid="day-reel"
        >
          <TaskRequirementsCard
            task="Animate"
            testId="day-animate-requirements"
            input={{ animate: true, adult: isDayAdultMood(dayMood) && intimateEnabled }}
          />
          <FilmWatchPlayer
            compact
            shots={sampleWatch ? sampleShots : watchPlaylist}
            onOpenShot={
              sampleWatch ? undefined : shot => shot.key && openProgressLightbox(shot.key)
            }
            emptyLabel="Queue the day — Morning through Night fill in here."
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
            <ToolActionRow>
              {/* The sticky banner owns Cut while it shows; this is the way to it otherwise. */}
              {showReelCut ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm || completedShotCount === 0}
                  onClick={() => void cutDayFilm()}
                  data-testid="day-reel-cut"
                >
                  {assemblingFilm ? 'Cutting…' : 'Cut film'}
                </Button>
              ) : null}
              {character && completedShotCount > 0 ? (
                <ButtonLink
                  href={continueDayAsStoryHref(character.id)}
                  size="sm"
                  variant="secondary"
                  data-testid="day-continue-story"
                >
                  Continue as a story
                </ButtonLink>
              ) : null}
              {cutCoachEligible && hideStickyCutCoach ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="day-cut-coach-show"
                  onClick={() => setHideStickyCutCoach(false)}
                >
                  Show cut banner
                </Button>
              ) : null}
              {showSampleEscape ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="day-watch-sample-cut"
                  onClick={() => setSampleWatch(prev => !prev)}
                >
                  {sampleWatch ? 'Show my reel' : 'Watch sample cut'}
                </Button>
              ) : null}
            </ToolActionRow>
          ) : null}
          {filmStatus && !firstCutCelebrate ? (
            <div className="flex flex-wrap gap-2" data-testid="day-after-cut">
              {filmNeedsCast ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || assemblingFilm}
                  onClick={saveFilmToCast}
                  data-testid="day-save-film-cast"
                >
                  Save film to Cast
                </Button>
              ) : null}
              {filmNeedsCast && !character ? (
                <ButtonLink
                  href="/characters"
                  size="sm"
                  variant="secondary"
                  data-testid="day-pick-cast"
                >
                  Pick Cast character
                </ButtonLink>
              ) : null}
              {character && !assemblingFilm ? (
                <ButtonLink
                  href={`/characters/${encodeURIComponent(character.id)}?media=films`}
                  size="sm"
                  variant={filmNeedsCast ? 'secondary' : 'primary'}
                  data-testid="day-open-cast-film"
                >
                  Watch on Cast
                </ButtonLink>
              ) : null}
              {character && !assemblingFilm ? (
                <DayRemixMenu
                  testIdPrefix="day-remix"
                  onTomorrow={() => void startTomorrow()}
                  tomorrowBusy={writingTomorrow}
                  onNewOutfit={remixNewOutfitDay}
                  onTheme={remixThemeDay}
                />
              ) : null}
              {character && !assemblingFilm ? (
                <ActionMenu label="After cut" testId="day-after-cut-menu">
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
                    title="Save a poster frame from a finished still"
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
                  {completedShotCount > 0 ? (
                    <ButtonLink
                      href={galleryFilmHref}
                      size="sm"
                      variant="ghost"
                      className="w-full !justify-start text-left"
                      data-testid="day-open-gallery"
                    >
                      Open in Gallery
                    </ButtonLink>
                  ) : null}
                  <ButtonLink
                    href={`/play?character=${encodeURIComponent(character.id)}`}
                    size="sm"
                    variant="ghost"
                    className="w-full !justify-start text-left"
                    data-testid="day-campaign-complete"
                  >
                    Back to Play
                  </ButtonLink>
                </ActionMenu>
              ) : null}
            </div>
          ) : null}
          {filmStatus ? (
            <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p>
          ) : null}
          <DaySeriesPanel
            season={season}
            stitching={seasonStitching}
            status={seasonStatus}
            onStitch={() => void stitchSeason()}
            onNewSeason={startNewSeason}
          />
        </ToolSection>

        {!firstCutCelebrate ? (
          leanChrome ? (
            <CollapsibleSection
              title="More"
              summary="Outfit, Look, Story"
              defaultOpen={false}
              persistKey="day-more-links"
            >
              <ToolActionRow>
                {character ? (
                  <>
                    <ButtonLink
                      href={`/fitting?character=${encodeURIComponent(character.id)}${
                        fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                      }`}
                      size="sm"
                      variant="ghost"
                    >
                      Open Outfit
                    </ButtonLink>
                    <ButtonLink
                      href={`/moodboard?character=${encodeURIComponent(character.id)}`}
                      size="sm"
                      variant="ghost"
                    >
                      Open Look
                    </ButtonLink>
                  </>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy} onClick={goRoleplay}>
                  Optional: Story
                </Button>
              </ToolActionRow>
            </CollapsibleSection>
          ) : (
            <ToolActionRow>
              {character ? (
                <>
                  <ButtonLink
                    href={`/fitting?character=${encodeURIComponent(character.id)}${
                      fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
                    }`}
                    size="sm"
                    variant="ghost"
                  >
                    Open Outfit
                  </ButtonLink>
                  <ButtonLink
                    href={`/moodboard?character=${encodeURIComponent(character.id)}`}
                    size="sm"
                    variant="ghost"
                  >
                    Open Look
                  </ButtonLink>
                </>
              ) : null}
              <Button size="sm" variant="ghost" disabled={busy} onClick={goRoleplay}>
                Optional: Story
              </Button>
            </ToolActionRow>
          )
        ) : null}
        {error ? (
          <div className="space-y-2">
            <FieldError>{error}</FieldError>
            <ToolActionRow>
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                data-testid="day-error-demo-stills"
                onClick={seedDemoStills}
              >
                Use demo stills
              </Button>
              <Button
                size="sm"
                variant="secondary"
                data-testid="day-error-watch-sample"
                onClick={() => setSampleWatch(true)}
              >
                Watch sample cut
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="day-error-retry-queue"
                onClick={() => void queueAll()}
              >
                Retry queue
              </Button>
              {filmGuideHref ? (
                <ButtonLink
                  href={filmGuideHref}
                  size="sm"
                  variant="ghost"
                  data-testid="film-failure-playbook-link"
                >
                  {resolveQueueFailureGuideLabel(filmGuideHref)}
                </ButtonLink>
              ) : null}
            </ToolActionRow>
          </div>
        ) : null}

        {!leanChrome ? (
          <ScenePromptResultPanel
            output={output}
            onOutputChange={setOutput}
            result={null}
            copied={copied}
            onCopy={() => {
              if (!output) {
                return;
              }
              void navigator.clipboard.writeText(output).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
            actions={actions}
            shared={shared}
            selectedComfyNode={selectedModel?.comfyNode ?? 'model'}
            hints={toolSettings.notes}
            queueLabel="Queue slot"
            onSendComfyUi={() => void queueSlot(activeSlot, { byPlayer: true })}
          />
        ) : null}
      </ToolLayout>
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
        onQueueSlot={() => void queueSlot(activeSlot, { byPlayer: true })}
        onAnimateSlot={() => void animateSlot(activeSlot)}
      />
      <SideSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Setup"
        description={
          hasPlate
            ? `${character?.name?.trim() || 'Cast'} · plate ready`
            : 'Character and plate for identity.'
        }
        testId="day-setup-sheet"
      >
        <div data-testid="day-character" className="day-character-section space-y-4">
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
          <DayPlateSection
            plate={plate}
            platePreviewUrl={platePreviewUrl}
            characterId={shared.activeCharacterId}
            lookId={activeSlot.lookId}
            lockedWardrobeId={activeSlot.wardrobeId || shared.lockedWardrobeId}
            busy={busy}
            isolateSubject={isolateSubject}
            isolateBusy={isolateBusy}
            isolateStatus={isolateStatus}
            isolatePending={isolatePending}
            onIsolateSubjectChange={setIsolateSubject}
            onUploadPlate={file => void uploadCastPlate(file)}
            onMakePlate={() => void makeCastPlate()}
            makePlateStatus={makePlateStatus}
            uploading={plateUploading}
            uploadError={plateUploadError}
          />
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
    </>
  );
}
