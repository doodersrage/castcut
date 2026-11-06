'use client';

import { CastMoodBoardMenu } from '@/components/character/CastMoodBoard';
import { useLocations } from '@/components/location/useLocations';
import SceneScriptAndRun from '@/components/day-planner/SceneScriptAndRun';
import type { useSceneRun } from '@/hooks/day-planner/useSceneRun';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import TaskRequirementsCard from '@/components/TaskRequirementsCardLazy';
import DayAdvancedDrawer, {
  DayQualityStatusLines,
} from '@/components/day-planner/DayAdvancedDrawer';
import DayPartnerRow from '@/components/day-planner/DayPartnerRow';
import DayPlanBar, { DayMoodHints } from '@/components/day-planner/DayPlanBar';
import DaySetupChip from '@/components/day-planner/DaySetupChip';
import DaySlotEditor from '@/components/day-planner/DaySlotEditor';
import DayStatusStrip from '@/components/day-planner/DayStatusStrip';
import {
  SceneKeptPreview,
  SceneTakeCard,
  SceneTakeList,
} from '@/components/day-planner/SceneTakes';
import { SCENE_ACCENT, useSceneToolViews } from '@/components/day-planner/useSceneToolViews';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError, FieldLabel, SelectInput, TextInput } from '@/components/ui/Field';
import { ToolActionRow, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { DAY_PARTS, dayPartOf } from '@/lib/day/parts';
import { isDayAdultMood, type DaySlotId } from '@/lib/day/planner';
import { sceneSummary } from '@/lib/day/scenes';

const ACCENT = SCENE_ACCENT;
const PART_LABELS: Record<(typeof DAY_PARTS)[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

type Props = {
  vm: ReturnType<typeof useDayPlannerToolOrchestration>;
  page: ReturnType<typeof useScenePage>;
  /** The run's runner (M5 W4). */
  runner: ReturnType<typeof useSceneRun>;
};

/**
 * Scene — one shot, exactly as you want it. The Cast's saved scenes; the open one's shot (the
 * Day slot editor: setting, beat, pose with the 3D editor and Camera row, look, engine, clothing,
 * people), its takes (render several, keep the best), and Make it move from the kept take
 * (Animate, Copy moves, the Director). Day's engine renders it, so it is Day's still pipeline.
 */
export default function SceneToolSections({ vm, page, runner }: Props) {
  const views = useSceneToolViews(vm, page);
  const {
    shared,
    toolSettings,
    updateToolSettings,
    error,
    busy,
    character,
    hasPlate,
    stills,
    slots,
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
    queueBlockReason,
    updateSlot,
    queueSlot,
    faceFinish,
    autoReviewStills,
  } = vm;
  const {
    castScenes,
    active,
    slot,
    inFlight,
    rendering,
    kept,
    note,
    newScene,
    openScene,
    renameScene,
    deleteScene,
    setTimeOfDay,
    daySlots,
    refreshDaySlots,
    sendToDay,
  } = page;
  const { renderOffline, queueBlocked, quality, mediaBusy, engineControls } = views;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const locations = useLocations();
  const advancedId = useId();
  const [sendSlotId, setSendSlotId] = useState<DaySlotId | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const takeCount = active?.takes.length ?? 0;
  const timeOfDay = dayPartOf(slot.id);
  const scenesInOrder = [...castScenes].sort((a, b) => a.createdAt - b.createdAt);
  // Keys (not while typing, nor over a dialog): ← → the take before / after onto the card, K keeps
  // it, X rejects it, N another take, [ ] the scene before / after.
  const { showTake, keepTake, reviewTake, noteTake, still: cardStill } = page;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      if (event.key === '[' || event.key === ']') {
        const at = scenesInOrder.findIndex(entry => entry.id === active?.id);
        const next = scenesInOrder[at + (event.key === '[' ? -1 : 1)];
        if (next) {
          event.preventDefault();
          openScene(next.id);
        }
        return;
      }
      if (!active) return;
      const takes = active.takes.filter(take => take.review !== 'rejected');
      const onCard = takes.findIndex(
        take => take.promptId && take.promptId === cardStill?.promptId
      );
      const take = takes[onCard];
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const next =
          takes[
            Math.max(
              0,
              Math.min(
                takes.length - 1,
                (onCard < 0 ? 0 : onCard) + (event.key === 'ArrowLeft' ? -1 : 1)
              )
            )
          ];
        if (next && next !== take) {
          event.preventDefault();
          showTake(next);
        }
      } else if (key === 'k' && take) {
        event.preventDefault();
        if (take.id !== active.keptTakeId) keepTake(take.id);
      } else if (key === 'x' && take && take.id !== active.keptTakeId) {
        event.preventDefault();
        reviewTake(take.id, 'rejected');
      } else if (/^[1-5]$/.test(key) && take) {
        // 1–5 rates the take on the card (the same number again clears it).
        event.preventDefault();
        const value = Number(key);
        noteTake(take.id, { stars: take.stars === value ? null : value });
      } else if (key === 'n' && !busy && !queueBlocked && !inFlight) {
        event.preventDefault();
        void queueSlot(slot, { byPlayer: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    active,
    busy,
    cardStill?.promptId,
    inFlight,
    keepTake,
    noteTake,
    openScene,
    queueBlocked,
    queueSlot,
    reviewTake,
    scenesInOrder,
    showTake,
    slot,
  ]);

  return (
    <>
      <ToolLayout
        width="full"
        accent={ACCENT}
        title="Scene"
        description="One shot, exactly as you want it — render takes, keep the best, make it move."
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <DaySetupChip
              character={character}
              hasPlate={hasPlate}
              onClick={() => views.setSetupOpen(true)}
            />
            <CastMoodBoardMenu character={character} testId="scene-mood-board" />
          </div>
        }
        sidebarPersistKey="scene"
        sidebar={engineControls}
      >
        <PlayGetStartedCard
          scene
          hasCharacter={Boolean(character)}
          hasPlate={hasPlate}
          characterId={character?.id}
          onOpenSetup={() => views.setSetupOpen(true)}
        />
        {/* A strip of scene tiles: a toolbar's padding, not a full section's. */}
        <ToolSection data-testid="scene-list" className="!py-3 sm:!py-3">
          <div className="flex flex-wrap items-center gap-2">
            {scenesInOrder.length > 0 ? (
              <PortraitTileStrip
                label="Scenes"
                className="min-w-0 flex-1"
                value={active?.id ?? ''}
                testIdPrefix="scene-list-item"
                size="lg"
                onChange={openScene}
                tiles={scenesInOrder.map(scene => ({
                  id: scene.id,
                  label: scene.name,
                  title: sceneSummary(scene) || scene.name,
                  thumb:
                    scene.takes.find(take => take.id === scene.keptTakeId)?.imageUrl ??
                    scene.takes.at(-1)?.imageUrl,
                  glyph: '—',
                  status: scene.keptTakeId ? ('done' as const) : ('todo' as const),
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
              disabled={!character || rendering}
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
            {/* The shot beside its takes (they were one long column: edit at the top, scroll down
                to see what came out). The takes column stays in view while the form scrolls. */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
              <div className="min-w-0">
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
                        <span className="type-caption">
                          Delete {active.name}?
                          {page.cutNoteFor(active) ? (
                            <span data-testid="scene-delete-cut-note">
                              {' '}
                              {page.cutNoteFor(active)}
                            </span>
                          ) : null}
                        </span>
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
                  {/* Hidden when every hint is off (it kept its margin, empty). */}
                  <div className="mb-3 space-y-1.5 empty:hidden">
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
                      onPartnerChange={vm.setPartnerCharacterId}
                      partnerTwoWomen={vm.partnerTwoWomen}
                      leadNoun={leadNoun}
                      partnerStandInUrl={vm.partnerStandInUrl}
                      partnerSentFaceUrl={vm.partnerSentFaceUrl}
                      partnerOutfit={vm.partnerOutfit}
                      onNewPartnerStandIn={vm.newPartnerStandIn}
                      onKeepPartnerAsCast={vm.keepPartnerAsCast}
                    />
                    <DayQualityStatusLines
                      faceFinish={faceFinish}
                      autoReviewStills={autoReviewStills}
                      redoPoseMisses={vm.redoPoseMisses}
                      bestOfTwoHardPoses={vm.bestOfTwoHardPoses}
                      faceFinishStatus={vm.faceFinishStatus}
                      afterChecksStatus={vm.afterChecksStatus}
                      qualityStatus={vm.qualityStatus}
                      poseRedoStatus={vm.poseRedoStatus}
                      bestOfTwoStatus={vm.bestOfTwoStatus}
                      twoTakesIntimate={vm.twoTakesIntimate}
                      twoTakesOrderStatus={vm.twoTakesOrderStatus}
                    />
                  </div>
                  {advancedOpen ? (
                    <DayAdvancedDrawer
                      id={advancedId}
                      className="mb-3"
                      busy={busy}
                      renderQuality={quality.renderQuality}
                      onRenderQualityChange={quality.setRenderQuality}
                      posePriority={vm.posePriority}
                      onPosePriorityChange={vm.setPosePriority}
                      identityBoost={vm.identityBoost}
                      onIdentityBoostChange={vm.setIdentityBoost}
                      faceFinish={faceFinish}
                      onFaceFinishChange={vm.setFaceFinish}
                      checkMarks={vm.checkMarks}
                      onCheckMarksChange={vm.setCheckMarks}
                      widescreenFilm={vm.widescreenFilm}
                      onWidescreenFilmChange={vm.setWidescreenFilm}
                      autoReviewStills={autoReviewStills}
                      onAutoReviewStillsChange={vm.setAutoReviewStills}
                      redoPoseMisses={vm.redoPoseMisses}
                      onRedoPoseMissesChange={vm.setRedoPoseMisses}
                      bestOfTwoHardPoses={vm.bestOfTwoHardPoses}
                      onBestOfTwoHardPosesChange={vm.setBestOfTwoHardPoses}
                      twoTakesIntimate={vm.twoTakesIntimate}
                      onTwoTakesIntimateChange={vm.setTwoTakesIntimate}
                      bestEnginePerPose={vm.bestEnginePerPose}
                      onBestEnginePerPoseChange={vm.setBestEnginePerPose}
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
                  {/* The clip engine is set once — with the other advanced settings (as on Day). */}
                  {advancedOpen && views.clipEngine ? (
                    <div className="mb-3">{views.clipEngine}</div>
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
                      poseMiss={vm.poseMissViews[slot.id]}
                      plateUrl={vm.platePreviewUrl || vm.plate?.imageUrl}
                      updateSlot={updateSlot}
                      clothingSummary={views.clothingView.slot.summary}
                      clothingThumbs={views.clothingView.slot.thumbs}
                      renderClothingPicker={views.renderClothingPicker}
                      clothingTitle={`Clothing · ${active.name}`}
                      onRedoSameSeed={() => void vm.redoSlotSameSeed(slot.id)}
                      onKeepOldTake={() => vm.keepPreviousTake(slot.id)}
                      onKeepNewTake={() => vm.dropPreviousTake(slot.id)}
                      onPickTwoTake={keep => vm.pickTwoTake(slot.id, keep)}
                      groupOptions={partnerOptions.filter(
                        option => option.id !== partnerCharacterId
                      )}
                      locations={locations}
                      storyState
                    />
                  </div>
                </ToolSection>
              </div>
              <div
                className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto"
                data-testid="scene-results"
              >
                <ToolSection
                  data-testid="scene-takes"
                  title="Takes"
                  description="Render it as many times as you like; keep the best (★). Cut uses the kept take."
                >
                  <DayStatusStrip
                    className="mb-2"
                    statusLine={`${active.name} · ${takeCount} take${takeCount === 1 ? '' : 's'}${kept ? ' · one kept' : ''}`}
                    queueBlockReason={character && hasPlate ? queueBlockReason : null}
                    poseGuideLine={vm.poseGuideLine}
                    dressPlateStatus={vm.dressPlateStatus}
                    dressPlatePreviewUrl={vm.dressPlatePreviewUrl}
                    onRedoDressPlate={vm.redoDressPlate}
                    keeperStandIn={vm.keeperStandIn}
                    onMakeStandingPicture={vm.makeStandingPicture}
                    onOpenDressPlate={url =>
                      views.setLightbox({ images: [url], index: 0, title: 'Dressed plate' })
                    }
                    poseGuidePreviews={vm.poseGuidePreviews}
                  />
                  {renderOffline ? (
                    <p className="type-caption mb-2 text-[var(--tint-warning-text,var(--accent-text))]">
                      ComfyUI is offline — Queue waits until it’s back.
                    </p>
                  ) : null}
                  {/* The take on the card: live render preview, checks and the ⋯ tools (Day's board). */}
                  <SceneTakeCard
                    vm={vm}
                    page={page}
                    views={views}
                    onEditShot={() =>
                      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  />
                  <SceneTakeList page={page} />
                </ToolSection>

                <ToolSection
                  data-testid="scene-move"
                  title="Make it move"
                  description="From the kept take: animate it, copy moves from a video, or direct the moves on the 3D body."
                >
                  {kept ? (
                    <div className="mb-3">
                      <SceneKeptPreview take={kept} views={views} />
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
                        views.openMove('animate');
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
                        views.openMove('moves');
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
                        views.openMove('director');
                      }}
                    >
                      Direct a move…
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!kept?.clipUrl || rendering || page.continuing}
                      loading={page.continuing}
                      loadingLabel="Reading its last frame"
                      data-testid="scene-continue"
                      title={
                        kept?.clipUrl
                          ? "A new scene that starts where this clip ends: its last frame becomes the new scene's kept take, with the same people, outfit and place — write what happens next and Animate it."
                          : 'Animate the kept take first — the new scene starts where its clip ends.'
                      }
                      onClick={() => {
                        void page.continueScene().then(error => {
                          if (error) page.setNote(error);
                        });
                      }}
                    >
                      Continue scene
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
                  {views.moveNote ? (
                    <p
                      className="type-caption mt-2 text-[var(--text-muted)]"
                      data-testid="scene-move-note"
                    >
                      {views.moveNote}
                    </p>
                  ) : null}
                </ToolSection>
              </div>
            </div>
            {/*
              One place for the next step (it was four: Another take over the takes, Redo · same
              seed under the form, Animate further down, Send to Day under the takes), kept in view.
            */}
            <div
              className="ui-sticky-surface sticky bottom-[calc(var(--bottom-dock-height,0px)+0.5rem)] z-20 mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-3 py-2 shadow-lg"
              data-sticky-bottom
              data-testid="scene-action-bar"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p
                  className="type-caption min-w-0 text-[var(--text-secondary)]"
                  data-testid="scene-action-status"
                >
                  {active.name} · {takeCount} take{takeCount === 1 ? '' : 's'}
                  {kept ? ' · one kept' : takeCount ? ' · none kept yet (K)' : ''}
                </p>
                <ToolActionRow className="w-full sm:w-auto sm:shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || queueBlocked || inFlight}
                    data-testid="scene-queue-take"
                    title="Render this shot (Day's still engine, its checks and finishes)"
                    onClick={() => void queueSlot(slot, { byPlayer: true })}
                  >
                    {rendering
                      ? 'Rendering…'
                      : inFlight
                        ? 'Checking…'
                        : takeCount > 0
                          ? 'Another take'
                          : 'Queue a take'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || queueBlocked || inFlight || takeCount === 0}
                    data-testid="scene-bar-redo"
                    title="The same seed again — after changing the beat or the outfit, only your change moves"
                    onClick={() => void vm.redoSlotSameSeed(slot.id)}
                  >
                    Redo · same seed
                  </Button>
                  <Button
                    size="sm"
                    variant={kept ? 'primary' : 'secondary'}
                    disabled={!kept || busy || renderOffline || mediaBusy}
                    data-testid="scene-bar-animate"
                    title={kept ? 'Animate the kept take' : 'Keep a take first (K)'}
                    onClick={() => views.openMove('animate')}
                  >
                    Animate
                  </Button>
                  <div className="flex flex-wrap items-center gap-2" data-testid="scene-send-day">
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
                          {entry.sceneHints?.trim()
                            ? ` — ${entry.sceneHints.trim().slice(0, 40)}`
                            : ''}
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
                  <ButtonLink
                    href="/cut?from=scenes"
                    size="sm"
                    variant="ghost"
                    data-testid="scene-bar-cut"
                  >
                    Cut →
                  </ButtonLink>
                </ToolActionRow>
              </div>
            </div>
          </>
        ) : null}
        {/* Set up once, not every shot: under More (open with a script, a place or a run). */}
        <SceneMore
          // Open with a prepared or running run too: its controls hid under a folded More.
          open={Boolean(
            page.run ||
            locations.length ||
            ((toolSettings as { scripts?: unknown[] }).scripts?.length ?? 0) > 0 ||
            page.scenes.some(entry => entry.fromScript)
          )}
        >
          <SceneScriptAndRun vm={vm} page={page} runner={runner} />
        </SceneMore>
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
      {views.sheets}
    </>
  );
}

/** Script and Locations, folded under one "More" (opens itself when there is something in it). */
function SceneMore({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const [seen, setSeen] = useState(open);
  // Something arrived (a script imported, a place added elsewhere): open, once.
  if (open && !seen) {
    setSeen(true);
    setShown(true);
  }
  return (
    <details
      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3"
      open={shown}
      data-testid="scene-more"
      onToggle={event => setShown((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none" data-testid="scene-more-toggle">
        <span className="type-heading">More</span>
        <span className="type-caption ml-2 text-[var(--text-muted)]">Script, Locations</span>
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}
