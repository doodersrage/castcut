'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useMemo, useState } from 'react';
import BrandBars from '@/components/BrandBars';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import {
  DEFAULT_LOGO_COLORS,
  LOGO_MOTIF_OPTIONS,
  LOGO_STYLE_PRESETS,
  type LogoMotifId,
  type LogoStylePresetId,
} from '@/lib/logo-presets';
import { buildLogoSvg, downloadLogoSvg, logoSvgFilename } from '@/lib/logo-svg-export';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_LOGO_TOOL_CACHE } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel, TextArea, TextInput } from '@/components/ui/Field';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { Button, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'amber' as const;

type LogoGenerateResult = {
  prompt: string;
  provider?: 'llm' | 'template';
  metadata?: Record<string, unknown>;
};

export default function LogoTool() {
  const description = useToolPageDescription(
    'Export a crisp SVG mark instantly, then optionally generate a raster concept prompt and queue it to ComfyUI or a cloud engine.',
    'Logo marks — download SVG now or queue a raster concept.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'logo',
    DEFAULT_LOGO_TOOL_CACHE
  );
  const actions = usePromptResultActions({
    tool: 'logo',
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.brandName,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<LogoGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const brandName = toolSettings.brandName ?? '';
  const tagline = toolSettings.tagline ?? '';
  const industry = toolSettings.industry ?? '';
  const stylePreset = (toolSettings.stylePreset ?? 'app-icon') as LogoStylePresetId;
  const motif = (toolSettings.motif ?? 'studio-bars') as LogoMotifId;

  useSeedToolDraft(mounted, {
    toolKey: 'logo',
    label: 'Logo',
    href: '/logo',
    fields: [brandName, tagline, industry, output],
  });

  const selectedModel = getComfyModelDefinition(shared.model);

  const svgPreview = useMemo(
    () =>
      buildLogoSvg({
        brandName: brandName || 'Brand',
        tagline,
        motif,
        stylePreset,
        includeWordmark: toolSettings.includeWordmark !== false,
        colors: {
          primary: toolSettings.colorPrimary,
          secondary: toolSettings.colorSecondary,
          accent: toolSettings.colorAccent,
        },
      }),
    [
      brandName,
      tagline,
      motif,
      stylePreset,
      toolSettings.includeWordmark,
      toolSettings.colorPrimary,
      toolSettings.colorSecondary,
      toolSettings.colorAccent,
    ]
  );

  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPreview)}`,
    [svgPreview]
  );

  const rememberDraft = useCallback(() => {
    rememberDraftFields({
      toolKey: 'logo',
      label: 'Logo',
      href: '/logo',
      fields: [brandName, tagline, industry, output],
    });
  }, [brandName, industry, output, tagline]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch('/api/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName,
          tagline,
          industry,
          stylePreset,
          motif,
          includeWordmark: toolSettings.includeWordmark !== false,
          extraNotes: toolSettings.extraNotes,
          model: shared.model,
          detail: shared.detail,
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as LogoGenerateResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
      }

      const prompt = data.prompt ?? '';
      setOutput(prompt);
      setResult({
        prompt,
        provider: data.provider,
        metadata: data.metadata,
      });
      rememberDraft();
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [
    actions,
    brandName,
    industry,
    motif,
    rememberDraft,
    shared,
    stylePreset,
    tagline,
    toolSettings.extraNotes,
    toolSettings.includeWordmark,
  ]);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  const handleDownloadSvg = useCallback(() => {
    downloadLogoSvg(svgPreview, logoSvgFilename(brandName || 'logo'));
  }, [brandName, svgPreview]);

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          <BrandBars size="sm" className="mr-1" />
          Logo
        </ToolBadge>
      }
      title="Logo"
      description={description}
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          detailHelp="Balanced or Rich helps the LLM describe palette and shape language."
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={[brandName, tagline, industry, toolSettings.extraNotes]
            .filter(Boolean)
            .join(' ')}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.logo} />

      <ToolPrimarySection title="Vector mark (instant)">
        <p className="type-caption text-[var(--text-muted)]">
          Download a clean SVG without waiting on ComfyUI. Tune colors and motif, then export for
          favicons, GitHub org avatars, or app icons.
        </p>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] lg:items-start">
          <div className="ui-media-card overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL preview */}
            <img
              src={svgDataUrl}
              alt={brandName ? `${brandName} logo preview` : 'Logo preview'}
              className="mx-auto aspect-square w-full max-w-[12rem] object-contain"
            />
          </div>
          <div className="space-y-3">
            <Button type="button" variant="primary" size="sm" onClick={handleDownloadSvg}>
              Download SVG
            </Button>
            <p className="type-caption text-[var(--text-muted)]">
              Tip: square raster queues read best at 1024×1024 with a solid background.
            </p>
          </div>
        </div>
      </ToolPrimarySection>

      <ToolSection title="Brand brief">
        <FieldLabel>Brand name</FieldLabel>
        <TextInput
          value={brandName}
          onChange={event => {
            updateToolSettings({ brandName: event.target.value });
            rememberDraftFields({
              toolKey: 'logo',
              label: 'Logo',
              href: '/logo',
              fields: [event.target.value, tagline, industry],
            });
          }}
          placeholder="Castcut"
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel hint="Optional — appears under the mark in SVG export.">Tagline</FieldLabel>
        <TextInput
          value={tagline}
          onChange={event => updateToolSettings({ tagline: event.target.value })}
          placeholder="ComfyUI prompt · queue · gallery"
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel hint="Helps the LLM pick shape language and mood.">Industry / vibe</FieldLabel>
        <TextInput
          value={industry}
          onChange={event => updateToolSettings({ industry: event.target.value })}
          placeholder="creative tools, developer studio, AI imaging"
          className={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Style preset</FieldLabel>
        <select
          value={stylePreset}
          onChange={event => {
            const next = event.target.value as LogoStylePresetId;
            const preset = LOGO_STYLE_PRESETS.find(entry => entry.id === next);
            updateToolSettings({
              stylePreset: next,
              motif: preset?.defaultMotif ?? motif,
            });
          }}
          className="ui-input w-full px-4 py-2 text-sm"
        >
          {LOGO_STYLE_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.label} — {preset.summary}
            </option>
          ))}
        </select>

        <FieldLabel>SVG motif</FieldLabel>
        <select
          value={motif}
          onChange={event => updateToolSettings({ motif: event.target.value as LogoMotifId })}
          className="ui-input w-full px-4 py-2 text-sm"
        >
          {LOGO_MOTIF_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Primary</span>
            <TextInput
              value={toolSettings.colorPrimary ?? DEFAULT_LOGO_COLORS.primary}
              onChange={event => updateToolSettings({ colorPrimary: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Secondary</span>
            <TextInput
              value={toolSettings.colorSecondary ?? DEFAULT_LOGO_COLORS.secondary}
              onChange={event => updateToolSettings({ colorSecondary: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Accent</span>
            <TextInput
              value={toolSettings.colorAccent ?? DEFAULT_LOGO_COLORS.accent}
              onChange={event => updateToolSettings({ colorAccent: event.target.value })}
              className={accentFocusClass(ACCENT)}
            />
          </label>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={toolSettings.includeWordmark !== false}
            onChange={event => updateToolSettings({ includeWordmark: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentRingClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Include wordmark in SVG
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Adds the brand name under the mark in the exported vector file.
            </span>
          </span>
        </label>

        <FieldLabel hint="Optional direction for the raster prompt.">Extra notes</FieldLabel>
        <TextArea
          rows={3}
          value={toolSettings.extraNotes ?? ''}
          onChange={event => updateToolSettings({ extraNotes: event.target.value })}
          placeholder="Rounded corners, teal + sand palette, no mascot"
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          loading={loading}
          loadingLabel="Writing logo prompt"
          disabled={!brandName.trim()}
        >
          Generate raster prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        provider={result?.provider ?? null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        extraMeta={
          result?.metadata?.stylePreset
            ? `preset: ${String(result.metadata.stylePreset)} · square raster recommended`
            : 'square 1024×1024 recommended for logo concepts'
        }
        diagnostics={actions.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: brandName,
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, brandName)}
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
            metadata: result?.metadata,
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
        label="Queue logo concept"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(output)}
      />
    </ToolLayout>
  );
}
