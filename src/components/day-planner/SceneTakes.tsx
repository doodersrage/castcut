'use client';

import { useState } from 'react';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import type { SceneToolViews } from '@/components/day-planner/useSceneToolViews';
import { Button } from '@/components/ui/Button';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { clipUrlIsVideo } from '@/lib/clip/media-kind';
import type { SceneTake } from '@/lib/day/scenes';
import { SceneTakeProvenanceDialog } from '@/components/day-planner/SceneTakeProvenance';

type Vm = ReturnType<typeof useDayPlannerToolOrchestration>;
type Page = ReturnType<typeof useScenePage>;

/**
 * The take on the card — Day's board on the scene's one slot: the live render preview, the pose
 * and face checks, and the ⋯ tools (redo, touch up, make it move).
 */
export function SceneTakeCard({
  vm,
  page,
  views,
  compact = false,
  onEditShot,
}: {
  vm: Vm;
  page: Page;
  views: SceneToolViews;
  compact?: boolean;
  onEditShot: () => void;
}) {
  const { character, slots, stills, busy, slotMedia, queueSlot } = vm;
  const { slot } = page;
  return (
    <DaySlotBoard
      castName={character?.name}
      castId={character?.id}
      leadNoun={vm.leadNoun}
      slots={slots}
      stills={stills}
      activeSlotId={slot.id}
      busy={busy}
      queueBlocked={views.queueBlocked}
      compact={compact}
      clipJobFeature="scene"
      onSelectSlot={() => undefined}
      onEditSlot={onEditShot}
      // Its clip when one finished (as Day), else the still.
      onOpenStill={views.openCard}
      onRetrySlot={entry => void queueSlot(entry, { byPlayer: true })}
      onAnimateSlot={() => views.setAnimateOpen(true)}
      onAddVoice={vm.addVoiceToSlot}
      voicingSlotId={vm.voicingSlotId}
      onExtendClip={vm.extendSlotClip}
      extendRequestFor={vm.extendRequestFor}
      extending={vm.extending}
      extendResult={vm.extendResult}
      onQueueSlot={entry => void queueSlot(entry, { byPlayer: true })}
      onRerollSlot={entry => vm.rerollActiveSlotScene({ slotId: entry.id })}
      qualityLedger={vm.qualityLedger}
      poseRedoMarks={vm.poseRedoMarks}
      clipChecks={vm.clipChecks}
      onPickTwoTake={vm.pickTwoTake}
      onLooksWrong={entry => void vm.looksWrongSlot(entry.id)}
      onFixArea={entry => views.setFixAreaTarget(vm.fixAreaTargetForSlot(entry.id))}
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
  );
}

/**
 * The scene's takes: tap one to put it on the card, ★ keeps it (Cut uses it, Make it move starts
 * from it), i says how it was made, × drops it from the scene (it stays in the Gallery). `strip`:
 * one swipeable row with 44 px buttons (the phone); else a wrapping grid.
 */
export function SceneTakeList({ page, strip = false }: { page: Page; strip?: boolean }) {
  const { active, still, showTake, keepTake, removeTake } = page;
  const [madeIndex, setMadeIndex] = useState<number | null>(null);
  if (!active || active.takes.length === 0) return null;
  const madeTake = madeIndex === null ? null : (active.takes[madeIndex] ?? null);
  return (
    <>
      <ol
        className={
          strip
            ? '-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]'
            : 'mt-3 flex flex-wrap gap-2'
        }
        data-testid="scene-take-list"
        aria-label="Takes"
      >
        {active.takes.map((take, index) => {
          const isKept = take.id === active.keptTakeId;
          const onCard = Boolean(still?.promptId && still.promptId === take.promptId);
          return (
            <li
              key={take.id}
              className={`relative shrink-0 snap-start overflow-hidden rounded-[var(--radius-md)] border-2 ${
                strip ? 'w-28' : 'w-24'
              } ${
                onCard
                  ? 'border-[var(--accent-border)]'
                  : isKept
                    ? 'border-[var(--accent-muted)]'
                    : 'border-[var(--border-subtle)]'
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
                aria-label={`Take ${index + 1}${onCard ? ' (on the card)' : ''}`}
                aria-pressed={onCard}
                data-testid={`scene-take-show-${index}`}
                onClick={() => showTake(take)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URL */}
                <img
                  src={take.imageUrl}
                  alt=""
                  className="aspect-[3/4] w-full object-cover"
                  loading="lazy"
                />
              </button>
              {onCard ? (
                <span className="type-caption pointer-events-none absolute left-1 top-1 rounded bg-[var(--bg-base)]/85 px-1 text-[var(--accent-text)]">
                  On card
                </span>
              ) : null}
              <div
                className={`flex items-center justify-between ${strip ? '' : 'gap-1 px-1 py-0.5'}`}
              >
                <button
                  type="button"
                  className={
                    strip
                      ? 'ui-text-link type-caption flex min-h-11 flex-1 items-center justify-center font-medium no-underline'
                      : 'ui-text-link type-caption'
                  }
                  aria-pressed={isKept}
                  data-testid={`scene-take-keep-${index}`}
                  title={isKept ? 'Kept — tap to let it go' : 'Keep this take'}
                  onClick={() => keepTake(take.id)}
                >
                  {isKept ? '★ Kept' : '☆ Keep'}
                </button>
                <button
                  type="button"
                  className={
                    strip
                      ? 'ui-text-link type-caption flex min-h-11 min-w-11 items-center justify-center no-underline'
                      : 'ui-text-link type-caption'
                  }
                  aria-label={`How take ${index + 1} was made`}
                  title="How this take was made"
                  data-testid={`scene-take-made-${index}`}
                  onClick={() => setMadeIndex(index)}
                >
                  i
                </button>
                <button
                  type="button"
                  className={
                    strip
                      ? 'ui-text-link type-caption flex min-h-11 min-w-11 items-center justify-center no-underline'
                      : 'ui-text-link type-caption'
                  }
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
      <SceneTakeProvenanceDialog
        take={madeTake}
        index={madeIndex ?? 0}
        castId={active.castId}
        onClose={() => setMadeIndex(null)}
      />
    </>
  );
}

/**
 * The kept take in Make it move: its picture and its clip. Tapping either opens the clip in the
 * lightbox when there is one (a still-only take opens the still); an mp4 clip also plays inline.
 */
export function SceneKeptPreview({
  take,
  views,
  phone = false,
}: {
  take: SceneTake;
  views: SceneToolViews;
  phone?: boolean;
}) {
  const clip = take.clipUrl?.trim() || '';
  const box = phone ? 'h-28' : 'h-32';
  const open = () => views.openTake(take);
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid="scene-kept">
      <Button
        variant="ghost"
        className={`!min-h-0 shrink-0 overflow-hidden !p-0 ${box} ${phone ? 'w-20' : 'w-24'}`}
        aria-label={clip ? 'Play the kept take’s clip' : 'Open the kept take'}
        data-testid="scene-kept-open"
        onClick={open}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URL */}
        <img src={take.imageUrl} alt="Kept take" className="h-full w-full object-cover" />
      </Button>
      {clip ? (
        clipUrlIsVideo(clip, { promptId: take.clipPromptId }) ? (
          <video
            src={clip}
            controls
            loop
            playsInline
            className={`${box} min-w-0 rounded-[var(--radius-md)]`}
            data-testid="scene-kept-clip"
          />
        ) : (
          <Button
            variant="ghost"
            className={`!min-h-0 min-w-0 overflow-hidden !p-0 ${box}`}
            aria-label="Play the kept take’s clip"
            data-testid="scene-kept-clip-open"
            onClick={open}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- animated clip */}
            <img
              src={clip}
              alt="Kept take's clip"
              className="h-full w-auto"
              data-testid="scene-kept-clip"
            />
          </Button>
        )
      ) : null}
    </div>
  );
}
