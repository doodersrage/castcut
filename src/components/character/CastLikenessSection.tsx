'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { activeLook, looksOf, type CharacterRecord } from '@/lib/character-os';
import { DAY_IDENTITY_BARS } from '@/lib/identity-mark';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import {
  compareLookPlates,
  measureLookLikeness,
  PLATE_DRIFT_BELOW,
  unmeasuredLookStills,
  type LookPlateComparison,
} from '@/lib/likeness-measure-client';
import { likenessModelLabel, likenessTrend } from '@/lib/likeness-trend';

const WIDTH = 320;
const HEIGHT = 72;
const PAD = 6;

function dateLabel(day: number): string {
  return new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Cast home → Likeness: each look's face match over time (likeness-trend.ts), with the days a
 * plate was replaced, so a drift after a plate or engine change shows before a film is cut.
 */
export default function CastLikenessSection({
  character,
  entries,
  onRemakePlate,
}: {
  character: CharacterRecord;
  entries: ReadonlyArray<ComfyGalleryEntry>;
  /** Opens the look's plate tools (Generate / Prepare). */
  onRemakePlate?: (lookId: string) => void;
}) {
  const looks = looksOf(character);
  const current = activeLook(character);
  const [measuring, setMeasuring] = useState<{
    lookId: string;
    done: number;
    total: number;
  } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [plates, setPlates] = useState<LookPlateComparison[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const trends = useMemo(
    () =>
      looks
        .map(look => ({
          look,
          trend: likenessTrend({
            characterId: character.id,
            lookId: look.id,
            defaultLookId: current.id,
            entries,
            plateHistory: look.plateHistory,
          }),
          unmeasured: unmeasuredLookStills(entries, {
            characterId: character.id,
            lookId: look.id,
            defaultLookId: current.id,
          }).length,
        }))
        .filter(({ trend, unmeasured }) => trend.points.length > 0 || unmeasured > 0),
    [character.id, current.id, entries, looks]
  );
  if (!trends.length && looks.length < 2) return null;
  const measure = async (lookId: string) => {
    const look = looks.find(item => item.id === lookId);
    if (!look || measuring) return;
    setNote(null);
    setMeasuring({ lookId, done: 0, total: 0 });
    const result = await measureLookLikeness({
      character,
      look,
      defaultLookId: current.id,
      onProgress: (done, total) => setMeasuring({ lookId, done, total }),
    });
    setMeasuring(null);
    setNote(
      result.error
        ? `${look.name}: ${result.error}`
        : `${look.name}: measured ${result.measured} still${result.measured === 1 ? '' : 's'}${result.noFace ? ` (${result.noFace} with no face to read)` : ''}.`
    );
  };

  return (
    <ToolSection
      title="Likeness"
      description={`How much each look's Day stills have looked like ${character.name} (face match). A line that falls after a plate change or an engine switch is the moment to re-make the plate.`}
      data-testid="cast-likeness-section"
    >
      <div className="space-y-5">
        {note ? (
          <p className="type-caption text-[var(--text-secondary)]" data-testid="cast-likeness-note">
            {note}
          </p>
        ) : null}
        {trends.map(({ look, trend, unmeasured }) => {
          const { points } = trend;
          const measureButton =
            unmeasured > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(measuring)}
                data-testid={`cast-likeness-measure-${look.id}`}
                onClick={() => void measure(look.id)}
              >
                {measuring?.lookId === look.id
                  ? `Measuring ${measuring.done} of ${measuring.total || unmeasured}…`
                  : `Measure ${unmeasured} still${unmeasured === 1 ? '' : 's'}`}
              </Button>
            ) : null;
          if (!points.length) {
            return (
              <div key={look.id} className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {look.name}{' '}
                  <span className="type-caption text-[var(--text-muted)]">— no face match yet</span>
                </p>
                {measureButton}
              </div>
            );
          }
          const first = points[0]!.day;
          const last = points.at(-1)!.day;
          const span = Math.max(1, last - first);
          const x = (day: number) =>
            points.length === 1 ? WIDTH / 2 : PAD + ((day - first) / span) * (WIDTH - 2 * PAD);
          // 0.3–0.8 face match fills the height; the warn bar is drawn across.
          const y = (face: number) =>
            PAD + (1 - (Math.min(0.8, Math.max(0.3, face)) - 0.3) / 0.5) * (HEIGHT - 2 * PAD);
          const path = points
            .map(
              (point, index) =>
                `${index ? 'L' : 'M'}${x(point.day).toFixed(1)},${y(point.face).toFixed(1)}`
            )
            .join(' ');
          const latest = points.at(-1)!;
          return (
            <div key={look.id} className="space-y-1.5" data-testid={`cast-likeness-${look.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">{look.name}</p>
                <p className="type-caption text-[var(--text-muted)]">
                  Latest {Math.round(latest.face * 100)}% ({dateLabel(latest.day)},{' '}
                  {likenessModelLabel(latest.model)})
                  {trend.drift
                    ? ` · last stills ${Math.round(trend.drift.recent * 100)}% vs ${Math.round(trend.drift.before * 100)}% before`
                    : ''}
                </p>
              </div>
              {measureButton}
              <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-[72px] w-full max-w-[480px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
                role="img"
                aria-label={`${look.name}: face match from ${Math.round(points[0]!.face * 100)}% to ${Math.round(latest.face * 100)}% over ${points.length} days`}
              >
                <line
                  x1={0}
                  x2={WIDTH}
                  y1={y(DAY_IDENTITY_BARS.warn)}
                  y2={y(DAY_IDENTITY_BARS.warn)}
                  stroke="var(--tint-warning-border)"
                  strokeDasharray="4 3"
                />
                {trend.plateChanges
                  .filter(day => day >= first && day <= last)
                  .map(day => (
                    <line
                      key={day}
                      x1={x(day)}
                      x2={x(day)}
                      y1={0}
                      y2={HEIGHT}
                      stroke="var(--text-muted)"
                      strokeOpacity={0.5}
                    >
                      <title>Plate replaced {dateLabel(day)}</title>
                    </line>
                  ))}
                <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
                {points.map(point => (
                  <circle
                    key={point.day}
                    cx={x(point.day)}
                    cy={y(point.face)}
                    r={3}
                    fill={
                      point.face < DAY_IDENTITY_BARS.warn
                        ? 'var(--tint-warning-text)'
                        : 'var(--accent)'
                    }
                  >
                    <title>
                      {dateLabel(point.day)}: {Math.round(point.face * 100)}% over {point.count}{' '}
                      still
                      {point.count === 1 ? '' : 's'} ({likenessModelLabel(point.model)})
                    </title>
                  </circle>
                ))}
              </svg>
              {trend.warn ? (
                <p
                  className="ui-alert-warning type-caption"
                  data-testid={`cast-likeness-warn-${look.id}`}
                >
                  Recent stills look less like {character.name}.{' '}
                  {onRemakePlate ? (
                    <button
                      type="button"
                      className="ui-text-link"
                      onClick={() => onRemakePlate(look.id)}
                    >
                      Re-make this look&apos;s plate
                    </button>
                  ) : (
                    'Re-make this look’s plate on Overview.'
                  )}
                </p>
              ) : null}
            </div>
          );
        })}
        {looks.length > 1 ? (
          <div className="space-y-1.5" data-testid="cast-likeness-plates">
            <Button
              size="sm"
              variant="ghost"
              disabled={comparing}
              onClick={() => {
                setComparing(true);
                void compareLookPlates(character)
                  .then(setPlates)
                  .finally(() => setComparing(false));
              }}
            >
              {comparing ? 'Comparing plates…' : "Compare the looks' plates"}
            </Button>
            {plates ? (
              <ul className="space-y-0.5 text-sm">
                {plates.map(item => (
                  <li key={item.lookId} className="flex flex-wrap items-center gap-2">
                    <span className="text-[var(--text-primary)]">{item.name}</span>
                    <span
                      className={
                        item.face !== null && item.face < PLATE_DRIFT_BELOW
                          ? 'type-caption text-[var(--tint-warning-text)]'
                          : 'type-caption text-[var(--text-muted)]'
                      }
                    >
                      {item.face === null
                        ? (item.note ?? 'not measured')
                        : `${Math.round(item.face * 100)}% like the Default look${item.face < PLATE_DRIFT_BELOW ? ' — this plate has drifted; re-make it' : ''}`}
                    </span>
                    {item.face !== null && item.face < PLATE_DRIFT_BELOW && onRemakePlate ? (
                      <button
                        type="button"
                        className="ui-text-link type-caption"
                        onClick={() => onRemakePlate(item.lookId)}
                      >
                        Open it
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <p className="type-caption text-[var(--text-muted)]">
          Dashed line: where Day cards start warning ({Math.round(DAY_IDENTITY_BARS.warn * 100)}%).
          Grey lines: a plate was replaced.
        </p>
      </div>
    </ToolSection>
  );
}
