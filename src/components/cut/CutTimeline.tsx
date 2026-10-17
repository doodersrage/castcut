'use client';

/**
 * Cut's timeline: every shot as a block as long as it plays, with its picture, under a ruler and
 * the playhead. Click a shot to jump to it, drag it to move it, drag a still's right edge to hold
 * it longer, a clip's edges to trim it; click or drag on the ruler to scrub.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CutPreviewLoaded } from '@/hooks/useCutPreview';
import { MAX_STILL_HOLD_SEC, MIN_STILL_HOLD_SEC } from '@/lib/character-film';
import {
  MIN_CLIP_TRIM_SEC,
  moveCutShotBefore,
  withCutShotEdit,
  type CutShotEdit,
  type CutShotEdits,
} from '@/lib/film-cut-plan';

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
    }
  | { kind: 'trimStart'; key: string; startX: number; base: number; value: number; max: number };

const round = (value: number) => Math.round(value * 10) / 10;

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
  onSeek: (t: number) => void;
  onPick: (key: string) => void;
  onChange: (next: CutShotEdits) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
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

  const startEdge = (event: ReactPointerEvent<HTMLSpanElement>, next: Drag) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(next);
  };
  const moveEdge = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    const delta = (event.clientX - drag.startX) / pps;
    if (drag.kind === 'hold') {
      setDrag({
        ...drag,
        value: round(Math.min(MAX_STILL_HOLD_SEC, Math.max(MIN_STILL_HOLD_SEC, drag.base + delta))),
      });
    } else if (drag.kind === 'trimEnd') {
      const raw = drag.base + delta;
      setDrag({
        ...drag,
        value: round(Math.max(drag.min, drag.max != null ? Math.min(drag.max, raw) : raw)),
      });
    } else {
      setDrag({ ...drag, value: round(Math.min(drag.max, Math.max(0, drag.base + delta))) });
    }
  };
  const endEdge = () => {
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
          <button
            type="button"
            className="h-7 w-7 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            aria-label="Zoom the timeline out"
            onClick={() => setZoom(value => Math.max(0.5, value / 1.5))}
          >
            −
          </button>
          <button
            type="button"
            className="h-7 w-7 rounded-[var(--radius-sm)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            aria-label="Zoom the timeline in"
            data-testid="cut-timeline-zoom-in"
            onClick={() => setZoom(value => Math.min(8, value * 1.5))}
          >
            +
          </button>
        </span>
      </div>
      <div
        ref={scroller}
        className="relative overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/50"
      >
        <div className="relative" style={{ width: trackWidth, height: 112 }}>
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
                className="absolute top-0 h-full border-l border-[var(--border-subtle)] pl-0.5 text-[10px] tabular-nums text-[var(--text-muted)]"
                style={{ left: t * pps }}
              >
                {Math.floor(t / 60)}:{String(Math.round(t) % 60).padStart(2, '0')}
              </span>
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
                  className="absolute top-6 flex h-[5.5rem] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-black px-1 text-center text-[10px] text-white/80"
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
            return (
              <div
                key={key}
                draggable={!disabled && !drag}
                onDragStart={event => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', key);
                  setDragging(key);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
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
                onClick={() => onPick(key)}
                className={`group absolute top-6 h-[5.5rem] cursor-pointer overflow-hidden rounded-[var(--radius-sm)] bg-black ${
                  active
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
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[10px] text-white">
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
                    className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/50 group-hover:bg-white/25"
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
                    onPointerMove={moveEdge}
                    onPointerUp={endEdge}
                  />
                ) : null}
                {!disabled && item.kind === 'clip' ? (
                  <>
                    <span
                      role="separator"
                      aria-label={`Start of ${loaded?.shots[item.shot]?.title}`}
                      title="Drag to trim the start"
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-white/50 group-hover:bg-white/25"
                      data-testid={`cut-timeline-trim-start-${key}`}
                      onClick={event => event.stopPropagation()}
                      onPointerDown={event =>
                        startEdge(event, {
                          kind: 'trimStart',
                          key,
                          startX: event.clientX,
                          base: item.fromSec,
                          value: item.fromSec,
                          max: item.fromSec + item.durSec - MIN_CLIP_TRIM_SEC,
                        })
                      }
                      onPointerMove={moveEdge}
                      onPointerUp={endEdge}
                    />
                    <span
                      role="separator"
                      aria-label={`End of ${loaded?.shots[item.shot]?.title}`}
                      title="Drag to trim the end"
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-white/50 group-hover:bg-white/25"
                      data-testid={`cut-timeline-trim-end-${key}`}
                      onClick={event => event.stopPropagation()}
                      onPointerDown={event =>
                        startEdge(event, {
                          kind: 'trimEnd',
                          key,
                          startX: event.clientX,
                          base: item.fromSec + item.durSec,
                          value: item.fromSec + item.durSec,
                          min: item.fromSec + MIN_CLIP_TRIM_SEC,
                          max: clipFull,
                        })
                      }
                      onPointerMove={moveEdge}
                      onPointerUp={endEdge}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
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
  );
}
