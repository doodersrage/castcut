'use client';

import { ChipButton } from '@/components/ui/Field';
import {
  formatRenderRealismHint,
  RENDER_REALISM_OPTIONS,
  type RenderRealismMode,
} from '@/lib/render-realism';

type RenderRealismHintsProps = {
  mode: RenderRealismMode;
  onModeChange: (mode: RenderRealismMode) => void;
};

export default function RenderRealismHints({ mode, onModeChange }: RenderRealismHintsProps) {
  const activeOption =
    RENDER_REALISM_OPTIONS.find(option => option.id === mode) ?? RENDER_REALISM_OPTIONS[0];

  return (
    <div className="rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2.5">
      <div className="min-w-0 space-y-2">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-[var(--tint-success-text)]">Render style on queue</p>
          <p className="text-xs text-[var(--text-secondary)]">{formatRenderRealismHint(mode)}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {RENDER_REALISM_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={mode === option.id}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
      </div>
      <p className="mt-2 type-caption text-[var(--text-muted)]">{activeOption.description}</p>
      <p className="mt-1.5 type-caption text-[var(--text-muted)]">
        Auto-adjusts positive and negative prompts when you Queue or copy a prompt pair. Flux-family
        models receive style cues in the positive prompt.
      </p>
    </div>
  );
}
