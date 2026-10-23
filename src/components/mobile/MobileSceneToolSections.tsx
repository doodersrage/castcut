'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
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
import { useSceneToolViews } from '@/components/day-planner/useSceneToolViews';
import PlayGetStartedCard from '@/components/play/PlayGetStartedCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError, TextInput } from '@/components/ui/Field';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import SideSheet from '@/components/ui/SideSheet';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import { DAY_PARTS, dayPartOf } from '@/lib/day/parts';
import {
  DAY_MOOD_OPTIONS,
  dayPickerMood,
  isDayAdultMood,
  normalizeDayMood,
  type DaySlotId,
} from '@/lib/day/planner';
import { dayQualityPresetLabel } from '@/lib/day/quality-preset';
import { sceneSummary } from '@/lib/day/scenes';
import { DAY_THEME_OPTIONS, dayThemeOf } from '@/lib/day/themes';

const PART_LABELS: Record<(typeof DAY_PARTS)[number], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

type Sheet = 'shot' | 'mood' | 'engine' | 'send' | null;

type Props = {
  vm: ReturnType<typeof useDayPlannerToolOrchestration>;
  page: ReturnType<typeof useScenePage>;
};

/**
 * The sticky action bar's height as `--page-action-bar-height` on <html>: the floating jobs tray
 * (SystemTray) sits above it, not over Queue a take.
 */
function useActionBarHeightRef() {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((element: HTMLDivElement | null) => {
    const root = document.documentElement;
    observer.current?.disconnect();
    observer.current = null;
    if (!element) {
      root.style.removeProperty('--page-action-bar-height');
      return;
    }
    const publish = () =>
      root.style.setProperty(
        '--page-action-bar-height',
        `${Math.round(element.getBoundingClientRect().height)}px`
      );
    publish();
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(publish);
      observer.current.observe(element);
    }
  }, []);
}

/** One row of the shot's summary: what is set, and a tap opens its sheet. */
function SummaryRow({
  label,
  value,
  testId,
  onOpen,
  disabled,
}: {
  label: string;
  value: ReactNode;
  testId: string;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      className="flex !min-h-12 w-full items-center justify-start gap-3 !rounded-none border-t border-[var(--border-subtle)] px-3 py-2 text-left font-normal first:border-t-0"
      data-testid={testId}
      disabled={disabled}
      onClick={onOpen}
    >
      <span className="type-caption w-16 shrink-0 text-left text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-left text-sm text-[var(--text-primary)]">
        {value}
      </span>
      <span aria-hidden className="shrink-0 text-[var(--text-muted)]">
        ›
      </span>
    </Button>
  );
}

/**
 * Phone Scene (/m/scene): the take on top, the takes as a swipeable strip, the shot as a short
 * summary whose rows open bottom sheets (the shot's editor, mood & people, the engine), Make it
 * move, Send to Day — and Queue a take always in reach in a bar above the dock. The same state
 * and sheets as the desk page (useSceneToolViews), laid out for one thumb.
 */
export default function MobileSceneToolSections({ vm, page }: Props) {
  const views = useSceneToolViews(vm, page);
  const actionBarRef = useActionBarHeightRef();
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
    queueSlot,
    updateSlot,
  } = vm;
  const {
    castScenes,
    active,
    slot,
    inFlight,
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
  const { queueBlocked, renderOffline, quality, mediaBusy } = views;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const advancedId = useId();
  const takeCount = active?.takes.length ?? 0;
  const timeOfDay = dayPartOf(slot.id);
  const scenesInOrder = [...castScenes].sort((a, b) => a.createdAt - b.createdAt);
  const picked = dayPickerMood(normalizeDayMood(dayMood));
  const moodLabel =
    dayThemeOf(dayMood)?.label ??
    [...DAY_MOOD_OPTIONS, ...DAY_THEME_OPTIONS].find(option => option.id === picked.mood)?.label ??
    'Everyday';
  const partnerName = partnerOptions.find(option => option.id === partnerCharacterId)?.name;
  const moodValue = [
    picked.playful ? `${moodLabel} · Playful` : moodLabel,
    people === 'solo' ? 'Solo' : people === 'duo' ? 'Duo' : 'Mixed',
    people !== 'solo' && partnerName ? `with ${partnerName}` : null,
    `${dayQualityPresetLabel(quality.preset)} quality`,
  ]
    .filter(Boolean)
    .join(' · ');
  const modelLabel =
    COMFY_IMAGE_MODELS.find(model => model.id === shared.model)?.label ?? shared.model ?? '—';
  const shotValue =
    [slot.location?.trim(), slot.sceneHints?.trim()].filter(Boolean).join(' · ') ||
    'Set the place and what happens';
  const queueLabel = inFlight ? 'Rendering…' : takeCount > 0 ? 'Another take' : 'Queue a take';
  const openShot = () => setSheet('shot');

  return (
    <div className="space-y-4" data-testid="scene-phone">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-heading truncate">Scene</h1>
          <p className="type-caption truncate text-[var(--text-muted)]">
            One shot, exactly as you want it
          </p>
        </div>
        <DaySetupChip
          character={character}
          hasPlate={hasPlate}
          className="!min-h-11 shrink-0"
          onClick={() => views.setSetupOpen(true)}
        />
      </div>
      <PlayGetStartedCard
        hasCharacter={Boolean(character)}
        hasPlate={hasPlate}
        characterId={character?.id}
        onOpenSetup={() => views.setSetupOpen(true)}
      />

      <section className="space-y-2" data-testid="scene-list">
        <div className="flex items-center gap-2">
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
          ) : (
            <div className="flex-1" />
          )}
          <Button
            variant={castScenes.length ? 'secondary' : 'primary'}
            className="!min-h-11 shrink-0"
            disabled={!character || inFlight}
            data-testid="scene-new"
            onClick={newScene}
          >
            New
          </Button>
        </div>
        {!active ? (
          <p className="type-caption text-[var(--text-muted)]" data-testid="scene-empty">
            {character
              ? `No scene open for ${character.name}. New starts one — or open a Day slot as a scene (its sheet → Open as Scene).`
              : 'Pick a Cast lead (Setup) — scenes are kept per Cast.'}
          </p>
        ) : null}
      </section>

      {active ? (
        <>
          <section className="space-y-3" data-testid="scene-shot">
            <div className="flex items-center gap-2">
              <TextInput
                key={active.id}
                defaultValue={active.name}
                maxLength={60}
                aria-label="Scene name"
                data-testid="scene-name"
                className="!min-h-11 min-w-0 flex-1"
                onBlur={event => renameScene(active.id, event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              {confirmDelete ? null : (
                <Button
                  variant="ghost"
                  className="!min-h-11 shrink-0"
                  disabled={inFlight}
                  data-testid="scene-delete"
                  title="Delete this scene (its takes stay in the Gallery)"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
            </div>
            {confirmDelete ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                data-testid="scene-delete-confirm"
              >
                <span className="type-caption min-w-0 flex-1">
                  Delete {active.name}? Its takes stay in the Gallery.
                </span>
                <Button
                  variant="secondary"
                  className="!min-h-11"
                  data-testid="scene-delete-yes"
                  onClick={() => {
                    setConfirmDelete(false);
                    deleteScene(active.id);
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  className="!min-h-11"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </Button>
              </div>
            ) : null}
            <div
              className="ui-segmented grid w-full grid-cols-4"
              role="radiogroup"
              aria-label="Time of day"
              data-testid="scene-time"
            >
              {DAY_PARTS.map(part => (
                <button
                  key={part}
                  type="button"
                  role="radio"
                  className="ui-segmented-item !min-h-11 justify-center px-1 text-sm"
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
          </section>

          <section className="space-y-2" data-testid="scene-takes">
            <DayStatusStrip
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
            <SceneTakeCard vm={vm} page={page} views={views} compact onEditShot={openShot} />
            <SceneTakeList page={page} strip />
            {renderOffline ? (
              <p className="type-caption text-[var(--tint-warning-text,var(--accent-text))]">
                ComfyUI is offline — Queue waits until it’s back.
              </p>
            ) : null}
          </section>

          <section
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated,var(--bg-muted))]"
            aria-label="The shot"
            data-testid="scene-shot-summary"
          >
            <SummaryRow label="Shot" value={shotValue} testId="scene-edit-shot" onOpen={openShot} />
            <SummaryRow
              label="Mood"
              value={moodValue}
              testId="scene-edit-mood"
              onOpen={() => setSheet('mood')}
            />
            <SummaryRow
              label="Engine"
              value={modelLabel}
              testId="scene-edit-engine"
              onOpen={() => setSheet('engine')}
            />
          </section>
          <TaskRequirementsCard
            task="This scene"
            testId="scene-task-requirements"
            input={{
              model: shared.model,
              adult: isDayAdultMood(dayMood) && intimateEnabled,
              faceFinish: vm.faceFinish,
              autoReview: vm.autoReviewStills,
            }}
          />

          <section className="space-y-3" data-testid="scene-move">
            <div>
              <h2 className="type-subheading">Make it move</h2>
              <p className="type-caption text-[var(--text-muted)]">
                From the kept take: animate it, copy moves from a video, or direct the moves.
              </p>
            </div>
            {kept ? (
              <SceneKeptPreview take={kept} views={views} phone />
            ) : (
              <p
                className="type-caption text-[var(--text-muted)]"
                data-testid="scene-move-needs-keep"
              >
                Keep a take (★ under the card) — Make it move starts from it.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                className="!min-h-11 justify-center px-1"
                disabled={!kept || busy || renderOffline || mediaBusy}
                data-testid="scene-animate"
                onClick={() => views.openMove('animate')}
              >
                Animate
              </Button>
              <Button
                variant="secondary"
                className="!min-h-11 justify-center px-1"
                disabled={!kept || renderOffline || mediaBusy}
                data-testid="scene-copy-moves"
                onClick={() => views.openMove('moves')}
              >
                Copy moves
              </Button>
              <Button
                variant="secondary"
                className="!min-h-11 justify-center px-1"
                disabled={!kept || renderOffline || mediaBusy}
                data-testid="scene-director"
                onClick={() => views.openMove('director')}
              >
                Direct
              </Button>
            </div>
            {/* Phone-sized: the select and the switches are 44 px tap targets. */}
            {views.clipEngine ? (
              <div className="[&_label]:!min-h-11 [&_select]:!min-h-11">{views.clipEngine}</div>
            ) : null}
            {views.moveNote ? (
              <p className="type-caption text-[var(--text-muted)]" data-testid="scene-move-note">
                {views.moveNote}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                className="!min-h-11 justify-center"
                data-testid="scene-send-day"
                onClick={() => {
                  refreshDaySlots();
                  setSheet('send');
                }}
              >
                Send to Day…
              </Button>
              <ButtonLink
                href="/m/cut?from=scenes"
                variant="ghost"
                className="!min-h-11 justify-center"
                data-testid="scene-open-cut"
              >
                Cut →
              </ButtonLink>
            </div>
          </section>
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

      {active ? (
        // In reach while the page scrolls: above the Film dock (its height is published).
        <div
          ref={actionBarRef}
          className="sticky z-20 -mx-4 flex gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 px-4 py-2 backdrop-blur"
          style={{ bottom: 'calc(var(--bottom-dock-height, 0px) + 0px)' }}
          data-testid="scene-action-bar"
        >
          <Button
            variant="secondary"
            className="!min-h-11 shrink-0"
            data-testid="scene-action-edit"
            onClick={openShot}
          >
            Edit shot
          </Button>
          <Button
            variant="primary"
            className="!min-h-11 flex-1 justify-center"
            disabled={busy || queueBlocked || inFlight}
            data-testid="scene-queue-take"
            title="Render this shot (Day's still engine, its checks and finishes)"
            onClick={() => void queueSlot(slot, { byPlayer: true })}
          >
            {queueLabel}
          </Button>
        </div>
      ) : null}

      <SideSheet
        open={sheet === 'shot' && Boolean(active)}
        onClose={() => setSheet(null)}
        title={active ? `The shot · ${active.name}` : 'The shot'}
        description="Setting, beat, pose and camera, look, engine, clothing."
        testId="scene-shot-sheet"
        size="lg"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" className="!min-h-11" onClick={() => setSheet(null)}>
              Done
            </Button>
            <Button
              variant="primary"
              className="!min-h-11 flex-1 justify-center"
              disabled={busy || queueBlocked || inFlight}
              data-testid="scene-shot-sheet-queue"
              onClick={() => {
                setSheet(null);
                void queueSlot(slot, { byPlayer: true });
              }}
            >
              {queueLabel}
            </Button>
          </div>
        }
      >
        {active ? (
          <div data-testid="scene-editor">
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
              compact
              groupOptions={partnerOptions.filter(option => option.id !== partnerCharacterId)}
            />
          </div>
        ) : null}
      </SideSheet>

      <SideSheet
        open={sheet === 'mood'}
        onClose={() => setSheet(null)}
        title="Mood & people"
        description="The kind of shot, who is in it, the weather and the render quality."
        testId="scene-mood-sheet"
      >
        <div className="space-y-3">
          <DayPlanBar
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
            faceFinish={vm.faceFinish}
            autoReviewStills={vm.autoReviewStills}
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
          {advancedOpen ? (
            <DayAdvancedDrawer
              id={advancedId}
              busy={busy}
              renderQuality={quality.renderQuality}
              onRenderQualityChange={quality.setRenderQuality}
              posePriority={vm.posePriority}
              onPosePriorityChange={vm.setPosePriority}
              identityBoost={vm.identityBoost}
              onIdentityBoostChange={vm.setIdentityBoost}
              faceFinish={vm.faceFinish}
              onFaceFinishChange={vm.setFaceFinish}
              checkMarks={vm.checkMarks}
              onCheckMarksChange={vm.setCheckMarks}
              widescreenFilm={vm.widescreenFilm}
              onWidescreenFilmChange={vm.setWidescreenFilm}
              autoReviewStills={vm.autoReviewStills}
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
        </div>
      </SideSheet>

      <SideSheet
        open={sheet === 'engine'}
        onClose={() => setSheet(null)}
        title="Engine"
        description="Model, quality and LoRAs for this scene's takes."
        testId="scene-engine-sheet"
      >
        {views.engineControls}
      </SideSheet>

      <SideSheet
        open={sheet === 'send'}
        onClose={() => setSheet(null)}
        title="Send to Day"
        description="The shot goes on that Day slot; its kept take becomes the slot's still (the old one stays as the previous take)."
        testId="scene-send-day-sheet"
      >
        {daySlots.length ? (
          <div className="grid gap-2">
            {daySlots.map(entry => (
              <Button
                key={entry.id}
                variant="secondary"
                className="!min-h-12 w-full justify-start text-left"
                data-testid={`scene-send-day-${entry.id}`}
                onClick={() => {
                  setSheet(null);
                  sendToDay(entry.id as DaySlotId);
                }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{entry.label}</span>
                  {entry.sceneHints?.trim() ? (
                    <span className="text-[var(--text-muted)]">
                      {' '}
                      — {entry.sceneHints.trim().slice(0, 48)}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="type-caption text-[var(--text-muted)]" data-testid="scene-send-day-none">
            {character?.name ?? 'This Cast'} has no Day yet — open Day with them first.
          </p>
        )}
      </SideSheet>

      {views.sheets}
    </div>
  );
}
