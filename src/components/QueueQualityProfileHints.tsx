'use client';

import { useState } from 'react';
import { ChipButton } from '@/components/ui/Field';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import {
  normalizeResolutionSizeTier,
  type ResolutionSizeTier,
} from '@/lib/model-resolution-defaults';
import {
  formatQueuePipelineStatusNotes,
  formatQueueQualityProfileHint,
  QUEUE_QUALITY_PROFILE_OPTIONS,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import { resolveUpscaleModelFilename } from '@/lib/model-upscale-map';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { rememberedSamplerOverrides } from '@/lib/sampler-memory';
import { toolQueueQualityLabel } from '@/lib/tool-quality-profiles';
import { describeSystemWorkflowChoice } from '@/lib/system-workflow-runtime';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';

type QueueQualityProfileHintsProps = {
  profile: QueueQualityProfile;
  samplerPreset: ModelSamplerPresetTier;
  resolutionSizeTier: ResolutionSizeTier;
  onProfileChange: (profile: QueueQualityProfile) => void;
  toolId?: string;
  toolProfile?: QueueQualityProfile;
  onToolProfileChange?: (profile: QueueQualityProfile | undefined) => void;
};

export default function QueueQualityProfileHints({
  profile,
  samplerPreset,
  resolutionSizeTier,
  onProfileChange,
  toolId,
  toolProfile,
  onToolProfileChange,
}: QueueQualityProfileHintsProps) {
  const [settingsTick, setSettingsTick] = useState(0);
  void settingsTick;
  const heldCount = useHeldMaxCount();
  const shared = loadSettingsCache().shared;
  const neuralUpscaleAvailable = Boolean(
    resolveUpscaleModelFilename(shared.model, { upscaleMap: shared.modelUpscaleMap })
  );
  const effectiveProfile = resolveQueueQualityProfile({
    global: profile,
    model: shared.model,
  });
  const hintOptions = { neuralUpscaleAvailable, model: shared.model };
  const activeOption =
    QUEUE_QUALITY_PROFILE_OPTIONS.find(option => option.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];
  const effectiveGlobal = formatQueueQualityProfileHint(
    effectiveProfile,
    normalizeModelSamplerPresetTier(samplerPreset),
    normalizeResolutionSizeTier(resolutionSizeTier),
    hintOptions
  );
  const draftBumped =
    profile === 'draft' &&
    effectiveProfile === 'final' &&
    (/^qwen-rapid-aio-/i.test(shared.model) || /^qwen-image-2512$/i.test(shared.model));
  const hasSamplerMemory = Object.keys(rememberedSamplerOverrides(shared.model)).length > 0;
  const systemChoice =
    shared.useSystemWorkflows === true
      ? describeSystemWorkflowChoice(
          shared.model,
          loadComfyWorkflowFiles(),
          readCachedComfyObjectInfoModels(),
          {
            preferI2v:
              getComfyModelDefinition(shared.model)?.category === 'video' &&
              Boolean(loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).initImageUrl?.trim()),
            tool: toolId,
          }
        )
      : null;
  const pipelinePreview = formatQueuePipelineStatusNotes({
    model: shared.model,
    qualityProfile: effectiveProfile,
    tool: toolId,
    samplerMemory: hasSamplerMemory,
    systemWorkflowSource: systemChoice?.source,
    systemWorkflowLabel:
      systemChoice?.source === 'pack' ? systemChoice.label : systemChoice?.display,
  });
  const effectiveForTool = toolId
    ? formatQueueQualityProfileHint(
        resolveQueueQualityProfile({
          tool: toolId,
          global: profile,
          toolProfiles: toolProfile ? { [toolId]: toolProfile } : undefined,
          model: shared.model,
        }),
        normalizeModelSamplerPresetTier(samplerPreset),
        normalizeResolutionSizeTier(resolutionSizeTier),
        hintOptions
      )
    : null;

  return (
    <div className="ui-panel-accent px-3 py-2.5">
      <div className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="type-caption text-[var(--accent-text)]">Queue quality profile</p>
          <p className="break-words text-xs text-[var(--text-secondary)]">
            {effectiveGlobal ??
              'Uses sidebar KSampler preset and resolution settings when queueing.'}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          {QUEUE_QUALITY_PROFILE_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={profile === option.id}
              onClick={() => onProfileChange(option.id)}
              className="w-full justify-center px-2"
            >
              {option.id === 'draft' && draftBumped ? 'Fast → Good' : option.label}
            </ChipButton>
          ))}
        </div>
        {draftBumped ? (
          <p className="type-caption text-[var(--text-muted)]">
            Fast queues as Good on this model so its polish pass runs.
          </p>
        ) : null}

        {pipelinePreview.length > 0 || heldCount > 0 ? (
          <div className="space-y-1.5">
            <p className="type-caption text-[var(--text-tertiary)]">Pipeline preview</p>
            <div className="flex flex-wrap gap-1.5">
              {pipelinePreview.map(note => (
                <span
                  key={note}
                  className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[11px] text-[var(--accent-text)]"
                >
                  {note}
                </span>
              ))}
              {heldCount > 0 ? (
                <a
                  href="/queue"
                  className="rounded-md border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2 py-0.5 text-[11px] text-[var(--tint-warning-text)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {heldCount} Best held
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <ChipButton
            active={shared.holdMaxUntilIdle === true}
            onClick={() => {
              const next = loadSettingsCache().shared;
              saveSharedSettings({
                ...next,
                holdMaxUntilIdle: next.holdMaxUntilIdle !== true,
              });
              setSettingsTick(value => value + 1);
            }}
          >
            Hold Best until idle
          </ChipButton>
          {shared.holdMaxUntilIdle ? (
            <span className="type-caption text-[var(--text-muted)]">
              Best waits for an empty ComfyUI queue
            </span>
          ) : null}
        </div>
      </div>

      {toolId && onToolProfileChange ? (
        <div className="mt-3 space-y-2 border-t border-[var(--accent-border)] pt-3">
          <p className="type-caption text-[var(--accent-text)]">
            {toolQueueQualityLabel(toolId)} override
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-1.5">
            <ChipButton
              active={!toolProfile}
              onClick={() => onToolProfileChange(undefined)}
              className="w-full justify-center px-2"
            >
              Use global
            </ChipButton>
            {QUEUE_QUALITY_PROFILE_OPTIONS.filter(option => option.id !== 'followSettings').map(
              option => (
                <ChipButton
                  key={`tool-${option.id}`}
                  active={toolProfile === option.id}
                  onClick={() => onToolProfileChange(option.id)}
                  className="w-full justify-center px-2"
                >
                  {option.label}
                </ChipButton>
              )
            )}
          </div>
          {effectiveForTool && toolProfile ? (
            <p className="type-caption text-[var(--text-muted)]">{effectiveForTool}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 type-caption text-[var(--text-muted)]">{activeOption.description}</p>
      <p className="mt-1.5 type-caption text-[var(--text-muted)]">
        {/^qwen-rapid-aio-/i.test(shared.model) ? (
          <>
            Rapid AIO: Fast queues as Good so moiré polish runs. Best uses 10-step sgm_uniform plus
            short anti-moiré cues; Good uses soft blur only, Best adds a mild bicubic resample.
            Output upscale is skipped (it re-amplifies screen-door).
          </>
        ) : /qwen-image-2512-lightning/i.test(shared.model) ? (
          <>
            Qwen 2512 Lightning: CFG-1 short negatives. Fast/Good/Best all skip output upscale
            (Lanczos and UltraSharp make wet streets and skin look hard). Good/Best add a soft blur
            after decode instead. Gallery Upscale/Refine are disabled — re-queue with a new seed.
          </>
        ) : /lightning-(4|8)\b/i.test(shared.model) ? (
          <>
            Lightning: CFG-1 short negatives. Sidebar ARs stick to 1:1 / 3:4 / 4:3 (extreme
            9:16/16:9 softens). Edit Lightning T2I skips Lanczos; Compose I2I keeps a light pass.
            Gallery Upscale/Refine are disabled — re-queue with a new seed instead.
          </>
        ) : /^qwen-image-2512$/i.test(shared.model) ? (
          <>
            Vanilla 2512: Fast queues as Good. Good/Best bump sampler steps and use Lanczos-only
            image upscale (~1.25× chroma guard — no neural 4×). Latent detail hires-fix is off — it
            melted anatomy on hard poses.
          </>
        ) : (
          <>
            Fast favors speed; Good and Best bump sampler steps and resolution. Flux Good/Best may
            insert a soft latent detail pass; SDXL may insert a refiner. When an upscale model is
            mapped, Good/Best run <span className="text-[var(--text-muted)]">UpscaleModel</span>{' '}
            then area-scale to ~1.25×/1.5× (Best may add Lanczos polish + sharpen); otherwise
            Lanczos <span className="text-[var(--text-muted)]">ImageScale</span> before SaveImage.
          </>
        )}
      </p>
    </div>
  );
}
