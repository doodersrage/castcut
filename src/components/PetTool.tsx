'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useState } from 'react';
import PetPresetControls from '@/components/PetPresetControls';
import PetPresetChips from '@/components/PetPresetChips';
import SharedToolControls from '@/components/SharedToolControls';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { presetOptionsFromPetCache } from '@/lib/pet-options';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene-preset-url';
import { getPetPreset } from '@/lib/pet-presets';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import { DEFAULT_PET_TOOL_CACHE } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { readVariationSeedFromResult } from '@/lib/variation-seed-metadata';
import { SubjectShotScaleControl } from '@/components/ShotScaleControl';
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
import { ROLL_VARIATION_LABEL, rollVariationLabel } from '@/lib/tool-ui-labels';
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

const ACCENT = 'rose' as const;

export default function PetTool() {
  const description = useToolPageDescription(
    'Animal-focused scene prompts. Add breed or species in hints, then generate.',
    'Pet and animal scenes — add breed or species in hints, then generate.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'pet',
    DEFAULT_PET_TOOL_CACHE
  );
  const { getRecent, record } = useRecentLocations();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useSeedToolDraft(mounted, {
    toolKey: 'pet',
    label: 'Pet',
    href: '/pet',
    fields: [toolSettings.hints],
  });

  const actions = usePromptResultActions({
    tool: 'pet',
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
  const historyCandidateCount = countHistorySeedCandidates('pet', historySeedScope);
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few pet or related prompts to Studio history first, or switch hint source.'
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
    if (scene.petPresetId) {
      updateToolSettings({ petPresetId: scene.petPresetId });
      const preset = getPetPreset(scene.petPresetId);
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
      const response = await fetch('/api/pet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: effectiveHints,
          portraitStyle: toolSettings.portraitStyle,
          variationStrength: toolSettings.variationStrength,
          presetOptions: presetOptionsFromPetCache(toolSettings),
          recentLocations: getRecent(),
          blockedLocations: getBlocklist(),
          lockedLocation: shared.lockedLocation,
          variationSeed: shared.lockedVariationSeed,
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
  }, [shared, toolSettings, hintSource, getRecent, record, getBlocklist, actions]);

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
      badge={<ToolBadge accent={ACCENT}>Pet scene · {selectedModel.comfyNode}</ToolBadge>}
      title="Pet"
      description={description}
      sidebarPersistKey="pet"
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
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
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.pet} />
      <SceneSetupSection description="Presets, hints, then generate.">
        <SceneFamilySwitcher />
        <CollapsibleSection
          title="Pet presets"
          summary="Starter chips and species, pose, and setting options."
          defaultOpen={false}
          persistKey="pet-presets"
        >
          <PetPresetChips
            selectedId={toolSettings.petPresetId}
            category={toolSettings.presetCategory ?? 'all'}
            onCategoryChange={category => updateToolSettings({ presetCategory: category })}
            onSelect={preset => {
              updateToolSettings({
                hints: preset.hints,
                portraitStyle: preset.portraitStyle ?? 'portrait',
                petPresetId: preset.id,
                presetCategory: preset.category,
                ...(preset.presetOptions ?? {}),
              });
            }}
          />

          <FieldDivider />

          <PetPresetControls
            mounted={mounted}
            settings={toolSettings}
            onChange={patch => updateToolSettings({ ...patch, petPresetId: undefined })}
          />
        </CollapsibleSection>

        <FieldDivider />

        <HistoryHintSeedPanel
          tool="pet"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({ hints: value, petPresetId: undefined });
            rememberDraftFields({
              toolKey: 'pet',
              label: 'Pet',
              href: '/pet',
              fields: [value],
            });
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result =>
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
              petPresetId: undefined,
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
                updateToolSettings({ hints: value, petPresetId: undefined });
                rememberDraftFields({
                  toolKey: 'pet',
                  label: 'Pet',
                  href: '/pet',
                  fields: [value],
                });
              }}
              placeholder="e.g. golden retriever puppy playing fetch, location: sunny dog park"
              className={accentFocusClass(ACCENT)}
            />
          </>
        ) : null}

        <FieldDivider />

        <SubjectShotScaleControl
          value={toolSettings.portraitStyle ?? 'portrait'}
          onChange={value => updateToolSettings({ portraitStyle: value })}
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
          label="Generate pet scene prompt"
          onClick={() => void generate()}
          disabled={!mounted || Boolean(generateDisabledReason)}
          loading={loading}
          loadingLabel="Generating pet scene prompt"
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
        queueLabel="Queue pet"
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
