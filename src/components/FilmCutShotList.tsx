'use client';

import { useEffect, useState } from 'react';
import IdentityMarkChip from '@/components/IdentityMarkChip';
import { MAX_STILL_HOLD_SEC, MIN_STILL_HOLD_SEC } from '@/lib/character-film';
import {
  clipTrimWindow,
  MIN_CLIP_TRIM_SEC,
  moveCutShot,
  type CutShotEdit,
  type CutShotEdits,
  type KeyedShot,
} from '@/lib/film-cut-plan';
import { probeMediaDurationSec } from '@/lib/film-cut-media';
import type { IdentityMark } from '@/lib/identity-mark';

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
}) {
  const known = new Set(shots.map(shot => shot.key));
  const rank = new Map((edits?.order ?? []).map((key, index) => [key, index]));
  const ordered = [...shots].sort((a, b) => {
    const ra = rank.get(a.key);
    const rb = rank.get(b.key);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return 0;
  });
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
        Shots — order, leave out{captions ? ', caption' : ''}
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
              className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1 text-xs ${
                included ? '' : 'opacity-60'
              }`}
              data-testid={`${testIdPrefix}-shot-${shot.key}`}
            >
              <input
                type="checkbox"
                checked={included}
                disabled={disabled}
                aria-label={`Include ${shot.title}`}
                data-testid={`${testIdPrefix}-shot-include-${shot.key}`}
                onChange={event => patchShot(shot.key, { include: event.target.checked })}
              />
              <span className="w-5 text-[var(--text-muted)]">{index + 1}.</span>
              <span className="min-w-[5rem] font-medium text-[var(--text-primary)]">
                {shot.title}
                <span className="ml-1 text-[var(--text-muted)]">
                  {shot.kind === 'clip' ? '· clip' : '· still'}
                </span>
              </span>
              {identity ? (
                <IdentityMarkChip
                  mark={identity}
                  compact={identity.tone === 'ok'}
                  testId={`${testIdPrefix}-shot-identity-${shot.key}`}
                />
              ) : null}
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
                    onChange={event => patchShot(shot.key, { holdSec: Number(event.target.value) })}
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
              {/* 32 px squares: the bare arrows were 9×16 px, too small to tap on a phone. */}
              <span className="ml-auto flex gap-0.5">
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
