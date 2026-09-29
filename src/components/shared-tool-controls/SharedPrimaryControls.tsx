'use client';

import { Button } from '@/components/ui/Button';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import { modelSupportsSessionIdentityLock } from '@/lib/compose-identity-lock';
import type { DetailLevel, DetailLimits } from '@/lib/detail-level';
import {
  QUEUE_QUALITY_PROFILE_OPTIONS,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import {
  applySessionRecipeShared,
  latestGenerateLookRecipe,
  type SessionRecipe,
} from '@/lib/session-recipes';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

export type SharedPrimaryControlsProps = {
  roleplayVariant: boolean;
  shared: SharedToolSettings;
  detailHelp?: string;
  modelLabel: string;
  activeLimits: DetailLimits;
  onDetailChange: (detail: DetailLevel) => void;
  queueQualityProfile: QueueQualityProfile;
  onQueueQualityProfileChange: (profile: QueueQualityProfile) => void;
  systemPathActive: boolean;
  systemQualityHint: string | null;
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
  queueQualityProfile,
  onQueueQualityProfileChange,
  systemPathActive,
  systemQualityHint,
  lastLookRecipe,
  onRecipesApplied,
  toolId,
  onSharedSettingsChange,
}: SharedPrimaryControlsProps) {
  return (
    <>
      {!roleplayVariant ? (
        <div className="space-y-2">
          <FieldLabel hint="How long the render takes and how much polish it gets.">
            Quality
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {QUEUE_QUALITY_PROFILE_OPTIONS.filter(option => option.id !== 'followSettings').map(
              option => (
                <ChipButton
                  key={option.id}
                  active={queueQualityProfile === option.id}
                  onClick={() => onQueueQualityProfileChange(option.id)}
                >
                  {option.label}
                </ChipButton>
              )
            )}
          </div>
          {systemPathActive && systemQualityHint ? (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{systemQualityHint}</p>
          ) : null}
        </div>
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
