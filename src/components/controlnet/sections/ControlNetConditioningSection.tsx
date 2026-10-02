'use client';

import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import {
  CONTROLNET_ACCENT,
  CONTROLNET_MODES,
} from '@/components/controlnet/controlnet-tool-shared';
import type { ControlNetSlotPreset } from '@/lib/settings-cache';

type Props = {
  mode: ControlNetMode;
  setMode: (mode: ControlNetMode) => void;
  slotStrengths: number[];
  setSlotStrengths: React.Dispatch<React.SetStateAction<number[]>>;
  slotModes: ControlNetMode[];
  setSlotModes: React.Dispatch<React.SetStateAction<ControlNetMode[]>>;
  presets: ControlNetSlotPreset[];
  presetNameDraft: string;
  setPresetNameDraft: (value: string) => void;
  saveSlotPreset: () => void;
  loadSlotPreset: (preset: ControlNetSlotPreset) => void;
  deleteSlotPreset: (id: string) => void;
};

export function ControlNetConditioningSection({
  mode,
  setMode,
  slotStrengths,
  setSlotStrengths,
  presets,
  presetNameDraft,
  setPresetNameDraft,
  saveSlotPreset,
  loadSlotPreset,
  deleteSlotPreset,
}: Props) {
  return (
    <ToolSection title="Conditioning mode">
      <div className="flex flex-wrap gap-2">
        {CONTROLNET_MODES.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setMode(entry.id)}
            // The active style is [data-active] — the old `ui-chip-active` class does not exist, so
            // the chosen mode was never highlighted.
            data-active={mode === entry.id ? 'true' : 'false'}
            aria-pressed={mode === entry.id}
            className="ui-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <FieldLabel htmlFor="controlnet-strength-0" hint="Primary ControlNetApply strength">
          Strength · slot 1 ({slotStrengths[0]!.toFixed(2)})
        </FieldLabel>
        <input
          id="controlnet-strength-0"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={slotStrengths[0]}
          onChange={event =>
            setSlotStrengths(previous => {
              const next = [...previous];
              next[0] = Number(event.target.value);
              return next;
            })
          }
          className={`w-full accent-[var(--accent)] ${accentFocusClass()}`}
        />
      </div>
      <div className="mt-5 space-y-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] p-3">
        <FieldLabel htmlFor="controlnet-preset-name" hint="Saves modes/strengths/text — not images">
          Slot presets
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="controlnet-preset-name"
            value={presetNameDraft}
            onChange={event => setPresetNameDraft(event.target.value)}
            placeholder="e.g. Soft depth stack"
            className={`ui-input min-w-[10rem] flex-1 px-3 py-2 text-sm ${accentFocusClass(CONTROLNET_ACCENT)}`}
          />
          <Button type="button" variant="secondary" size="sm" onClick={saveSlotPreset}>
            Save preset
          </Button>
        </div>
        {presets.length > 0 ? (
          <ul className="space-y-1.5">
            {presets.map(preset => (
              <li
                key={preset.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)]/70 px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                  {preset.name}
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {normalizeControlNetMode(preset.mode ?? 'depth')}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => loadSlotPreset(preset)}
                >
                  Load
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteSlotPreset(preset.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Save the current slot modes and strengths for quick recall.
          </p>
        )}
      </div>
    </ToolSection>
  );
}
