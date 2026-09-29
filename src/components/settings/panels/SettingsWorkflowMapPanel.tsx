'use client';

import { useEffect, useState } from 'react';
import type { ComfyUiSettings } from '@/lib/comfyui-settings';
import { formatModelCheckpointMap, formatModelVaeMap } from '@/lib/model-checkpoint-map';
import { formatModelUpscaleMap } from '@/lib/model-upscale-map';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import {
  countMappedModels,
  mergeModelWorkflowMap,
  suggestWorkflowDefaultsByCategory,
} from '@/lib/workflow-category-defaults';
import {
  loadSettingsCache,
  setUseSystemWorkflowsPref,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import { markOnboardingSystemWorkflowsEnabled } from '@/lib/onboarding-hooks';
import {
  SETTINGS_TOOL_ACCENT,
  formatModelWorkflowMap,
  parseModelWorkflowMap,
} from '@/components/settings/tabs/settings-tool-shared';
import { CollapsibleSection, ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import ModelWorkflowMapTable from '@/components/settings/panels/ModelWorkflowMapTable';
import { useComfyWorkflowFilesSnapshot } from '@/hooks/useComfyWorkflowFilesSnapshot';

const ACCENT = SETTINGS_TOOL_ACCENT;

export type SettingsWorkflowMapPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  settings: ComfyUiSettings;
  modelWorkflowMapText: string;
  setModelWorkflowMapText: (value: string) => void;
  setModelCheckpointMapText: (value: string) => void;
  setModelVaeMapText: (value: string) => void;
  setModelUpscaleMapText: (value: string) => void;
  setWorkflowHealthRefresh: (value: number | ((previous: number) => number)) => void;
  setStatus: (status: string | null) => void;
};

export default function SettingsWorkflowMapPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  settings,
  modelWorkflowMapText,
  setModelWorkflowMapText,
  setModelCheckpointMapText,
  setModelVaeMapText,
  setModelUpscaleMapText,
  setWorkflowHealthRefresh,
  setStatus,
}: SettingsWorkflowMapPanelProps) {
  const [systemWorkflowsSaveHint, setSystemWorkflowsSaveHint] = useState<string | null>(null);
  const [systemWorkflowsSaving, setSystemWorkflowsSaving] = useState(false);
  const workflowFiles = useComfyWorkflowFilesSnapshot();
  const workflowMap = sharedSettings.modelWorkflowMap ?? {};
  const mapKey = JSON.stringify(workflowMap);
  // Health remaps and scaffold helpers write the map directly — keep the text view in step.
  useEffect(() => {
    const current = JSON.parse(mapKey) as Record<string, string>;
    if (JSON.stringify(parseModelWorkflowMap(modelWorkflowMapText)) !== mapKey) {
      setModelWorkflowMapText(formatModelWorkflowMap(current));
    }
    // Only an outside map change should rewrite the text, not typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]);
  const setWorkflowMap = (model: string, workflowId: string | null) => {
    // Apply to the latest saved map: this page's copy can lag the server settings sync.
    const next = { ...(loadSettingsCache().shared.modelWorkflowMap ?? {}) };
    if (workflowId) next[model] = workflowId;
    else delete next[model];
    updateSharedSettings({ modelWorkflowMap: next });
    setModelWorkflowMapText(formatModelWorkflowMap(next));
    setWorkflowHealthRefresh(n => n + 1);
  };
  const mapTable = (automaticLabel: string) => (
    <ModelWorkflowMapTable
      map={workflowMap}
      files={workflowFiles}
      disabled={!sharedMounted}
      automaticLabel={automaticLabel}
      onChange={setWorkflowMap}
    />
  );

  return (
    <ToolSection id="settings-comfyui-workflow-map" title="Model → workflow map">
      <label className="mb-3 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={sharedSettings.useSystemWorkflows === true}
          onChange={event => {
            const enabled = event.target.checked;
            const qualityPatch: Partial<Pick<SharedToolSettings, 'queueQualityProfile'>> =
              enabled &&
              (sharedSettings.queueQualityProfile === 'followSettings' ||
                sharedSettings.queueQualityProfile == null)
                ? { queueQualityProfile: 'final' }
                : {};
            updateSharedSettings({
              useSystemWorkflows: enabled,
              ...qualityPatch,
            });
            void (async () => {
              setSystemWorkflowsSaving(true);
              setSystemWorkflowsSaveHint('Saving…');
              try {
                await setUseSystemWorkflowsPref(enabled, qualityPatch);
                setSystemWorkflowsSaveHint(
                  enabled ? 'Saved — stays on after refresh.' : 'Saved — system workflows off.'
                );
                void import('@/lib/app-toast').then(({ pushAppToast }) => {
                  pushAppToast({
                    text: enabled ? 'Saved — system workflows on' : 'Saved — system workflows off',
                    tone: 'success',
                    ttlMs: 2500,
                  });
                });
              } catch {
                setSystemWorkflowsSaveHint('Could not save. Your browser may be blocking storage.');
                updateSharedSettings({ useSystemWorkflows: !enabled });
                return;
              } finally {
                setSystemWorkflowsSaving(false);
              }
              if (enabled) {
                markOnboardingSystemWorkflowsEnabled();
                setSystemWorkflowsSaveHint('Saved — scanning ComfyUI inventory…');
                const { scanAndAdaptSystemWorkflowInventory } =
                  await import('@/lib/comfyui-runtime-for-model');
                const models = await scanAndAdaptSystemWorkflowInventory({
                  comfyUrl: settings.apiUrl || undefined,
                  persist: true,
                });
                if (!models) {
                  setSystemWorkflowsSaveHint(
                    'Saved — ComfyUI not reachable yet; scaffolds adapt on next queue.'
                  );
                  return;
                }
                const adapted = loadSettingsCache().shared;
                updateSharedSettings({
                  modelCheckpointMap: adapted.modelCheckpointMap,
                  modelVaeMap: adapted.modelVaeMap,
                  modelUpscaleMap: adapted.modelUpscaleMap,
                  modelControlNetMap: adapted.modelControlNetMap,
                });
                setModelCheckpointMapText(formatModelCheckpointMap(adapted.modelCheckpointMap));
                setModelVaeMapText(formatModelVaeMap(adapted.modelVaeMap));
                setModelUpscaleMapText(formatModelUpscaleMap(adapted.modelUpscaleMap));
                setSystemWorkflowsSaveHint('Saved — loader maps adapted from ComfyUI.');
                setWorkflowHealthRefresh(n => n + 1);
              }
            })();
          }}
          disabled={systemWorkflowsSaving}
          className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
        />
        <span className="space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Use system workflows
            </span>
            {!sharedMounted ? (
              <span className="text-xs text-[var(--text-muted)]">Loading saved settings…</span>
            ) : null}
            {systemWorkflowsSaveHint ? (
              <span
                className={`text-xs ${
                  systemWorkflowsSaveHint.startsWith('Could not')
                    ? 'ui-status-danger'
                    : systemWorkflowsSaveHint.startsWith('Saved')
                      ? 'ui-status-success'
                      : 'text-[var(--text-muted)]'
                }`}
                role="status"
                aria-live="polite"
              >
                {systemWorkflowsSaveHint}
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            Queue from the best matching library pack when one scores well, otherwise a built-in
            scaffold. Fast / Good / Best still drive sampler, resolution, and polish (same pipelines
            as Draft / Final / Max). Checkpoint/VAE maps still apply. For FLUX / Qwen / video, hides
            the workflow picker while enabled. Enabling scans ComfyUI inventory and adapts
            checkpoint/VAE/upscale maps.
          </span>
        </span>
      </label>

      {sharedSettings.useSystemWorkflows === true ? (
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.systemWorkflowsLimitPicker !== false}
            onChange={event =>
              updateSharedSettings({
                systemWorkflowsLimitPicker: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Limit picker to FLUX / Qwen / video
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              On (default): snap the model list to system-supported families. Off (hybrid): keep
              SDXL and other models — they use mapped/manual workflows while FLUX/Qwen/video still
              use the system path.
            </span>
          </span>
        </label>
      ) : null}

      {sharedSettings.useSystemWorkflows === true ? (
        <p className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]">
          Explicit model→workflow map entries still win at queue time. When a model has no map
          entry, matching pack graphs in your library are preferred automatically, otherwise a
          built-in scaffold is used. Expand below to pin a model (or Face detail) to a workflow.
        </p>
      ) : (
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          Pin a model to a workflow file below. When you change the target model in a generator, the
          pinned workflow is selected automatically.
        </p>
      )}

      {sharedSettings.useSystemWorkflows !== true ? (
        <>
          <label className="mb-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={sharedSettings.autoSelectWorkflowForModel !== false}
              onChange={event =>
                updateSharedSettings({
                  autoSelectWorkflowForModel: event.target.checked,
                })
              }
              disabled={!sharedMounted}
              className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Auto-select workflow when target model changes
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Uses the map below, or filename-based defaults when no line exists. You can still
                pick a different workflow manually to override for the session.
              </span>
            </span>
          </label>
          <label className="mb-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={sharedSettings.limitModelsToAvailableWorkflows !== false}
              onChange={event =>
                updateSharedSettings({
                  limitModelsToAvailableWorkflows: event.target.checked,
                })
              }
              disabled={!sharedMounted}
              className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] ${accentFocusClass(ACCENT)}`}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Limit model picker to available workflows
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                Generators only list models that have a workflow in your library or assignment map.
                Use &quot;Show all models&quot; in a tool sidebar to override temporarily.
              </span>
            </span>
          </label>
        </>
      ) : null}

      {sharedSettings.useSystemWorkflows === true ? (
        <CollapsibleSection
          title="Library map (advanced)"
          summary={
            sharedSettings.systemWorkflowsLimitPicker === false
              ? 'SDXL/other hybrid maps, FaceDetailer pin, and explicit overrides.'
              : `${Object.keys(sharedSettings.modelWorkflowMap ?? {}).length} pinned model(s) — FaceDetailer pin and explicit overrides.`
          }
          defaultOpen={sharedSettings.systemWorkflowsLimitPicker === false}
          persistKey="settings-system-workflow-map-advanced"
        >
          {mapTable('system workflow')}
          <details className="mt-3">
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Edit as text
            </summary>
            <textarea
              value={modelWorkflowMapText}
              onChange={event => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={4}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`faceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Pin a FaceDetailer/ReActor graph with{' '}
              <code className="ui-inline-code">faceDetailer=&lt;workflowId&gt;</code>.
            </p>
          </details>
        </CollapsibleSection>
      ) : (
        <>
          {mapTable('filename default')}
          <details className="mt-3">
            <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
              Edit as text
            </summary>
            <textarea
              value={modelWorkflowMapText}
              onChange={event => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={6}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`qwen-image-2512=my-qwen-workflow.json\nflux-2-klein=flux-klein-default.json\nfaceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Pin a FaceDetailer/ReActor graph with{' '}
              <code className="ui-inline-code">faceDetailer=&lt;workflowId&gt;</code> (required for
              Gallery → Face detail).
            </p>
          </details>
          <button
            type="button"
            disabled={!sharedMounted}
            onClick={() => {
              const suggested = suggestWorkflowDefaultsByCategory(loadComfyWorkflowFiles());
              const merged = mergeModelWorkflowMap(
                loadSettingsCache().shared.modelWorkflowMap,
                suggested,
                false
              );
              updateSharedSettings({ modelWorkflowMap: merged });
              setModelWorkflowMapText(formatModelWorkflowMap(merged));
              setStatus(
                `Applied ${countMappedModels(merged)} model→workflow mappings from workflow filenames.`
              );
            }}
            className="mt-3 rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Apply smart defaults by category
          </button>
        </>
      )}
    </ToolSection>
  );
}
