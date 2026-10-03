'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import type { CastcutEditorMeta, ComfyApiPrompt } from '@/lib/comfy-editor-graph';
import {
  diffEditorGraphs,
  editorChangeLabel,
  formatEditorValue,
  samplerOverridesFromEditorChanges,
  sortEditorChanges,
  type EditorChange,
} from '@/lib/comfy-editor-diff';
import { pickModelSamplerOverrideFields } from '@/lib/model-sampler-defaults';
import type { SharedToolSettings } from '@/lib/settings-cache';

export type SettingsComfyEditorImportPanelProps = {
  comfyUrl?: string;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
};

type ListedFile = { name: string; modified?: number };

type LoadedFile = {
  name: string;
  meta: CastcutEditorMeta | null;
  changes: EditorChange[];
};

function comfyQuery(comfyUrl: string | undefined, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (comfyUrl?.trim()) params.set('comfyUrl', comfyUrl.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

const OVERRIDE_LABELS: Record<string, string> = {
  samplerName: 'sampler',
  scheduler: 'scheduler',
  steps: 'steps',
  cfg: 'CFG',
  denoise: 'denoise',
};

/**
 * Settings → ComfyUI → Import a workflow from ComfyUI: the files "Open in ComfyUI" saved under
 * `workflows/Castcut/`, and what the player changed in the editor against the graph Castcut
 * queued. Sampler changes can become the Engine's sampler overrides (the existing
 * `modelSamplerOverrides`, every tool); LoRA and prompt changes are listed only.
 */
export default function SettingsComfyEditorImportPanel({
  comfyUrl,
  sharedSettings,
  updateSharedSettings,
  setStatus,
}: SettingsComfyEditorImportPanelProps) {
  const [files, setFiles] = useState<ListedFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);

  const listFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/comfyui/editor-workflows${comfyQuery(comfyUrl)}`);
      const data = (await response.json().catch(() => null)) as {
        files?: ListedFile[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      setFiles(data?.files ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list ComfyUI workflows.');
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/comfyui/editor-workflows${comfyQuery(comfyUrl, { file: name })}`
      );
      const data = (await response.json().catch(() => null)) as {
        edited?: ComfyApiPrompt;
        castcut?: CastcutEditorMeta | null;
        error?: string;
      } | null;
      if (!response.ok || !data?.edited) throw new Error(data?.error ?? `HTTP ${response.status}`);
      const meta = data.castcut ?? null;
      setLoaded({
        name,
        meta,
        changes: meta ? sortEditorChanges(diffEditorGraphs(meta.apiPrompt, data.edited)) : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the workflow.');
    } finally {
      setLoading(false);
    }
  };

  const overrides = loaded ? samplerOverridesFromEditorChanges(loaded.changes) : {};
  const overrideText = Object.entries(overrides)
    .map(([key, value]) => `${OVERRIDE_LABELS[key] ?? key} ${value}`)
    .join(' · ');
  const listedOnly = loaded?.changes.filter(change =>
    ['lora', 'prompt', 'model', 'node', 'size', 'other', 'seed'].includes(change.kind)
  );

  return (
    <CollapsibleSection
      title="Import a workflow from ComfyUI"
      summary="Stills you opened in ComfyUI (Castcut folder) and what you changed there."
      defaultOpen={false}
      persistKey="settings-comfyui-editor-import"
    >
      <div id="settings-comfyui-editor-import" className="scroll-mt-28 space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          “Open in ComfyUI” on a Gallery, Day or Story still saves its exact graph to ComfyUI’s
          Workflows → Castcut. Edit and save it there, then compare it here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading}
            data-testid="comfy-editor-import-list"
            onClick={() => void listFiles()}
          >
            {loading && !loaded ? 'Loading…' : files ? 'Refresh list' : 'List Castcut workflows'}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--tint-danger-text)]" role="alert">
            {error}
          </p>
        ) : null}
        {files && files.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="Nothing in ComfyUI’s Castcut folder yet"
            description="Use Open in ComfyUI on a finished still first."
          />
        ) : null}
        {files && files.length > 0 ? (
          <ul className="space-y-1.5" data-testid="comfy-editor-import-files">
            {files.map(file => (
              <li key={file.name}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                    loaded?.name === file.name
                      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 hover:bg-[var(--bg-muted)]'
                  }`}
                  disabled={loading}
                  onClick={() => void loadFile(file.name)}
                >
                  <span className="font-medium text-[var(--text-primary)]">{file.name}</span>
                  {file.modified ? (
                    <span className="type-caption ml-2 text-[var(--text-muted)]">
                      saved {new Date(file.modified).toLocaleString()}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {loaded ? (
          <div className="space-y-2" data-testid="comfy-editor-import-diff">
            {!loaded.meta ? (
              <p className="text-sm text-[var(--text-muted)]">
                {loaded.name} was not saved by Castcut, so there is no queued graph to compare it
                with.
              </p>
            ) : loaded.changes.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No changes in {loaded.name} — it matches the graph Castcut queued
                {loaded.meta.model ? ` on ${loaded.meta.model}` : ''}.
              </p>
            ) : (
              <>
                <p className="type-caption text-[var(--text-muted)]">
                  {loaded.changes.length} change{loaded.changes.length === 1 ? '' : 's'} against the
                  queued {loaded.meta.tool ?? 'still'} graph
                  {loaded.meta.model ? ` (${loaded.meta.model})` : ''}.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[var(--text-muted)]">
                      <tr>
                        <th className="py-1 pr-3 font-medium">What</th>
                        <th className="py-1 pr-3 font-medium">Node</th>
                        <th className="py-1 pr-3 font-medium">Before</th>
                        <th className="py-1 font-medium">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loaded.changes.map(change => (
                        <tr
                          key={`${change.nodeId}:${change.input}`}
                          className="border-t border-[var(--border-subtle)] align-top"
                        >
                          <td className="py-1 pr-3 text-[var(--text-primary)]">
                            {editorChangeLabel(change)}
                            {change.input ? (
                              <span className="text-[var(--text-muted)]"> · {change.input}</span>
                            ) : null}
                          </td>
                          <td className="py-1 pr-3 text-[var(--text-muted)]">
                            {change.classType} #{change.nodeId}
                          </td>
                          <td className="max-w-[16rem] break-words py-1 pr-3 text-[var(--tint-danger-text)]">
                            {change.input || change.before !== undefined
                              ? formatEditorValue(change.before)
                              : '—'}
                          </td>
                          <td className="max-w-[16rem] break-words py-1 text-[var(--tint-success-text)]">
                            {formatEditorValue(change.after)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {overrideText ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      data-testid="comfy-editor-import-apply"
                      onClick={() => {
                        const next = pickModelSamplerOverrideFields({
                          ...sharedSettings.modelSamplerOverrides,
                          ...overrides,
                        });
                        updateSharedSettings({ modelSamplerOverrides: next });
                        setStatus(
                          `Engine sampler overrides set: ${overrideText}. They apply on every tool (Engine → More → Sampler & size).`
                        );
                      }}
                    >
                      Use {overrideText} in the Engine
                    </Button>
                    <span className="type-caption text-[var(--text-muted)]">
                      Sets the Engine’s sampler overrides — every tool, until you clear them.
                    </span>
                  </div>
                ) : null}
                {listedOnly && listedOnly.length > 0 ? (
                  <p className="type-caption text-[var(--text-muted)]">
                    LoRA, prompt and other graph changes are listed only — set LoRAs in the LoRA
                    library and prompts on the tool.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}
