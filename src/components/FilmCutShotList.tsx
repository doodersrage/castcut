'use client';

import { MAX_STILL_HOLD_SEC, MIN_STILL_HOLD_SEC } from '@/lib/character-film';
import { moveCutShot, type CutShotEdits, type KeyedShot } from '@/lib/film-cut-plan';

/**
 * Day / Story shot list: order, leave a shot out, edit its caption (when titles are on), and
 * set a still's hold (unless the length is fitted to the music / a set length).
 */
export default function FilmCutShotList({
  shots,
  edits,
  captions,
  holdsLocked,
  disabled,
  testIdPrefix,
  onChange,
}: {
  shots: KeyedShot[];
  edits?: CutShotEdits;
  captions: boolean;
  holdsLocked: boolean;
  disabled?: boolean;
  testIdPrefix: string;
  onChange: (next: CutShotEdits) => void;
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
        {holdsLocked ? '' : ', hold'}
      </p>
      <ol className="space-y-1">
        {ordered.map((shot, index) => {
          const edit = edits?.shots?.[shot.key];
          const included = edit?.include !== false;
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
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  className="ui-text-link px-1"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${shot.title} earlier`}
                  onClick={() => onChange({ ...edits, order: moveCutShot(keys, shot.key, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="ui-text-link px-1"
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
