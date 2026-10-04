'use client';

import { useId, useState } from 'react';
import FittingAutoReviewToggle from '@/components/fitting/FittingAutoReviewToggle';
import FittingFrontBackToggle from '@/components/fitting/FittingFrontBackToggle';
import { ChipButton, FieldLabel, TextArea } from '@/components/ui/Field';
import QualityPresetSegments from '@/components/ui/QualityPresetSegments';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  OUTFIT_QUALITY_PRESET_OPTIONS,
  type OutfitQualityPreset,
  type OutfitQualityPresetChoice,
} from '@/lib/outfit-quality-preset';
import type { RenderQuality } from '@/lib/render-quality';

const ACCENT = 'rose' as const;

export type OutfitQualityControlsProps = {
  busy?: boolean;
  preset: OutfitQualityPresetChoice;
  onPresetChange: (next: OutfitQualityPreset) => void;
  /** "Good render · Front and back" — what the next try-on will do. */
  summary: string;
  renderQuality: RenderQuality;
  onRenderQualityChange: (next: RenderQuality) => void;
  autoReview: boolean;
  onAutoReviewChange: (next: boolean) => void;
  /** Checks that switched themselves off this session (missing node pack / vision model). */
  checksOff?: string[];
  frontBack: boolean;
  onFrontBackChange: (next: boolean) => void;
  notes: string;
  onNotesChange: (next: string) => void;
  className?: string;
};

/**
 * Outfit's one Quality control — Fast / Balanced / Best in Day's vocabulary — with the two
 * try-on switches, the render quality by hand and the try-on notes under Advanced. Changing a
 * switch there turns the preset into Custom. Desk and phone Outfit render this same row.
 */
export default function OutfitQualityControls({
  busy = false,
  preset,
  onPresetChange,
  summary,
  renderQuality,
  onRenderQualityChange,
  autoReview,
  onAutoReviewChange,
  checksOff = [],
  frontBack,
  onFrontBackChange,
  notes,
  onNotesChange,
  className = '',
}: OutfitQualityControlsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  const label = 'type-caption w-16 shrink-0 text-[var(--text-muted)]';

  return (
    <div className={`space-y-2 ${className}`.trim()} data-testid="fitting-quality-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
        <div className="flex items-center gap-x-2">
          <span className="type-caption shrink-0 text-[var(--text-muted)]">Quality</span>
          <QualityPresetSegments
            label="Quality"
            options={OUTFIT_QUALITY_PRESET_OPTIONS}
            value={preset}
            disabled={busy}
            testId="fitting-quality-preset"
            onChange={onPresetChange}
          />
        </div>
        <button
          type="button"
          className="ui-text-link type-caption"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          data-testid="fitting-quality-advanced"
          onClick={() => setAdvancedOpen(open => !open)}
        >
          Advanced {advancedOpen ? '▴' : '▾'}
        </button>
        <p
          className="type-caption basis-full text-[var(--text-muted)]"
          data-testid="fitting-quality-summary"
        >
          {summary}
        </p>
      </div>
      {advancedOpen ? (
        <div
          id={advancedId}
          className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-3"
          data-testid="fitting-advanced-drawer"
        >
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
            role="group"
            aria-label="Render quality"
          >
            <span className={label}>Render</span>
            <ChipButton
              active={renderQuality === 'good'}
              disabled={busy}
              title="Everyday keepers — stronger sampler, medium or larger canvas."
              data-testid="fitting-render-quality-good"
              onClick={() => onRenderQualityChange('good')}
            >
              Good
            </ChipButton>
            <ChipButton
              active={renderQuality === 'best'}
              disabled={busy}
              title="Full sampler, largest canvas, and extra polish."
              data-testid="fitting-render-quality-best"
              onClick={() => onRenderQualityChange('best')}
            >
              Best
            </ChipButton>
            <span className="type-caption text-[var(--text-muted)]">
              The Engine&rsquo;s quality for try-ons — set by the Quality preset.
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
            <span className={`${label} pt-1`}>Checks</span>
            <div className="min-w-0 flex-1 space-y-2">
              <FittingFrontBackToggle
                enabled={frontBack}
                busy={busy}
                onChange={onFrontBackChange}
              />
              <FittingAutoReviewToggle
                enabled={autoReview}
                busy={busy}
                checksOff={checksOff}
                onChange={onAutoReviewChange}
              />
            </div>
          </div>
          <label className="block space-y-1.5">
            <FieldLabel>Notes for the try-on (optional)</FieldLabel>
            <TextArea
              data-testid="fitting-notes"
              rows={2}
              value={notes}
              disabled={busy}
              className={accentFocusClass(ACCENT)}
              placeholder="e.g. slightly oversized blazer, sneakers untied"
              onChange={event => onNotesChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
