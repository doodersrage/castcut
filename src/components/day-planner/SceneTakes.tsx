'use client';

import { useState } from 'react';
import DaySlotBoard from '@/components/day-planner/DaySlotBoard';
import type { SceneToolViews } from '@/components/day-planner/useSceneToolViews';
import { TrashRecentlyDeleted, useTrash } from '@/components/trash/TrashRecentlyDeleted';
import { Button } from '@/components/ui/Button';
import type { useScenePage } from '@/hooks/day-planner/useScenePage';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { clipUrlIsVideo } from '@/lib/clip/media-kind';
import type { SceneTake } from '@/lib/day/scenes';
import { trashedTakesOf } from '@/lib/gallery/trash';
import {
  SceneTakeCompareDialog,
  SceneTakeProvenanceDialog,
} from '@/components/day-planner/SceneTakeProvenance';

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
        restyle: slotMedia.restyleSlotClip,
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
 * from it), i says how it was made, × drops it from the scene (it stays in the Gallery, and Recently
 * deleted puts it back for 14 days). Good and Reject are your verdict, without rendering again
 * (M7 T3): rejected takes are hidden until shown, and restorable; Compare puts two side by side. `strip`: one swipeable row with 44 px
 * buttons (the phone); else a wrapping grid.
 */
export function SceneTakeList({ page, strip = false }: { page: Page; strip?: boolean }) {
  const { active, still, showTake, keepTake, reviewTake, noteTake, removeTake, restoreTake } = page;
  const [madeIndex, setMadeIndex] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [comparing, setComparing] = useState(false);
  const trash = useTrash();
  if (!active) return null;
  // Takes removed from this scene (M10 T2): Restore puts one back where it stood. Keyed, so it
  // stays open as the first take comes back.
  const removed = (
    <TrashRecentlyDeleted
      key="trash"
      items={trashedTakesOf(trash, active.id)}
      what="takes"
      onRestore={item => restoreTake(item.id)}
      testId="scene-takes-trash"
    />
  );
  if (active.takes.length === 0) return <>{removed}</>;
  const madeTake = madeIndex === null ? null : (active.takes[madeIndex] ?? null);
  const rejected = active.takes.filter(take => take.review === 'rejected').length;
  const linkButton = strip
    ? 'ui-text-link type-caption flex min-h-11 flex-1 items-center justify-center no-underline'
    : 'ui-text-link type-caption whitespace-nowrap rounded px-1 py-0.5 hover:bg-[var(--bg-hover)]';
  return (
    <>
      <ol
        className={
          strip
            ? '-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]'
            : 'mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4'
        }
        data-testid="scene-take-list"
        aria-label="Takes"
      >
        {active.takes.map((take, index) => {
          const isKept = take.id === active.keptTakeId;
          const onCard = Boolean(still?.promptId && still.promptId === take.promptId);
          const isRejected = take.review === 'rejected';
          // A rejected take is hidden — but not while it's on the card.
          if (isRejected && !showRejected && !onCard) return null;
          return (
            <li
              key={take.id}
              className={`group/take relative shrink-0 snap-start overflow-hidden rounded-[var(--radius-md)] border-2 ${
                strip ? 'w-28' : 'w-full'
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
              data-review={take.review ?? 'candidate'}
            >
              {/* The picture and what sits over it (badges, hover actions); the notes go under it. */}
              <div className="relative">
                <button
                  type="button"
                  className="ui-btn-ghost relative block w-full !p-0"
                  title={onCard ? 'On the card' : 'Show this take on the card'}
                  aria-label={`Take ${index + 1}${onCard ? ' (on the card)' : ''}${
                    isRejected ? ', rejected' : take.review === 'approved' ? ', good' : ''
                  }`}
                  aria-pressed={onCard}
                  data-testid={`scene-take-show-${index}`}
                  onClick={() => showTake(take)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI view URL */}
                  <img
                    src={take.imageUrl}
                    alt=""
                    className={`aspect-[3/4] w-full object-cover ${isRejected ? 'opacity-40' : ''}`}
                    loading="lazy"
                  />
                  {isRejected || take.review === 'approved' ? (
                    <span
                      className={`type-caption pointer-events-none absolute bottom-1 left-1 rounded bg-[var(--bg-base)]/85 px-1 ${
                        isRejected ? 'text-[var(--text-muted)]' : 'text-[var(--tint-success-text)]'
                      }`}
                    >
                      {isRejected ? 'Rejected' : '✓ Good'}
                    </span>
                  ) : null}
                </button>
                {onCard ? (
                  <span className="type-caption pointer-events-none absolute left-1 top-1 rounded bg-[var(--bg-base)]/85 px-1 text-[var(--accent-text)]">
                    On card
                  </span>
                ) : null}
                {isKept ? (
                  <span
                    className="type-caption pointer-events-none absolute right-1 top-1 rounded bg-[var(--accent)] px-1.5 font-medium text-[var(--on-accent)]"
                    data-testid={`scene-take-kept-badge-${index}`}
                  >
                    ★ Kept
                  </span>
                ) : null}
                {/* Quick actions on hover (or keyboard focus): keep it or reject it from the picture. */}
                {!strip && !isRejected ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 top-[calc(100%-5.5rem)] z-10 flex justify-center gap-1 opacity-0 transition-opacity group-hover/take:pointer-events-auto group-hover/take:opacity-100 group-focus-within/take:pointer-events-auto group-focus-within/take:opacity-100"
                    data-testid={`scene-take-quick-${index}`}
                  >
                    {!isKept ? (
                      <Button
                        size="sm"
                        variant="overlay"
                        title="Keep this take (K)"
                        data-testid={`scene-take-quick-keep-${index}`}
                        onClick={() => keepTake(take.id)}
                      >
                        ★ Keep
                      </Button>
                    ) : null}
                    {!isKept ? (
                      <Button
                        size="sm"
                        variant="overlay"
                        title="Reject — hide it from the takes (X)"
                        data-testid={`scene-take-quick-reject-${index}`}
                        onClick={() => reviewTake(take.id, 'rejected')}
                      >
                        Reject
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <div
                  className={`flex items-center justify-between ${strip ? '' : 'gap-1 px-1 py-0.5'}`}
                >
                  <button
                    type="button"
                    className={
                      strip
                        ? 'ui-text-link type-caption flex min-h-11 flex-1 items-center justify-center font-medium no-underline'
                        : 'ui-text-link type-caption rounded px-1 py-0.5 hover:bg-[var(--bg-hover)]'
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
                    onClick={() => void removeTake(take.id)}
                  >
                    ×
                  </button>
                </div>
                <div
                  className={`flex items-center justify-between ${strip ? '' : 'gap-1 px-1 pb-0.5'}`}
                >
                  {isRejected ? (
                    <button
                      type="button"
                      className={linkButton}
                      data-testid={`scene-take-restore-${index}`}
                      title="Put it back with the other takes"
                      onClick={() => reviewTake(take.id, null)}
                    >
                      Restore
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={linkButton}
                        aria-pressed={take.review === 'approved'}
                        aria-label={`Take ${index + 1} is good`}
                        data-testid={`scene-take-approve-${index}`}
                        title={
                          take.review === 'approved'
                            ? 'Marked good — tap to make it a candidate again'
                            : 'Good — a take you could use'
                        }
                        onClick={() =>
                          reviewTake(take.id, take.review === 'approved' ? null : 'approved')
                        }
                      >
                        Good
                      </button>
                      <button
                        type="button"
                        className={`${linkButton} disabled:cursor-not-allowed disabled:opacity-40`}
                        aria-label={`Reject take ${index + 1}`}
                        data-testid={`scene-take-reject-${index}`}
                        disabled={isKept}
                        title={
                          isKept
                            ? 'Keep another take first — Cut uses this one'
                            : 'Reject — hide it from the takes (it stays in the Gallery)'
                        }
                        onClick={() => reviewTake(take.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
              {!strip ? (
                <SceneTakeNotes
                  index={index}
                  stars={take.stars}
                  note={take.note}
                  onChange={patch => noteTake(take.id, patch)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {rejected > 0 || active.takes.length - rejected >= 2 ? (
        <div className="mt-1 flex flex-wrap gap-3">
          {active.takes.length - rejected >= 2 ? (
            <Button
              size="sm"
              variant="secondary"
              data-testid="scene-takes-compare"
              title="Two takes side by side, to pick the better"
              onClick={() => setComparing(true)}
            >
              Compare takes
            </Button>
          ) : null}
          {rejected > 0 ? (
            <button
              type="button"
              className="ui-text-link type-caption"
              aria-pressed={showRejected}
              data-testid="scene-takes-show-rejected"
              onClick={() => setShowRejected(value => !value)}
            >
              {showRejected ? 'Hide rejected' : `Show ${rejected} rejected`}
            </button>
          ) : null}
        </div>
      ) : null}
      {comparing ? (
        <SceneTakeCompareDialog
          open
          takes={active.takes}
          keptTakeId={active.keptTakeId}
          castId={active.castId}
          onKeep={keepTake}
          onReview={reviewTake}
          onClose={() => setComparing(false)}
        />
      ) : null}
      <SceneTakeProvenanceDialog
        take={madeTake}
        index={madeIndex ?? 0}
        castId={active.castId}
        onClose={() => setMadeIndex(null)}
      />
      {removed}
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

/** A take's stars (1–5; the same star again clears) and a short note, under its picture. */
function SceneTakeNotes({
  index,
  stars,
  note,
  onChange,
}: {
  index: number;
  stars?: number;
  note?: string;
  onChange: (patch: { stars?: number | null; note?: string }) => void;
}) {
  return (
    <div className="space-y-1 px-1 pb-1 pt-0.5">
      <div
        className="flex items-center gap-0.5"
        role="radiogroup"
        aria-label={`Rating for take ${index + 1}`}
        data-testid={`scene-take-stars-${index}`}
      >
        {[1, 2, 3, 4, 5].map(value => (
          <Button
            key={value}
            variant="quiet"
            role="radio"
            aria-checked={stars === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            title={stars === value ? 'Clear the rating' : `${value} of 5`}
            className={`!min-h-0 !p-0 text-sm leading-none ${
              (stars ?? 0) >= value ? 'text-[var(--tint-warning-text)]' : 'text-[var(--text-muted)]'
            } hover:text-[var(--tint-warning-text)]`}
            data-testid={`scene-take-star-${index}-${value}`}
            onClick={() => onChange({ stars: stars === value ? null : value })}
          >
            {(stars ?? 0) >= value ? '★' : '☆'}
          </Button>
        ))}
      </div>
      <input
        type="text"
        maxLength={200}
        defaultValue={note ?? ''}
        key={note ?? ''}
        placeholder="A note — hands wrong, best face…"
        aria-label={`Note for take ${index + 1}`}
        className="ui-input h-6 w-full min-w-0 px-1.5 text-xs"
        data-testid={`scene-take-note-${index}`}
        onBlur={event => {
          if (event.target.value.trim() !== (note ?? '')) onChange({ note: event.target.value });
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}
