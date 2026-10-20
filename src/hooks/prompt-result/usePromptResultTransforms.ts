'use client';

import { useCallback, useState } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { formatPromptPair, modelUsesNegativePrompt } from '@/lib/prompt-pair';
import { buildPromptSidecar, downloadPromptSidecar } from '@/lib/prompt-sidecar';
import type { WorkflowParamValues } from '@/lib/comfyui/config';
import { resolveQueueNegativePrompt } from '@/lib/queue-negative';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { loadSettingsCache } from '@/lib/settings-cache';
import { prepareQueuePrompts } from '@/lib/queue-prompt-prep';
import type { GenerationDiagnostics } from '@/lib/generation-diagnostics';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

type TransformsDeps = {
  diagnostics: GenerationDiagnostics | null;
  lintPrompt: (prompt: string, hints?: string) => Promise<GenerationDiagnostics | null>;
  applyRuleFix: (
    prompt: string,
    hints?: string
  ) => Promise<{
    prompt?: string;
    changes?: Array<{ description: string }>;
    error?: string;
  }>;
  saveHistory: (input: {
    prompt: string;
    hints?: string;
    metadata?: Record<string, unknown>;
    parentHistoryId?: string;
  }) => string | undefined;
  sendComfyUi: (
    prompt: string,
    sport?: AthleticSport | null,
    historyId?: string,
    options?: object
  ) => Promise<string | undefined>;
  setFixStatus: (status: string | null) => void;
};

export function usePromptResultTransforms(config: PromptResultActionsConfig, deps: TransformsDeps) {
  const { diagnostics, lintPrompt, applyRuleFix, saveHistory, sendComfyUi, setFixStatus } = deps;
  const [pairCopied, setPairCopied] = useState(false);
  const [compactStatus, setCompactStatus] = useState<string | null>(null);
  const [reformatStatus, setReformatStatus] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  const resetStatuses = useCallback(() => {
    setPairCopied(false);
    setCompactStatus(null);
    setReformatStatus(null);
    setPipelineStatus(null);
  }, []);

  const fetchNegative = useCallback(
    async (sport?: AthleticSport | null) => {
      return resolveQueueNegativePrompt({
        model: config.model,
        hints: config.hints,
        sport,
        tool: config.tool,
      });
    },
    [config.hints, config.model, config.tool]
  );

  const copyPromptPair = useCallback(
    async (prompt: string, sport?: AthleticSport | null, explicitNegative?: string) => {
      if (!prompt) {
        return;
      }

      try {
        const { positive, negative } = await prepareQueuePrompts({
          model: config.model,
          positive: prompt,
          hints: config.hints,
          sport,
          tool: config.tool,
          explicitNegative,
          embeddingTokens: loadSettingsCache().shared.sessionEmbeddingTokens,
          turboEditStrength: loadSettingsCache().shared.turboEditStrength,
        });
        const text = formatPromptPair({
          positive,
          negative,
          model: config.model,
        });
        await navigator.clipboard.writeText(text);
        setPairCopied(true);
        window.setTimeout(() => setPairCopied(false), 2000);
      } catch {
        setFixStatus('Could not copy prompt pair.');
      }
    },
    [config.hints, config.model, config.tool, setFixStatus]
  );

  const compactPrompt = useCallback(
    async (prompt: string, onCompacted: (next: string) => void) => {
      if (!prompt.trim()) {
        return;
      }

      setCompactStatus('Compacting…');
      try {
        const response = await fetch('/api/compact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model: config.model,
            detail: config.detail ?? 'balanced',
          }),
        });

        const data = (await response.json()) as {
          prompt?: string;
          beforeChars?: number;
          afterChars?: number;
          maxChars?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? 'Compact failed.');
        }

        if (data.prompt) {
          onCompacted(data.prompt);
          await lintPrompt(data.prompt, config.hints);
        }

        setCompactStatus(
          data.beforeChars != null && data.afterChars != null
            ? `Compacted ${data.beforeChars} → ${data.afterChars} chars (max ${data.maxChars})`
            : 'Compacted to model limit.'
        );
      } catch (err) {
        setCompactStatus(err instanceof Error ? err.message : 'Compact failed.');
      }
    },
    [config.model, config.detail, config.hints, lintPrompt]
  );

  const reformatForModel = useCallback(
    async (
      prompt: string,
      onReformatted: (next: string) => void,
      targetModel?: ComfyImageModel
    ) => {
      const model = targetModel ?? config.reformatTarget;
      if (!prompt.trim() || !model) {
        return;
      }

      setReformatStatus(`Reformatting for ${model}…`);
      try {
        const response = await fetch('/api/format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: prompt,
            mode: 'positive',
            model,
            detail: config.detail ?? 'balanced',
            smartFormat: true,
          }),
        });

        const data = (await response.json()) as { prompt?: string; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? 'Reformat failed.');
        }

        if (data.prompt) {
          onReformatted(data.prompt);
          saveHistory({
            prompt: data.prompt,
            hints: config.hints,
            parentHistoryId: resolveParentHistoryId(),
            metadata: { reformattedFrom: config.model, reformattedTo: model },
          });
        }

        setReformatStatus(`Reformatted for ${model}.`);
      } catch (err) {
        setReformatStatus(err instanceof Error ? err.message : 'Reformat failed.');
      }
    },
    [config.detail, config.hints, config.model, config.reformatTarget, saveHistory]
  );

  const exportSidecar = useCallback(
    async (
      prompt: string,
      extras?: {
        comfyNode?: string;
        metadata?: Record<string, unknown>;
        variationSeed?: string | null;
      }
    ) => {
      if (!prompt.trim()) {
        return;
      }

      let negative: string | undefined;
      if (modelUsesNegativePrompt(config.model)) {
        negative = (await fetchNegative()) ?? undefined;
      }

      downloadPromptSidecar(
        buildPromptSidecar({
          positive: prompt,
          negative,
          model: config.model,
          detail: config.detail,
          comfyNode: extras?.comfyNode,
          hints: config.hints,
          tool: config.tool,
          variationSeed: extras?.variationSeed ?? undefined,
          diagnostics,
          metadata: extras?.metadata,
        })
      );
    },
    [config.model, config.detail, config.hints, config.tool, diagnostics, fetchNegative]
  );

  const runExportPipeline = useCallback(
    async (
      prompt: string,
      onUpdate: (next: string) => void,
      options?: {
        sport?: AthleticSport | null;
        maxChars?: number;
        queueComfyUi?: boolean;
        inputImage?: File | null;
        inputImageFilename?: string;
        inputImageUrl?: string;
        inputImages?: Array<File | null | undefined>;
        inputImageUrls?: Array<string | undefined>;
        inputImageFilenames?: string[];
        maskImage?: File | null;
        maskImageFilename?: string;
        maskImageUrl?: string;
        queueParamsBase?: WorkflowParamValues;
        identityLock?: boolean;
        identityLockStrength?: number;
        identityKind?: import('@/lib/compose-identity-lock').ComposeIdentityKind;
      }
    ) => {
      if (!prompt.trim()) {
        return;
      }

      setPipelineStatus('Linting…');
      let current = prompt;

      try {
        const lint = await lintPrompt(current, config.hints);
        const hasErrors = lint?.issues.some(issue => issue.severity === 'error');

        if (hasErrors && config.autoFixRules !== false) {
          setPipelineStatus('Applying rule fixes…');
          const data = await applyRuleFix(current, config.hints);
          if (data.prompt) {
            current = data.prompt;
            onUpdate(current);
            await lintPrompt(current, config.hints);
          }
        }

        if (options?.maxChars && current.length > options.maxChars) {
          setPipelineStatus('Compacting to model limit…');
          const response = await fetch('/api/compact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: current,
              model: config.model,
              detail: config.detail ?? 'balanced',
            }),
          });
          const data = (await response.json()) as { prompt?: string; error?: string };
          if (response.ok && data.prompt) {
            current = data.prompt;
            onUpdate(current);
          }
        }

        setPipelineStatus('Copying prompt pair…');
        await copyPromptPair(current, options?.sport);

        if (options?.queueComfyUi) {
          setPipelineStatus('Queueing ComfyUI…');
          await sendComfyUi(current, options?.sport, undefined, {
            inputImage: options?.inputImage,
            inputImageFilename: options?.inputImageFilename,
            inputImageUrl: options?.inputImageUrl,
            inputImages: options?.inputImages,
            inputImageUrls: options?.inputImageUrls,
            inputImageFilenames: options?.inputImageFilenames,
            maskImage: options?.maskImage,
            maskImageFilename: options?.maskImageFilename,
            maskImageUrl: options?.maskImageUrl,
            queueParamsBase: options?.queueParamsBase,
            identityLock: options?.identityLock,
            identityLockStrength: options?.identityLockStrength,
            identityKind: options?.identityKind,
          });
          setPipelineStatus('Pipeline complete · pair copied · queued');
        } else {
          setPipelineStatus('Pipeline complete · pair copied');
        }
      } catch (err) {
        setPipelineStatus(err instanceof Error ? err.message : 'Pipeline failed.');
      }
    },
    [
      applyRuleFix,
      config.autoFixRules,
      config.detail,
      config.hints,
      config.model,
      copyPromptPair,
      lintPrompt,
      sendComfyUi,
    ]
  );

  return {
    pairCopied,
    compactStatus,
    reformatStatus,
    pipelineStatus,
    resetStatuses,
    copyPromptPair,
    compactPrompt,
    reformatForModel,
    exportSidecar,
    runExportPipeline,
  };
}
