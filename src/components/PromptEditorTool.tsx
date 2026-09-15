'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import PromptDiagnosticsPanel from '@/components/PromptDiagnosticsPanel';
import SharedToolControls from '@/components/SharedToolControls';
import SidecarImportButton from '@/components/SidecarImportButton';
import PromptWeightInspector from '@/components/PromptWeightInspector';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import {
  usePromptEditorHandoff,
  type PromptEditorHandoffMeta,
} from '@/hooks/usePromptEditorHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getDetailLimits } from '@/lib/detail-level';
import { modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_PROMPT_EDITOR_TOOL_CACHE } from '@/lib/settings-cache';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import {
  ToolBadge,
  CollapsibleSection,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';

const ACCENT = 'sky' as const;

export default function PromptEditorTool() {
  const description = useToolPageDescription(
    'Edit positive and negative prompts, lint, and queue to ComfyUI.',
    'Edit prompts, lint, and queue — no generator UI in the way.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'promptEditor',
    DEFAULT_PROMPT_EDITOR_TOOL_CACHE
  );
  const hints = toolSettings.hints ?? '';
  const positive = toolSettings.positive ?? '';
  const negative = toolSettings.negative ?? '';
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [negativeStatus, setNegativeStatus] = useState<string | null>(null);
  const [sourceMeta, setSourceMeta] = useState<PromptEditorHandoffMeta | null>(null);

  const rememberEditorDraft = useCallback(
    (next: { hints?: string; positive?: string; negative?: string }) => {
      rememberDraftFields({
        toolKey: 'prompt-editor',
        label: 'Prompt Editor',
        href: '/prompt',
        fields: [next.positive ?? positive, next.hints ?? hints, next.negative ?? negative],
      });
    },
    [hints, negative, positive]
  );

  const setHints = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberEditorDraft({ hints: value });
    },
    [rememberEditorDraft, updateToolSettings]
  );
  const setPositive = useCallback(
    (value: string) => {
      updateToolSettings({ positive: value });
      rememberEditorDraft({ positive: value });
    },
    [rememberEditorDraft, updateToolSettings]
  );
  const setNegative = useCallback(
    (value: string) => {
      updateToolSettings({ negative: value });
      rememberEditorDraft({ negative: value });
    },
    [rememberEditorDraft, updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'prompt-editor',
    label: 'Prompt Editor',
    href: '/prompt',
    fields: [positive, hints, negative],
  });

  const reformatTarget = getReformatTargetModel(shared.model);
  const actions = usePromptResultActions({
    tool: 'prompt-editor',
    model: shared.model,
    detail: shared.detail,
    hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);
  const usesNegative = modelUsesNegativePrompt(shared.model);
  const sport = actions.diagnostics?.inferred.sport ?? null;

  usePromptEditorHandoff(
    useCallback(
      payload => {
        setPositive(payload.positive);
        setNegative(payload.negative);
        if (payload.hints) {
          setHints(payload.hints);
        }
        if (payload.model) {
          updateShared({ model: payload.model as typeof shared.model });
        }
        setSourceMeta(payload.meta);
        actions.resetStatuses();
      },
      [actions, setHints, setNegative, setPositive, updateShared]
    )
  );

  const runLint = useCallback(async () => {
    await actions.lintPrompt(positive, hints);
  }, [actions, positive, hints]);

  const copyPositive = useCallback(async () => {
    if (!positive) {
      return;
    }
    try {
      await navigator.clipboard.writeText(positive);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [positive]);

  const generateNegative = useCallback(async () => {
    setNegativeStatus('Building negative…');
    try {
      const response = await fetch('/api/negative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hints: hints || positive.slice(0, 240),
          sport: sport ?? undefined,
        }),
      });
      const data = (await response.json()) as { prompt?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Negative generation failed.');
      }
      setNegative(data.prompt ?? '');
      setNegativeStatus('Negative prompt generated.');
    } catch (err) {
      setNegativeStatus(err instanceof Error ? err.message : 'Negative generation failed.');
    }
  }, [hints, positive, setNegative, sport]);

  const queueOptions = { explicitNegative: negative.trim() || undefined };

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Manual edit · {selectedModel.comfyNode}</ToolBadge>}
      title="Prompt Editor"
      description={description}
      sidebarPersistKey="prompt-editor"
      sidebar={
        <SharedToolControls
          toolId="prompt-editor"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={positive || hints}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.promptEditor} />
      {sourceMeta ? (
        <ToolSection>
          <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-[var(--tint-info-border)] bg-gradient-to-br from-[var(--tint-info-bg)] to-[var(--bg-base)]/40 p-4 ">
            {sourceMeta.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceMeta.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-xl border border-[var(--border-subtle)]/80 object-cover"
              />
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-[var(--tint-info-text)]">
                Loaded from {sourceMeta.source === 'gallery' ? 'gallery' : 'history'}
                {sourceMeta.tool ? ` · ${sourceMeta.tool}` : ''}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Edits here do not change the saved gallery entry until you queue a new job.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                {sourceMeta.source === 'gallery' ? (
                  <Link
                    href="/gallery"
                    className="text-xs text-[var(--tint-info-text)] transition hover:text-[var(--tint-info-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Back to gallery
                  </Link>
                ) : null}
                {sourceMeta.historyId ? (
                  <Link
                    href={`/studio?history=${sourceMeta.historyId}`}
                    className="text-xs text-[var(--tint-info-text)] transition hover:text-[var(--tint-info-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  >
                    Open in Studio
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </ToolSection>
      ) : null}

      <ToolSection>
        <FieldLabel>Hints</FieldLabel>
        <TextArea
          value={hints}
          onChange={event => setHints(event.target.value)}
          placeholder="Optional scene hints for lint, negative generation, and queue steering"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Positive prompt</FieldLabel>
        <TextArea
          id="prompt-editor-positive"
          value={positive}
          onChange={event => setPositive(event.target.value)}
          placeholder="Paste or type your positive prompt…"
          rows={10}
          className={`font-mono text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
        />

        {usesNegative ? (
          <CollapsibleSection
            title="Negative prompt"
            summary="Optional — auto-generate or paste a negative for queue."
            defaultOpen={Boolean(negative.trim())}
            persistKey="prompt-editor-negative"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <FieldLabel>Negative prompt</FieldLabel>
              <button
                type="button"
                onClick={() => void generateNegative()}
                disabled={!positive.trim() && !hints.trim()}
                className="rounded-lg border border-[var(--tint-info-border)] px-3 py-1.5 text-xs font-medium text-[var(--tint-info-text)] transition hover:border-[var(--tint-info-border)] hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
              >
                Auto-generate negative
              </button>
            </div>
            <TextArea
              value={negative}
              onChange={event => setNegative(event.target.value)}
              placeholder="Optional — leave blank to auto-resolve on queue"
              rows={4}
              className={`font-mono text-[var(--tint-danger-text)]/90 ${accentFocusClass(ACCENT)}`}
            />
            {negativeStatus ? (
              <p className="text-xs text-[var(--text-muted)]">{negativeStatus}</p>
            ) : null}
          </CollapsibleSection>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            {selectedModel.comfyNode} ignores separate negatives — fold exclusions into the positive
            prompt.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            data-action="primary-generate"
            onClick={() => void actions.sendComfyUi(positive, sport, undefined, queueOptions)}
            disabled={!mounted || !positive.trim()}
          >
            Queue prompt
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void runLint()}
            disabled={!mounted || !positive.trim()}
            className="rounded-xl border border-[var(--tint-info-border)] px-5 py-2 text-sm font-medium text-[var(--tint-info-text)] transition hover:border-[var(--tint-info-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
          >
            Run lint
          </button>
          <button
            type="button"
            onClick={() => void actions.fixPrompt(positive, setPositive, hints)}
            disabled={!positive.trim()}
            className="rounded-xl border border-[var(--tint-info-border)] px-5 py-2 text-sm font-medium text-[var(--tint-info-text)] transition hover:border-[var(--tint-info-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-50"
          >
            Fix prompt (rules)
          </button>
          <SidecarImportButton
            onImport={sidecar => {
              setPositive(sidecar.positive);
              if (sidecar.negative) {
                setNegative(sidecar.negative);
              }
              if (sidecar.hints) {
                setHints(sidecar.hints);
              }
              setImportStatus(
                `Imported sidecar · ${sidecar.tool ?? 'unknown tool'} · ${sidecar.model}`
              );
            }}
            onError={setImportStatus}
          />
        </div>
        {importStatus ? <p className="text-xs text-[var(--text-muted)]">{importStatus}</p> : null}

        {positive.trim() ? (
          <CollapsibleSection
            title="Weight inspector"
            summary="Adjust emphasis weights in the prompt."
            defaultOpen={false}
            persistKey="prompt-editor-weights"
          >
            <PromptWeightInspector
              prompt={positive}
              model={shared.model}
              onChange={setPositive}
              textareaId="prompt-editor-positive"
            />
          </CollapsibleSection>
        ) : null}
      </ToolSection>

      {actions.diagnostics ? (
        <CollapsibleSection
          title="Lint diagnostics"
          summary="Sport, duo, and rule checks from the last lint run."
          defaultOpen={false}
          persistKey="prompt-editor-diagnostics"
        >
          <PromptDiagnosticsPanel diagnostics={actions.diagnostics} />
        </CollapsibleSection>
      ) : null}

      <EnhancedPromptResult
        showWeightInspector={false}
        output={positive}
        onOutputChange={setPositive}
        provider={actions.diagnostics ? 'rules' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        limits={activeLimits}
        copied={copied}
        onCopy={() => void copyPositive()}
        onFixPrompt={() => void actions.fixPrompt(positive, setPositive, hints)}
        onCopyPair={() =>
          void actions.copyPromptPair(positive, sport, queueOptions.explicitNegative)
        }
        onCompact={() => void actions.compactPrompt(positive, setPositive)}
        onReformat={() => void actions.reformatForModel(positive, setPositive)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(positive, setPositive, { queueComfyUi: true })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(positive, { comfyNode: selectedModel.comfyNode })
        }
        onSendComfyUi={() => void actions.sendComfyUi(positive, sport, undefined, queueOptions)}
        {...promptResultPreviewProps(actions, positive, sport)}
        {...continueEditResultProps(actions, positive, { queueImageOptions: queueOptions })}
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        pairCopied={actions.pairCopied}
      />
      <MobileStickyQueueBar
        disabled={!positive.trim()}
        label="Queue prompt"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(positive, sport, undefined, queueOptions)}
      />
    </ToolLayout>
  );
}
