'use client';

import { ToolSection, CollapsibleSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<SettingsComfyConnectionPanelProps, 'settings' | 'updateSettings' | 'setStatus'>;

export function SettingsComfyConnectionAutoImproveSection({
  settings,
  updateSettings,
  setStatus,
}: Props) {
  const applyCalm = () => {
    updateSettings({
      autoRequeueFinalOnHighRating: true,
      autoRequeueMaxOnFiveStar: false,
      autoImg2imgRefineOnFiveStar: false,
      autoMutateOnHighRating: false,
      autoSeedExperimentOnHighRating: false,
      autoRefineOnLowRating: true,
    });
    setStatus('Auto-improve preset: calm (Final on 4–5★, Max off).');
  };
  const applyAggressive = () => {
    updateSettings({
      autoRequeueFinalOnHighRating: true,
      autoRequeueMaxOnFiveStar: true,
      autoImg2imgRefineOnFiveStar: false,
      autoMutateOnHighRating: false,
      autoSeedExperimentOnHighRating: false,
      autoRefineOnLowRating: true,
    });
    setStatus('Auto-improve preset: aggressive (Final + Max).');
  };
  const applyOff = () => {
    updateSettings({
      autoRequeueFinalOnHighRating: false,
      autoRequeueMaxOnFiveStar: false,
      autoImg2imgRefineOnFiveStar: false,
      autoMutateOnHighRating: false,
      autoSeedExperimentOnHighRating: false,
      autoRefineOnLowRating: false,
    });
    setStatus('Auto-improve disabled.');
  };

  const isOff =
    settings.autoRequeueFinalOnHighRating === false &&
    settings.autoRequeueMaxOnFiveStar === false &&
    settings.autoImg2imgRefineOnFiveStar !== true &&
    settings.autoMutateOnHighRating !== true &&
    settings.autoSeedExperimentOnHighRating !== true &&
    settings.autoRefineOnLowRating === false;

  const isCalm =
    !isOff &&
    settings.autoRequeueFinalOnHighRating !== false &&
    settings.autoRequeueMaxOnFiveStar === false &&
    settings.autoImg2imgRefineOnFiveStar !== true &&
    settings.autoMutateOnHighRating !== true &&
    settings.autoSeedExperimentOnHighRating !== true &&
    settings.autoRefineOnLowRating !== false;

  const isAggressive =
    !isOff &&
    settings.autoRequeueFinalOnHighRating !== false &&
    settings.autoRequeueMaxOnFiveStar !== false &&
    settings.autoImg2imgRefineOnFiveStar !== true &&
    settings.autoMutateOnHighRating !== true &&
    settings.autoSeedExperimentOnHighRating !== true &&
    settings.autoRefineOnLowRating !== false;

  return (
    <ToolSection id="settings-comfyui-auto-improve" title="Auto-improve on gallery ratings">
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Rating-driven queue actions. Prefer Calm if you do not want surprise Max jobs.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant={isCalm ? 'primary' : 'secondary'} size="sm" onClick={applyCalm}>
          Calm{isCalm ? ' ✓' : ''}
        </Button>
        <Button
          variant={isAggressive ? 'primary' : 'secondary'}
          size="sm"
          onClick={applyAggressive}
        >
          Aggressive{isAggressive ? ' ✓' : ''}
        </Button>
        <Button variant={isOff ? 'primary' : 'ghost'} size="sm" onClick={applyOff}>
          Off{isOff ? ' ✓' : ''}
        </Button>
        {!isCalm && !isAggressive && !isOff ? (
          <span className="self-center text-xs text-[var(--text-muted)]">Custom mix</span>
        ) : null}
      </div>
      <CollapsibleSection
        title="Expert auto-improve toggles"
        summary="Final / Max / refine / low-star refine checkboxes"
        defaultOpen={false}
        persistKey="settings-expert-auto-improve"
      >
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={settings.autoRequeueFinalOnHighRating !== false}
            onChange={event =>
              updateSettings({ autoRequeueFinalOnHighRating: event.target.checked })
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
          />
          Auto improve 4–5★ → Final (upscale / moiré / Lightning re-seed)
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={settings.autoRequeueMaxOnFiveStar !== false}
            onChange={event => updateSettings({ autoRequeueMaxOnFiveStar: event.target.checked })}
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
          />
          Auto improve 5★ → Max
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={settings.autoImg2imgRefineOnFiveStar === true}
            onChange={event =>
              updateSettings({ autoImg2imgRefineOnFiveStar: event.target.checked })
            }
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
          />
          After 5★ upscale, also queue low-denoise refine (experimental)
        </label>
        <label className="mt-2 flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          <span>Gallery skin refine model</span>
          <select
            className="rounded border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1 text-[var(--text-primary)]"
            value={settings.autoSkinRefineModel ?? 'flux-2-klein-9b'}
            onChange={event => updateSettings({ autoSkinRefineModel: event.target.value })}
            data-testid="settings-gallery-skin-refine-model"
          >
            <option value="flux-2-klein-9b">Klein 9B Base (recommended)</option>
            <option value="qwen-image-edit-2511">Qwen Image Edit 2511 (pose-locked)</option>
            <option value="qwen-image-edit">Qwen Image Edit</option>
            <option value="flux-ultrareal-v4">UltraReal (routes to Klein)</option>
          </select>
          <span className="type-caption text-[var(--text-muted)]">
            Used when you tap Skin refine on a Gallery card. Soft pass rematerializes oily plastic
            skin; UltraReal remaps to Klein on queue.
          </span>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={settings.autoRefineOnLowRating !== false}
            onChange={event => updateSettings({ autoRefineOnLowRating: event.target.checked })}
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
          />
          Auto-open Refine when rated 1–2★
        </label>
      </CollapsibleSection>
    </ToolSection>
  );
}
