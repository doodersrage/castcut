'use client';

import CompactDraftSavesStatus from '@/components/settings/CompactDraftSavesStatus';
import ToolQualityProfilesSettings from '@/components/settings/ToolQualityProfilesSettings';
import SettingsLoaderMapsPanel from '@/components/settings/panels/SettingsLoaderMapsPanel';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  QUEUE_BEHAVIOR_PROFILES,
  applyQueueBehaviorProfile,
  detectQueueBehaviorProfile,
  type QueueBehaviorProfileId,
} from '@/lib/queue-behavior-profiles';
import { SETTINGS_TOOL_ACCENT } from '@/components/settings/tabs/settings-tool-shared';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsWorkflowPatchingPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  modelCheckpointMapText: string;
  setModelCheckpointMapText: (value: string) => void;
  modelVaeMapText: string;
  setModelVaeMapText: (value: string) => void;
  modelRefinerMapText: string;
  setModelRefinerMapText: (value: string) => void;
  modelUpscaleMapText: string;
  setModelUpscaleMapText: (value: string) => void;
  modelControlNetMapText: string;
  setModelControlNetMapText: (value: string) => void;
  modelLoraMapText: string;
  setModelLoraMapText: (value: string) => void;
  loaderMapMergeHint: string | null;
  workflowHealthRefresh: number;
  applySuggestedLoaderMaps: () => void;
  syncLoaderMapsFromComfyInventory: () => void | Promise<void>;
};

export default function SettingsWorkflowPatchingPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  modelCheckpointMapText,
  setModelCheckpointMapText,
  modelVaeMapText,
  setModelVaeMapText,
  modelRefinerMapText,
  setModelRefinerMapText,
  modelUpscaleMapText,
  setModelUpscaleMapText,
  modelControlNetMapText,
  setModelControlNetMapText,
  modelLoraMapText,
  setModelLoraMapText,
  loaderMapMergeHint,
  workflowHealthRefresh,
  applySuggestedLoaderMaps,
  syncLoaderMapsFromComfyInventory,
}: SettingsWorkflowPatchingPanelProps) {
  const activeProfile = detectQueueBehaviorProfile(sharedSettings);

  const applyProfile = (id: QueueBehaviorProfileId) => {
    const patch = applyQueueBehaviorProfile(id);
    if (patch) {
      updateSharedSettings(patch);
    }
  };

  return (
    <ToolSection id="settings-comfyui-workflow-patching" title="Workflow patching & checkpoints">
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        Queue behavior for imported workflows. Most Play users want{' '}
        <strong className="font-medium">Reliable</strong> — Heal &amp; Sync handle the maps.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {QUEUE_BEHAVIOR_PROFILES.map(profile => {
          const selected = activeProfile === profile.id;
          return (
            <Button
              key={profile.id}
              type="button"
              variant={selected ? 'primary' : 'secondary'}
              size="sm"
              disabled={!sharedMounted}
              onClick={() => applyProfile(profile.id)}
              title={profile.description}
            >
              {profile.label}
              {selected ? ' ✓' : ''}
            </Button>
          );
        })}
        {activeProfile === null ? (
          <span className="self-center text-xs text-[var(--text-muted)]">Custom mix</span>
        ) : null}
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
        {
          QUEUE_BEHAVIOR_PROFILES.find(profile => profile.id === (activeProfile ?? 'reliable'))
            ?.description
        }
      </p>

      <label className="mb-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={sharedSettings.autoSyncLoaderMaps !== false}
          onChange={event => updateSharedSettings({ autoSyncLoaderMaps: event.target.checked })}
          disabled={!sharedMounted}
          data-testid="settings-auto-sync-loader-maps"
          className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium text-[var(--text-primary)]">
            Map new ComfyUI models automatically
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            When ComfyUI&apos;s model list changes, fill empty checkpoint / VAE / upscale /
            ControlNet map entries from it (what Heal &amp; ready does for maps). Entries that are
            already set are never changed.
          </span>
        </span>
      </label>
      <CollapsibleSection
        title="Expert patch toggles"
        summary="Direct patching, loader sync, optimize, Draft WebP, enrich / refiner / sharpen"
        defaultOpen={false}
        persistKey="settings-expert-patch-toggles"
      >
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.directWorkflowPatching !== false}
            onChange={event =>
              updateSharedSettings({
                directWorkflowPatching: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Direct workflow patching on queue
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Patches latent size and checkpoint/UNET/VAE loader filenames from model defaults.
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.syncWorkflowLoadersToModel === true}
            onChange={event =>
              updateSharedSettings({
                syncWorkflowLoadersToModel: event.target.checked,
              })
            }
            disabled={!sharedMounted || sharedSettings.directWorkflowPatching === false}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Sync loaders to model on queue
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Overwrites hardcoded loader filenames with the target model (Studio profile).
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.workflowQueueOptimize !== false}
            onChange={event =>
              updateSharedSettings({
                workflowQueueOptimize: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Optimize workflows on queue
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Auto-binds missing placeholders on imported workflows before injection.
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.compactDraftSaves !== false}
            onChange={event =>
              updateSharedSettings({
                compactDraftSaves: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Compact Draft saves (WebP when available)
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Draft → WebP-capable save node when installed; Final/Max stay PNG.
            </span>
          </span>
        </label>
        <CompactDraftSavesStatus
          enabled={sharedMounted && sharedSettings.compactDraftSaves !== false}
        />
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.workflowGraphEnrich !== false}
            onChange={event =>
              updateSharedSettings({
                workflowGraphEnrich: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Insert model-sampling nodes on queue
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              FLUX/SD3 sampling + Final/Max polish (refiner / upscale / sharpen).
            </span>
          </span>
        </label>
        {sharedSettings.workflowGraphEnrich !== false ? (
          <div className="mb-4 ml-7 space-y-2 border-l border-[var(--border-subtle)] pl-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowSdxlRefinerEnrich !== false}
                onChange={event =>
                  updateSharedSettings({
                    workflowSdxlRefinerEnrich: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="block text-sm text-[var(--text-secondary)]">
                SDXL refiner pass (Final/Max)
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowNeuralUpscalePolish !== false}
                onChange={event =>
                  updateSharedSettings({
                    workflowNeuralUpscalePolish: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="block text-sm text-[var(--text-secondary)]">
                Lanczos polish after neural upscale (Max)
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowSharpenAfterUpscale === true}
                onChange={event =>
                  updateSharedSettings({
                    workflowSharpenAfterUpscale: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="block text-sm text-[var(--text-secondary)]">
                Subtle sharpen after upscale (Max)
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.useLibraryUpscaleWorkflow === true}
                onChange={event =>
                  updateSharedSettings({
                    useLibraryUpscaleWorkflow: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
              />
              <span className="block text-sm text-[var(--text-secondary)]">
                Prefer library upscale workflows
              </span>
            </label>
            <label className="block space-y-2">
              <span className="block text-sm text-[var(--text-secondary)]">
                Neural upscale tile size (Max)
              </span>
              <input
                type="number"
                min={0}
                max={2048}
                step={64}
                value={sharedSettings.neuralUpscaleTileSize ?? 512}
                onChange={event =>
                  updateSharedSettings({
                    neuralUpscaleTileSize: Number(event.target.value),
                  })
                }
                disabled={!sharedMounted}
                className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
              />
            </label>
          </div>
        ) : null}
        <div className="mb-2 space-y-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">Per-tool queue quality</p>
          <ToolQualityProfilesSettings
            profiles={sharedSettings.toolQueueQualityProfiles ?? {}}
            disabled={!sharedMounted}
            onChange={toolQueueQualityProfiles =>
              updateSharedSettings({ toolQueueQualityProfiles })
            }
          />
        </div>
      </CollapsibleSection>

      <div className="mt-4">
        <SettingsLoaderMapsPanel
          sharedSettings={sharedSettings}
          sharedMounted={sharedMounted}
          updateSharedSettings={updateSharedSettings}
          modelCheckpointMapText={modelCheckpointMapText}
          setModelCheckpointMapText={setModelCheckpointMapText}
          modelVaeMapText={modelVaeMapText}
          setModelVaeMapText={setModelVaeMapText}
          modelRefinerMapText={modelRefinerMapText}
          setModelRefinerMapText={setModelRefinerMapText}
          modelUpscaleMapText={modelUpscaleMapText}
          setModelUpscaleMapText={setModelUpscaleMapText}
          modelControlNetMapText={modelControlNetMapText}
          setModelControlNetMapText={setModelControlNetMapText}
          modelLoraMapText={modelLoraMapText}
          setModelLoraMapText={setModelLoraMapText}
          loaderMapMergeHint={loaderMapMergeHint}
          workflowHealthRefresh={workflowHealthRefresh}
          applySuggestedLoaderMaps={applySuggestedLoaderMaps}
          syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
        />
      </div>
    </ToolSection>
  );
}
