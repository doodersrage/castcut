'use client';

import ClipExtendSheet, { type ClipExtendChoice } from '@/components/ClipExtendSheet';
import type { ClipExtendRequest } from '@/lib/clip-extend';
import { clipUrlIsVideo } from '@/lib/clip-media-kind';
import { useTakeCastVoice } from '@/hooks/useTakeCastVoice';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import MotionMedia from '@/components/ui/MotionMedia';
import ShotCardMenu, { SHOT_CARD_MENU_ITEM_CLASS } from '@/components/ui/ShotCardMenu';
import StillPromptCheckNote from '@/components/StillPromptCheckNote';
import {
  ADULT_GATE_WITHHELD_MESSAGE,
  CLOTHED_GATE_WITHHELD_MESSAGE,
} from '@/lib/adult-appearance-gate';
import OpenInComfyButton from '@/components/OpenInComfyButton';
import {
  daySlotBoardCaption,
  daySlotClipProgressState,
  daySlotPlanLabel,
  daySlotProgressState,
  dayStillShownImage,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { slotQualityBadge, type SlotQualityLedger } from '@/lib/play-slot-quality';
import { clipCheckLabel, type ClipCheck } from '@/lib/clip-quality';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import { daySlotJobProgress, type DaySlotJobEntry } from '@/lib/day-slot-progress';
import { getGalleryCache } from '@/lib/gallery-db-store';
import { dayTwoTakesPending, dayTwoTakesReady } from '@/lib/day-two-takes';
import { dayLooksWrongMark } from '@/lib/day-looks-wrong';
import { DayTwoTakesPick } from '@/components/day-planner/DaySameSeedRedo';
import FixAreaSessionChip from '@/components/fix-area/FixAreaSessionChip';

export type DaySlotBoardProps = {
  slots: DaySlot[];
  stills: DaySlotStill[];
  activeSlotId: DaySlotId;
  busy?: boolean;
  queueBlocked?: boolean;
  compact?: boolean;
  onSelectSlot: (slotId: DaySlotId) => void;
  /** Open the slot's sheet (Edit on the card, ⋯ → Edit slot, a tap on an unrendered slot). */
  onEditSlot: (slotId: DaySlotId) => void;
  /** A finished still opens full size (the lightbox) on tap. */
  onOpenStill?: (slotId: DaySlotId) => void;
  onRetrySlot?: (slot: DaySlot) => void;
  /**
   * Add voice to a finished silent clip (two-person adult clips render on WAN, without sound).
   * Resolves to an error message, or null when the slot now has the voiced clip.
   */
  onAddVoice?: (slot: DaySlot) => Promise<string | null>;
  /** The slot Day is adding a voice to right now (a tap or the automatic pass). */
  voicingSlotId?: string | null;
  /** "Make it 30 s": the clip grows in chained segments. Resolves to an error, or null. */
  onExtendClip?: (slot: DaySlot, choice?: ClipExtendChoice) => Promise<string | null>;
  /** The slot's clip and scene for the Make it 30 s sheet. */
  extendRequestFor?: (slot: DaySlot) => Omit<ClipExtendRequest, 'direction' | 'beats'> | null;
  /** The slot being made longer, and how far it is. */
  extending?: { slotId: string; note: string } | null;
  onAnimateSlot?: (slot: DaySlot) => void;
  onRerollSlot?: (slot: DaySlot) => void;
  /** Queue this slot only (an unrendered slot's ⋯ menu). */
  onQueueSlot?: (slot: DaySlot) => void;
  /** Quality-gate outcomes per slot — drives the review badge on each card. */
  qualityLedger?: SlotQualityLedger;
  /** "Redo pose misses once" marks by slot id ("Redone for the pose"). */
  poseRedoMarks?: Record<string, string>;
  /** Animate clip checks by slot id (Auto-review). */
  clipChecks?: Record<string, ClipCheck>;
  /** Two takes (intimate stills): the player keeps the first or the second. */
  onPickTwoTake?: (slotId: DaySlotId, keep: 'first' | 'second') => void;
  /** ⋯ → Looks wrong: a bad outcome for the pose, and the slot again on a new seed. */
  onLooksWrong?: (slot: DaySlot) => void;
  /** ⋯ → Fix an area…: paint over what's wrong in the finished still (fix-area.ts). */
  onFixArea?: (slot: DaySlot) => void;
};

const NO_GALLERY: ComfyGalleryEntry[] = [];

function subscribeGallery(onChange: () => void): () => void {
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
}

/**
 * Morning → night board. A card is the still (or its clip, playing in place), the slot's name
 * and beat, its state and check notes, and one ⋯ menu. Tapping a finished still opens it full
 * size; tapping the name, Edit, or a slot with nothing rendered yet opens the slot sheet.
 * In-flight Comfy stills show the live render preview in that time-of-day card.
 */
export default function DaySlotBoard({
  slots,
  stills,
  activeSlotId,
  busy = false,
  queueBlocked = false,
  compact = false,
  onSelectSlot,
  onEditSlot,
  onOpenStill,
  onRetrySlot,
  onAnimateSlot,
  onAddVoice,
  voicingSlotId = null,
  onExtendClip,
  extendRequestFor,
  extending = null,
  onRerollSlot,
  onQueueSlot,
  qualityLedger,
  poseRedoMarks,
  clipChecks,
  onPickTwoTake,
  onLooksWrong,
  onFixArea,
}: DaySlotBoardProps) {
  const voice = useTakeCastVoice();
  const [tapVoicing, setVoicing] = useState<string | null>(null);
  const voicing = tapVoicing ?? voicingSlotId;
  const [voicedNote, setVoicedNote] = useState<{ slotId: string; text: string } | null>(null);
  const [extendNote, setExtendNote] = useState<{ slotId: string; text: string } | null>(null);
  const [extendSheet, setExtendSheet] = useState<DaySlot | null>(null);
  const extendClip = async (slot: DaySlot, choice?: ClipExtendChoice) => {
    if (!onExtendClip) return;
    setExtendNote(null);
    const error = await onExtendClip(slot, choice);
    setExtendNote({ slotId: slot.id, text: error ?? 'Done — the clip is now about 30 seconds.' });
  };
  const addVoice = async (slot: DaySlot) => {
    if (!onAddVoice) return;
    setVoicing(slot.id);
    setVoicedNote(null);
    const error = await onAddVoice(slot);
    setVoicing(null);
    setVoicedNote({ slotId: slot.id, text: error ?? 'Voice added — the clip now has sound.' });
  };
  const promptKey = useMemo(
    () =>
      stills
        .flatMap(entry => [entry.promptId, entry.clipPromptId])
        .map(id => id?.trim())
        .filter((id): id is string => Boolean(id))
        .join('|'),
    [stills]
  );
  const [liveByPrompt, setLiveByPrompt] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, string | null> = {};
      for (const id of promptKey.split('|').filter(Boolean)) {
        next[id] = getComfyLivePreviewUrl(id);
      }
      setLiveByPrompt(next);
    };
    refresh();
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
  }, [promptKey]);

  // Queue position and sampler progress live on each prompt's gallery entry.
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => NO_GALLERY);
  const jobsByPrompt = useMemo(() => {
    const map = new Map<string, DaySlotJobEntry>();
    const wanted = new Set(stills.map(still => still.promptId?.trim()).filter(Boolean));
    if (wanted.size === 0) {
      return map;
    }
    for (const entry of gallery) {
      if (wanted.has(entry.promptId)) {
        map.set(entry.promptId, entry);
      }
    }
    return map;
  }, [gallery, stills]);

  const pad = compact ? 'px-2.5' : 'px-3';
  const mediaClass = compact
    ? 'aspect-video w-full object-cover'
    : 'aspect-[4/3] w-full object-cover';

  const sheetRequest = extendSheet && extendRequestFor ? extendRequestFor(extendSheet) : null;
  return (
    <>
      <ol
        className={
          compact
            ? 'grid grid-cols-2 gap-2'
            : // Phones: a swipe row (a card plus a peek of the next) instead of a ~1,200 px
              // column that pushed the plan off the screen. Grid from sm up.
              `max-sm:-mx-1 max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:px-1 max-sm:pb-1 max-sm:[&>li]:w-[78%] max-sm:[&>li]:shrink-0 max-sm:[&>li]:snap-start ${
                slots.length === 2
                  ? 'gap-2 sm:grid sm:grid-cols-2'
                  : slots.length === 3 || slots.length === 6
                    ? 'gap-2 sm:grid sm:grid-cols-3'
                    : 'gap-2 sm:grid sm:grid-cols-4'
              }`
        }
        data-testid="day-progress"
        aria-label="Day slots"
      >
        {slots.map(slot => {
          const still = stills.find(entry => entry.slotId === slot.id);
          const state = daySlotProgressState(still);
          const clipState = daySlotClipProgressState(still);
          const stillPromptId = still?.promptId?.trim() || '';
          const clipPromptId = still?.clipPromptId?.trim() || '';
          // An adult still is never previewed live: it waits for the adult-appearance gate.
          const stillLive =
            stillPromptId && state === 'queued' && !still?.adultGated
              ? liveByPrompt[stillPromptId]?.trim() || ''
              : '';
          const clipLive =
            clipPromptId && clipState === 'queued' ? liveByPrompt[clipPromptId]?.trim() || '' : '';
          const doneThumb = state === 'done' ? still?.imageUrl?.trim() || '' : '';
          const showStillLive = Boolean(stillLive);
          const showClipLive = Boolean(clipLive);
          const thumb = doneThumb || stillLive || (!doneThumb && clipLive) || '';
          // A finished clip plays in place of its still, like Story — no scroll to the Day reel.
          const doneClip = clipState === 'done' ? still?.clipUrl?.trim() || '' : '';
          const baseCaption = daySlotBoardCaption(still);
          const planLabel = daySlotPlanLabel(slot, compact ? 72 : 96);
          const planEmpty = !slot.location?.trim() || !slot.sceneHints?.trim();
          // Queue position / render % from the still's gallery entry instead of a flat "Queueing…".
          const job = daySlotJobProgress({
            stillStatus: still?.status,
            entry: stillPromptId ? jobsByPrompt.get(stillPromptId) : null,
            livePreview: showStillLive,
          });
          const label = job ? baseCaption.replace('Queueing…', job.label) : baseCaption;
          const selected = activeSlotId === slot.id;
          const openable = Boolean(doneThumb) && Boolean(onOpenStill);
          const canAnimate =
            state === 'done' && clipState === 'idle' && Boolean(onAnimateSlot) && !queueBlocked;
          const canRequeue =
            Boolean(doneThumb) && Boolean(onRetrySlot) && !queueBlocked && state === 'done';
          const canQueue = state === 'idle' && Boolean(onQueueSlot) && !queueBlocked;
          const reviewBadge = qualityLedger ? slotQualityBadge(qualityLedger, slot.id) : null;
          const poseRedoMark = poseRedoMarks?.[slot.id];
          const looksWrongMark = dayLooksWrongMark(still);
          const clipCheck = clipChecks?.[slot.id];
          const clipNote = clipCheckLabel(clipCheck);
          const edit = () => {
            onSelectSlot(slot.id);
            onEditSlot(slot.id);
          };
          // Two takes landed: both side by side, the player keeps one (day-two-takes.ts).
          const twoTakesPick =
            still && onPickTwoTake && dayTwoTakesPending(still) && dayTwoTakesReady(still);

          const menu = (
            <ShotCardMenu label={slot.label} testId={`day-progress-menu-${slot.id}`}>
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                data-testid={`day-progress-menu-edit-${slot.id}`}
                onClick={edit}
              >
                Edit slot
              </button>
              {openable ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  data-testid={`day-progress-open-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onOpenStill?.(slot.id);
                  }}
                >
                  Open full size
                </button>
              ) : null}
              {canRequeue ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy}
                  data-testid={`day-progress-requeue-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onRetrySlot?.(slot);
                  }}
                >
                  Requeue · new seed
                </button>
              ) : null}
              {Boolean(doneThumb) && state === 'done' && onFixArea && !still?.adultHold ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  title="Paint over a wrong hand, a stray object or a glitch and redraw only that area."
                  data-testid={`day-progress-fix-area-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onFixArea(slot);
                  }}
                >
                  Fix an area…
                </button>
              ) : null}
              {canRequeue && onLooksWrong ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy}
                  title="Merged bodies, a mixed-up pose, something off: redo this slot on a new seed, and remember that this pose went wrong on this engine."
                  data-testid={`day-progress-looks-wrong-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onLooksWrong(slot);
                  }}
                >
                  Looks wrong · redo
                </button>
              ) : null}
              {state === 'failed' && onRetrySlot ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy || queueBlocked}
                  data-testid={`day-progress-retry-${slot.id}`}
                  onClick={() => onRetrySlot(slot)}
                >
                  Retry {slot.label}
                </button>
              ) : null}
              {canQueue ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy}
                  data-testid={`day-progress-queue-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onQueueSlot?.(slot);
                  }}
                >
                  Queue this slot only
                </button>
              ) : null}
              {onAddVoice &&
              clipState === 'done' &&
              doneClip &&
              !clipUrlIsVideo(doneClip, { promptId: still?.clipPromptId }) ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy || voicing !== null}
                  title="Give this silent clip its sound — breathing, moans, the room — with the picture as it is. No words: the picture cannot move the lips."
                  data-testid={`day-progress-add-voice-${slot.id}`}
                  onClick={() => void addVoice(slot)}
                >
                  {voicing === slot.id ? 'Adding voice…' : 'Add voice'}
                </button>
              ) : null}
              {onExtendClip && clipState === 'done' && doneClip ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy || extending !== null}
                  title="Carry this clip on to about 30 seconds: what happens next is written from the scene and rendered in parts that continue from each other (a few minutes)."
                  data-testid={`day-progress-extend-${slot.id}`}
                  onClick={() => (extendRequestFor ? setExtendSheet(slot) : void extendClip(slot))}
                >
                  {extending?.slotId === slot.id ? 'Making it longer…' : 'Make it 30 s'}
                </button>
              ) : null}
              {slot.line?.trim() && clipState === 'done' && doneClip ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy || voice.taking(slot.id)}
                  title="Keep this clip's voice on the Cast: later talking clips are steered toward it."
                  data-testid={`day-progress-take-voice-${slot.id}`}
                  onClick={() => void voice.take(slot.id, doneClip)}
                >
                  Use this voice
                </button>
              ) : null}
              {canAnimate ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy}
                  data-testid={`day-progress-animate-${slot.id}`}
                  onClick={() => onAnimateSlot?.(slot)}
                >
                  Animate
                </button>
              ) : null}
              {onRerollSlot && state === 'idle' ? (
                <button
                  type="button"
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  disabled={busy}
                  aria-label={`Reroll ${slot.label} plan`}
                  data-testid={`day-progress-reroll-${slot.id}`}
                  onClick={() => {
                    onSelectSlot(slot.id);
                    onRerollSlot(slot);
                  }}
                >
                  Reroll plan
                </button>
              ) : null}
              {doneThumb && stillPromptId ? (
                <OpenInComfyButton
                  promptId={stillPromptId}
                  className={SHOT_CARD_MENU_ITEM_CLASS}
                  testId={`day-progress-comfy-${slot.id}`}
                />
              ) : null}
            </ShotCardMenu>
          );

          return (
            <li key={slot.id} className="min-w-0">
              <div
                data-testid={`day-progress-${slot.id}`}
                data-state={state}
                data-clip={clipState}
                data-live={showStillLive || showClipLive ? 'true' : 'false'}
                data-selected={selected ? 'true' : 'false'}
                data-plan-empty={planEmpty ? 'true' : 'false'}
                className={[
                  'relative rounded-[var(--radius-md)] border transition-[box-shadow,border-color,transform]',
                  selected
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[var(--shadow-card)] ring-2 ring-[var(--accent-ring)]'
                    : state === 'done'
                      ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]'
                      : state === 'failed'
                        ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]'
                        : state === 'queued'
                          ? 'border-[var(--accent-border)]/60 bg-[var(--accent-muted)]/50'
                          : planEmpty
                            ? 'border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]',
                ].join(' ')}
              >
                {twoTakesPick && still ? (
                  <div className="px-1.5 pb-1.5 pt-10">
                    <DayTwoTakesPick
                      slot={slot}
                      still={still}
                      compact
                      testId={`day-two-takes-${slot.id}`}
                      onPick={keep => {
                        onSelectSlot(slot.id);
                        onPickTwoTake?.(slot.id, keep);
                      }}
                    />
                  </div>
                ) : thumb ? (
                  <div className="relative overflow-hidden rounded-t-[var(--radius-md)]">
                    {doneClip ? (
                      <MotionMedia
                        src={doneClip}
                        alt={slot.label}
                        className={mediaClass}
                        autoPlay
                        loop
                        muted
                        controls={false}
                        poster={doneThumb || undefined}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        data-testid={
                          showStillLive || (showClipLive && !doneThumb)
                            ? `day-progress-live-${slot.id}`
                            : undefined
                        }
                        className={[
                          mediaClass,
                          showStillLive || (showClipLive && !doneThumb) ? 'opacity-80' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      />
                    )}
                    {doneThumb && showClipLive ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={clipLive}
                        alt=""
                        data-testid={`day-progress-live-${slot.id}`}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
                      />
                    ) : null}
                    {showStillLive || showClipLive ? (
                      <span className="type-overline pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)]/85 px-1.5 py-0.5 text-[var(--accent-text)]">
                        Live
                      </span>
                    ) : null}
                    {doneThumb ? (
                      // A Fix of this still rendering out of sight, or landed and not yet compared.
                      <FixAreaSessionChip
                        url={dayStillShownImage(still) || doneThumb}
                        className="absolute bottom-1.5 left-1.5 z-20"
                        testId={`day-fix-area-chip-${slot.id}`}
                      />
                    ) : null}
                    <button
                      type="button"
                      className={`absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)] ${openable ? 'cursor-zoom-in' : ''}`}
                      aria-pressed={selected}
                      aria-label={
                        openable
                          ? `Open ${slot.label} full size`
                          : `Edit ${slot.label} — ${planLabel || label}`
                      }
                      data-testid={`day-slot-select-${slot.id}`}
                      onClick={() => {
                        if (openable) {
                          onSelectSlot(slot.id);
                          onOpenStill?.(slot.id);
                          return;
                        }
                        edit();
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={[
                      'flex w-full items-center justify-center rounded-t-[var(--radius-md)] bg-[var(--bg-muted)]/40 text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]',
                      // Nothing rendered yet: a short strip, not a full-size empty frame.
                      state === 'idle' ? 'h-12' : compact ? 'aspect-video' : 'aspect-[4/3]',
                    ].join(' ')}
                    aria-pressed={selected}
                    aria-label={
                      state === 'idle' && planEmpty
                        ? `Add a beat for ${slot.label}`
                        : `Edit ${slot.label} — ${planLabel || label}`
                    }
                    data-testid={`day-slot-select-${slot.id}`}
                    onClick={edit}
                  >
                    {state === 'idle' && planEmpty ? (
                      <span
                        className="type-caption inline-flex items-center gap-1 font-medium text-[var(--accent-text)]"
                        data-testid={`day-slot-add-beat-${slot.id}`}
                      >
                        + Add a beat
                      </span>
                    ) : (
                      <span className="type-caption">{label}</span>
                    )}
                  </button>
                )}
                {/* The one menu, over the picture's top-right corner. */}
                <div className="absolute right-1.5 top-1.5 z-20">{menu}</div>
                <button
                  type="button"
                  className={[
                    'block w-full rounded-b-[var(--radius-md)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]',
                    compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
                  ].join(' ')}
                  aria-pressed={selected}
                  aria-label={`Edit ${slot.label}`}
                  data-testid={`day-progress-edit-${slot.id}`}
                  onClick={edit}
                >
                  {/* Wraps "Edit" under a long time of day on narrow cards instead of touching it. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="type-heading min-w-0 max-w-full truncate text-sm leading-snug sm:text-base">
                      {slot.label}
                    </p>
                    <span className="type-caption shrink-0 text-[var(--accent-text)]" aria-hidden>
                      Edit
                    </span>
                    {/* Screen-reader only: the accent border already marks the slot being edited. */}
                    {selected ? <span className="sr-only">Editing</span> : null}
                  </div>
                  <p className="type-caption text-[var(--text-muted)]">{label}</p>
                  {job?.percent != null ? (
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg-muted)]"
                      role="progressbar"
                      aria-label={`${slot.label} render progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={job.percent}
                      data-testid={`day-slot-progress-${slot.id}`}
                    >
                      <div
                        className="h-full bg-[var(--accent-active)] transition-[width]"
                        style={{ width: `${job.percent}%` }}
                      />
                    </div>
                  ) : null}
                  {planLabel ? (
                    <p
                      className={[
                        'type-caption mt-1 line-clamp-2',
                        planEmpty ? 'text-[var(--accent-text)]' : 'text-[var(--text-secondary)]',
                      ].join(' ')}
                      data-testid={`day-progress-scene-${slot.id}`}
                    >
                      {planLabel}
                    </p>
                  ) : null}
                  {reviewBadge ? (
                    <p
                      className={[
                        'type-overline mt-1',
                        reviewBadge.tone === 'warn'
                          ? 'text-[var(--tint-danger-text)]'
                          : 'text-[var(--text-muted)]',
                      ].join(' ')}
                      title={reviewBadge.detail || undefined}
                      data-testid={`day-progress-review-${slot.id}`}
                    >
                      {reviewBadge.label}
                      {reviewBadge.detail ? ` · ${reviewBadge.detail}` : ''}
                    </p>
                  ) : null}
                  {poseRedoMark ? (
                    <p
                      className="type-overline mt-1 text-[var(--text-muted)]"
                      data-testid={`day-progress-pose-redo-${slot.id}`}
                    >
                      {poseRedoMark}
                    </p>
                  ) : null}
                  {looksWrongMark ? (
                    <p
                      className="type-overline mt-1 text-[var(--text-muted)]"
                      data-testid={`day-progress-redone-${slot.id}`}
                    >
                      {looksWrongMark}
                    </p>
                  ) : null}
                  {clipNote ? (
                    <p
                      className={[
                        'type-overline mt-1',
                        clipCheck?.status === 'warn'
                          ? 'text-[var(--tint-danger-text)]'
                          : 'text-[var(--text-muted)]',
                      ].join(' ')}
                      data-testid={`day-progress-clip-check-${slot.id}`}
                    >
                      {clipNote}
                    </p>
                  ) : null}
                  {clipState === 'done' ? (
                    <p
                      className="type-overline mt-1 text-[var(--tint-success-text)]"
                      data-testid={`day-progress-clip-${slot.id}`}
                    >
                      {slot.line?.trim() ? 'Talking' : 'Motion'}
                    </p>
                  ) : clipState === 'queued' ? (
                    <p
                      className="type-overline mt-1 text-[var(--accent-text)]"
                      data-testid={`day-progress-clip-${slot.id}`}
                    >
                      Animating…
                    </p>
                  ) : clipState === 'failed' ? (
                    <p
                      className="type-overline mt-1 text-[var(--tint-danger-text)]"
                      data-testid={`day-progress-clip-${slot.id}`}
                    >
                      Clip failed
                    </p>
                  ) : null}
                  {voicing === slot.id || voicedNote?.slotId === slot.id ? (
                    <p
                      className="type-caption mt-1 text-[var(--text-muted)]"
                      role="status"
                      data-testid={`day-progress-add-voice-note-${slot.id}`}
                    >
                      {voicing === slot.id ? 'Adding voice… (about a minute)' : voicedNote?.text}
                    </p>
                  ) : null}
                  {extending?.slotId === slot.id || extendNote?.slotId === slot.id ? (
                    <p
                      className="type-caption mt-1 text-[var(--text-muted)]"
                      role="status"
                      data-testid={`day-progress-extend-note-${slot.id}`}
                    >
                      {extending?.slotId === slot.id ? extending.note : extendNote?.text}
                    </p>
                  ) : null}
                  {voice.noteFor(slot.id) ? (
                    <p
                      className="type-caption mt-1 text-[var(--text-muted)]"
                      role="status"
                      data-testid={`day-progress-voice-note-${slot.id}`}
                    >
                      {voice.noteFor(slot.id)}
                    </p>
                  ) : null}
                </button>
                {still?.adultHold === 'withheld' ? (
                  <p
                    className={`type-caption text-[var(--tint-danger-text)] ${pad} pb-2.5`}
                    role="status"
                    data-testid={`day-slot-withheld-${slot.id}`}
                  >
                    {still.adultHoldCause === 'bare'
                      ? CLOTHED_GATE_WITHHELD_MESSAGE
                      : ADULT_GATE_WITHHELD_MESSAGE}
                  </p>
                ) : null}
                {still?.engineNote ? (
                  <p
                    className={`type-caption text-[var(--text-muted)] ${pad} pb-1`}
                    data-testid={`day-slot-engine-note-${slot.id}`}
                  >
                    {still.engineNote}
                  </p>
                ) : null}
                {still?.referenceNote ? (
                  <p
                    className={`type-caption text-[var(--tint-warning-text,var(--text-muted))] ${pad} pb-1`}
                    role="status"
                    data-testid={`day-slot-reference-note-${slot.id}`}
                  >
                    {still.referenceNote}
                  </p>
                ) : null}
                {/* Outside the edit button: the note opens on its own tap. */}
                <StillPromptCheckNote
                  check={still?.promptCheck}
                  testId={`day-slot-prompt-check-${slot.id}`}
                  className={`${pad} pb-2.5`}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {extendSheet && sheetRequest ? (
        <ClipExtendSheet
          key={extendSheet.id}
          open
          onClose={() => setExtendSheet(null)}
          request={sheetRequest}
          onStart={choice => void extendClip(extendSheet, choice)}
          testId="day-extend-sheet"
        />
      ) : null}
    </>
  );
}
