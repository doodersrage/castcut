'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import type { DetailLevel } from '@/lib/detail-level';
import { getDetailLimits } from '@/lib/detail-level';
import { getComfyModelDefinition, type ComfyImageModel } from '@/lib/comfy-models/client';
import { DEFAULT_GENERATE_TOOL_CACHE } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { readVariationSeedFromResult } from '@/lib/variation-seed-metadata';
import { applyRatingDrivenWildness } from '@/lib/rating-driven-random';
import { resolveModelForPromptGeneration } from '@/lib/queue-tool-model';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { normalizeHistorySeedScope, resolveGenerateHintSource } from '@/lib/scene-hint-source';
import { consumeGenerateHandoff } from '@/lib/generate-handoff';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import type { PromptMode } from '@/hooks/generate/generate-tool-orchestration-types';

export function useGenerateToolOrchestrationCore() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'generate',
    DEFAULT_GENERATE_TOOL_CACHE
  );
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [mode, setMode] = useState<PromptMode>(DEFAULT_GENERATE_TOOL_CACHE.mode ?? 'positive');
  const [output, setOutput] = useState('');
  const [handoffNegative, setHandoffNegative] = useState('');
  const [showHandoffNegative, setShowHandoffNegative] = useState(false);
  const [provider, setProvider] = useState<'llm' | 'template' | null>(null);
  const [randomResult, setRandomResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [randomSeed, setRandomSeed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resultMeta, setResultMeta] = useState<{
    model: ComfyImageModel;
    comfyNode: string;
    limits: {
      minChars?: number;
      maxChars: number;
      maxSentences: number;
      maxTokens: number;
    };
    metadata?: {
      rawPrompt?: string;
      wardrobeAssignments?: Array<{
        wardrobeId?: string | null;
        footwearId?: string | null;
        accessoriesId?: string | null;
      }>;
    };
  } | null>(null);

  const pendingFirstRunRef = useRef({
    autogen: false,
    autoqueue: false,
    generated: false,
    queued: false,
  });

  const input = toolSettings.hints ?? '';
  const setInput = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberDraftFields({
        toolKey: 'generate',
        label: 'Generate',
        href: '/',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'generate',
    label: 'Generate',
    href: '/',
    fields: [input],
  });

  const hintSource = resolveGenerateHintSource(toolSettings);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const genre = toolSettings.genre ?? '';
  const includePeople = toolSettings.includePeople !== false;
  const wildness = toolSettings.wildness ?? 65;
  const effectiveWildness = useMemo(() => applyRatingDrivenWildness(wildness), [wildness]);

  const queueModel = shared.model;
  const generateModel = useMemo(
    () => resolveModelForPromptGeneration(queueModel, 'generate'),
    [queueModel]
  );
  const detail = shared.detail;
  const variationEnabled = toolSettings.variationEnabled ?? true;
  const variationStrength = toolSettings.variationStrength ?? 65;
  const distinctPeople = toolSettings.distinctPeople ?? true;
  const alwaysIncludeClothing = shared.alwaysIncludeClothing === true;
  const seedLlmWithIngredients = shared.seedLlmWithIngredients === true;
  const autoFixRules = shared.autoFixRules !== false;

  const actions = usePromptResultActions({
    tool: hintSource === 'random' ? 'randomScene' : 'generate',
    model: queueModel,
    detail,
    hints: hintSource === 'random' ? genre : input,
    autoFixRules,
    reformatTarget: getReformatTargetModel(generateModel),
  });

  const variationSeed = readVariationSeedFromResult(
    randomResult ?? { metadata: undefined, seed: undefined }
  );

  const setQueueModel = (model: ComfyImageModel) => updateShared({ model });
  const setDetail = (value: DetailLevel) => updateShared({ detail: value });
  const setVariationEnabled = (enabled: boolean) =>
    updateToolSettings({ variationEnabled: enabled });
  const setVariationStrength = (strength: number) =>
    updateToolSettings({ variationStrength: strength });
  const setDistinctPeople = (value: boolean) => updateToolSettings({ distinctPeople: value });
  const setModeAndCache = (value: PromptMode) => {
    setMode(value);
    updateToolSettings({ mode: value });
  };

  const selectedModel = useMemo(() => getComfyModelDefinition(generateModel), [generateModel]);

  const activeLimits = useMemo(
    () => getDetailLimits(detail, generateModel),
    [detail, generateModel]
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (toolSettings.mode) {
        setMode(toolSettings.mode);
      }
    });
  }, [toolSettings.mode]);

  useEffect(() => {
    const handoff = consumeGenerateHandoff();
    if (!handoff) {
      return;
    }
    scheduleAfterCommit(() => {
      setOutput(handoff.prompt);
      const negative = handoff.negativePrompt?.trim() || '';
      setHandoffNegative(negative);
      setShowHandoffNegative(Boolean(negative));
      updateToolSettings({ hintSource: 'manual', generateSource: 'keywords' });
    });
  }, [updateToolSettings]);

  const setHintSource = (value: import('@/lib/scene-hint-source').SceneHintSource) =>
    updateToolSettings({
      hintSource: value,
      generateSource: value === 'random' ? 'random' : 'keywords',
    });

  const historyCandidateCount = mounted
    ? countHistorySeedCandidates('generate', historySeedScope)
    : 0;
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few prompts to Studio history first, or switch hint source.'
      : hintSource === 'manual' && !input.trim()
        ? 'Enter scene keywords above to enable generation.'
        : null;

  const submitDisabled =
    !mounted ||
    loading ||
    (hintSource === 'random'
      ? false
      : hintSource === 'history'
        ? historyCandidateCount === 0
        : !input.trim());
  const submitDisabledReason = generateDisabledReason ?? (loading ? 'Generating…' : null);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    mode,
    setMode,
    output,
    setOutput,
    handoffNegative,
    setHandoffNegative,
    showHandoffNegative,
    setShowHandoffNegative,
    provider,
    setProvider,
    randomResult,
    setRandomResult,
    randomSeed,
    setRandomSeed,
    loading,
    setLoading,
    error,
    setError,
    copied,
    setCopied,
    resultMeta,
    setResultMeta,
    pendingFirstRunRef,
    input,
    setInput,
    hintSource,
    historySeedScope,
    genre,
    includePeople,
    wildness,
    effectiveWildness,
    queueModel,
    generateModel,
    detail,
    variationEnabled,
    variationStrength,
    distinctPeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients,
    autoFixRules,
    actions,
    variationSeed,
    setQueueModel,
    setDetail,
    setVariationEnabled,
    setVariationStrength,
    setDistinctPeople,
    setModeAndCache,
    selectedModel,
    activeLimits,
    setHintSource,
    getRecent,
    getRecentClothing,
    recordClothing,
    recordLocation,
    getBlocklist,
    historyCandidateCount,
    generateDisabledReason,
    submitDisabled,
    submitDisabledReason,
  };
}

export type GenerateToolOrchestrationCore = ReturnType<typeof useGenerateToolOrchestrationCore>;
