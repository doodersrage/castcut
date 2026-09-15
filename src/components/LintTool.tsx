'use client';

import { useCallback, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import PromptDiagnosticsPanel from '@/components/PromptDiagnosticsPanel';
import SharedToolControls from '@/components/SharedToolControls';
import SidecarImportButton from '@/components/SidecarImportButton';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getDetailLimits } from '@/lib/detail-level';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { DEFAULT_LINT_TOOL_CACHE } from '@/lib/settings-cache';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldLabel, TextArea } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import PromptWeightInspector from '@/components/PromptWeightInspector';

const ACCENT = 'amber' as const;

export default function LintTool() {
  const description = useToolPageDescription(
    'Paste a prompt, run lint and fixes, then queue.',
    'Lint a prompt and queue when it is ready.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'lint',
    DEFAULT_LINT_TOOL_CACHE
  );
  const hints = toolSettings.hints ?? '';
  const prompt = toolSettings.prompt ?? '';
  const setHints = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberDraftFields({
        toolKey: 'lint',
        label: 'Lint',
        href: '/lint',
        fields: [prompt, value],
      });
    },
    [prompt, updateToolSettings]
  );
  const setPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ prompt: value });
      rememberDraftFields({
        toolKey: 'lint',
        label: 'Lint',
        href: '/lint',
        fields: [value, hints],
      });
    },
    [hints, updateToolSettings]
  );
  const [copied, setCopied] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useSeedToolDraft(mounted, {
    toolKey: 'lint',
    label: 'Lint',
    href: '/lint',
    fields: [prompt, hints],
  });

  const reformatTarget = getReformatTargetModel(shared.model);
  const actions = usePromptResultActions({
    tool: 'lint',
    model: shared.model,
    detail: shared.detail,
    hints,
    autoFixRules: true,
    reformatTarget,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);

  const runLint = useCallback(async () => {
    await actions.lintPrompt(prompt, hints);
  }, [actions, prompt, hints]);

  const copyOutput = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [prompt]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Lint · {selectedModel.comfyNode}</ToolBadge>}
      title="Lint"
      description={description}
      sidebarPersistKey="lint"
      sidebar={
        <SharedToolControls
          toolId="lint"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={prompt || hints}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.lint} />
      <ToolSection title="Prompt input">
        <FieldLabel>Hints</FieldLabel>
        <TextArea
          value={hints}
          onChange={event => setHints(event.target.value)}
          placeholder="two female gravel cyclists in fierce competition"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Prompt</FieldLabel>
        <TextArea
          id="lint-prompt-editor"
          value={prompt}
          onChange={event => setPrompt(event.target.value)}
          placeholder="Paste generated or hand-written prompt to lint…"
          rows={8}
          className={`font-mono text-[var(--tint-success-text)] ${accentFocusClass(ACCENT)}`}
        />

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={() => void runLint()}
            disabled={!mounted || !prompt.trim()}
          >
            Run lint
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void actions.fixPrompt(prompt, setPrompt, hints)}
            disabled={!prompt.trim()}
            className="ui-btn-secondary rounded-xl px-5 py-2 text-sm disabled:opacity-50"
          >
            Fix prompt (rules)
          </button>
          <SidecarImportButton
            onImport={sidecar => {
              setPrompt(sidecar.positive);
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
        {importStatus && <p className="text-xs text-[var(--text-muted)]">{importStatus}</p>}

        {prompt.trim() ? (
          <CollapsibleSection
            title="Weight inspector"
            summary="Adjust emphasis weights in the prompt."
            defaultOpen={false}
            persistKey="lint-weights"
          >
            <PromptWeightInspector
              prompt={prompt}
              model={shared.model}
              onChange={setPrompt}
              textareaId="lint-prompt-editor"
            />
          </CollapsibleSection>
        ) : null}
      </ToolSection>

      {actions.diagnostics ? (
        <CollapsibleSection
          title="Lint diagnostics"
          summary="Issues found in the last lint run."
          defaultOpen={false}
          persistKey="lint-diagnostics"
        >
          <PromptDiagnosticsPanel diagnostics={actions.diagnostics} />
        </CollapsibleSection>
      ) : null}

      <EnhancedPromptResult
        showWeightInspector={false}
        output={prompt}
        onOutputChange={setPrompt}
        provider={actions.diagnostics ? 'rules' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        limits={activeLimits}
        copied={copied}
        onCopy={() => void copyOutput()}
        onFixPrompt={() => void actions.fixPrompt(prompt, setPrompt, hints)}
        onCopyPair={() =>
          void actions.copyPromptPair(prompt, actions.diagnostics?.inferred.sport ?? null)
        }
        onCompact={() => void actions.compactPrompt(prompt, setPrompt)}
        onReformat={() => void actions.reformatForModel(prompt, setPrompt)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(prompt, setPrompt, { queueComfyUi: true })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(prompt, { comfyNode: selectedModel.comfyNode })
        }
        onSendComfyUi={() =>
          void actions.sendComfyUi(prompt, actions.diagnostics?.inferred.sport ?? null)
        }
        onEditPrompt={() => actions.editPromptOutput(prompt, null, undefined, hints)}
        {...promptResultPreviewProps(actions, prompt, actions.diagnostics?.inferred.sport ?? null)}
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
        disabled={!prompt.trim()}
        label="Queue linted prompt"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(prompt, actions.diagnostics?.inferred.sport ?? null)
        }
      />
    </ToolLayout>
  );
}
