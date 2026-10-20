'use client';

import { ChipButton } from '@/components/ui/Field';
import {
  editStrengthUsesDenoiseBands,
  formatTurboEditStrengthHint,
  resolveEditStrengthDenoise,
  TURBO_EDIT_STRENGTH_OPTIONS,
  usesTurboEditStrengthUi,
  type TurboEditStrength,
} from '@/lib/engine/turbo-edit-strength';
import { isBooguEditTurboModel, isZImageTurboModel } from '@/lib/model/denoise-defaults';
import { isKleinDistilledModel } from '@/lib/model/sampler-defaults';

type TurboEditStrengthControlsProps = {
  model?: string | null;
  tool?: string;
  value?: TurboEditStrength;
  onChange: (value: TurboEditStrength) => void;
};

export default function TurboEditStrengthControls({
  model,
  tool,
  value = 'balanced',
  onChange,
}: TurboEditStrengthControlsProps) {
  if (!usesTurboEditStrengthUi(model, tool)) {
    return null;
  }

  const hint = formatTurboEditStrengthHint(model, value, tool);
  const showDenoise = editStrengthUsesDenoiseBands(model, tool);
  const title = isZImageTurboModel(model)
    ? 'Z-Image Turbo edit strength'
    : isBooguEditTurboModel(model)
      ? 'Boogu Edit Turbo strength'
      : isKleinDistilledModel(String(model ?? ''))
        ? 'Klein Distilled edit strength'
        : 'Edit strength';

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--text-primary)]">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {TURBO_EDIT_STRENGTH_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={value === option.id}
              title={option.hint}
              onClick={() => onChange(option.id)}
            >
              {showDenoise
                ? `${option.label} ${resolveEditStrengthDenoise(model, option.id, tool).toFixed(2)}`
                : option.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        {TURBO_EDIT_STRENGTH_OPTIONS.find(option => option.id === value)?.hint} {hint}
      </p>
    </div>
  );
}
