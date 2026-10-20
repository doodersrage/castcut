'use client';

import { CUT_FRAMINGS, type CutFraming } from '@/lib/video/cut-move';
import { CutShotOverlayEditor } from '@/components/cut/CutOverlayControls';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import IdentityMarkChip from '@/components/IdentityMarkChip';
import { MAX_STILL_HOLD_SEC, MIN_STILL_HOLD_SEC } from '@/lib/film/character-film';
import {
  CLIP_SPEEDS,
  clipSpeed,
  clipTrimWindow,
  MIN_CLIP_TRIM_SEC,
  moveCutShot,
  moveCutShotBefore,
  orderedCutShots,
  type CutShotEdit,
  type CutShotEdits,
  type KeyedShot,
} from '@/lib/film/cut-plan';
import { probeMediaDurationSec } from '@/lib/film/cut-media';
import { CUT_TRANSITIONS, type CutTransitionKind } from '@/lib/video/cut-timeline';
import type { IdentityMark } from '@/lib/character/identity-mark';

/**
 * Day / Story shot list: order, leave a shot out, edit its caption (when titles are on), set a
 * still's hold (unless the length is fitted to the music / a set length), trim a clip, and see
 * whether each shot looks like the Cast.
 */
export default function FilmCutShotList({
  shots,
  edits,
  captions,
  holdsLocked,
  disabled,
  testIdPrefix,
  onChange,
  identityFor,
  tagFor,
  activeKey,
  onPick,
  renderExtra,
}: {
  shots: KeyedShot[];
  edits?: CutShotEdits;
  captions: boolean;
  holdsLocked: boolean;
  disabled?: boolean;
  testIdPrefix: string;
  onChange: (next: CutShotEdits) => void;
  /** Face match mark per shot (identity-mark.ts), when measured. */
  identityFor?: (shot: KeyedShot) => IdentityMark | null;
  /** A small tag per shot — where it came from (Cut: "Day" / "Story") when the film mixes them. */
  tagFor?: (shot: KeyedShot) => string | null;
  /** The shot under the playhead (Cut's monitor) — ringed. */
  activeKey?: string | null;
  /** Clicking a shot's picture: jump the monitor to it. */
  onPick?: (key: string) => void;
  /** Extra controls on a shot's card (Cut: a text card's words, Remove for an added shot). */
  renderExtra?: (shot: KeyedShot) => ReactNode;
}) {
  // Drag to reorder: the grip arms the row (dragging from a text field would grab the row
  // instead of selecting text), `over` marks where it lands.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** The shot whose overlay editor is open. */
  const [overlayOpen, setOverlayOpen] = useState<string | null>(null);
  const known = new Set(shots.map(shot => shot.key));
  const ordered = orderedCutShots(shots, edits);
  const keys = ordered.map(shot => shot.key);
  const patchShot = (key: string, patch: NonNullable<CutShotEdits['shots']>[string]) =>
    onChange({
      ...edits,
      order: keys,
      shots: {
        ...Object.fromEntries(
          Object.entries(edits?.shots ?? {}).filter(([shotKey]) => known.has(shotKey))
        ),
        [key]: { ...edits?.shots?.[key], ...patch },
      },
    });

  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}-shot-list`}>
      <p className="type-caption text-[var(--text-muted)]">
        Shots — drag to reorder, leave out{captions ? ', caption' : ''}
        {holdsLocked ? '' : ', hold'}, frame stills
        {shots.some(shot => shot.kind === 'clip') ? ', trim clips' : ''}, pick the poster
      </p>
      <ol className="space-y-1">
        {ordered.map((shot, index) => {
          const edit = edits?.shots?.[shot.key];
          const included = edit?.include !== false;
          const identity = identityFor?.(shot) ?? null;
          const isPoster = edits?.poster?.key === shot.key;
          return (
            <li
              key={shot.key}
              draggable={!disabled && armed === shot.key}
              onDragStart={(event: DragEvent<HTMLLIElement>) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', shot.key);
                setDragging(shot.key);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
                setArmed(null);
              }}
              onDragOver={event => {
                if (!dragging || dragging === shot.key) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOver(shot.key);
              }}
              onDrop={event => {
                event.preventDefault();
                const moved = dragging ?? event.dataTransfer.getData('text/plain');
                setDragging(null);
                setOver(null);
                setArmed(null);
                if (!moved || moved === shot.key) return;
                // Dropped on a later row: land after it; on an earlier one: before it.
                const from = keys.indexOf(moved);
                const before = from < index ? (keys[index + 1] ?? null) : shot.key;
                onChange({ ...edits, order: moveCutShotBefore(keys, moved, before) });
              }}
              data-active={activeKey === shot.key ? 'true' : undefined}
              className={`flex items-start gap-2 rounded-[var(--radius-md)] border bg-[var(--bg-elevated)] p-1.5 text-xs ${
                over === shot.key
                  ? 'border-[var(--accent-border)] ring-2 ring-[var(--accent-border)]'
                  : activeKey === shot.key
                    ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                    : 'border-[var(--border-subtle)]'
              } ${included ? '' : 'opacity-60'} ${dragging === shot.key ? 'opacity-40' : ''}`}
              data-testid={`${testIdPrefix}-shot-${shot.key}`}
            >
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Drag ${shot.title} to reorder`}
                title="Drag to reorder"
                className={`flex w-6 shrink-0 cursor-grab select-none flex-col items-center self-stretch justify-center rounded-[var(--radius-sm)] text-base text-[var(--text-muted)] hover:bg-[var(--bg-hover)] active:cursor-grabbing ${disabled ? 'pointer-events-none opacity-40' : ''}`}
                data-testid={`${testIdPrefix}-shot-grip-${shot.key}`}
                onPointerDown={() => setArmed(shot.key)}
                onPointerUp={() => setArmed(current => (dragging ? current : null))}
              >
                ⠿<span className="mt-0.5 text-[10px]">{index + 1}</span>
              </span>
              {onPick ? (
                <button
                  type="button"
                  className="shrink-0 rounded-[var(--radius-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  title="Show this shot in the monitor"
                  aria-label={`Show ${shot.title} in the monitor`}
                  data-testid={`${testIdPrefix}-shot-pick-${shot.key}`}
                  onClick={() => onPick(shot.key)}
                >
                  <ShotThumb shot={shot} />
                </button>
              ) : (
                <ShotThumb shot={shot} />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={disabled}
                    aria-label={`Include ${shot.title}`}
                    data-testid={`${testIdPrefix}-shot-include-${shot.key}`}
                    onChange={event => patchShot(shot.key, { include: event.target.checked })}
                  />
                  <span className="font-medium text-[var(--text-primary)]">{shot.title}</span>
                  {tagFor?.(shot) ? (
                    <span className="rounded-full border border-[var(--border-subtle)] px-1.5 text-[10px] text-[var(--text-muted)]">
                      {tagFor(shot)}
                    </span>
                  ) : null}
                  {identity ? (
                    <IdentityMarkChip
                      mark={identity}
                      compact={identity.tone === 'ok'}
                      testId={`${testIdPrefix}-shot-identity-${shot.key}`}
                    />
                  ) : null}
                </div>
                <ShotWords shot={shot} />
                {renderExtra?.(shot)}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {captions ? (
                    <input
                      type="text"
                      maxLength={60}
                      disabled={disabled || !included}
                      aria-label={`Caption for ${shot.title}`}
                      className="min-w-[10rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-primary)]"
                      value={edit?.caption ?? shot.caption ?? shot.title}
                      data-testid={`${testIdPrefix}-shot-caption-${shot.key}`}
                      onChange={event => patchShot(shot.key, { caption: event.target.value })}
                    />
                  ) : null}
                  {shot.kind === 'still' && !holdsLocked ? (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      <input
                        type="number"
                        min={MIN_STILL_HOLD_SEC}
                        max={MAX_STILL_HOLD_SEC}
                        step={0.5}
                        disabled={disabled || !included}
                        aria-label={`Hold for ${shot.title}`}
                        className="w-14 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={edit?.holdSec ?? shot.holdSec ?? 2.5}
                        onChange={event =>
                          patchShot(shot.key, { holdSec: Number(event.target.value) })
                        }
                      />
                      s
                    </label>
                  ) : null}
                  {shot.kind === 'still' ? (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      frame
                      <select
                        disabled={disabled || !included}
                        aria-label={`Framing for ${shot.title}`}
                        title="A closer shot is a crop of the still around her face"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={edit?.framing ?? 'full'}
                        data-testid={`${testIdPrefix}-shot-framing-${shot.key}`}
                        onChange={event =>
                          patchShot(shot.key, {
                            framing:
                              event.target.value === 'medium' || event.target.value === 'close'
                                ? event.target.value
                                : undefined,
                          })
                        }
                      >
                        <option value="full">as shot</option>
                        <option value="medium">waist up</option>
                        <option value="close">chest up</option>
                      </select>
                    </label>
                  ) : null}
                  {shot.kind === 'still' ? (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      move
                      <select
                        disabled={disabled || !included}
                        aria-label={`Motion of ${shot.title}`}
                        title="Slow zoom on this still: push in, pull out, or hold it still"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={edit?.motion ?? ''}
                        data-testid={`${testIdPrefix}-shot-motion-${shot.key}`}
                        onChange={event =>
                          patchShot(shot.key, {
                            motion: (event.target.value || undefined) as
                              'in' | 'out' | 'none' | 'custom' | undefined,
                          })
                        }
                      >
                        <option value="">auto</option>
                        <option value="in">push in</option>
                        <option value="out">pull out</option>
                        <option value="none">hold still</option>
                        <option value="custom">from… to…</option>
                      </select>
                    </label>
                  ) : null}
                  {shot.kind === 'still' && edit?.motion === 'custom' ? (
                    <>
                      {(['moveFrom', 'moveTo'] as const).map(field => (
                        <label
                          key={field}
                          className="flex items-center gap-1 text-[var(--text-muted)]"
                        >
                          {field === 'moveFrom' ? 'from' : 'to'}
                          <select
                            disabled={disabled || !included}
                            aria-label={`${field === 'moveFrom' ? 'Start' : 'End'} framing of ${shot.title}`}
                            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                            value={edit?.[field] ?? (field === 'moveFrom' ? 'whole' : 'centre')}
                            data-testid={`${testIdPrefix}-shot-${field === 'moveFrom' ? 'move-from' : 'move-to'}-${shot.key}`}
                            onChange={event =>
                              patchShot(shot.key, { [field]: event.target.value as CutFraming })
                            }
                          >
                            {CUT_FRAMINGS.map(framing => (
                              <option key={framing.id} value={framing.id}>
                                {framing.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </>
                  ) : null}
                  {shot.kind === 'still' ? null : (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      sound
                      <select
                        disabled={disabled || !included}
                        aria-label={`Sound of ${shot.title}`}
                        title="This clip's sound in the cut (the Lines level applies on top)"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={String(edit?.volume ?? 1)}
                        data-testid={`${testIdPrefix}-shot-volume-${shot.key}`}
                        onChange={event => {
                          const next = Number(event.target.value);
                          patchShot(shot.key, { volume: next === 1 ? undefined : next });
                        }}
                      >
                        <option value="1">as recorded</option>
                        <option value="1.5">louder</option>
                        <option value="0.5">quieter</option>
                        <option value="0">muted</option>
                      </select>
                    </label>
                  )}
                  {shot.kind === 'clip' ? (
                    <>
                      <label className="flex items-center gap-1 text-[var(--text-muted)]">
                        speed
                        <select
                          disabled={disabled || !included}
                          aria-label={`Speed of ${shot.title}`}
                          title="How fast this clip plays — under 1× is smooth slow motion (frames made in between)"
                          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                          value={String(clipSpeed(edit?.speed))}
                          data-testid={`${testIdPrefix}-shot-speed-${shot.key}`}
                          onChange={event => {
                            const next = clipSpeed(Number(event.target.value));
                            patchShot(shot.key, { speed: next === 1 ? undefined : next });
                          }}
                        >
                          {CLIP_SPEEDS.map(speed => (
                            <option key={speed} value={String(speed)}>
                              {speed === 1
                                ? '1× as shot'
                                : speed < 1
                                  ? `${speed}× slow`
                                  : `${speed}× fast`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[var(--text-muted)]">
                        <input
                          type="checkbox"
                          disabled={disabled || !included}
                          checked={edit?.reverse === true}
                          data-testid={`${testIdPrefix}-shot-reverse-${shot.key}`}
                          onChange={event =>
                            patchShot(shot.key, { reverse: event.target.checked || undefined })
                          }
                        />
                        <span title="Play this clip backwards (in the cut; the monitor plays it forwards)">
                          reverse
                        </span>
                      </label>
                      {(['soundLeadSec', 'soundTailSec'] as const).map(field => (
                        <label
                          key={field}
                          className="flex items-center gap-1 text-[var(--text-muted)]"
                        >
                          {field === 'soundLeadSec' ? 'sound in early' : 'sound runs on'}
                          <select
                            disabled={disabled || !included}
                            aria-label={`${field === 'soundLeadSec' ? 'Sound in early' : 'Sound runs on'} for ${shot.title}`}
                            title={
                              field === 'soundLeadSec'
                                ? 'J cut: hear this clip before it is seen, over the shot before (needs a trimmed start)'
                                : 'L cut: keep hearing this clip over the next shot (needs a trimmed end)'
                            }
                            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                            value={String(edit?.[field] ?? 0)}
                            data-testid={`${testIdPrefix}-shot-${field === 'soundLeadSec' ? 'sound-lead' : 'sound-tail'}-${shot.key}`}
                            onChange={event => {
                              const next = Number(event.target.value);
                              patchShot(shot.key, { [field]: next > 0 ? next : undefined });
                            }}
                          >
                            <option value="0">no</option>
                            <option value="0.5">½ s</option>
                            <option value="1">1 s</option>
                            <option value="2">2 s</option>
                            <option value="3">3 s</option>
                          </select>
                        </label>
                      ))}
                    </>
                  ) : null}
                  {index > 0 ? (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      in
                      <select
                        disabled={disabled || !included}
                        aria-label={`How ${shot.title} comes in`}
                        title="How this shot comes in from the one before"
                        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={edit?.transition ?? ''}
                        data-testid={`${testIdPrefix}-shot-transition-${shot.key}`}
                        onChange={event =>
                          patchShot(shot.key, {
                            transition: (event.target.value || undefined) as
                              CutTransitionKind | undefined,
                          })
                        }
                      >
                        <option value="">default</option>
                        {CUT_TRANSITIONS.map(entry => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {shot.kind === 'clip' ? (
                    <ClipTrimInputs
                      url={shot.url}
                      title={shot.title}
                      edit={edit}
                      disabled={disabled || !included}
                      testId={`${testIdPrefix}-shot-trim-${shot.key}`}
                      onChange={patch => patchShot(shot.key, patch)}
                    />
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={isPoster}
                    disabled={disabled || !included}
                    title={
                      shot.kind === 'clip'
                        ? 'Save poster uses a frame of this clip'
                        : 'Save poster uses this still'
                    }
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      isPoster
                        ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    } disabled:opacity-40`}
                    data-testid={`${testIdPrefix}-shot-poster-${shot.key}`}
                    onClick={() =>
                      onChange({
                        ...edits,
                        order: keys,
                        poster: isPoster ? undefined : { key: shot.key },
                      })
                    }
                  >
                    Poster
                  </button>
                  <button
                    type="button"
                    aria-expanded={overlayOpen === shot.key}
                    disabled={disabled || !included}
                    title="A lower third (a name or place) or a picture in a corner of this shot"
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      edit?.lowerThird || edit?.pipUrl
                        ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    } disabled:opacity-40`}
                    data-testid={`${testIdPrefix}-shot-overlay-${shot.key}`}
                    onClick={() => setOverlayOpen(open => (open === shot.key ? null : shot.key))}
                  >
                    Overlay…
                  </button>
                  {overlayOpen === shot.key ? (
                    <div className="basis-full">
                      <CutShotOverlayEditor
                        edit={edit}
                        disabled={disabled}
                        testId={`${testIdPrefix}-shot-overlay-editor-${shot.key}`}
                        onPatch={patch => patchShot(shot.key, patch)}
                      />
                    </div>
                  ) : null}
                  {isPoster && shot.kind === 'clip' ? (
                    <label className="flex items-center gap-1 text-[var(--text-muted)]">
                      frame at
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        disabled={disabled}
                        aria-label={`Poster frame of ${shot.title} (seconds)`}
                        className="w-14 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]"
                        value={edits?.poster?.atSec ?? edit?.trimStartSec ?? 1}
                        data-testid={`${testIdPrefix}-shot-poster-at-${shot.key}`}
                        onChange={event => {
                          const value = Number(event.target.value);
                          onChange({
                            ...edits,
                            order: keys,
                            poster: {
                              key: shot.key,
                              ...(Number.isFinite(value) && value >= 0 ? { atSec: value } : {}),
                            },
                          });
                        }}
                      />
                      s
                    </label>
                  ) : null}
                </div>
              </div>
              {/* 32 px squares: the bare arrows were 9×16 px, too small to tap on a phone. */}
              <span className="flex shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-base text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${shot.title} earlier`}
                  onClick={() => onChange({ ...edits, order: moveCutShot(keys, shot.key, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-base text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={disabled || index === ordered.length - 1}
                  aria-label={`Move ${shot.title} later`}
                  data-testid={`${testIdPrefix}-shot-down-${shot.key}`}
                  onClick={() => onChange({ ...edits, order: moveCutShot(keys, shot.key, 1) })}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "from [0] to [6.2] of 6.2 s": a clip's in and out points (the length is read off the file). */
function ClipTrimInputs({
  url,
  title,
  edit,
  disabled,
  testId,
  onChange,
}: {
  url: string;
  title: string;
  edit?: CutShotEdit;
  disabled?: boolean;
  testId: string;
  onChange: (patch: Pick<CutShotEdit, 'trimStartSec' | 'trimEndSec'>) => void;
}) {
  const [length, setLength] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void probeMediaDurationSec(url, 'video').then(sec => {
      if (!cancelled) setLength(sec);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  const range = clipTrimWindow(edit ?? {}, length);
  const full = length != null ? Math.round(length * 10) / 10 : null;
  const inputClass =
    'w-14 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-[var(--text-primary)]';
  const set = (key: 'trimStartSec' | 'trimEndSec', raw: string) => {
    const value = Number(raw);
    // Back to the clip's own start / end clears the trim.
    const cleared =
      !Number.isFinite(value) ||
      value <= 0 ||
      (key === 'trimEndSec' && full != null && value >= full);
    onChange({ [key]: cleared ? undefined : Math.round(value * 10) / 10 });
  };
  return (
    <span className="flex items-center gap-1 text-[var(--text-muted)]" data-testid={testId}>
      from
      <input
        type="number"
        min={0}
        max={full != null ? Math.max(0, full - MIN_CLIP_TRIM_SEC) : undefined}
        step={0.1}
        disabled={disabled}
        aria-label={`${title} starts at (seconds)`}
        className={inputClass}
        value={range.start}
        data-testid={`${testId}-start`}
        onChange={event => set('trimStartSec', event.target.value)}
      />
      to
      <input
        type="number"
        min={MIN_CLIP_TRIM_SEC}
        max={full ?? undefined}
        step={0.1}
        disabled={disabled}
        aria-label={`${title} ends at (seconds)`}
        className={inputClass}
        value={range.end ?? full ?? ''}
        placeholder="end"
        data-testid={`${testId}-end`}
        onChange={event => set('trimEndSec', event.target.value)}
      />
      {full != null ? `of ${full} s` : 's'}
    </span>
  );
}

/** The shot's picture: the still, or the clip's opening frame (it plays on hover). */
function ShotThumb({ shot }: { shot: KeyedShot }) {
  const box =
    'relative block h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-black';
  if (shot.kind === 'clip' && shot.thumbUrl) {
    return (
      <span className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] text-white">
          ▶ clip
        </span>
      </span>
    );
  }
  if (shot.kind === 'clip') {
    return (
      <span className={box}>
        <video
          src={`${shot.url}#t=0.1`}
          muted
          playsInline
          loop
          preload="metadata"
          className="h-full w-full object-cover"
          onMouseEnter={event => void event.currentTarget.play().catch(() => undefined)}
          onMouseLeave={event => event.currentTarget.pause()}
        />
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] text-white">
          ▶ clip
        </span>
      </span>
    );
  }
  return (
    <span className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </span>
  );
}

/** What happens in the shot, and what is said or narrated over it. */
function ShotWords({ shot }: { shot: KeyedShot }) {
  const beat =
    shot.caption?.trim() && shot.caption.trim() !== shot.title ? shot.caption.trim() : '';
  const said = shot.spoken?.trim() ?? '';
  const over = !said ? (shot.narrationText?.trim() ?? '') : '';
  if (!beat && !said && !over) return null;
  return (
    <p className="line-clamp-2 text-[11px] text-[var(--text-secondary)]">
      {beat}
      {said ? (
        <span className="text-[var(--text-primary)]">
          {beat ? ' · ' : ''}“{said}”
        </span>
      ) : null}
      {over ? (
        <span className="italic">
          {beat ? ' · ' : ''}narration: {over}
        </span>
      ) : null}
    </p>
  );
}
