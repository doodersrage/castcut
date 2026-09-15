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
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { DEFAULT_AUDIO_MODEL } from '@/lib/comfy-models/client';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { AUDIO_SECONDS_TOKEN, buildAudioPrompt } from '@/lib/audio-mesh-prompt';
import { ensureAudioWorkflowScaffold } from '@/lib/ensure-media-workflow';
import { DEFAULT_AUDIO_TOOL_CACHE } from '@/lib/settings-cache';
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
import { PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'sky' as const;

export default function AudioPromptTool() {
  const description = useToolPageDescription(
    'Describe sound for Stable Audio (or BYO audio packs). Queues with {{AUDIO_SECONDS}} when the workflow exposes it.',
    'Describe sound for Stable Audio — duration fills {{AUDIO_SECONDS}} when supported.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'audio',
    DEFAULT_AUDIO_TOOL_CACHE
  );
  const subject = toolSettings?.subject ?? '';
  const mood = toolSettings?.mood ?? '';
  const instruments = toolSettings?.instruments ?? '';
  const durationSec = toolSettings?.durationSec ?? 10;

  const actions = usePromptResultActions({
    tool: 'audio',
    model: shared.model,
    detail: shared.detail,
    hints: subject,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (getComfyModelDefinition(shared.model).category !== 'audio') {
      updateShared({ model: DEFAULT_AUDIO_MODEL });
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
        getComfyModelDefinition(shared.model).category === 'audio'
          ? shared.model
          : DEFAULT_AUDIO_MODEL;
      void fetchComfyObjectInfoCached().catch(() => null);
      const result = ensureAudioWorkflowScaffold(model);
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
              : 'Could not create audio workflow scaffold. Import a Stable Audio pack in Settings → workflows.'
          );
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [mounted, shared.model, updateShared]);

  const builtOutput = useMemo(
    () => buildAudioPrompt({ subject, mood, instruments, durationSec }),
    [durationSec, instruments, mood, subject]
  );
  const [outputOverride, setOutputOverride] = useState<string | null>(null);
  useEffect(() => {
    setOutputOverride(null);
  }, [durationSec, instruments, mood, subject]);
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
    getComfyModelDefinition(shared.model).category === 'audio' ? shared.model : DEFAULT_AUDIO_MODEL;
  const controlsShared =
    controlsModel === shared.model ? shared : { ...shared, model: controlsModel };
  const selectedModel = getComfyModelDefinition(controlsModel);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Audio · {selectedModel.comfyNode}</ToolBadge>}
      title="Audio prompt"
      description={description}
      sidebarPersistKey="audio"
      sidebar={
        <SharedToolControls
          toolId="audio"
          shared={controlsShared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.audio} />
      <ToolSection>
        {workflowStatus ? (
          <p className="mb-3 rounded-xl border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-3 py-2 text-xs text-[var(--tint-info-text)]">
            {workflowStatus}
          </p>
        ) : null}
        <div className="mb-4 space-y-3">
          <MediaScaffoldReadyPanel
            kind="audio"
            ensureScaffold={() => {
              ensureAudioWorkflowScaffold();
            }}
            onImported={(summary, result) => {
              if (result.sharedPatch) {
                updateShared(result.sharedPatch);
              }
              setWorkflowStatus(summary);
            }}
          />
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 px-3 py-3">
            <p className="mb-2 text-xs font-medium text-[var(--text-primary)]">Audio model files</p>
            <ComfyModelAssetsPanel
              modelId={controlsModel}
              compact
              onStatus={setWorkflowStatus}
              onInstalled={() => {
                void (async () => {
                  try {
                    const { pinMediaWeightsAfterInstall } = await import('@/lib/pin-media-weights');
                    const result = await pinMediaWeightsAfterInstall('audio', controlsModel);
                    if (result.sharedPatch) {
                      updateShared(result.sharedPatch);
                    }
                    setWorkflowStatus(
                      result.note ??
                        'Audio weights installed and mapped — refresh ComfyUI if loaders stay empty.'
                    );
                  } catch (error) {
                    setWorkflowStatus(
                      error instanceof Error
                        ? error.message
                        : 'Audio weights installed — refresh ComfyUI if loaders stay empty.'
                    );
                  }
                })();
              }}
            />
          </div>
        </div>
        <FieldLabel>Subject / scene sound</FieldLabel>
        <TextArea
          rows={3}
          value={subject}
          onChange={event => updateToolSettings({ subject: event.target.value })}
          placeholder="Rain on a tin roof with distant thunder…"
          className={accentFocusClass(ACCENT)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel>Mood</FieldLabel>
            <TextInput
              value={mood}
              onChange={event => updateToolSettings({ mood: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Instruments / texture</FieldLabel>
            <TextInput
              value={instruments}
              onChange={event => updateToolSettings({ instruments: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>
        <label className="mt-3 block space-y-1 text-xs text-[var(--text-muted)]">
          Duration (seconds)
          <TextInput
            type="number"
            min={1}
            max={120}
            value={String(durationSec)}
            onChange={event =>
              updateToolSettings({
                durationSec: Math.max(1, Number(event.target.value) || 10),
              })
            }
            className={accentFocusClass(ACCENT)}
          />
        </label>
        <PrimaryButton
          className="mt-4"
          accentClassName={accentButtonClass(ACCENT)}
          disabled={!output.trim()}
          onClick={() =>
            void actions.sendComfyUi(output, undefined, undefined, {
              customTokens: [{ token: AUDIO_SECONDS_TOKEN, value: String(durationSec) }],
              queueParamsBase: {/* audio seconds via token */},
            })
          }
        >
          Queue audio
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
            customTokens: [{ token: AUDIO_SECONDS_TOKEN, value: String(durationSec) }],
          })
        }
        {...promptResultPreviewProps(actions, output)}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        historySaved={actions.historySaved}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue audio"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(output, undefined, undefined, {
            customTokens: [{ token: AUDIO_SECONDS_TOKEN, value: String(durationSec) }],
          })
        }
      />
    </ToolLayout>
  );
}
