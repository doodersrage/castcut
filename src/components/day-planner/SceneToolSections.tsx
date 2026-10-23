'use client';

import dynamic from 'next/dynamic';
import { useId, useRef, useState } from 'react';
import SharedToolControls from '@/components/SharedToolControls';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import DayAdvancedDrawer, {
  DayQualityStatusLines,
} from '@/components/day-planner/DayAdvancedDrawer';
import DayAnimateSheet from '@/components/day-planner/DayAnimateSheet';
import DayClothingPicker, {
  type DayClothingPickerVm,
} from '@/components/day-planner/DayClothingPicker';
import { dayClothingView } from '@/components/day-planner/DayOutfitRow';
import DayPartnerRow from '@/components/day-planner/DayPartnerRow';
import DayPlanBar, { DayMoodHints } from '@/components/day-planner/DayPlanBar';
import DaySetupChip from '@/components/day-planner/DaySetupChip';
import DaySetupSheet, { type DaySetupSheetVm } from '@/components/day-planner/DaySetupSheet';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import DaySlotEditor from '@/components/day-planner/DaySlotEditor';
import DayStatusStrip from '@/components/day-planner/DayStatusStrip';
import SlotMediaSheet from '@/components/day-planner/SlotMediaSheet';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import { ToolActionRow, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { useDayQualityPreset } from '@/hooks/day-planner/useDayQualityPreset';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { clipUrlIsVideo } from '@/lib/clip/media-kind';
import { DAY_PARTS, dayPartOf } from '@/lib/day/parts';
import { dayQualityPresetLabel } from '@/lib/day/quality-preset';
import { dayStillShownImage, isDayAdultMood, type DaySlotId } from '@/lib/day/planner';
import { sceneSummary } from '@/lib/day/scenes';
import type { FixAreaTarget } from '@/lib/edit/fix-area-client';
import { useRenderBackend } from '@/lib/engine/render-backend-status';
import { pickedPostures } from '@/lib/pose/rig3d-posture-points';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});
const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});
// Three.js and the pose body load only when the Director opens.
const DirectorSheet = dynamic(() => import('@/components/director/DirectorSheet'), {
  ssr: false,
});

const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;
const PART_LABELS: Record<(typeof DAY_PARTS)[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

type Props = {
  vm: ReturnType<typeof useDayPlannerToolOrchestration>;
  page: ReturnType<typeof useScenePage>;
  /** Phone (/m/scene): the compact pose preview and board card. */
  compact?: boolean;
};

/**
 * Scene — one shot, exactly as you want it. The Cast's saved scenes; the open one's shot (the
 * Day slot editor: setting, beat, pose with the 3D editor and Camera row, look, engine, clothing,
 * people), its takes (render several, keep the best), and Make it move from the kept take
 * (Animate, Copy moves, the Director). Day's engine renders it, so it is Day's still pipeline.
 */
export default function SceneToolSections({ vm, page, compact = false }: Props) {
  const {
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    error,
    busy,
    character,
    hasPlate,
    plate,
    platePreviewUrl,
    stills,
    slots,
    activeSlot,
    dayMood,
    setDayMood,
    setIntimatePlayful,
    intimateEnabled,
    intimateMix,
    people,
    setPeople,
    leadNoun,
    dayWeather,
    setDayWeather,
    allowCompanions,
    partnerCharacterId,
    partnerOptions,
    setPartnerCharacterId,
    partnerTwoWomen,
    partnerStandInUrl,
    partnerSentFaceUrl,
    partnerOutfit,
    newPartnerStandIn,
    keepPartnerAsCast,
    queueBlockReason,
    poseGuideLine,
    poseGuidePreviews,
    dressPlateStatus,
    dressPlatePreviewUrl,
    redoDressPlate,
    keeperStandIn,
    makeStandingPicture,
    updateSlot,
    queueSlot,
    animateSlot,
    previewSlotClip,
    poseMissViews,
    slotMedia,
    qualityLedger,
    poseRedoMarks,
    clipChecks,
    pickTwoTake,
    looksWrongSlot,
    fixAreaTargetForSlot,
    redoSlotSameSeed,
    keepPreviousTake,
    dropPreviousTake,
    rerollActiveSlotScene,
    addVoiceToSlot,
    voicingSlotId,
    extendSlotClip,
    extendRequestFor,
    extending,
    extendResult,
    wardrobeLabelFor,
    faceFinish,
    setFaceFinish,
    autoReviewStills,
    setAutoReviewStills,
    redoPoseMisses,
    setRedoPoseMisses,
    bestOfTwoHardPoses,
    setBestOfTwoHardPoses,
    twoTakesIntimate,
    setTwoTakesIntimate,
    bestEnginePerPose,
    setBestEnginePerPose,
    posePriority,
    setPosePriority,
    identityBoost,
    setIdentityBoost,
    checkMarks,
    setCheckMarks,
    widescreenFilm,
    setWidescreenFilm,
    faceFinishStatus,
    afterChecksStatus,
    qualityStatus,
    poseRedoStatus,
    bestOfTwoStatus,
    twoTakesOrderStatus,
    filteredWardrobeOptions,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
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
    selectDayWardrobe,
    setError,
    isolateSubject,
    isolateBusy,
    isolateStatus,
    isolatePending,
    setIsolateSubject,
    uploadCastPlate,
    makeCastPlate,
    makePlateStatus,
    plateUploading,
    plateUploadError,
  } = vm;
  const {
    castScenes,
    active,
    slot,
    still,
    inFlight,
    kept,
    note,
    newScene,
    openScene,
    renameScene,
    deleteScene,
    setTimeOfDay,
    showTake,
    keepTake,
    removeTake,
    keptOnCard,
    daySlots,
    refreshDaySlots,
    sendToDay,
  } = page;
  const renderOffline = useRenderBackend().state === 'offline';
  const queueBlocked = Boolean(queueBlockReason) || renderOffline;
  const quality = useDayQualityPreset({ shared, updateShared, toolSettings, updateToolSettings });
  const [setupOpen, setSetupOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  const [animateOpen, setAnimateOpen] = useState(false);
  const [movesOpen, setMovesOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [fixAreaTarget, setFixAreaTarget] = useState<FixAreaTarget | null>(null);
  const [sendSlotId, setSendSlotId] = useState<DaySlotId | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const hasCustomGarment = Boolean(toolSettings.customGarmentImageUrl?.trim());
  const clothingView = dayClothingView({
    dayKitId: shared.lockedWardrobeId,
    slotKitId: slot.wardrobeId,
    photoUrl: hasCustomGarment ? toolSettings.customGarmentImageUrl : null,
    footwear: toolSettings.footwear,
    footwearImageUrl: toolSettings.footwearImageUrl,
    labelFor: wardrobeLabelFor,
  });
  const clothingVm: DayClothingPickerVm = {
    shared,
    toolSettings,
    updateToolSettings,
    busy,
    activeSlot,
    filteredWardrobeOptions,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
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
    selectDayWardrobe,
    setError,
  };
  const setupVm: DaySetupSheetVm = {
    character,
    hasPlate,
    shared,
    updateShared,
    setError,
    plate,
    platePreviewUrl,
    activeSlot,
    busy,
    isolateSubject,
    isolateBusy,
    isolateStatus,
    isolatePending,
    setIsolateSubject,
    uploadCastPlate,
    makeCastPlate,
    makePlateStatus,
    plateUploading,
    plateUploadError,
  };
  const shownTake = dayStillShownImage(still);
  const keptClip = kept?.clipUrl?.trim() || '';
  const mediaBusy = slotMedia.busy !== null;
  const takeCount = active?.takes.length ?? 0;
  const timeOfDay = dayPartOf(slot.id);
  const scenesInOrder = [...castScenes].sort((a, b) => a.createdAt - b.createdAt);
  // Make it move: the job runs in the background (the jobs tray follows it); the clip lands on
  // the kept take.
  const runMove = async (work: () => Promise<string | null>) => {
    setMoveNote('Working on ComfyUI — a few minutes. The jobs tray follows it.');
    const failed = await work();
    setMoveNote(failed ?? 'Done — the clip is on the kept take.');
  };

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
      toolId={TOOL_ID}
      qualitySetBy={{
        label: dayQualityPresetLabel(quality.preset),
        hint: 'Change it in the bar above the shot; Good / Best by hand under Advanced.',
      }}
      preferEditModels={hasPlate}
      onSharedSettingsChange={updateShared}
      variant="roleplay"
    />
  );

  return (
    <>
      <ToolLayout
        accent={ACCENT}
        title="Scene"
        description="One shot, exactly as you want it — render takes, keep the best, make it move."
        headerActions={
          <DaySetupChip
            character={character}
            hasPlate={hasPlate}
            onClick={() => setSetupOpen(true)}
          />
        }
        sidebarPersistKey="scene"
        sidebar={engineControls}
      >
        <PlayGetStartedCard
          hasCharacter={Boolean(character)}
          hasPlate={hasPlate}
          characterId={character?.id}
          onOpenSetup={() => setSetupOpen(true)}
        />
        <ToolSection data-testid="scene-list">
          <div className="flex flex-wrap items-center gap-2">
            {scenesInOrder.length > 0 ? (
              <PortraitTileStrip
                label="Scenes"
                className="min-w-0 flex-1"
                value={active?.id ?? ''}
                testIdPrefix="scene-list-item"
                onChange={openScene}
                tiles={scenesInOrder.map(scene => ({
                  id: scene.id,
                  label: scene.name,
                  title: sceneSummary(scene) || scene.name,
                  thumb:
                    scene.takes.find(take => take.id === scene.keptTakeId)?.imageUrl ??
                    scene.takes.at(-1)?.imageUrl,
                  glyph: '—',
                  caption: scene.keptTakeId
                    ? 'Take kept'
                    : scene.takes.length
                      ? `${scene.takes.length} take${scene.takes.length === 1 ? '' : 's'}`
                      : 'No takes yet',
                }))}
              />
            ) : null}
            <Button
              size="sm"
              variant={castScenes.length ? 'secondary' : 'primary'}
              disabled={!character || inFlight}
              data-testid="scene-new"
              onClick={newScene}
            >
              New scene
            </Button>
          </div>
          {!active ? (
            <p className="type-caption mt-2 text-[var(--text-muted)]" data-testid="scene-empty">
              {character
                ? `No scene open for ${character.name}. New scene starts one — or open a Day slot as a scene (its sheet → Open as Scene).`
                : 'Pick a Cast lead (Setup) — scenes are kept per Cast.'}
            </p>
          ) : null}
        </ToolSection>

        {active ? (
          <>
            <ToolSection data-testid="scene-shot" title="The shot">
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <FieldLabel>Name</FieldLabel>
                  <TextInput
                    key={active.id}
                    defaultValue={active.name}
                    maxLength={60}
                    data-testid="scene-name"
                    className="!w-48"
                    onBlur={event => renameScene(active.id, event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <div
                  className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
                  role="radiogroup"
                  aria-label="Time of day"
                  data-testid="scene-time"
                >
                  <span className="type-caption text-[var(--text-muted)]">Time</span>
                  <div className="ui-segmented" data-wrap="true">
                    {DAY_PARTS.map(part => (
                      <button
                        key={part}
                        type="button"
                        role="radio"
                        className="ui-segmented-item"
                        aria-checked={timeOfDay === part}
                        data-active={timeOfDay === part ? 'true' : 'false'}
                        disabled={busy || inFlight}
                        data-testid={`scene-time-${part}`}
                        onClick={() => setTimeOfDay(part)}
                      >
                        {PART_LABELS[part]}
                      </button>
                    ))}
                  </div>
                </div>
                {confirmDelete ? (
                  <span className="flex items-center gap-2" data-testid="scene-delete-confirm">
                    <span className="type-caption">Delete {active.name}?</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid="scene-delete-yes"
                      onClick={() => {
                        setConfirmDelete(false);
                        deleteScene(active.id);
                      }}
                    >
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={inFlight}
                    data-testid="scene-delete"
                    title="Delete this scene (its takes stay in the Gallery)"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete scene
                  </Button>
                )}
              </div>
              <TaskRequirementsCard
                task="This scene"
                testId="scene-task-requirements"
                input={{
                  model: shared.model,
                  adult: isDayAdultMood(dayMood) && intimateEnabled,
                  faceFinish,
                  autoReview: autoReviewStills,
                }}
              />
              {/* Day's plan bar without its length: mood (Intimate · Playful as Day gates it),
                  people, weather, quality. */}
              <DayPlanBar
                className="mb-2"
                testId="scene-plan-bar"
                showLength={false}
                busy={busy}
                onDayLengthChange={() => undefined}
                dayMood={dayMood}
                onDayMoodChange={setDayMood}
                onIntimatePlayfulChange={setIntimatePlayful}
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
                  partnerOutfit={partnerOutfit}
                  onNewPartnerStandIn={newPartnerStandIn}
                  onKeepPartnerAsCast={keepPartnerAsCast}
                />
                <DayQualityStatusLines
                  faceFinish={faceFinish}
                  autoReviewStills={autoReviewStills}
                  redoPoseMisses={redoPoseMisses}
                  bestOfTwoHardPoses={bestOfTwoHardPoses}
                  faceFinishStatus={faceFinishStatus}
                  afterChecksStatus={afterChecksStatus}
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
                  checkMarks={checkMarks}
                  onCheckMarksChange={setCheckMarks}
                  widescreenFilm={widescreenFilm}
                  onWidescreenFilmChange={setWidescreenFilm}
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
              {/* The Day slot's own editor — every fix to Day's slot controls reaches Scene. */}
              <div ref={editorRef} data-testid="scene-editor">
                <DaySlotEditor
                  slot={slot}
                  slots={slots}
                  stills={stills}
                  character={character}
                  busy={busy}
                  queueBlocked={queueBlocked}
                  dayMood={dayMood}
                  intimateEnabled={intimateEnabled}
                  intimateMix={intimateMix}
                  allowCompanions={allowCompanions}
                  model={shared.model}
                  poseMiss={poseMissViews[slot.id]}
                  plateUrl={platePreviewUrl || plate?.imageUrl}
                  updateSlot={updateSlot}
                  clothingSummary={clothingView.slot.summary}
                  clothingThumbs={clothingView.slot.thumbs}
                  renderClothingPicker={() => (
                    <DayClothingPicker vm={clothingVm} scope="slot" accent={ACCENT} />
                  )}
                  clothingTitle={`Clothing · ${active.name}`}
                  onRedoSameSeed={() => void redoSlotSameSeed(slot.id)}
                  onKeepOldTake={() => keepPreviousTake(slot.id)}
                  onKeepNewTake={() => dropPreviousTake(slot.id)}
                  onPickTwoTake={keep => pickTwoTake(slot.id, keep)}
                  compact={compact}
                  groupOptions={partnerOptions.filter(option => option.id !== partnerCharacterId)}
                />
              </div>
            </ToolSection>

            <ToolSection
              data-testid="scene-takes"
              title="Takes"
              description="Render it as many times as you like; keep the best (★). Cut uses the kept take."
            >
              <DayStatusStrip
                className="mb-2"
                statusLine={`${active.name} · ${takeCount} take${takeCount === 1 ? '' : 's'}${kept ? ' · one kept' : ''}`}
                queueBlockReason={character && hasPlate ? queueBlockReason : null}
                poseGuideLine={poseGuideLine}
                dressPlateStatus={dressPlateStatus}
                dressPlatePreviewUrl={dressPlatePreviewUrl}
                onRedoDressPlate={redoDressPlate}
                keeperStandIn={keeperStandIn}
                onMakeStandingPicture={makeStandingPicture}
                onOpenDressPlate={url =>
                  setLightbox({ images: [url], index: 0, title: 'Dressed plate' })
                }
                poseGuidePreviews={poseGuidePreviews}
              />
              <ToolActionRow className="mb-3">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || queueBlocked || inFlight}
                  data-testid="scene-queue-take"
                  title="Render this shot (Day's still engine, its checks and finishes)"
                  onClick={() => void queueSlot(slot, { byPlayer: true })}
                >
                  {inFlight ? 'Rendering…' : takeCount > 0 ? 'Another take' : 'Queue a take'}
                </Button>
              </ToolActionRow>
              {renderOffline ? (
                <p className="type-caption mb-2 text-[var(--tint-warning-text,var(--accent-text))]">
                  ComfyUI is offline — Queue waits until it’s back.
                </p>
              ) : null}
              {/* The take on the card: live render preview, checks and the ⋯ tools (Day's board). */}
              <DaySlotBoard
                castName={character?.name}
                castId={character?.id}
                leadNoun={leadNoun}
                slots={slots}
                stills={stills}
                activeSlotId={slot.id}
                busy={busy}
                queueBlocked={queueBlocked}
                compact={compact}
                clipJobFeature="scene"
                onSelectSlot={() => undefined}
                onEditSlot={() =>
                  editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                onOpenStill={() =>
                  shownTake
                    ? setLightbox({ images: [shownTake], index: 0, title: active.name })
                    : undefined
                }
                onRetrySlot={entry => void queueSlot(entry, { byPlayer: true })}
                onAnimateSlot={() => setAnimateOpen(true)}
                onAddVoice={addVoiceToSlot}
                voicingSlotId={voicingSlotId}
                onExtendClip={extendSlotClip}
                extendRequestFor={extendRequestFor}
                extending={extending}
                extendResult={extendResult}
                onQueueSlot={entry => void queueSlot(entry, { byPlayer: true })}
                onRerollSlot={entry => rerollActiveSlotScene({ slotId: entry.id })}
                qualityLedger={qualityLedger}
                poseRedoMarks={poseRedoMarks}
                clipChecks={clipChecks}
                onPickTwoTake={pickTwoTake}
                onLooksWrong={entry => void looksWrongSlot(entry.id)}
                onFixArea={entry => setFixAreaTarget(fixAreaTargetForSlot(entry.id))}
                mediaTools={{
                  busy: slotMedia.busy,
                  finish: slotMedia.finishSlotClip,
                  realism: slotMedia.realismSlotClip,
                  moves: slotMedia.copyMovesToSlot,
                  dance: slotMedia.danceSlot,
                  lipSync: slotMedia.lipSyncSlot,
                  relight: slotMedia.relightSlot,
                  upscale: slotMedia.upscaleSlot,
                  sketch: slotMedia.applySketchToSlot,
                }}
              />
              {active.takes.length > 0 ? (
                <ol className="mt-3 flex flex-wrap gap-2" data-testid="scene-take-list">
                  {active.takes.map((take, index) => {
                    const isKept = take.id === active.keptTakeId;
                    const onCard = Boolean(still?.promptId && still.promptId === take.promptId);
                    return (
                      <li
                        key={take.id}
                        className={`relative w-24 overflow-hidden rounded-[var(--radius-md)] border ${
                          isKept ? 'border-[var(--accent-border)]' : 'border-[var(--border-subtle)]'
                        }`}
                        data-testid="scene-take"
                        data-take={take.id}
                        data-kept={isKept ? 'true' : 'false'}
                        data-on-card={onCard ? 'true' : 'false'}
                      >
                        <button
                          type="button"
                          className="ui-btn-ghost block w-full !p-0"
                          title={onCard ? 'On the card' : 'Show this take on the card'}
                          data-testid={`scene-take-show-${index}`}
                          onClick={() => showTake(take)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URL */}
                          <img
                            src={take.imageUrl}
                            alt={`Take ${index + 1}`}
                            className="aspect-[3/4] w-full object-cover"
                          />
                        </button>
                        <div className="flex items-center justify-between gap-1 px-1 py-0.5">
                          <button
                            type="button"
                            className="ui-text-link type-caption"
                            aria-pressed={isKept}
                            data-testid={`scene-take-keep-${index}`}
                            title={isKept ? 'Kept — tap to let it go' : 'Keep this take'}
                            onClick={() => keepTake(take.id)}
                          >
                            {isKept ? '★ Kept' : '☆ Keep'}
                          </button>
                          <button
                            type="button"
                            className="ui-text-link type-caption"
                            aria-label={`Remove take ${index + 1}`}
                            title="Remove from the scene (it stays in the Gallery)"
                            data-testid={`scene-take-remove-${index}`}
                            onClick={() => removeTake(take.id)}
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="scene-send-day">
                <SelectInput
                  value={sendSlotId}
                  aria-label="Day slot"
                  className="!w-auto"
                  data-testid="scene-send-day-slot"
                  onFocus={refreshDaySlots}
                  onPointerDown={refreshDaySlots}
                  onChange={event => setSendSlotId(event.target.value as DaySlotId)}
                >
                  <option value="">Send to Day slot…</option>
                  {daySlots.map(entry => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                      {entry.sceneHints?.trim() ? ` — ${entry.sceneHints.trim().slice(0, 40)}` : ''}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!sendSlotId}
                  data-testid="scene-send-day-go"
                  title="The shot goes on that Day slot; its kept take becomes the slot's still (the old one stays as the previous take)"
                  onClick={() => {
                    if (sendSlotId) sendToDay(sendSlotId);
                  }}
                >
                  Send
                </Button>
              </div>
            </ToolSection>

            <ToolSection
              data-testid="scene-move"
              title="Make it move"
              description="From the kept take: animate it, copy moves from a video, or direct the moves on the 3D body."
            >
              {kept ? (
                <div className="mb-3 flex flex-wrap items-start gap-3" data-testid="scene-kept">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URL */}
                  <img
                    src={kept.imageUrl}
                    alt="Kept take"
                    className="h-32 w-24 rounded-[var(--radius-md)] object-cover"
                  />
                  {keptClip ? (
                    clipUrlIsVideo(keptClip, { promptId: kept.clipPromptId }) ? (
                      <video
                        src={keptClip}
                        controls
                        loop
                        playsInline
                        className="h-32 rounded-[var(--radius-md)]"
                        data-testid="scene-kept-clip"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- animated clip
                      <img
                        src={keptClip}
                        alt="Kept take's clip"
                        className="h-32 rounded-[var(--radius-md)]"
                        data-testid="scene-kept-clip"
                      />
                    )
                  ) : null}
                </div>
              ) : (
                <p
                  className="type-caption mb-2 text-[var(--text-muted)]"
                  data-testid="scene-move-needs-keep"
                >
                  Keep a take (★ under Takes) — Make it move starts from it.
                </p>
              )}
              <ToolActionRow>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!kept || busy || renderOffline || mediaBusy}
                  data-testid="scene-animate"
                  onClick={() => {
                    if (keptOnCard()) setAnimateOpen(true);
                  }}
                >
                  Animate
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!kept || renderOffline || mediaBusy}
                  data-testid="scene-copy-moves"
                  title="Film yourself (or pick a video): the kept take's person does the same moves."
                  onClick={() => {
                    if (keptOnCard()) setMovesOpen(true);
                  }}
                >
                  Copy moves…
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!kept || renderOffline || mediaBusy}
                  data-testid="scene-director"
                  title="Pose a few beats on the 3D body (or pick ready-made moves): the kept take's person acts them out."
                  onClick={() => {
                    if (keptOnCard()) setDirectorOpen(true);
                  }}
                >
                  Direct a move…
                </Button>
                <ButtonLink
                  href="/cut?from=scenes"
                  size="sm"
                  variant="ghost"
                  data-testid="scene-open-cut"
                >
                  Cut →
                </ButtonLink>
              </ToolActionRow>
              {moveNote ? (
                <p
                  className="type-caption mt-2 text-[var(--text-muted)]"
                  data-testid="scene-move-note"
                >
                  {moveNote}
                </p>
              ) : null}
            </ToolSection>
          </>
        ) : null}
        {note ? (
          <p
            className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
            data-testid="scene-note"
            role="status"
          >
            {note}
          </p>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </ToolLayout>
      <DayAnimateSheet
        key={animateOpen ? slot.id : 'none'}
        slot={animateOpen ? slot : null}
        preview={previewSlotClip}
        initialExtraSeconds={toolSettings.dayClipExtraSeconds}
        busy={busy}
        onClose={() => setAnimateOpen(false)}
        onAnimate={(target, direction, extraSeconds) => {
          setAnimateOpen(false);
          if (extraSeconds !== (toolSettings.dayClipExtraSeconds ?? 0)) {
            updateToolSettings({ dayClipExtraSeconds: extraSeconds });
          }
          void animateSlot(target, { direction, extraSeconds });
        }}
      />
      <SlotMediaSheet
        kind={movesOpen ? 'moves' : null}
        onClose={() => setMovesOpen(false)}
        onMoves={(video, options) => {
          setMovesOpen(false);
          void runMove(() => slotMedia.copyMovesToSlot(slot, video, options));
        }}
        onLipSync={() => undefined}
        onRelight={() => undefined}
      />
      {directorOpen && kept ? (
        <DirectorSheet
          open
          stillUrl={kept.imageUrl}
          castId={character?.id}
          castName={character?.name}
          body={leadNoun === 'man' ? 'male' : 'female'}
          place={slot.location}
          postures={pickedPostures(slot)}
          busy={mediaBusy}
          onClose={() => setDirectorOpen(false)}
          onRender={(video, options) => {
            setDirectorOpen(false);
            void runMove(() => slotMedia.copyMovesToSlot(slot, video, options));
          }}
          testId="scene-director-sheet"
        />
      ) : null}
      <DaySetupSheet vm={setupVm} open={setupOpen} onClose={() => setSetupOpen(false)} />
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />
      {fixAreaTarget ? (
        <FixAreaDialog target={fixAreaTarget} onClose={() => setFixAreaTarget(null)} />
      ) : null}
    </>
  );
}
