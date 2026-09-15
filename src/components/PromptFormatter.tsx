'use client';

import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { useCallback, useEffect, useMemo, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldError, TextArea } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import { DEFAULT_FORMAT_TOOL_CACHE } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const ACCENT = 'emerald' as const;

type FormatMode = 'positive' | 'negative';

type FormatResponse = {
  prompt: string;
  mode: FormatMode;
  model: string;
  comfyNode: string;
  provider: 'llm' | 'rules';
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  inputChars: number;
  outputChars: number;
  rawPrompt?: string;
};

const EXAMPLE_DRAFTS = [
  '1girl, neon alley, rain, masterpiece, best quality, 8k',
  'keep her face, change background to gothic cathedral with candles and fog',
  'A woman in a red dress standing in a field at sunset',
];

export default function PromptFormatter() {
  const description = useToolPageDescription(
    'Paste tag soup or a rough draft — restructure and trim it for your target model.',
    'Paste a draft and format it for your model.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'format',
    DEFAULT_FORMAT_TOOL_CACHE
  );
  const [mode, setMode] = useState<FormatMode>(DEFAULT_FORMAT_TOOL_CACHE.mode ?? 'positive');
  const [output, setOutput] = useState('');
  const [provider, setProvider] = useState<'llm' | 'rules' | null>(null);
  const [resultMeta, setResultMeta] = useState<Omit<FormatResponse, 'prompt' | 'provider'> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const input = toolSettings.draft ?? '';
  const setInput = useCallback(
    (value: string) => {
      updateToolSettings({ draft: value });
      rememberDraftFields({
        toolKey: 'format',
        label: TOOL_SETUP_LABELS.format,
        href: '/format',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'format',
    label: TOOL_SETUP_LABELS.format,
    href: '/format',
    fields: [input],
  });

  const targetModel = shared.model;
  const detail = shared.detail;
  const smartFormat = toolSettings.smartFormat ?? true;
  const autoFixRules = shared.autoFixRules !== false;

  const actions = usePromptResultActions({
    tool: 'format',
    model: targetModel,
    detail,
    hints: input,
    autoFixRules,
    reformatTarget: getReformatTargetModel(targetModel),
  });

  const setModeAndCache = (value: FormatMode) => {
    setMode(value);
    updateToolSettings({ mode: value });
  };

  const selectedModel = useMemo(() => getComfyModelDefinition(targetModel), [targetModel]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (toolSettings.mode) {
        setMode(toolSettings.mode);
      }
    });
  }, [toolSettings.mode]);

  const runFormat = useCallback(async () => {
    if (!input.trim()) {
      setError('Paste a prompt draft first.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      if (mode === 'positive') {
        await actions.runPreLint(input);
      }

      const response = await fetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          mode,
          detail,
          model: targetModel,
          smartFormat,
        }),
      });

      const data = (await response.json()) as FormatResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Formatting failed.');
      }

      const prompt =
        mode === 'positive' ? await actions.finalizePrompt(data.prompt, input) : data.prompt;
      setOutput(prompt);
      setProvider(data.provider);
      setResultMeta({
        mode: data.mode,
        model: data.model,
        comfyNode: data.comfyNode,
        limits: data.limits,
        inputChars: data.inputChars,
        outputChars: data.outputChars,
        rawPrompt: data.rawPrompt,
      });
    } catch (err) {
      setOutput('');
      setProvider(null);
      setResultMeta(null);
      setError(err instanceof Error ? err.message : 'Formatting failed.');
    } finally {
      setLoading(false);
    }
  }, [input, mode, detail, targetModel, smartFormat, actions]);

  const copyOutput = useCallback(async () => {
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>{TOOL_SETUP_LABELS.format}</ToolBadge>}
      title="Format for your model"
      description={description}
      sidebarPersistKey="format"
      sidebar={
        <SharedToolControls
          toolId="format"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={value => updateShared({ detail: value })}
          autoFixRules={autoFixRules}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={input}
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.format} />
      <ToolSection
        title="Prompt draft"
        description="Tags, rough prose, or output from another tool — positive or negative/preserve mode."
      >
        <div className="flex flex-wrap gap-2">
          <ChipButton active={mode === 'positive'} onClick={() => setModeAndCache('positive')}>
            Positive
          </ChipButton>
          <ChipButton active={mode === 'negative'} onClick={() => setModeAndCache('negative')}>
            Negative / preserve
          </ChipButton>
        </div>

        <TextArea
          id="format-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void runFormat();
            }
          }}
          placeholder="Paste your prompt here…"
          rows={7}
          className={`text-base ${accentFocusClass(ACCENT)}`}
        />

        <div className="flex flex-wrap gap-2">
          {EXAMPLE_DRAFTS.map(example => (
            <button
              key={example}
              type="button"
              onClick={() => setInput(example)}
              className="rounded-full border border-[var(--border-default)] px-3 py-1 type-caption text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {example.length > 48 ? `${example.slice(0, 48)}…` : example}
            </button>
          ))}
        </div>

        <CollapsibleSection
          title="Format options"
          summary={smartFormat ? 'Smart format (LLM) on' : 'Rules-only cleanup'}
          defaultOpen={false}
          persistKey="format-options"
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={smartFormat}
              onChange={e => updateToolSettings({ smartFormat: e.target.checked })}
              className="ui-checkbox mt-1"
            />
            <span className="space-y-1">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Smart format (LLM)
              </span>
              <span className="type-caption block text-[var(--text-muted)]">
                Rewrites your draft for{' '}
                <span className="text-[var(--text-secondary)]">{selectedModel.comfyNode}</span>{' '}
                while preserving content. Off uses instant rules-only cleanup.
              </span>
            </span>
          </label>
        </CollapsibleSection>

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void runFormat()}
          disabled={!mounted || !input.trim()}
          loading={loading}
          loadingLabel="Formatting prompt"
        >
          Format prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && mode === 'positive' && (
        <EnhancedPromptResult
          output={output}
          provider={provider}
          comfyNode={resultMeta?.comfyNode ?? selectedModel.comfyNode}
          limits={resultMeta?.limits}
          readinessModel={shared.model}
          readinessDetail={shared.detail}
          copied={copied}
          onCopy={() => void copyOutput()}
          extraMeta={
            resultMeta ? `${resultMeta.inputChars} → ${resultMeta.outputChars} chars` : undefined
          }
          diagnostics={actions.diagnostics}
          preDiagnostics={actions.preDiagnostics}
          onSaveHistory={() => actions.saveHistory({ prompt: output, hints: input })}
          onSendComfyUi={() => void actions.sendComfyUi(output)}
          onOutputChange={setOutput}
          rawPrompt={resultMeta?.rawPrompt}
          {...promptResultPreviewProps(actions, output)}
          onFixPrompt={() => void actions.fixPrompt(output, setOutput, input)}
          onCopyPair={() => void actions.copyPromptPair(output)}
          onCompact={() => void actions.compactPrompt(output, setOutput)}
          onReformat={() => void actions.reformatForModel(output, setOutput)}
          reformatTargetLabel={getReformatTargetLabel(targetModel)}
          onRunPipeline={() =>
            void actions.runExportPipeline(output, setOutput, {
              maxChars: resultMeta?.limits.maxChars,
              queueComfyUi: true,
            })
          }
          onExportSidecar={() =>
            void actions.exportSidecar(output, {
              comfyNode: resultMeta?.comfyNode ?? selectedModel.comfyNode,
            })
          }
          fixStatus={actions.fixStatus}
          compactStatus={actions.compactStatus}
          reformatStatus={actions.reformatStatus}
          pipelineStatus={actions.pipelineStatus}
          comfyUiStatus={actions.comfyUiStatus}
          comfyUiJob={actions.comfyUiJob}
          comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
          historySaved={actions.historySaved}
          pairCopied={actions.pairCopied}
        />
      )}

      {output && mode === 'negative' && (
        <ToolSection title="Formatted preserve prompt">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <PrimaryButton
              accentClassName={accentButtonClass(ACCENT)}
              onClick={() => void copyOutput()}
            >
              {copied ? 'Copied!' : 'Copy for ComfyUI'}
            </PrimaryButton>
          </div>
          <pre className="ui-scroll-region overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 font-mono text-sm leading-relaxed text-[var(--tint-success-text)]">
            {output}
          </pre>
        </ToolSection>
      )}
      {output && mode !== 'negative' ? (
        <MobileStickyQueueBar
          disabled={!output.trim()}
          label="Queue formatted"
          status={actions.comfyUiStatus}
          primaryGenerate
          onQueue={() => void actions.sendComfyUi(output)}
        />
      ) : null}
    </ToolLayout>
  );
}
