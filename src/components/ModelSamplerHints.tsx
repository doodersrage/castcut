'use client';

import { useState } from 'react';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import {
  formatKleinSamplerPeopleHint,
  formatModelSamplerHint,
  formatTurboEditSamplerHint,
  formatWanVideoSamplerHint,
  getModelSamplerDefaults,
  hasModelSamplerOverrides,
  MODEL_SAMPLER_PRESET_OPTIONS,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import { formatModelSamplingHint } from '@/lib/model-sampling-patch';
import type { ComfyImageModel } from '@/lib/comfy-models/client';

type OverrideFieldKey = keyof ModelSamplerOverrideFields;

const OVERRIDE_FIELDS: { key: OverrideFieldKey; label: string; placeholder?: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'cfg', label: 'CFG' },
  { key: 'denoise', label: 'Denoise', placeholder: 'auto' },
  { key: 'samplerName', label: 'Sampler' },
  { key: 'scheduler', label: 'Scheduler' },
];

type ModelSamplerHintsProps = {
  model: ComfyImageModel;
  preset: ModelSamplerPresetTier;
  onPresetChange: (preset: ModelSamplerPresetTier) => void;
  overrides?: ModelSamplerOverrideFields;
  onOverridesChange?: (overrides: ModelSamplerOverrideFields) => void;
};

export default function ModelSamplerHints({
  model,
  preset,
  onPresetChange,
  overrides = {},
  onOverridesChange,
}: ModelSamplerHintsProps) {
  const [overridesOpen, setOverridesOpen] = useState(() => hasModelSamplerOverrides(overrides));
  const defaults = getModelSamplerDefaults(model, preset);
  const activeOption =
    MODEL_SAMPLER_PRESET_OPTIONS.find(option => option.id === preset) ??
    MODEL_SAMPLER_PRESET_OPTIONS[0];
  const turboEditHint = formatTurboEditSamplerHint(model);
  const peopleHint =
    formatWanVideoSamplerHint(model, preset) ?? formatKleinSamplerPeopleHint(model, preset);
  const samplingHint = formatModelSamplingHint(model, preset);
  const overridesActive = hasModelSamplerOverrides(overrides);
  const distilledModel = model.includes('lightning') || /rapid-aio/i.test(model);

  const updateOverride = (key: OverrideFieldKey, value: string) => {
    onOverridesChange?.({ ...overrides, [key]: value });
  };

  const resetOverrides = () => {
    onOverridesChange?.({});
    setOverridesOpen(false);
  };

  return (
    <div className="rounded-xl border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-[var(--tint-info-text)]">KSampler preset on queue</p>
          <p className="break-words text-xs text-[var(--text-secondary)]">
            {formatModelSamplerHint(model, preset)}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {MODEL_SAMPLER_PRESET_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={preset === option.id}
              onClick={() => onPresetChange(option.id)}
              className="w-full justify-center px-2"
            >
              {option.id === 'maxCompatible' ? 'Max compat.' : option.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {onOverridesChange ? (
        <div className="mt-3 border-t border-[var(--tint-info-border)] pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] px-1 py-1 text-left text-xs font-medium text-[var(--tint-info-text)] transition hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            aria-expanded={overridesOpen}
            onClick={() => setOverridesOpen(open => !open)}
          >
            <span>
              KSampler overrides
              {overridesActive ? (
                <span className="ui-badge ml-1.5" data-tone="accent" data-size="xs">
                  active
                </span>
              ) : null}
            </span>
            <span className="text-[var(--tint-info-text)]/60" aria-hidden>
              {overridesOpen ? '−' : '+'}
            </span>
          </button>
          {overridesOpen ? (
            <div className="mt-2 space-y-2">
              <p className="type-caption text-[var(--text-muted)]">
                Leave blank to use preset values. Overrides apply on queue and win over gallery
                sampler memory. Denoise blank uses tool defaults (1.0 txt2img, ~0.65 edit, ~0.36
                Z-Image Turbo img2img).
              </p>
              <div className="grid grid-cols-2 gap-2">
                {OVERRIDE_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="min-w-0 space-y-1">
                    <FieldLabel>{label}</FieldLabel>
                    <input
                      value={overrides[key]?.toString() ?? ''}
                      placeholder={
                        placeholder ??
                        (key in defaults
                          ? defaults[key as keyof typeof defaults]?.toString()
                          : '') ??
                        ''
                      }
                      onChange={event => updateOverride(key, event.target.value)}
                      className="ui-input w-full px-2.5 py-1.5 text-sm transition focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    />
                  </div>
                ))}
              </div>
              {distilledModel ? (
                <p className="type-caption text-[var(--tint-warning-text)]/75">
                  Lightning / Rapid models clamp steps and CFG on queue. Denoise override is honored
                  when set.
                </p>
              ) : null}
              {overridesActive ? (
                <button
                  type="button"
                  onClick={resetOverrides}
                  className="text-xs text-[var(--tint-info-text)]/80 transition hover:text-[var(--tint-info-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Reset overrides
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 type-caption text-[var(--text-muted)]">{activeOption.description}</p>
      {turboEditHint ? (
        <p className="mt-1.5 type-caption text-[var(--tint-warning-text)]">{turboEditHint}</p>
      ) : null}
      {peopleHint ? (
        <p className="mt-1.5 type-caption text-[var(--tint-warning-text)]">{peopleHint}</p>
      ) : null}
      {samplingHint ? (
        <p className="mt-1.5 type-caption text-[var(--text-muted)]">{samplingHint}</p>
      ) : null}
      <details className="mt-2 group">
        <summary className="type-caption cursor-pointer list-none text-[var(--text-muted)] transition hover:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] [&::-webkit-details-marker]:hidden">
          <span className="underline decoration-[var(--border-default)] underline-offset-2 group-open:decoration-[var(--text-muted)]">
            How queue patching works
          </span>
        </summary>
        <p className="mt-1.5 type-caption text-[var(--text-muted)]">
          Patches{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{SEED}}`}</code>
          ,{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{STEPS}}`}</code>
          ,{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{CFG}}`}</code>
          ,{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{DENOISE}}`}</code>
          ,{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{SAMPLER}}`}</code>
          ,{' '}
          <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--tint-info-text)]/90">{`{{SCHEDULER}}`}</code>
          , and Flux shift placeholders — or writes directly into sampler nodes.
          {defaults.fixedSeed == null
            ? ' Seed is randomized per job unless pinned in advanced queue params.'
            : null}
        </p>
      </details>
    </div>
  );
}
