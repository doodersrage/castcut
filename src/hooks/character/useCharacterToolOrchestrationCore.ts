'use client';

import { useEffect, useState } from 'react';
import { applyHintSourceFromSearchParams } from '@/lib/app/tool-url-params';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import {
  fetchClothingLabels,
  getCachedClothingLabel,
} from '@/lib/wardrobe/clothing-catalog-client';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/edit/reformat-target';
import { DEFAULT_CHARACTER_TOOL_CACHE, type CharacterSceneMode } from '@/lib/settings/cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { readVariationSeedFromResult } from '@/lib/variation/seed-metadata';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene/preset-url';
import { getSportPreset } from '@/lib/scene/sport-presets';
import { type ToolAccent } from '@/lib/app/tool-theme';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene/hint-source';
import { countHistorySeedCandidates } from '@/lib/prompt/history-hint-seed';
import { useCachedSettings } from '@/hooks/useCachedSettings';

const SOLO_BATCH_COUNT = 3;

export const CHARACTER_SCENE_MODE_OPTIONS: Array<{
  value: CharacterSceneMode;
  label: string;
  description: string;
}> = [
  { value: 'solo', label: 'Solo', description: 'Single person portrait or action' },
  { value: 'duo', label: 'Duo / sport', description: 'Two people, teams, and competition' },
  {
    value: 'compose',
    label: 'With background',
    description: 'Subject plus generated environment merged together',
  },
];

export function accentForSceneMode(mode: CharacterSceneMode): ToolAccent {
  if (mode === 'duo') {
    return 'emerald';
  }
  if (mode === 'compose') {
    return 'cyan';
  }
  return 'sky';
}

function historyToolForSceneMode(mode: CharacterSceneMode): 'character' | 'duo' | 'scene-compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'scene-compose';
  }
  return 'character';
}

function historySeedToolForSceneMode(mode: CharacterSceneMode): 'character' | 'duo' | 'compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'compose';
  }
  return 'character';
}

export function presetVariantForSceneMode(mode: CharacterSceneMode): 'solo' | 'duo' | 'compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'compose';
  }
  return 'solo';
}

function defaultPortraitStyle(mode: CharacterSceneMode): 'portrait' | 'full-body' | 'action' {
  return mode === 'solo' ? 'portrait' : 'action';
}

function parseSceneMode(value: string | null): CharacterSceneMode | null {
  if (value === 'solo' || value === 'duo' || value === 'compose') {
    return value;
  }
  return null;
}

export function useCharacterToolOrchestrationCore() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'character',
    DEFAULT_CHARACTER_TOOL_CACHE
  );
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  useSeedToolDraft(mounted, {
    toolKey: 'character',
    label: 'Character',
    href: '/character',
    fields: [toolSettings.hints],
  });
  const [output, setOutput] = useState('');
  const [batchResults, setBatchResults] = useState<EnrichedToolGenerateResult[]>([]);
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();

  useEffect(() => {
    const id = shared.lockedWardrobeId?.trim();
    if (!id) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(undefined));
      return;
    }

    const cached = getCachedClothingLabel(id);
    if (cached) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(cached));
      return;
    }

    let cancelled = false;
    void fetchClothingLabels([id]).then(labels => {
      if (cancelled) {
        return;
      }
      setLockedWardrobeLabel(labels.get(id) ?? id);
    });

    return () => {
      cancelled = true;
    };
  }, [shared.lockedWardrobeId]);

  const sceneMode = toolSettings.sceneMode ?? 'solo';
  const accent = accentForSceneMode(sceneMode);
  const historyTool = historyToolForSceneMode(sceneMode);
  const historySeedTool = historySeedToolForSceneMode(sceneMode);
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates(historySeedTool, historySeedScope);
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few character prompts to Studio history first, or switch hint source.'
      : null;
  const portraitStyle = toolSettings.portraitStyle ?? defaultPortraitStyle(sceneMode);

  const actions = usePromptResultActions({
    tool: historyTool,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const inferredSport = result?.diagnostics?.inferred.sport ?? null;
  const variationSeed = readVariationSeedFromResult(result ?? {});

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    applyHintSourceFromSearchParams(params, updateToolSettings);
    const mode = parseSceneMode(params.get('mode'));
    if (mode) {
      updateToolSettings({ sceneMode: mode });
    }

    const hints = params.get('hints');
    const seed = params.get('seed');
    if (hints?.trim()) {
      updateToolSettings({
        hints: hints.trim(),
        ...(params.get('hintSource') === 'manual' ? { hintSource: 'manual' } : {}),
      });
    }
    if (seed?.trim()) {
      updateShared({ lockedVariationSeed: seed.trim() });
    }

    const scene = parseScenePresetFromSearch(window.location.search);
    if (!scene) {
      return;
    }

    const applied = applyShareableSceneParams(scene);
    if (applied.hints?.trim()) {
      updateToolSettings({ hints: applied.hints.trim() });
    }
    updateShared({
      lockedWardrobeId: applied.lockedWardrobeId,
      lockedLocation: applied.lockedLocation,
      lockedVariationSeed: applied.lockedVariationSeed,
    });
    if (applied.sportPresetId) {
      updateToolSettings({ sceneMode: 'duo', sportPresetId: applied.sportPresetId });
      const preset = getSportPreset(applied.sportPresetId);
      if (preset?.hints?.trim()) {
        updateToolSettings({ hints: preset.hints.trim() });
      }
    }
  }, [updateShared, updateToolSettings]);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    batchResults,
    setBatchResults,
    result,
    setResult,
    loading,
    setLoading,
    error,
    setError,
    copied,
    setCopied,
    lockedWardrobeLabel,
    sceneMode,
    accent,
    historyTool,
    historySeedTool,
    hintSource,
    historySeedScope,
    historyCandidateCount,
    generateDisabledReason,
    portraitStyle,
    actions,
    selectedModel,
    inferredSport,
    variationSeed,
    getRecent,
    recordLocation,
    getRecentClothing,
    recordClothing,
    getBlocklist,
    soloBatchCount: SOLO_BATCH_COUNT,
  };
}

export type CharacterToolOrchestrationCore = ReturnType<typeof useCharacterToolOrchestrationCore>;
