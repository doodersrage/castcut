'use client';

import { FieldLabel } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';

export type FilmCutOptionsValue = {
  crossfadeSec: number;
  audioBedUrl: string;
};

type FilmCutOptionsControlsProps = {
  value: FilmCutOptionsValue;
  onChange: (next: FilmCutOptionsValue) => void;
  disabled?: boolean;
  testIdPrefix?: string;
};

/** Crossfade + audio bed for Day/Story Cut (same contract as Cast Film studio). */
export default function FilmCutOptionsControls({
  value,
  onChange,
  disabled = false,
  testIdPrefix = 'film-cut',
}: FilmCutOptionsControlsProps) {
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-options`}>
      <ToolActionRow>
        <label className="flex items-center gap-2 type-caption text-[var(--text-muted)]">
          <span>Crossfade</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            disabled={disabled}
            className="w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[var(--text-primary)]"
            value={value.crossfadeSec}
            onChange={event =>
              onChange({
                ...value,
                crossfadeSec: Math.min(2, Math.max(0, Number(event.target.value) || 0)),
              })
            }
            data-testid={`${testIdPrefix}-crossfade`}
          />
          <span>s</span>
        </label>
      </ToolActionRow>
      <label className="flex flex-col gap-1">
        <FieldLabel>Audio bed URL (optional)</FieldLabel>
        <input
          type="url"
          disabled={disabled}
          placeholder="https://… or /api/gallery/media/…"
          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 type-body text-[var(--text-primary)]"
          value={value.audioBedUrl}
          onChange={event => onChange({ ...value, audioBedUrl: event.target.value })}
          data-testid={`${testIdPrefix}-audio-bed`}
        />
      </label>
    </div>
  );
}
