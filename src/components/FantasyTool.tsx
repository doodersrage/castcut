'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useMemo, useState } from 'react';
import FantasyPresetChips from '@/components/FantasyPresetChips';
import FantasyPresetControls from '@/components/FantasyPresetControls';
import SharedToolControls from '@/components/SharedToolControls';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { fetchClothingLabels, getCachedClothingLabel } from '@/lib/clothing-catalog-client';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { presetOptionsFromFantasyCache, resolveFantasyFocus } from '@/lib/fantasy-options';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene-preset-url';
import { getFantasyPreset } from '@/lib/fantasy-presets';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import { readClothingIdsFromMetadata } from '@/lib/recent-clothing';
import { DEFAULT_FANTASY_TOOL_CACHE } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { readVariationSeedFromResult } from '@/lib/variation-seed-metadata';
import { FantasyShotScaleControl } from '@/components/ShotScaleControl';
import {
  SceneGenerateFooter,
  SceneHintsField,
  VariationSliderField,
} from '@/components/scene-tool/SceneToolSections';
import SceneSetupSection from '@/components/scene-tool/SceneSetupSection';
import SceneFamilySwitcher from '@/components/SceneFamilySwitcher';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import {
  HistoryHintSeedPanel,
  resolveSceneHintsForGeneration,
} from '@/components/scene-tool/HistoryHintSeedPanel';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import {
  CONCEPT_WILDNESS_LABEL,
  ROLL_VARIATION_LABEL,
  conceptWildnessLabel,
  rollVariationLabel,
} from '@/lib/tool-ui-labels';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import {
  ToolBadge,
  CollapsibleSection,
  ToolLayout,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { FieldDivider } from '@/components/ui/Field';

const ACCENT = 'brand' as const;

export default function FantasyTool() {
  const description = useToolPageDescription(
    'Fantasy characters, creatures, or environments. Add hints and generate.',
    'Fantasy scenes — characters, creatures, or environments. Add hints and generate.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'fantasy',
    DEFAULT_FANTASY_TOOL_CACHE
  );
  const { getRecent, record } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();

  useSeedToolDraft(mounted, {
    toolKey: 'fantasy',
    label: 'Fantasy',
    href: '/fantasy',
    fields: [toolSettings.hints],
  });

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

  const presetOptions = useMemo(() => presetOptionsFromFantasyCache(toolSettings), [toolSettings]);
  const focus = resolveFantasyFocus(presetOptions, toolSettings.hints);
  const includePeople = focus === 'character' || focus === 'ensemble';
  const activeFraming =
    focus === 'environment' ? 'wide' : (toolSettings.portraitStyle ?? 'portrait');

  const actions = usePromptResultActions({
    tool: 'fantasy',
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const variationSeed = readVariationSeedFromResult(result ?? {});
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates('fantasy', historySeedScope);
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few fantasy or related prompts to Studio history first, or switch hint source.'
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    applyHintSourceFromSearchParams(params, updateToolSettings);
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
    if (scene.fantasyPresetId) {
      updateToolSettings({ fantasyPresetId: scene.fantasyPresetId });
      const preset = getFantasyPreset(scene.fantasyPresetId);
      if (preset?.hints?.trim()) {
        updateToolSettings({ hints: preset.hints.trim() });
      }
    }
  }, [updateShared, updateToolSettings]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const effectiveHints = resolveSceneHintsForGeneration({
        hintSource,
        hints: toolSettings.hints,
        randomTheme: toolSettings.randomTheme,
      });
      const response = await fetch('/api/fantasy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: effectiveHints,
          portraitStyle: activeFraming,
          wildness: toolSettings.wildness,
          variationStrength: toolSettings.variationStrength,
          presetOptions,
          recentLocations: getRecent(),
          recentClothing: getRecentClothing(),
          blockedLocations: getBlocklist(),
          lockedLocation: shared.lockedLocation,
          lockedWardrobeId: shared.lockedWardrobeId,
          variationSeed: shared.lockedVariationSeed,
          alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
          seedLlmWithIngredients: shared.seedLlmWithIngredients !== false,
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
      }

      record(readSceneLocationFromMetadata(data.metadata));
      recordClothing(readClothingIdsFromMetadata(data.metadata));

      const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
      setOutput(prompt);
      setResult({ ...data, prompt });
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [
    shared,
    toolSettings,
    hintSource,
    presetOptions,
    getRecent,
    record,
    getRecentClothing,
    recordClothing,
    getBlocklist,
    actions,
    activeFraming,
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

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Fantasy scene · {selectedModel.comfyNode}</ToolBadge>}
      title="Fantasy"
      description={description}
      sidebarPersistKey="fantasy"
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={includePeople}
          alwaysIncludeClothing={shared.alwaysIncludeClothing !== false}
          onAlwaysIncludeClothingChange={value => updateShared({ alwaysIncludeClothing: value })}
          seedLlmWithIngredients={shared.seedLlmWithIngredients !== false}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          wardrobeHelp="When focus is character or ensemble, rolls catalog outfits for heroes and adventurers."
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedWardrobeLabel={
            shared.lockedWardrobeId ? (lockedWardrobeLabel ?? shared.lockedWardrobeId) : undefined
          }
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          lockedLocation={shared.lockedLocation}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fantasy} />
      <SceneSetupSection description="Presets, hints, then generate.">
        <SceneFamilySwitcher />
        <CollapsibleSection
          title="Fantasy presets"
          summary="Starter chips and subgenre, magic, and camera options."
          defaultOpen={false}
          persistKey="fantasy-presets"
        >
          <FantasyPresetChips
            selectedId={toolSettings.fantasyPresetId}
            category={toolSettings.presetCategory ?? 'all'}
            onCategoryChange={category => updateToolSettings({ presetCategory: category })}
            onSelect={preset => {
              updateToolSettings({
                hints: preset.hints,
                fantasyPresetId: preset.id,
                presetCategory: preset.category,
                ...(preset.presetOptions ?? {}),
              });
            }}
          />

          <FieldDivider />

          <FantasyPresetControls
            mounted={mounted}
            settings={toolSettings}
            onChange={patch => updateToolSettings({ ...patch, fantasyPresetId: undefined })}
          />
        </CollapsibleSection>

        <FieldDivider />

        <HistoryHintSeedPanel
          tool="fantasy"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({
              hints: value,
              fantasyPresetId: undefined,
            });
            rememberDraftFields({
              toolKey: 'fantasy',
              label: 'Fantasy',
              href: '/fantasy',
              fields: [value],
            });
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result =>
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
              fantasyPresetId: undefined,
            })
          }
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        {hintSource !== 'random' ? (
          <>
            <FieldDivider />
            <SceneHintsField
              value={toolSettings.hints ?? ''}
              onChange={value => {
                updateToolSettings({
                  hints: value,
                  fantasyPresetId: undefined,
                });
                rememberDraftFields({
                  toolKey: 'fantasy',
                  label: 'Fantasy',
                  href: '/fantasy',
                  fields: [value],
                });
              }}
              placeholder="e.g. elven spellblade in a crystal cavern, location: floating ruins above the clouds"
              className={accentFocusClass(ACCENT)}
            />
          </>
        ) : null}

        <FieldDivider />

        <FantasyShotScaleControl
          value={activeFraming}
          onChange={value => updateToolSettings({ portraitStyle: value })}
          environmentOnly={focus === 'environment'}
        />

        <FieldDivider />

        <VariationSliderField
          label={CONCEPT_WILDNESS_LABEL}
          value={toolSettings.wildness ?? 65}
          onChange={value => updateToolSettings({ wildness: value })}
          valueLabel={`${conceptWildnessLabel(toolSettings.wildness ?? 65)} (${toolSettings.wildness ?? 65})`}
          minLabel="Grounded"
          maxLabel="Surreal"
          accentRingClassName={accentRingClass(ACCENT)}
        />

        <FieldDivider />

        <VariationSliderField
          label={ROLL_VARIATION_LABEL}
          value={toolSettings.variationStrength ?? 50}
          onChange={value => updateToolSettings({ variationStrength: value })}
          valueLabel={`${rollVariationLabel(toolSettings.variationStrength ?? 50)} (${toolSettings.variationStrength ?? 50})`}
          accentRingClassName={accentRingClass(ACCENT)}
        />

        <SceneGenerateFooter
          accent={ACCENT}
          label="Generate fantasy scene prompt"
          onClick={() => void generate()}
          disabled={!mounted || Boolean(generateDisabledReason)}
          loading={loading}
          loadingLabel="Generating fantasy scene prompt"
          error={error ?? generateDisabledReason}
        />
      </SceneSetupSection>

      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={result}
        copied={copied}
        onCopy={() => void copyOutput()}
        actions={actions}
        shared={shared}
        selectedComfyNode={selectedModel.comfyNode}
        hints={toolSettings.hints}
        queueLabel="Queue fantasy"
        variationSeed={variationSeed}
        onLockSeed={() => {
          if (variationSeed) {
            updateShared({ lockedVariationSeed: variationSeed });
          }
        }}
      />
    </ToolLayout>
  );
}
