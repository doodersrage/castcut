'use client';

/**
 * Cut's timeline: every shot as a block as long as it plays, with its picture, under a ruler and
 * the playhead. Click a shot to jump to it, drag it to move it, drag a still's right edge to hold
 * it longer, a clip's edges to trim it; click or drag on the ruler to scrub.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import CutSoundLane, {
  CUT_LANE_HEIGHT,
  CUT_LANES_HEIGHT,
  CUT_LANES_TOP,
} from '@/components/cut/CutSoundLane';
import { CUT_TRACKS, type CutSoundOptions, type CutTrack } from '@/lib/video/cut-sound';
import type { ReactNode } from 'react';
import { MAX_STILL_HOLD_SEC, MIN_STILL_HOLD_SEC } from '@/lib/film/character-film';
import { CUT_TRANSITIONS, type CutTransitionKind } from '@/lib/video/cut-timeline';
import {
  MIN_CLIP_TRIM_SEC,
  moveCutShotBefore,
  withCutShotEdit,
  type CutShotEdit,
  type CutShotEdits,
} from '@/lib/film/cut-plan';
import { Button } from '@/components/ui/Button';
import { clipFrames } from '@/lib/video/filmstrip-client';
import { nearestSnap } from '@/lib/film/cut-markers';

type Drag =
  | { kind: 'hold'; key: string; startX: number; base: number; value: number }
  | {
      kind: 'trimEnd';
      key: string;
      startX: number;
      base: number;
      value: number;
      max: number | null;
      min: number;
      /** File seconds per cut second (a sped-up / slowed clip). */
      scale: number;
    }
  | {
      kind: 'trimStart';
      key: string;
      startX: number;
      base: number;
      value: number;
      max: number;
      scale: number;
    };

const round = (value: number) => Math.round(value * 10) / 10;

/** Window event the Cut's keys send to zoom the timeline: 'in', 'out' or 'fit'. */
export const CUT_TIMELINE_ZOOM_EVENT = 'castcut-cut-timeline-zoom';

/** How close (px) an edge comes to the playhead, a marker, a beat or a shot's edge to snap. */
const SNAP_PX = 8;

/** Frames along a clip block (filmstrip-client.ts), drawn once read; the block's own picture until then. */
function ClipFilmstrip({
  url,
  fromSec,
  toSec,
  count,
}: {
  url: string;
  fromSec: number;
  toSec: number;
  count: number;
}) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const span = Math.max(0.1, toSec - fromSec);
    const times = Array.from({ length: count }, (_, i) => fromSec + (span * (i + 0.5)) / count);
    void clipFrames(url, times).then(next => {
      if (!cancelled) setFrames(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url, fromSec, toSec, count]);
  if (frames.length < 2) return null;
  return (
    <span
      className="pointer-events-none absolute inset-0 flex"
      data-testid="cut-timeline-filmstrip"
    >
      {frames.map((frame, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- frames read from the clip, data URLs
        <img
          key={index}
          src={frame}
          alt=""
          className="h-full min-w-0 flex-1 object-cover opacity-90"
        />
      ))}
    </span>
  );
}

/** The ruler and shots, then a lane per sound track (CutSoundLane). */
const TIMELINE_HEIGHT = CUT_LANES_TOP + CUT_LANES_HEIGHT + 2;

export default function CutTimeline({
  loaded,
  order,
  edits,
  time,
  activeKey,
  holdsLocked,
  disabled,
  thumbFor,
  playing = false,
  bedUrl,
  bedLabel,
  sound,
  audible,
  trackHeader,
  markers,
  snapTimes,
  selected,
  onSelect,
  onSkim,
  onSeek,
  onPick,
  onChange,
}: {
  loaded: CutPreviewLoaded | null;
  /** Every shot key in the shown order (left-out shots included) — reorders keep them. */
  order: string[];
  edits?: CutShotEdits;
  time: number;
  /** The shot under the playhead. */
  activeKey: string | null;
  holdsLocked: boolean;
  disabled?: boolean;
  /** The picture to show for a shot (the still, or the clip's URL). */
  thumbFor: (key: string) => { url: string; clip: boolean } | null;
  /** Follow the playhead only while the cut plays. */
  playing?: boolean;
  /** The music bed (the sound lane draws it). */
  bedUrl?: string;
  bedLabel?: string;
  /** The ambience and effects lanes (cut-sound.ts). */
  sound?: CutSoundOptions | null;
  /** Whether each track is heard (mute and solo): a lane you can't hear is dimmed. */
  audible?: Partial<Record<CutTrack, boolean>>;
  /** Each sound lane's header (its name, mute and solo), at the start of the lane. */
  trackHeader?: (track: CutTrack) => ReactNode;
  /** Review comments pinned to a moment (review-notes.ts): a mark on the ruler, click to jump. */
  markers?: Array<{
    id: string;
    timeSec: number;
    label: string;
    resolved?: boolean;
    /** Your own marker (M), not a reviewer's comment. */
    own?: boolean;
  }>;
  /** Where a dragged edge snaps besides the shots' edges: the playhead, markers, the beats. */
  snapTimes?: readonly number[];
  /** Shots picked together (Shift- / Ctrl-click). */
  selected?: readonly string[];
  /** A Shift- / Ctrl-click adds or takes a shot from the picked ones; a plain click picks only it. */
  onSelect?: (key: string, add: boolean) => void;
  /** The pointer over the shots, not dragging: the monitor shows that moment (null: back). */
  onSkim?: (t: number | null) => void;
  onSeek: (t: number) => void;
  onPick: (key: string) => void;
  onChange: (next: CutShotEdits) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [drag, setDragState] = useState<Drag | null>(null);
  // The live drag, read by the pointer handlers: a move that lands before React re-renders
  // must not be lost (the state is for drawing).
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [dragging, setDragging] = useState<string | null>(null);
  // A block is draggable (to move it) once pressed on its body — not on an edge.
  const [armed, setArmed] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const scrubbing = useRef(false);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onZoom = (event: Event) => {
      const how = (event as CustomEvent<'in' | 'out' | 'fit'>).detail;
      setZoom(value =>
        how === 'fit' ? 1 : how === 'in' ? Math.min(8, value * 1.5) : Math.max(0.5, value / 1.5)
      );
    };
    window.addEventListener(CUT_TIMELINE_ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(CUT_TIMELINE_ZOOM_EVENT, onZoom);
  }, []);
  // Where the last dragged edge snapped (a guide line while it holds there).
  const [snapAt, setSnapAt] = useState<number | null>(null);

  const total = loaded?.timeline.totalSec ?? 0;
  // Fit the cut to the width at zoom 1; at least 24 px a second so a long cut scrolls.
  const pps = Math.max(24, total > 0 ? (width - 8) / total : 60) * zoom;
  const items = loaded?.timeline.items ?? [];
  const playheadX = time * pps;

  // Follow the playhead when it runs off screen (while playing — not on layout changes).
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    if (
      playheadX < element.scrollLeft ||
      playheadX > element.scrollLeft + element.clientWidth - 24
    ) {
      element.scrollLeft = Math.max(0, playheadX - element.clientWidth / 3);
    }
  }, [playheadX, playing]);

  const timeAt = (clientX: number) => {
    const element = scroller.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - rect.left + element.scrollLeft) / pps));
  };

  const commit = (key: string, patch: CutShotEdit) =>
    onChange(withCutShotEdit(edits, order, key, patch));

  // An edge drag follows the pointer on the window (not the handle: the block may re-render
  // under it), with the latest handlers.
  const startEdge = (event: ReactPointerEvent<HTMLSpanElement>, next: Drag) => {
    event.stopPropagation();
    event.preventDefault();
    setDrag(next);
    const onMove = (move: PointerEvent) => moveRef.current(move);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      endRef.current();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const moveEdge = (event: { clientX: number; altKey?: boolean }) => {
    const drag = dragRef.current;
    if (!drag) return;
    let delta = (event.clientX - drag.startX) / pps;
    // An end edge snaps to the playhead, a marker, a beat or an earlier shot's edge (Alt: free).
    // Later shots move with it, so their edges are no target.
    if (drag.kind !== 'trimStart' && !event.altKey) {
      const index = items.findIndex(item => item.shot >= 0 && loaded?.keys[item.shot] === drag.key);
      const item = items[index];
      if (item) {
        const edgeAt = item.startSec + item.durSec;
        const wanted = edgeAt + delta;
        const targets = [
          ...(snapTimes ?? []),
          ...items
            .slice(0, index)
            .flatMap(other => [other.startSec, other.startSec + other.durSec]),
        ].filter(t => t > item.startSec + 0.2);
        const best = nearestSnap(wanted, targets, SNAP_PX / pps);
        setSnapAt(best);
        if (best != null) delta = best - edgeAt;
      }
    } else {
      setSnapAt(null);
    }
    if (drag.kind === 'hold') {
      setDrag({
        ...drag,
        value: round(Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, drag.base + delta))),
      });
    } else if (drag.kind === 'trimEnd') {
      const raw = drag.base + delta * drag.scale;
      setDrag({
        ...drag,
        value: round(Math.max(drag.min, drag.max != null ? Math.min(drag.max, raw) : raw)),
      });
    } else {
      setDrag({
        ...drag,
        value: round(Math.min(drag.max, Math.max(0, drag.base + delta * drag.scale))),
      });
    }
  };
  const endEdge = () => {
    const drag = dragRef.current;
    setSnapAt(null);
    if (!drag) return;
    if (drag.kind === 'hold') commit(drag.key, { holdSec: drag.value });
    else if (drag.kind === 'trimEnd')
      commit(drag.key, {
        // Back at the clip's own end clears the trim.
        trimEndSec: drag.max != null && drag.value >= drag.max - 0.05 ? undefined : drag.value,
      });
    else commit(drag.key, { trimStartSec: drag.value <= 0.05 ? undefined : drag.value });
    setDrag(null);
  };
  const moveRef = useRef(moveEdge);
  const endRef = useRef(endEdge);
  useEffect(() => {
    moveRef.current = moveEdge;
    endRef.current = endEdge;
  });

  const rulerStep = pps >= 60 ? 1 : pps >= 25 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += rulerStep) ticks.push(t);
  const trackWidth = Math.max(width - 8, total * pps + 24);

  return (
    <div className="space-y-1" data-testid="cut-timeline">
      <div className="flex items-center justify-between gap-2">
        <span className="type-caption text-[var(--text-muted)]">
          Click to jump · drag a shot to move it · drag its edge to hold or trim
        </span>
        <span className="flex items-center gap-1">
          <Button
            variant="icon"
            className="h-7 w-7"
            aria-label="Zoom the timeline out"
            onClick={() => setZoom(value => Math.max(0.5, value / 1.5))}
          >
            −
          </Button>
          <Button
            variant="icon"
            className="h-7 w-7"
            aria-label="Zoom the timeline in"
            data-testid="cut-timeline-zoom-in"
            onClick={() => setZoom(value => Math.min(8, value * 1.5))}
          >
            +
          </Button>
        </span>
      </div>
      <div className="flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50">
        {/* The lanes' names, mute and solo — fixed while the lanes scroll (an editor's track headers). */}
        <div
          className="relative w-36 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/60"
          style={{ height: TIMELINE_HEIGHT }}
          data-testid="cut-track-headers"
        >
          <span
            className="absolute left-2 type-caption text-[var(--text-muted)]"
            style={{ top: 24, height: CUT_LANES_TOP - 30, lineHeight: `${CUT_LANES_TOP - 30}px` }}
          >
            Picture
          </span>
          {CUT_TRACKS.map((track, index) => (
            <div
              key={track}
              className="absolute inset-x-0 border-t border-[var(--border-subtle)] px-2"
              style={{ top: CUT_LANES_TOP + index * CUT_LANE_HEIGHT, height: CUT_LANE_HEIGHT }}
            >
              {trackHeader?.(track)}
            </div>
          ))}
        </div>
        <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ width: trackWidth, height: TIMELINE_HEIGHT }}
            onPointerMove={event => {
              // Skimming: the moment under the pointer on the monitor, the playhead left where it is.
              if (!onSkim || playing || dragRef.current || dragging || event.buttons) return;
              onSkim(timeAt(event.clientX));
            }}
            onPointerLeave={() => onSkim?.(null)}
          >
            {snapAt != null ? (
              <span
                className="pointer-events-none absolute top-0 z-20 w-px bg-[var(--tint-warning-text)]"
                style={{ left: snapAt * pps, height: TIMELINE_HEIGHT }}
                data-testid="cut-timeline-snap"
              />
            ) : null}
            {/* Ruler: click or drag to scrub. */}
            <div
              className="absolute inset-x-0 top-0 h-5 cursor-pointer select-none border-b border-[var(--border-subtle)]"
              data-testid="cut-timeline-ruler"
              onPointerDown={event => {
                scrubbing.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                onSeek(timeAt(event.clientX));
              }}
              onPointerMove={event => {
                if (scrubbing.current) onSeek(timeAt(event.clientX));
              }}
              onPointerUp={() => {
                scrubbing.current = false;
              }}
            >
              {ticks.map(t => (
                <span
                  key={t}
                  className="absolute top-0 h-full border-l border-[var(--border-subtle)] pl-0.5 text-3xs tabular-nums text-[var(--text-muted)]"
                  style={{ left: t * pps }}
                >
                  {Math.floor(t / 60)}:{String(Math.round(t) % 60).padStart(2, '0')}
                </span>
              ))}
              {markers?.map(marker => (
                <Button
                  key={marker.id}
                  variant="plain"
                  title={marker.label}
                  aria-label={`${marker.own ? 'Marker' : 'Review comment'} at ${Math.floor(marker.timeSec / 60)}:${String(Math.floor(marker.timeSec) % 60).padStart(2, '0')}: ${marker.label}`}
                  className={`absolute top-0.5 z-10 h-3.5 w-2.5 -translate-x-1/2 rounded-b-full ${marker.own ? 'bg-[var(--tint-warning-text)]' : marker.resolved ? 'bg-[var(--text-muted)]/50' : 'bg-[var(--accent)]'}`}
                  style={{ left: Math.min(total, marker.timeSec) * pps }}
                  data-testid={marker.own ? 'cut-timeline-marker' : 'cut-timeline-review-marker'}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => onSeek(Math.min(total, marker.timeSec))}
                />
              ))}
            </div>
            {/* Shots. */}
            {items.map((item, index) => {
              const next = items[index + 1];
              const slot = next ? next.startSec - item.startSec : item.durSec;
              const key = item.shot >= 0 ? (loaded?.keys[item.shot] ?? null) : null;
              const live = drag && key && drag.key === key ? drag : null;
              // While an edge is dragged, the block shows its new length.
              const shownSlot = live
                ? live.kind === 'hold'
                  ? slot + (live.value - live.base)
                  : live.kind === 'trimEnd'
                    ? slot + (live.value - live.base)
                    : slot - (live.value - live.base)
                : slot;
              const left = item.startSec * pps;
              const blockWidth = Math.max(10, shownSlot * pps - 2);
              if (item.kind === 'title' || !key) {
                return (
                  <div
                    key={`title-${index}`}
                    className="absolute top-6 flex h-[5.5rem] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-black px-1 text-center text-3xs text-white/80"
                    style={{ left, width: blockWidth }}
                    title="Title card"
                  >
                    Title
                  </div>
                );
              }
              const thumb = thumbFor(key);
              const active = activeKey === key;
              const clipFull = loaded?.clipSecs[item.shot] ?? null;
              const own = edits?.shots?.[key]?.transition ?? '';
              const transitionPicker =
                index > 0 && !disabled ? (
                  <span
                    key={`${key}-in`}
                    className={`absolute top-[0.85rem] z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border text-[12px] leading-none shadow ${
                      own
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                    style={{ left }}
                  >
                    {CUT_TRANSITIONS.find(entry => entry.id === item.transition)?.short ?? '|'}
                    {/* The native picker, invisible over the badge: the full list on click. */}
                    <select
                      aria-label={`How ${loaded?.shots[item.shot]?.title ?? 'this shot'} comes in`}
                      title={`Comes in with: ${CUT_TRANSITIONS.find(entry => entry.id === item.transition)?.label ?? 'Cut'}${own ? '' : " (the cut's default)"}`}
                      className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
                      value={own}
                      data-testid={`cut-timeline-transition-${key}`}
                      onChange={event =>
                        commit(key, {
                          transition: (event.target.value || undefined) as
                            CutTransitionKind | undefined,
                        })
                      }
                    >
                      <option value="">Default (the cut&apos;s crossfade)</option>
                      {CUT_TRANSITIONS.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : null;
              return [
                transitionPicker,
                <div
                  key={key}
                  draggable={!disabled && !drag && armed === key}
                  onPointerDown={() => setArmed(key)}
                  onPointerUp={() => setArmed(null)}
                  onDragStart={event => {
                    // Pressing an edge holds / trims — not a move of the whole block.
                    if (dragRef.current) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', key);
                    setDragging(key);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                    setArmed(null);
                  }}
                  onDragOver={event => {
                    if (!dragging || dragging === key) return;
                    event.preventDefault();
                    setOver(key);
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    const moved = dragging ?? event.dataTransfer.getData('text/plain');
                    setDragging(null);
                    setOver(null);
                    if (!moved || moved === key) return;
                    const from = order.indexOf(moved);
                    const to = order.indexOf(key);
                    const before = from < to ? (order[to + 1] ?? null) : key;
                    onChange({ ...edits, order: moveCutShotBefore(order, moved, before) });
                  }}
                  onClick={event => {
                    const add = event.shiftKey || event.ctrlKey || event.metaKey;
                    onSelect?.(key, add);
                    if (!add) onPick(key);
                  }}
                  aria-selected={selected?.includes(key) || undefined}
                  className={`group absolute top-6 h-[5.5rem] cursor-pointer overflow-hidden rounded-[var(--radius-sm)] bg-black ${
                    selected?.includes(key) && (selected?.length ?? 0) > 1
                      ? 'ring-2 ring-[var(--tint-warning-text)]'
                      : active
                        ? 'ring-2 ring-[var(--accent)]'
                        : over === key
                          ? 'ring-2 ring-[var(--accent-border)]'
                          : 'ring-1 ring-black/40'
                  } ${dragging === key ? 'opacity-40' : ''}`}
                  style={{ left, width: blockWidth }}
                  title={`${loaded?.shots[item.shot]?.title ?? ''} · ${round(shownSlot)} s`}
                  data-testid={`cut-timeline-shot-${key}`}
                >
                  {thumb ? (
                    thumb.clip ? (
                      <video
                        src={`${thumb.url}#t=${Math.max(0.1, item.fromSec)}`}
                        muted
                        preload="metadata"
                        className="pointer-events-none h-full w-full object-cover opacity-90"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb.url}
                        alt=""
                        draggable={false}
                        className="pointer-events-none h-full w-full object-cover opacity-90"
                      />
                    )
                  ) : null}
                  {item.kind === 'clip' && blockWidth > 110 && loaded?.shots[item.shot]?.url ? (
                    <ClipFilmstrip
                      url={loaded.shots[item.shot]!.url}
                      fromSec={item.fromSec}
                      toSec={item.fromSec + item.durSec * (item.speed ?? 1)}
                      count={Math.min(12, Math.max(2, Math.floor(blockWidth / 64)))}
                    />
                  ) : null}
                  {item.inSec > 0 ? (
                    <span
                      className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/60 to-transparent"
                      style={{ width: Math.min(blockWidth, item.inSec * pps) }}
                    />
                  ) : null}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-3xs text-white">
                    {item.kind === 'clip' ? '▶ ' : ''}
                    {loaded?.shots[item.shot]?.title}
                    {live ? ` · ${live.value} s` : ''}
                  </span>
                  {/* Edges: a still's hold, a clip's in and out points. */}
                  {!disabled && item.kind === 'still' && !holdsLocked ? (
                    <span
                      role="separator"
                      aria-label={`Hold of ${loaded?.shots[item.shot]?.title}`}
                      title="Drag to hold this still longer or shorter"
                      className="absolute bottom-0 right-0 top-5 w-2 cursor-ew-resize bg-white/0 hover:bg-white/50 group-hover:bg-white/25"
                      data-testid={`cut-timeline-hold-${key}`}
                      onClick={event => event.stopPropagation()}
                      onPointerDown={event =>
                        startEdge(event, {
                          kind: 'hold',
                          key,
                          startX: event.clientX,
                          base: item.durSec,
                          value: item.durSec,
                        })
                      }
                    />
                  ) : null}
                  {!disabled && item.kind === 'clip' ? (
                    <>
                      <span
                        role="separator"
                        aria-label={`Start of ${loaded?.shots[item.shot]?.title}`}
                        title="Drag to trim the start"
                        className="absolute bottom-0 left-0 top-5 w-2 cursor-ew-resize hover:bg-white/50 group-hover:bg-white/25"
                        data-testid={`cut-timeline-trim-start-${key}`}
                        onClick={event => event.stopPropagation()}
                        onPointerDown={event =>
                          startEdge(event, {
                            kind: 'trimStart',
                            key,
                            startX: event.clientX,
                            base: item.fromSec,
                            value: item.fromSec,
                            max: item.fromSec + item.durSec * (item.speed ?? 1) - MIN_CLIP_TRIM_SEC,
                            scale: item.speed ?? 1,
                          })
                        }
                      />
                      <span
                        role="separator"
                        aria-label={`End of ${loaded?.shots[item.shot]?.title}`}
                        title="Drag to trim the end"
                        className="absolute bottom-0 right-0 top-5 w-2 cursor-ew-resize hover:bg-white/50 group-hover:bg-white/25"
                        data-testid={`cut-timeline-trim-end-${key}`}
                        onClick={event => event.stopPropagation()}
                        onPointerDown={event =>
                          startEdge(event, {
                            kind: 'trimEnd',
                            key,
                            startX: event.clientX,
                            base: item.fromSec + item.durSec * (item.speed ?? 1),
                            value: item.fromSec + item.durSec * (item.speed ?? 1),
                            min: item.fromSec + MIN_CLIP_TRIM_SEC,
                            max: clipFull,
                            scale: item.speed ?? 1,
                          })
                        }
                      />
                    </>
                  ) : null}
                </div>,
              ];
            })}
            <CutSoundLane
              loaded={loaded}
              pps={pps}
              width={trackWidth}
              bedUrl={bedUrl}
              bedLabel={bedLabel}
              sound={sound}
              audible={audible}
            />
            {/* Playhead. */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-[var(--accent)]"
              style={{ left: playheadX }}
              data-testid="cut-timeline-playhead"
            >
              <span className="absolute -left-1 top-0 h-2 w-2.5 rounded-sm bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
