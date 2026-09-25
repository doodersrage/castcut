'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { LOOK_PRESETS, type LookPreset } from '@/lib/look-presets';

/**
 * One row of Look presets. Pick one, then load it into the board or use it for today (skip
 * Outfit) — the page used to list the same presets twice, as chips and as "Use X for today".
 */
export default function LookPresetPicker({
  busy = false,
  compact = false,
  onLoad,
  onUseToday,
}: {
  busy?: boolean;
  /** Phone: full-width action buttons. */
  compact?: boolean;
  onLoad: (preset: LookPreset) => void;
  onUseToday: (preset: LookPreset) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = LOOK_PRESETS.find(preset => preset.id === selectedId) ?? null;

  return (
    <div className="space-y-3" data-testid="look-preset-picker">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Look presets">
        {LOOK_PRESETS.map(preset => (
          <ChipButton
            key={preset.id}
            active={selectedId === preset.id}
            disabled={busy}
            title={preset.hint}
            data-testid={`look-preset-${preset.id}`}
            onClick={() => setSelectedId(current => (current === preset.id ? null : preset.id))}
          >
            {preset.label}
          </ChipButton>
        ))}
      </div>
      {selected ? (
        <div
          className="space-y-2 rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-3"
          data-testid="look-preset-selected"
        >
          <p className="type-caption text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{selected.label}</span>
            {selected.hint ? ` — ${selected.hint}` : ''}
          </p>
          <div className={compact ? 'grid gap-2' : 'flex flex-wrap gap-2'}>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              className={compact ? 'w-full justify-center' : undefined}
              data-testid="look-preset-load"
              onClick={() => onLoad(selected)}
            >
              Load into board
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              className={compact ? 'w-full justify-center' : undefined}
              data-testid={`moodboard-preset-day-${selected.id}`}
              onClick={() => onUseToday(selected)}
            >
              Use for today — skip Outfit
            </Button>
          </div>
        </div>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          Pick a preset to load its tiles, or use it straight for today&rsquo;s Day.
        </p>
      )}
    </div>
  );
}
