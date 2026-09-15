'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_NEGATIVE_TOOL_CACHE } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { SPORT_PRESETS } from '@/lib/sport-presets';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'rose' as const;

type NegativeGenerateResult = {
  prompt: string;
  sport: AthleticSport | null;
  mode?: string;
};

export default function NegativeTool() {
  const description = useToolPageDescription(
    'Sport-aware negatives for SD-family models, or preserve lists for edit workflows.',
    'Build negative prompts — sport-aware for SD models or preserve lists for edits.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'negative',
    DEFAULT_NEGATIVE_TOOL_CACHE
  );
  const actions = usePromptResultActions({
    tool: 'negative',
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.sport,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<NegativeGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useSeedToolDraft(mounted, {
    toolKey: 'negative',
    label: 'Negative',
    href: '/negative',
    fields: [toolSettings.extra, toolSettings.sport, output],
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch('/api/negative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport: toolSettings.sport,
          preserveSubject: toolSettings.preserveSubject,
          extra: toolSettings.extra,
        }),
      });

      const data = (await response.json()) as NegativeGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
      }

      const prompt = data.prompt ?? '';
      setOutput(prompt);
      setResult({
        prompt,
        sport: data.sport ?? null,
        mode: data.mode,
      });
      rememberDraftFields({
        toolKey: 'negative',
        label: 'Negative',
        href: '/negative',
        fields: [prompt, toolSettings.extra, toolSettings.sport],
      });
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [toolSettings, actions]);

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

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Negative / preserve</ToolBadge>}
      title="Negative"
      description={description}
      sidebarPersistKey="negative"
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          detailHelp="Detail level affects compact-to-limit when trimming long negatives."
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output || toolSettings.extra || ''}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.negative} />
      <ToolSection>
        <FieldLabel>Sport context</FieldLabel>
        <select
          value={toolSettings.sport ?? ''}
          onChange={event => {
            updateToolSettings({ sport: event.target.value });
            rememberDraftFields({
              toolKey: 'negative',
              label: 'Negative',
              href: '/negative',
              fields: [toolSettings.extra, event.target.value],
            });
          }}
          className="ui-input w-full px-4 py-2 text-sm"
        >
          <option value="">Auto / general</option>
          {SPORT_PRESETS.map(preset => (
            <option key={preset.id} value={preset.category}>
              {preset.label} ({preset.category})
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={toolSettings.preserveSubject === true}
            onChange={event => updateToolSettings({ preserveSubject: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentRingClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Preserve subject mode
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Adds identity-preservation negatives for edit/refine workflows.
            </span>
          </span>
        </label>

        <FieldLabel>Extra negatives</FieldLabel>
        <TextArea
          rows={3}
          value={toolSettings.extra ?? ''}
          onChange={event => {
            const value = event.target.value;
            updateToolSettings({ extra: value });
            rememberDraftFields({
              toolKey: 'negative',
              label: 'Negative',
              href: '/negative',
              fields: [value, toolSettings.sport],
            });
          }}
          placeholder="watermark, text, duplicate limbs"
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          loading={loading}
          loadingLabel="Building negative prompt"
        >
          Build negative prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        provider="template"
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        negativePrompt={output}
        copied={copied}
        onCopy={() => void copyOutput()}
        extraMeta={
          result?.sport
            ? `sport: ${result.sport}${result.mode ? ` · ${result.mode}` : ''}`
            : result?.mode
              ? `mode: ${result.mode}`
              : undefined
        }
        diagnostics={actions.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: toolSettings.sport,
            metadata: {
              sport: result?.sport,
              mode: result?.mode,
            },
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        {...promptResultPreviewProps(actions, output, result?.sport ?? null)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, toolSettings.sport)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, setOutput, {
            queueComfyUi: true,
          })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(output, {
            comfyNode: selectedModel.comfyNode,
            metadata: {
              sport: result?.sport,
              mode: result?.mode,
            },
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
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue negative"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(output)}
      />
    </ToolLayout>
  );
}
