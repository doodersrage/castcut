'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useMemo, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import MediaScaffoldReadyPanel from '@/components/MediaScaffoldReadyPanel';
import ComfyModelAssetsPanel from '@/components/settings/ComfyModelAssetsPanel';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { DEFAULT_MESH_MODEL, getComfyModelDefinition } from '@/lib/comfy-models/client';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { MESH_RESOLUTION_TOKEN, buildMeshPrompt } from '@/lib/audio-mesh-prompt';
import { ensureMeshWorkflowScaffold } from '@/lib/ensure-media-workflow';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { DEFAULT_MESH_TOOL_CACHE } from '@/lib/settings-cache';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldLabel, TextArea, TextInput } from '@/components/ui/Field';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { ButtonLink, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'emerald' as const;

export default function MeshPromptTool() {
  const description = useToolPageDescription(
    'Describe shape and materials for Hunyuan3D-style scaffolds. Optional reference image binds {{INPUT_IMAGE}}; resolution fills {{MESH_RESOLUTION}}.',
    '3D mesh prompts — optional reference image and resolution tokens when supported.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'mesh',
    DEFAULT_MESH_TOOL_CACHE
  );
  const subject = toolSettings?.subject ?? '';
  const materials = toolSettings?.materials ?? '';
  const style = toolSettings?.style ?? '';
  const resolution = toolSettings?.resolution ?? 512;
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const actions = usePromptResultActions({
    tool: 'mesh',
    model: shared.model,
    detail: shared.detail,
    hints: subject,
  });

  const applyGalleryHandoff = useCallback(
    (handoff: { prompt: string; model?: string; file: File | null; previewUrl: string | null }) => {
      if (handoff.prompt.trim()) {
        updateToolSettings({ subject: handoff.prompt.trim().slice(0, 400) });
      }
      if (handoff.model?.trim()) {
        updateShared({ model: handoff.model.trim() as ComfyImageModel });
      }
      setFile(handoff.file);
      setPreviewUrl(current => {
        if (current?.startsWith('blob:')) {
          URL.revokeObjectURL(current);
        }
        return handoff.previewUrl;
      });
    },
    [updateShared, updateToolSettings]
  );
  useGalleryHandoff('mesh', applyGalleryHandoff);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (getComfyModelDefinition(shared.model).category !== 'mesh') {
      updateShared({ model: DEFAULT_MESH_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    let cancelled = false;
    try {
      const model =
        getComfyModelDefinition(shared.model).category === 'mesh'
          ? shared.model
          : DEFAULT_MESH_MODEL;
      void fetchComfyObjectInfoCached().catch(() => null);
      const result = ensureMeshWorkflowScaffold(model);
      if (!cancelled) {
        updateShared(result.sharedPatch);
        scheduleAfterCommit(() => {
          setWorkflowStatus(result.note);
        });
      }
    } catch (error) {
      if (!cancelled) {
        scheduleAfterCommit(() => {
          setWorkflowStatus(
            error instanceof Error
              ? error.message
              : 'Could not create mesh workflow scaffold. Import a Hunyuan3D pack in Settings → workflows.'
          );
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [mounted, shared.model, updateShared]);

  const builtOutput = useMemo(
    () => buildMeshPrompt({ subject, materials, style }),
    [materials, style, subject]
  );
  const [outputOverride, setOutputOverride] = useState<string | null>(null);
  useEffect(() => {
    setOutputOverride(null);
  }, [materials, style, subject]);
  const output = outputOverride ?? builtOutput;

  const [copied, setCopied] = useState(false);
  const copyOutput = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [output]);

  if (!mounted) {
    return null;
  }

  const controlsModel =
    getComfyModelDefinition(shared.model).category === 'mesh' ? shared.model : DEFAULT_MESH_MODEL;
  const controlsShared =
    controlsModel === shared.model ? shared : { ...shared, model: controlsModel };
  const selectedModel = getComfyModelDefinition(controlsModel);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>3D · {selectedModel.comfyNode}</ToolBadge>}
      title="Mesh / 3D prompt"
      description={description}
      sidebarPersistKey="mesh"
      sidebar={
        <SharedToolControls
          toolId="mesh"
          shared={controlsShared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.mesh} />
      <ToolSection>
        {workflowStatus ? (
          <p className="mb-3 rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-2 text-xs text-[var(--tint-success-text)]">
            {workflowStatus}
          </p>
        ) : null}
        <div className="mb-4 space-y-3">
          <MediaScaffoldReadyPanel
            kind="mesh"
            ensureScaffold={() => {
              ensureMeshWorkflowScaffold();
            }}
            onImported={(summary, result) => {
              if (result.sharedPatch) {
                updateShared(result.sharedPatch);
              }
              setWorkflowStatus(summary);
            }}
          />
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-3">
            <p className="mb-2 text-xs font-medium text-[var(--text-primary)]">
              3D mesh model files
            </p>
            <ComfyModelAssetsPanel
              modelId={controlsModel}
              compact
              onStatus={setWorkflowStatus}
              onInstalled={() => {
                void (async () => {
                  try {
                    const { pinMediaWeightsAfterInstall } = await import('@/lib/pin-media-weights');
                    const result = await pinMediaWeightsAfterInstall('mesh', controlsModel);
                    if (result.sharedPatch) {
                      updateShared(result.sharedPatch);
                    }
                    setWorkflowStatus(
                      result.note ??
                        'Mesh weights installed and mapped — refresh ComfyUI if loaders stay empty.'
                    );
                  } catch (error) {
                    setWorkflowStatus(
                      error instanceof Error
                        ? error.message
                        : 'Mesh weights installed — refresh ComfyUI if loaders stay empty.'
                    );
                  }
                })();
              }}
            />
          </div>
        </div>
        <FieldLabel>Reference image (optional)</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={event => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setPreviewUrl(current => {
                if (current?.startsWith('blob:')) {
                  URL.revokeObjectURL(current);
                }
                return next ? URL.createObjectURL(next) : null;
              });
            }}
            className="block min-w-0 flex-1 text-sm text-[var(--text-muted)]"
          />
          <ButtonLink href={galleryPickPath('mesh')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
        </div>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Mesh reference"
            className="mt-3 max-h-48 rounded-xl border border-[var(--border-subtle)] object-contain"
          />
        ) : null}
        <FieldLabel>Subject / silhouette</FieldLabel>
        <TextArea
          rows={3}
          value={subject}
          onChange={event => updateToolSettings({ subject: event.target.value })}
          placeholder="A ceramic teapot with a short spout…"
          className={accentFocusClass(ACCENT)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Materials</FieldLabel>
            <TextInput
              value={materials}
              onChange={event => updateToolSettings({ materials: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Style</FieldLabel>
            <TextInput
              value={style}
              onChange={event => updateToolSettings({ style: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>
        <label className="mt-3 block space-y-1 text-xs text-[var(--text-muted)]">
          Mesh resolution hint
          <TextInput
            type="number"
            min={128}
            max={2048}
            value={String(resolution)}
            onChange={event =>
              updateToolSettings({
                resolution: Math.max(128, Number(event.target.value) || 512),
              })
            }
            className={accentFocusClass(ACCENT)}
          />
        </label>
        <PrimaryButton
          className="mt-4"
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          disabled={!output.trim()}
          onClick={() =>
            void actions.sendComfyUi(output, undefined, undefined, {
              inputImage: file,
              inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
              customTokens: [{ token: MESH_RESOLUTION_TOKEN, value: String(resolution) }],
            })
          }
        >
          Queue mesh
        </PrimaryButton>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutputOverride}
        provider={output ? 'template' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={controlsModel}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        onSaveHistory={() => actions.saveHistory({ prompt: output, hints: subject })}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            inputImage: file,
            inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
            customTokens: [{ token: MESH_RESOLUTION_TOKEN, value: String(resolution) }],
          })
        }
        {...promptResultPreviewProps(actions, output)}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        historySaved={actions.historySaved}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue mesh"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            inputImage: file,
            inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
            customTokens: [{ token: MESH_RESOLUTION_TOKEN, value: String(resolution) }],
          })
        }
      />
    </ToolLayout>
  );
}
