'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import { modelSupportsSessionIdentityLock } from '@/lib/compose-identity-lock';
import type { DetailLevel, DetailLimits } from '@/lib/detail-level';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model-resolution-defaults';
import type { QueueQualityProfile } from '@/lib/queue-quality-profile';
import {
  applySessionRecipeShared,
  latestGenerateLookRecipe,
  type SessionRecipe,
} from '@/lib/session-recipes';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

const ModelResolutionHints = dynamic(() => import('@/components/ModelResolutionHints'), {
  ssr: false,
  loading: () => null,
});

/**
 * Engine quality: Fast is gone — every queue with a model promotes it to Good
 * (resolveQueueQualityProfile). Custom follows the sampler/size chips under More; the
 * system-workflow path resets a global Custom to Good, so it is offered off that path only.
 */
const ENGINE_QUALITY_OPTIONS: Array<{ id: QueueQualityProfile; label: string; title: string }> = [
  {
    id: 'final',
    label: 'Good',
    title: 'Everyday keepers — stronger sampler, medium or larger canvas.',
  },
  { id: 'max', label: 'Best', title: 'Full sampler, largest canvas, and extra polish.' },
  { id: 'followSettings', label: 'Custom', title: 'Use the sampler and canvas size under More.' },
];

export type SharedPrimaryControlsProps = {
  roleplayVariant: boolean;
  shared: SharedToolSettings;
  detailHelp?: string;
  modelLabel: string;
  activeLimits: DetailLimits;
  onDetailChange: (detail: DetailLevel) => void;
  /** What this tool queues with (tool override, else global; Fast shows as Good). */
  effectiveQualityProfile: QueueQualityProfile;
  onEngineQualityChange: (profile: QueueQualityProfile) => void;
  /** Set when the choice differs from other tools — applies it everywhere. */
  onQualityApplyAll?: () => void;
  qualityCaption: string | null;
  allowCustomQuality: boolean;
  /** The tool's Quality preset owns this choice — show it, don't offer the chips. */
  qualitySetBy?: { label: string; hint?: string };
  cloudEngine: boolean;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  onResolutionOrientationChange: (orientation: ResolutionOrientation) => void;
  onResolutionSizeTierChange: (tier: ResolutionSizeTier) => void;
  lastLookRecipe: SessionRecipe | null;
  onRecipesApplied: (next: SharedToolSettings) => void;
  toolId?: string;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
};

export default function SharedPrimaryControls({
  roleplayVariant,
  shared,
  detailHelp,
  modelLabel,
  activeLimits,
  onDetailChange,
  effectiveQualityProfile,
  onEngineQualityChange,
  onQualityApplyAll,
  qualityCaption,
  allowCustomQuality,
  qualitySetBy,
  cloudEngine,
  resolutionOrientation,
  resolutionSizeTier,
  onResolutionOrientationChange,
  onResolutionSizeTierChange,
  lastLookRecipe,
  onRecipesApplied,
  toolId,
  onSharedSettingsChange,
}: SharedPrimaryControlsProps) {
  return (
    <>
      {cloudEngine ? null : (
        <div className="space-y-2" data-testid="engine-quality">
          <FieldLabel hint="How long the render takes and how much polish it gets.">
            Quality
          </FieldLabel>
          {qualitySetBy ? (
            <p
              className="type-caption text-[var(--text-secondary)]"
              data-testid="engine-quality-set-by"
            >
              Set by Quality:{' '}
              <span className="font-medium text-[var(--text-primary)]">{qualitySetBy.label}</span>
              {qualitySetBy.hint ? (
                <span className="block text-[var(--text-muted)]">{qualitySetBy.hint}</span>
              ) : null}
            </p>
          ) : null}
          <div className={qualitySetBy ? 'hidden' : 'flex flex-wrap gap-2'}>
            {ENGINE_QUALITY_OPTIONS.filter(
              option =>
                option.id !== 'followSettings' ||
                allowCustomQuality ||
                effectiveQualityProfile === 'followSettings'
            ).map(option => (
              <ChipButton
                key={option.id}
                active={
                  effectiveQualityProfile === option.id ||
                  (option.id === 'final' && effectiveQualityProfile === 'draft')
                }
                title={option.title}
                onClick={() => onEngineQualityChange(option.id)}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          {qualityCaption ? (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{qualityCaption}</p>
          ) : null}
          {onQualityApplyAll && !qualitySetBy ? (
            <button
              type="button"
              className="ui-text-link type-caption"
              data-testid="engine-quality-apply-all"
              onClick={onQualityApplyAll}
            >
              Use on every tool
            </button>
          ) : null}
        </div>
      )}

      {!roleplayVariant && !cloudEngine ? (
        <ModelResolutionHints
          part="orientation"
          model={shared.model as ComfyImageModel}
          orientation={resolutionOrientation}
          sizeTier={resolutionSizeTier}
          onOrientationChange={onResolutionOrientationChange}
          onSizeTierChange={onResolutionSizeTierChange}
        />
      ) : null}

      {!roleplayVariant ? (
        <div className="space-y-3">
          <FieldLabel
            hint={
              detailHelp ??
              `Limits for ${modelLabel}: up to ${activeLimits.maxSentences} sentences, ~${activeLimits.maxChars} chars.`
            }
          >
            Prompt detail
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: 'Concise', value: 'concise' },
                { label: 'Balanced', value: 'balanced' },
                { label: 'Rich', value: 'rich' },
              ] as const
            ).map(preset => (
              <ChipButton
                key={preset.value}
                active={shared.detail === preset.value}
                onClick={() => onDetailChange(preset.value)}
              >
                {preset.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      {lastLookRecipe && !roleplayVariant ? (
        <div className="space-y-1.5">
          <FieldLabel hint="Newest saved look from a 4–5★ still. Applies the same session stack on every image tool.">
            Last look
          </FieldLabel>
          <ChipButton
            active={false}
            title={lastLookRecipe.label}
            onClick={() => {
              const recipe = latestGenerateLookRecipe() ?? lastLookRecipe;
              const next = applySessionRecipeShared(loadSettingsCache().shared, recipe);
              saveSharedSettings(next, { notify: true });
              onRecipesApplied(next);
            }}
          >
            <span data-testid="last-generate-look" className="truncate">
              {lastLookRecipe.label}
            </span>
          </ChipButton>
        </div>
      ) : null}

      {modelSupportsSessionIdentityLock(shared.model) &&
      toolId !== 'video' &&
      toolId !== 'compose' &&
      shared.ipAdapterImageFilename?.trim() ? (
        <div className="flex flex-wrap items-center gap-2">
          {shared.ipAdapterImageUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shared.ipAdapterImageUrl}
              alt=""
              className="h-8 w-8 rounded-lg object-cover"
              // A purged plate file must not leave a broken-image icon beside the chip.
              onError={event => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
          <span className="type-caption rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--accent-text)]">
            Face locked
          </span>
          <Button
            variant="ghost"
            className="!min-h-8 px-2 type-caption"
            onClick={() => {
              const patch = {
                ipAdapterImageFilename: '',
                ipAdapterImageFilenames: [] as string[],
                ipAdapterImageUrl: '',
                ipAdapterComfyUrl: '',
                ipAdapterSource: undefined,
              };
              if (onSharedSettingsChange) {
                onSharedSettingsChange(patch);
              } else {
                saveSharedSettings({
                  ...loadSettingsCache().shared,
                  ...patch,
                });
              }
            }}
          >
            Clear
          </Button>
        </div>
      ) : null}
    </>
  );
}
