'use client';

import { useCallback } from 'react';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { resolveSceneHintsForGeneration } from '@/components/scene-tool/HistoryHintSeedPanel';
import { presetOptionsFromBackgroundCache } from '@/lib/background-options';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import { readClothingIdsFromMetadata } from '@/lib/recent-clothing';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { presetOptionsFromCache } from '@/lib/character-options-ui';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { downloadPromptPairTextFile } from '@/lib/prompt-pair';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import type { CharacterToolOrchestrationCore } from '@/hooks/character/useCharacterToolOrchestrationCore';

export function useCharacterToolOrchestrationPart2(ctx: CharacterToolOrchestrationCore) {
  const {
    shared,
    toolSettings,
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
    sceneMode,
    hintSource,
    portraitStyle,
    actions,
    historyTool,
    getRecent,
    recordLocation,
    getRecentClothing,
    recordClothing,
    getBlocklist,
    soloBatchCount,
  } = ctx;

  const generate = useCallback(
    async (batch = false) => {
      setLoading(true);
      setError(null);
      setCopied(false);
      actions.resetStatuses();
      setBatchResults([]);

      try {
        const effectiveHints = resolveSceneHintsForGeneration({
          hintSource,
          hints: toolSettings.hints,
          randomTheme: toolSettings.randomTheme,
        });

        await actions.runPreLint(effectiveHints);

        if (sceneMode === 'compose') {
          const response = await fetch('/api/compose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: shared.model,
              detail: shared.detail,
              subjectMode: toolSettings.composeSubjectMode ?? 'duo',
              hints: effectiveHints,
              portraitStyle,
              variationStrength: toolSettings.variationStrength,
              presetOptions: presetOptionsFromCache(toolSettings),
              background: {
                settingType: toolSettings.settingType,
                timeOfDay: toolSettings.timeOfDay,
                mood: toolSettings.mood,
                presetOptions: presetOptionsFromBackgroundCache(toolSettings),
              },
              composeStyle: toolSettings.composeStyle ?? 'layered',
              recentLocations: getRecent(),
              recentClothing: getRecentClothing(),
              blockedLocations: getBlocklist(),
              lockedWardrobeId: shared.lockedWardrobeId,
              lockedLocation: shared.lockedLocation,
              variationSeed: shared.lockedVariationSeed,
              alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
              seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
              teamKit: toolSettings.teamKit === true,
              ...avoidedTokensRequestBody(),
            }),
          });

          const data = (await response.json()) as EnrichedToolGenerateResult & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(data.error ?? 'Composition failed.');
          }

          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
          setOutput(prompt);
          setResult({ ...data, prompt });
          return;
        }

        const presetOptions =
          sceneMode === 'duo'
            ? { ...presetOptionsFromCache(toolSettings), headcount: 'duo' as const }
            : presetOptionsFromCache(toolSettings);

        const endpoint = batch ? '/api/batch' : sceneMode === 'duo' ? '/api/duo' : '/api/character';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: shared.model,
            detail: shared.detail,
            hints: effectiveHints,
            portraitStyle,
            variationStrength: toolSettings.variationStrength,
            presetOptions,
            recentLocations: getRecent(),
            recentClothing: getRecentClothing(),
            blockedLocations: getBlocklist(),
            lockedWardrobeId: shared.lockedWardrobeId,
            lockedLocation: shared.lockedLocation,
            variationSeed: shared.lockedVariationSeed,
            alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
            seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
            activeCharacterDescriptor: shared.activeCharacterDescriptor,
            teamKit: sceneMode === 'duo' ? toolSettings.teamKit === true : undefined,
            sportPresetId:
              sceneMode === 'duo' ? toolSettings.sportPresetId || undefined : undefined,
            count: batch
              ? sceneMode === 'duo'
                ? (toolSettings.batchCount ?? 3)
                : soloBatchCount
              : undefined,
            ...avoidedTokensRequestBody(),
            ...sharedLlmRequestBody(shared),
          }),
        });

        const data = (await response.json()) as EnrichedToolGenerateResult & {
          error?: string;
          results?: EnrichedToolGenerateResult[];
        };

        if (!response.ok) {
          throw new Error(data.error ?? 'Generation failed.');
        }

        if (batch && data.results) {
          for (const entry of data.results) {
            recordLocation(readSceneLocationFromMetadata(entry.metadata));
            recordClothing(readClothingIdsFromMetadata(entry.metadata));
          }
          setBatchResults(data.results);
          const firstPrompt = data.results[0]?.prompt ?? '';
          const finalized = firstPrompt
            ? await actions.finalizePrompt(firstPrompt, effectiveHints)
            : '';
          setOutput(finalized || firstPrompt);
          setResult(data.results[0] ?? null);
        } else {
          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
          setOutput(prompt);
          setResult({ ...data, prompt });
        }
      } catch (err) {
        setOutput('');
        setResult(null);
        setBatchResults([]);
        setError(err instanceof Error ? err.message : 'Generation failed.');
      } finally {
        setLoading(false);
      }
    },
    [
      actions,
      getBlocklist,
      getRecent,
      getRecentClothing,
      portraitStyle,
      recordClothing,
      recordLocation,
      sceneMode,
      hintSource,
      shared,
      toolSettings,
      setBatchResults,
      setCopied,
      setError,
      setLoading,
      setOutput,
      setResult,
      soloBatchCount,
    ]
  );

  const exportBatch = useCallback(() => {
    if (batchResults.length === 0) {
      return;
    }

    downloadPromptPairTextFile(
      `${historyTool}-batch-${Date.now()}.txt`,
      batchResults.map((entry, index) => `# ${index + 1}\n${entry.prompt}`).join('\n\n')
    );
  }, [batchResults, historyTool]);

  const batchPrompts = batchResults.map(entry => entry.prompt);

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
  }, [output, setCopied, setError]);

  const rememberHints = useCallback((value: string) => {
    rememberDraftFields({
      toolKey: 'character',
      label: 'Character',
      href: '/character',
      fields: [value],
    });
  }, []);

  const applyCollabDraft = useCallback(
    (payload: Parameters<typeof resolveCollabFieldValue>[0]) => {
      const nextHints = resolveCollabFieldValue(payload, 'hints');
      if (nextHints) {
        updateToolSettings({ hints: nextHints });
      }
    },
    [updateToolSettings]
  );

  return {
    generate,
    exportBatch,
    batchPrompts,
    copyOutput,
    rememberHints,
    applyCollabDraft,
    loading,
    error,
    copied,
    output,
    batchResults,
    result,
  };
}
