'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  DEFAULT_CAST_PLATE_PREPARE_OPTIONS,
  hasCastPlatePrepareStep,
  type CastPlatePrepareOptions,
  type prepareCastPlate,
} from '@/lib/cast-plate-prepare';
import type { DayPartnerNoun } from '@/lib/day-partner';
import { loadSettingsCache } from '@/lib/settings-cache';

type SendComfyUi = Parameters<typeof prepareCastPlate>[0]['sendComfyUi'];

const STEPS: Array<{ key: keyof CastPlatePrepareOptions; label: string }> = [
  { key: 'stand', label: 'Stand upright' },
  { key: 'baseLayer', label: 'Base layer clothing' },
  { key: 'whiteBackground', label: 'White background' },
];

/**
 * "Prepare plate" on the Cast look plate: one edit to standing, base layer, white — each part a
 * checkbox (all on). Loaded lazily — it owns a ComfyUI queue hook the rest of Cast home never
 * needs.
 */
export default function CastPlatePrepareControl({
  disabled,
  noun,
  onPrepare,
}: {
  disabled: boolean;
  noun: DayPartnerNoun;
  onPrepare: (sendComfyUi: SendComfyUi, options: CastPlatePrepareOptions) => void;
}) {
  const [model] = useState(() => loadSettingsCache().shared.model);
  const actions = usePromptResultActions({ tool: 'fitting', model });
  const [options, setOptions] = useState<CastPlatePrepareOptions>(
    DEFAULT_CAST_PLATE_PREPARE_OPTIONS
  );
  const pronoun = noun === 'man' ? 'him' : noun === 'woman' ? 'her' : 'them';
  const possessive = noun === 'man' ? 'his' : noun === 'woman' ? 'her' : 'their';

  return (
    <div className="space-y-1.5" data-testid="cast-look-plate-prepare-group">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || !hasCastPlatePrepareStep(options)}
        data-testid="cast-look-plate-prepare"
        title={`One edit: stand ${pronoun} up, swap ${possessive} outfit for the plain base layer, plain white behind — Undo puts the old plate back`}
        onClick={() => onPrepare(actions.sendComfyUi, options)}
      >
        Prepare plate
      </Button>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {STEPS.map(step => (
          <label
            key={step.key}
            className="flex items-center gap-1.5 type-caption text-[var(--text-secondary)]"
          >
            <input
              type="checkbox"
              checked={options[step.key]}
              disabled={disabled}
              data-testid={`cast-look-plate-prepare-${step.key}`}
              onChange={event =>
                setOptions(previous => ({ ...previous, [step.key]: event.target.checked }))
              }
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            {step.label}
          </label>
        ))}
      </div>
    </div>
  );
}
