'use client';

import { Button } from '@/components/ui/Button';
import { normalizeShotGrade, type ShotGrade } from '@/lib/video/cut-look';

/** The four hand controls: what each is called, its range and its neutral value. */
const CONTROLS: ReadonlyArray<{
  field: keyof ShotGrade;
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
  show: (value: number) => string;
}> = [
  {
    field: 'exposure',
    label: 'Exposure',
    min: -1,
    max: 1,
    step: 0.05,
    neutral: 0,
    show: value => `${value > 0 ? '+' : ''}${value.toFixed(2)} stop`,
  },
  {
    field: 'contrast',
    label: 'Contrast',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    neutral: 1,
    show: value => `${Math.round(value * 100)}%`,
  },
  {
    field: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 2,
    step: 0.05,
    neutral: 1,
    show: value => `${Math.round(value * 100)}%`,
  },
  {
    field: 'warmth',
    label: 'Warmth',
    min: -1,
    max: 1,
    step: 0.05,
    neutral: 0,
    show: value =>
      value === 0
        ? 'neutral'
        : value > 0
          ? `warm ${value.toFixed(2)}`
          : `cool ${(-value).toFixed(2)}`,
  },
];

/**
 * One shot's colour correction in Cut's shot list: exposure, contrast, saturation and warmth,
 * under the film's look (cut-look.ts). The monitor shows it as you drag; the render applies the
 * same matrix.
 */
export default function CutShotColour({
  title,
  grade,
  disabled,
  testId,
  onChange,
  copied,
  onCopy,
  onPasteAll,
  matchedTo,
  onMatchTo,
}: {
  title: string;
  grade: ShotGrade | undefined;
  disabled?: boolean;
  testId: string;
  onChange: (grade: ShotGrade | undefined) => void;
  /** The colour copied from a shot (Copy), ready to paste here; null: nothing copied. */
  copied?: ShotGrade | null;
  onCopy?: (grade: ShotGrade | null) => void;
  /** Paste the copied colour on every shot. */
  onPasteAll?: () => void;
  /** This shot is the one Match shots matches the others to. */
  matchedTo?: boolean;
  onMatchTo?: (on: boolean) => void;
}) {
  const current = normalizeShotGrade(grade);
  const set = (field: keyof ShotGrade, value: number) =>
    onChange(normalizeShotGrade({ ...current, [field]: value }) ?? undefined);
  return (
    <details className="group" data-testid={testId}>
      <summary
        className="cursor-pointer list-none text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        title="This shot's own colour — under the film's look"
      >
        colour{current ? ' · set' : ''}
      </summary>
      <div className="mt-1 grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2 sm:grid-cols-2">
        {CONTROLS.map(control => {
          const value = current?.[control.field] ?? control.neutral;
          return (
            <label key={control.field} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[var(--text-muted)]">{control.label}</span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                disabled={disabled}
                aria-label={`${control.label} of ${title}`}
                aria-valuetext={control.show(value)}
                className="min-w-0 flex-1"
                data-testid={`${testId}-${control.field}`}
                onChange={event => set(control.field, Number(event.target.value))}
                onDoubleClick={() => set(control.field, control.neutral)}
              />
              <span className="w-20 shrink-0 text-right tabular-nums text-[var(--text-secondary)]">
                {control.show(value)}
              </span>
            </label>
          );
        })}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {onCopy ? (
            <Button
              variant="underline"
              size="sm"
              disabled={disabled}
              data-testid={`${testId}-copy`}
              title="Copy this shot's colour, to paste on others"
              onClick={() => onCopy(current)}
            >
              Copy
            </Button>
          ) : null}
          {onCopy && copied !== undefined && copied !== null ? (
            <>
              <Button
                variant="underline"
                size="sm"
                disabled={disabled}
                data-testid={`${testId}-paste`}
                onClick={() => onChange(copied)}
              >
                Paste
              </Button>
              {onPasteAll ? (
                <Button
                  variant="underline"
                  size="sm"
                  disabled={disabled}
                  data-testid={`${testId}-paste-all`}
                  onClick={onPasteAll}
                >
                  Paste to all shots
                </Button>
              ) : null}
            </>
          ) : null}
          {onMatchTo ? (
            <label
              className="flex items-center gap-1 text-[var(--text-muted)]"
              title="Match shots moves every other shot's colour toward this one's, instead of the film's middle"
            >
              <input
                type="checkbox"
                checked={matchedTo === true}
                disabled={disabled}
                data-testid={`${testId}-match-to`}
                onChange={event => onMatchTo(event.target.checked)}
              />
              Match the others to this shot
            </label>
          ) : null}
        </div>
        <div className="sm:col-span-2 flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Double-click a slider to reset it.</span>
          <Button
            variant="underline"
            size="sm"
            disabled={disabled || !current}
            data-testid={`${testId}-reset`}
            onClick={() => onChange(undefined)}
          >
            As shot
          </Button>
        </div>
      </div>
    </details>
  );
}
