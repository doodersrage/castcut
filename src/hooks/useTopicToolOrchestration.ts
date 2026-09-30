'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BatchQueueProgressState } from '@/components/BatchQueueProgress';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { resolveQueueNegativePrompt } from '@/lib/queue-negative';
import { DEFAULT_TOPIC_TOOL_CACHE } from '@/lib/settings-cache';
import { runWorkflowPreflight } from '@/lib/workflow-preflight';
import { runBatchLintGate, type BatchLintSummary } from '@/lib/batch-lint-gate';
import {
  buildTopicsVariationsHandoff,
  loadTopicsVariationsHandoff,
  saveTopicsVariationsHandoff,
  variationsPathFromTopics,
} from '@/lib/topics-variations-handoff';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { BatchFromTopicsItem } from '@/lib/batch-from-topics';
import type { TopicGenerateResult } from '@/lib/specialized/types';
import { resolveRuntimeForQueue } from '@/lib/comfyui-runtime-for-model';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { registerComfyGalleryJob } from '@/lib/comfyui-gallery-client';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { postComfyUiPrompt } from '@/lib/comfyui-queue-request';
import { resolveSceneHintsForGeneration } from '@/components/scene-tool/HistoryHintSeedPanel';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import { scoreBatchReadiness } from '@/lib/batch-readiness';

export function useTopicToolOrchestration() {
  const router = useRouter();
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'topics',
    DEFAULT_TOPIC_TOOL_CACHE
  );
  const { getRecent: getRecentClothing } = useRecentClothing();
  const { getRecent: getRecentLocations } = useRecentLocations();
  const { getBlocklist } = useLocationBlocklist();

  useSeedToolDraft(mounted, {
    toolKey: 'topics',
    label: 'Topics',
    href: '/topics',
    fields: [toolSettings.seedTopic],
  });

  const [topics, setTopics] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<BatchFromTopicsItem[]>([]);
  const [provider, setProvider] = useState<TopicGenerateResult['provider'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [comfyBatchStatus, setComfyBatchStatus] = useState<string | null>(null);
  const [lintSummary, setLintSummary] = useState<BatchLintSummary | null>(null);
  const [lintLoading, setLintLoading] = useState(false);
  const [pendingQueuePrompts, setPendingQueuePrompts] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | 'all' | 'batch' | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);
  const [queueProgress, setQueueProgress] = useState<BatchQueueProgressState | null>(null);

  const batchTarget = toolSettings.batchTarget ?? 'generate';
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates('generate', historySeedScope);
  const effectiveSeedTopic = resolveSceneHintsForGeneration({
    hintSource,
    hints: toolSettings.seedTopic,
    randomTheme: toolSettings.randomTheme,
  });

  const batchReadiness = useMemo(
    () =>
      scoreBatchReadiness({
        rows: batchResults.map(entry => ({
          prompt: entry.prompt,
          label: entry.topic,
          hints: toolSettings.seedTopic,
        })),
        model: shared.model,
        detail: shared.detail,
      }),
    [batchResults, shared.detail, shared.model, toolSettings.seedTopic]
  );
  const readinessByIndex = useMemo(
    () => new Map(batchReadiness.map(row => [row.index, row])),
    [batchReadiness]
  );

  useEffect(() => {
    if (!mounted) {
      return;
    }
    scheduleAfterCommit(() => {
      if (new URLSearchParams(window.location.search).get('from') !== 'gallery') {
        return;
      }
      const handoff = loadTopicsVariationsHandoff();
      if (!handoff) {
        return;
      }
      setBatchResults(
        handoff.prompts.map((prompt, index) => ({
          topic: handoff.topics[index] ?? prompt.slice(0, 80),
          prompt,
          provider: 'template' as const,
        }))
      );
      setBatchStatus(`Loaded ${handoff.prompts.length} prompts from Gallery.`);
    });
  }, [mounted]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopiedIndex(null);
    setBatchResults([]);

    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedTopic: effectiveSeedTopic,
          count: toolSettings.count,
          variety: toolSettings.variety,
          recentLocations: [],
          blockedLocations: getBlocklist(),
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as TopicGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
      }

      setTopics(data.topics);
      setProvider(data.provider);
    } catch (err) {
      setTopics([]);
      setProvider(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [toolSettings, getBlocklist, effectiveSeedTopic, shared]);

  const batchGenerate = useCallback(async () => {
    if (topics.length === 0) {
      return;
    }

    setBatchLoading(true);
    setBatchStatus(null);
    setError(null);

    try {
      const response = await fetch('/api/topics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics,
          target: batchTarget,
          model: shared.model,
          detail: shared.detail,
          recentClothing: getRecentClothing(),
          recentLocations: getRecentLocations(),
          alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
          seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
          distinctPeople: true,
          teamKit: batchTarget === 'duo',
          lockedWardrobeId: shared.lockedWardrobeId,
          lockedLocation: shared.lockedLocation,
          variationSeed: shared.lockedVariationSeed,
          blockedLocations: getBlocklist(),
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as {
        results?: BatchFromTopicsItem[];
        count?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Batch generation failed.');
      }

      setBatchResults(data.results ?? []);
      setBatchStatus(
        `Generated ${data.count ?? data.results?.length ?? 0} prompts via ${batchTarget}.`
      );
    } catch (err) {
      setBatchResults([]);
      setError(err instanceof Error ? err.message : 'Batch generation failed.');
    } finally {
      setBatchLoading(false);
    }
  }, [topics, batchTarget, shared, getRecentClothing, getRecentLocations, getBlocklist]);

  const executeComfyQueue = useCallback(
    async (prompts: string[]) => {
      if (prompts.length === 0) {
        return;
      }

      setComfyBatchStatus('Queueing batch to ComfyUI…');
      setQueueProgress({
        phase: 'preflight',
        current: 0,
        total: prompts.length,
        message: 'Validating workflow placeholders…',
      });
      try {
        const negativePrompt = await resolveQueueNegativePrompt({
          model: shared.model,
          hints: toolSettings.seedTopic ?? batchResults[0]?.topic,
          tool: 'topics',
        });
        const preflight = await runWorkflowPreflight({
          model: shared.model,
          prompts,
          negativePrompt,
          tool: 'topics',
        });
        if (!preflight.ok) {
          throw new Error(
            preflight.issues
              .filter(issue => issue.severity === 'error')
              .map(issue => issue.message)
              .join(' · ') || 'Workflow pre-flight failed.'
          );
        }
        const { guardQueueQualityForVram } = await import('@/lib/vram-queue-guard');
        const { maybeHoldMaxGenerateJobs } = await import('@/lib/held-max-queue');
        const { toastHeldMax } = await import('@/lib/app-toast');
        const baseRuntime = resolveRuntimeForQueue(shared.model, 'topics');
        const vramGuard = await guardQueueQualityForVram({ runtime: baseRuntime });
        const runtime = vramGuard.runtime ?? baseRuntime;
        setQueueProgress({
          phase: 'queueing',
          current: 0,
          total: prompts.length,
          message: vramGuard.downgraded
            ? 'Max → Final (VRAM) · submitting…'
            : 'Submitting prompts to ComfyUI…',
        });
        const paramsPerPrompt = prompts.map((_, index) =>
          resolveQueueParams({
            model: shared.model,
            tool: 'topics',
            base: { seed: String(Math.floor(Math.random() * 2 ** 32) + index) },
            qualityProfile: vramGuard.profile,
          })
        );
        const held = await maybeHoldMaxGenerateJobs({
          profile: vramGuard.profile,
          jobs: prompts.map((prompt, index) => ({
            prompt,
            negativePrompt,
            model: shared.model,
            tool: 'topics',
            params: paramsPerPrompt[index],
            comfy: runtime,
          })),
        });
        if (held.held) {
          setQueueProgress(null);
          toastHeldMax({
            text: 'Max topics held until ComfyUI queue is idle',
            count: held.count,
          });
          return;
        }
        const queued = await postComfyUiPrompt({
          prompts,
          negativePrompt,
          paramsPerPrompt,
          ...(runtime ? { comfy: runtime } : {}),
        });
        const data = queued.raw as {
          queued?: number;
          error?: string;
          comfyUrl?: string;
          results?: Array<{ promptId?: string; comfyUrl?: string }>;
        };
        if (queued.status >= 400) {
          queued.releaseLiveSocket();
          throw new Error(queued.error ?? data.error ?? 'ComfyUI batch queue failed.');
        }

        for (const [index, result] of (data.results ?? []).entries()) {
          if (!result.promptId) {
            continue;
          }
          const comfyUrl =
            result.comfyUrl ?? data.comfyUrl ?? queued.comfyUrl ?? 'http://127.0.0.1:8188';
          registerComfyGalleryJob({
            promptId: result.promptId,
            prompt: prompts[index] ?? '',
            negativePrompt,
            tool: 'topics',
            model: shared.model,
            comfyUrl,
            clientId: queued.clientId,
            queueParams: paramsPerPrompt[index],
            queueQualityProfile: runtime.queueQualityProfile,
          });
          void scheduleComfyGalleryPoll(result.promptId, {
            comfyUrl,
            clientId: queued.clientId,
          });
        }
        queued.releaseLiveSocket();

        const queuedCount = data.queued ?? (data.results ?? []).filter(r => r.promptId).length;
        const failures = (data.results ?? [])
          .map((result, index) =>
            result.promptId
              ? null
              : {
                  label: batchResults[index]?.topic ?? `Row ${index + 1}`,
                  message: 'No promptId returned',
                }
          )
          .filter(Boolean) as Array<{ label: string; message: string }>;

        setQueueProgress({
          phase: 'done',
          current: queuedCount,
          total: prompts.length,
          message:
            `Queued ${queuedCount}/${prompts.length} · ${data.comfyUrl ?? queued.comfyUrl ?? ''}`.trim(),
          failures: failures.length > 0 ? failures : undefined,
        });

        setComfyBatchStatus(
          `Queued ${queuedCount}/${prompts.length} · ${data.comfyUrl ?? queued.comfyUrl ?? ''}`.trim()
        );
        setLintSummary(null);
        setPendingQueuePrompts([]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'ComfyUI batch failed.';
        setQueueProgress({
          phase: 'error',
          current: 0,
          total: prompts.length,
          message,
        });
        setComfyBatchStatus(message);
      }
    },
    [batchResults, shared.model, toolSettings.seedTopic]
  );

  const queueBatchComfyUi = useCallback(async () => {
    const prompts = batchResults.map(entry => entry.prompt.trim()).filter(Boolean);
    if (prompts.length === 0) {
      return;
    }

    setLintLoading(true);
    setLintSummary(null);
    try {
      const summary = await runBatchLintGate(batchResults, toolSettings.seedTopic);
      setLintSummary(summary);
      setPendingQueuePrompts(prompts);
    } finally {
      setLintLoading(false);
    }
  }, [batchResults, toolSettings.seedTopic]);

  const sendToVariations = useCallback(() => {
    if (batchResults.length === 0) {
      return;
    }
    const target =
      batchTarget === 'duo' ? 'duo' : batchTarget === 'character' ? 'character' : batchTarget;
    saveTopicsVariationsHandoff(
      buildTopicsVariationsHandoff(
        batchResults,
        target as 'generate' | 'duo' | 'character' | 'pet' | 'fantasy' | 'background',
        toolSettings.seedTopic
      )
    );
    router.push(variationsPathFromTopics());
  }, [batchResults, batchTarget, router, toolSettings.seedTopic]);

  const copyTopics = useCallback(async (value: string, index: number | 'all' | 'batch') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, []);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    topics,
    setTopics,
    batchResults,
    setBatchResults,
    provider,
    loading,
    batchLoading,
    error,
    setError,
    batchStatus,
    comfyBatchStatus,
    lintSummary,
    setLintSummary,
    lintLoading,
    pendingQueuePrompts,
    setPendingQueuePrompts,
    copiedIndex,
    setCopiedIndex,
    readyOnly,
    setReadyOnly,
    queueProgress,
    setQueueProgress,
    batchTarget,
    hintSource,
    historySeedScope,
    historyCandidateCount,
    effectiveSeedTopic,
    batchReadiness,
    readinessByIndex,
    generate,
    batchGenerate,
    executeComfyQueue,
    queueBatchComfyUi,
    sendToVariations,
    copyTopics,
  };
}
