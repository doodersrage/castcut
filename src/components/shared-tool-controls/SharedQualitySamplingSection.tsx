'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  hasModelSamplerOverrides,
  MODEL_SAMPLER_PRESET_OPTIONS,
} from '@/lib/model-sampler-defaults';
import { ANATOMY_GUARD_OPTIONS } from '@/lib/anatomy-guard';
import { RENDER_REALISM_OPTIONS } from '@/lib/render-realism';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';

const ModelRecommenderHints = dynamic(() => import('@/components/ModelRecommenderHints'), {
  ssr: false,
  loading: () => null,
});
const ModelSamplerHints = dynamic(() => import('@/components/ModelSamplerHints'), {
  ssr: false,
  loading: () => null,
});
const ModelResolutionHints = dynamic(() => import('@/components/ModelResolutionHints'), {
  ssr: false,
  loading: () => null,
});

export type SharedQualitySamplingSectionProps = Pick<
  SharedAdvancedSectionsProps,
  | 'cloudEngine'
  | 'samplerOverrides'
  | 'advancedOpenByDefault'
  | 'shared'
  | 'samplerPreset'
  | 'onSamplerPresetChange'
  | 'onSamplerOverridesChange'
  | 'resolutionOrientation'
  | 'resolutionSizeTier'
  | 'onResolutionOrientationChange'
  | 'onResolutionSizeTierChange'
  | 'queueQualityProfile'
  | 'roleplayVariant'
  | 'renderRealismMode'
  | 'anatomyGuardMode'
  | 'recommendFromText'
  | 'onModelChange'
>;

/** What the sampler preset and canvas size do under this tool's quality. */
function samplerSizeEffect(profile: SharedQualitySamplingSectionProps['queueQualityProfile']) {
  if (profile === 'followSettings') {
    return 'Quality is Custom — these are used as set.';
  }
  if (profile === 'max') {
    return 'Quality is Best — it uses the Max sampler and the largest canvas; these apply under Custom.';
  }
  return 'Quality is Good — these act as a minimum (at least Optimized, medium canvas).';
}

/**
 * Sampler & size under More. Queue quality lives at the top of the Engine; render style and
 * anatomy guard are Settings-wide (Settings → Prompt quality) — one line here says which.
 */
export default function SharedQualitySamplingSection({
  cloudEngine,
  samplerOverrides,
  advancedOpenByDefault,
  shared,
  samplerPreset,
  onSamplerPresetChange,
  onSamplerOverridesChange,
  resolutionOrientation,
  resolutionSizeTier,
  onResolutionOrientationChange,
  onResolutionSizeTierChange,
  queueQualityProfile,
  roleplayVariant,
  renderRealismMode,
  anatomyGuardMode,
  recommendFromText,
  onModelChange,
}: SharedQualitySamplingSectionProps) {
  if (cloudEngine) {
    return null;
  }
  const realism = RENDER_REALISM_OPTIONS.find(option => option.id === renderRealismMode)?.label;
  const presetLabel =
    MODEL_SAMPLER_PRESET_OPTIONS.find(option => option.id === samplerPreset)?.label ??
    samplerPreset;
  const anatomy = ANATOMY_GUARD_OPTIONS.find(option => option.id === anatomyGuardMode)?.label;

  return (
    <>
      <CollapsibleSection
        title="Sampler & size"
        summary={`${presetLabel}${hasModelSamplerOverrides(samplerOverrides) ? ' · overrides' : ''} · ${resolutionSizeTier} canvas`}
        defaultOpen={advancedOpenByDefault || queueQualityProfile === 'followSettings'}
        persistKey="shared-quality-sampling"
      >
        <p className="type-caption text-[var(--text-muted)]" data-testid="sampler-size-effect">
          {samplerSizeEffect(queueQualityProfile)}
        </p>
        <ModelSamplerHints
          model={shared.model}
          preset={samplerPreset}
          onPresetChange={onSamplerPresetChange}
          overrides={samplerOverrides}
          onOverridesChange={onSamplerOverridesChange}
        />
        <ModelResolutionHints
          part="size"
          model={shared.model}
          orientation={resolutionOrientation}
          sizeTier={resolutionSizeTier}
          onOrientationChange={onResolutionOrientationChange}
          onSizeTierChange={onResolutionSizeTierChange}
        />
      </CollapsibleSection>

      <p className="type-caption text-[var(--text-muted)]" data-testid="engine-render-style">
        Render style {realism ?? renderRealismMode} · anatomy guard {anatomy ?? anatomyGuardMode}
        {' · '}
        <Link
          href="/settings?tab=comfyui&section=prompt-quality"
          className="text-[var(--accent-text)] underline-offset-2 hover:underline"
        >
          Settings
        </Link>
      </p>

      {roleplayVariant ? null : recommendFromText ? (
        <ModelRecommenderHints
          text={recommendFromText}
          currentModel={shared.model}
          onApplyModel={model => onModelChange(model)}
        />
      ) : null}
    </>
  );
}
