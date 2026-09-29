'use client';

import { ChipButton, FieldLabel } from '@/components/ui/Field';
import {
  formatModelResolutionHint,
  getModelResolutionPreset,
  RESOLUTION_ORIENTATION_OPTIONS,
  RESOLUTION_SIZE_TIER_OPTIONS,
  resolutionOrientationsForModel,
  resolutionSizeTiersForModel,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from '@/lib/model-resolution-defaults';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { useEffect } from 'react';

type ModelResolutionHintsProps = {
  model: ComfyImageModel;
  orientation: ResolutionOrientation;
  sizeTier: ResolutionSizeTier;
  onOrientationChange: (orientation: ResolutionOrientation) => void;
  onSizeTierChange: (tier: ResolutionSizeTier) => void;
  /** Engine panel shows aspect up top and canvas size under More; the rest shows both. */
  part?: 'all' | 'orientation' | 'size';
};

export default function ModelResolutionHints({
  model,
  orientation,
  sizeTier,
  onOrientationChange,
  onSizeTierChange,
  part = 'all',
}: ModelResolutionHintsProps) {
  const allowedOrientations = resolutionOrientationsForModel(model);
  const allowedSizeTiers = resolutionSizeTiersForModel(model);
  const orientationOptions = RESOLUTION_ORIENTATION_OPTIONS.filter(option =>
    allowedOrientations.includes(option.id)
  );
  const sizeTierOptions = RESOLUTION_SIZE_TIER_OPTIONS.filter(option =>
    allowedSizeTiers.includes(option.id)
  );

  const effectiveOrientation = allowedOrientations.includes(orientation)
    ? orientation
    : (allowedOrientations[0] ?? 'square');
  const effectiveSizeTier = allowedSizeTiers.includes(sizeTier)
    ? sizeTier
    : (allowedSizeTiers[allowedSizeTiers.length - 1] ?? 'medium');

  useEffect(() => {
    if (effectiveOrientation !== orientation) {
      onOrientationChange(effectiveOrientation);
    }
  }, [effectiveOrientation, orientation, onOrientationChange]);

  useEffect(() => {
    if (effectiveSizeTier !== sizeTier) {
      onSizeTierChange(effectiveSizeTier);
    }
  }, [effectiveSizeTier, sizeTier, onSizeTierChange]);

  const preset = getModelResolutionPreset(model, effectiveOrientation, effectiveSizeTier);
  const activeTier =
    sizeTierOptions.find(option => option.id === effectiveSizeTier) ??
    sizeTierOptions[0] ??
    RESOLUTION_SIZE_TIER_OPTIONS[1];

  if (part === 'orientation') {
    return (
      <div className="space-y-2" data-testid="engine-aspect">
        <FieldLabel
          hint={formatModelResolutionHint(model, effectiveOrientation, effectiveSizeTier)}
        >
          Aspect
        </FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {orientationOptions.map(option => (
            <ChipButton
              key={option.id}
              active={effectiveOrientation === option.id}
              onClick={() => onOrientationChange(option.id)}
              title={option.description}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>
    );
  }

  if (part === 'size') {
    return (
      <div className="space-y-2">
        <FieldLabel hint={`${activeTier.description} · ${preset.width}×${preset.height}px`}>
          Canvas size
        </FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {sizeTierOptions.map(option => (
            <ChipButton
              key={option.id}
              active={effectiveSizeTier === option.id}
              onClick={() => onSizeTierChange(option.id)}
              title={option.description}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-2">
          <div className="min-w-0 space-y-1">
            <p className="type-caption text-[var(--accent-text)]/85">Resolution preset on queue</p>
            <p className="break-words text-xs text-[var(--text-secondary)]">
              {formatModelResolutionHint(model, effectiveOrientation, effectiveSizeTier)}
            </p>
          </div>
          <div
            className={`grid min-w-0 gap-1.5 ${
              orientationOptions.length > 3
                ? 'grid-cols-3 sm:grid-cols-4'
                : orientationOptions.length === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-3'
            }`}
          >
            {orientationOptions.map(option => (
              <ChipButton
                key={option.id}
                active={effectiveOrientation === option.id}
                onClick={() => onOrientationChange(option.id)}
                className="w-full justify-center px-2"
                title={option.description}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="type-caption break-words text-[var(--text-muted)]">
            {activeTier.description} · {preset.width}×{preset.height}px
          </p>
          <div
            className={`grid min-w-0 gap-1.5 ${
              sizeTierOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {sizeTierOptions.map(option => (
              <ChipButton
                key={option.id}
                active={effectiveSizeTier === option.id}
                onClick={() => onSizeTierChange(option.id)}
                className="w-full justify-center px-2"
                title={option.description}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 type-caption break-words text-[var(--text-muted)]">
        Applied to{' '}
        <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--accent-text)]">{`{{WIDTH}}`}</code>{' '}
        and{' '}
        <code className="rounded bg-[var(--bg-muted)]/80 px-1 text-[var(--accent-text)]">{`{{HEIGHT}}`}</code>{' '}
        workflow placeholders unless advanced queue params override them.
      </p>
    </div>
  );
}
