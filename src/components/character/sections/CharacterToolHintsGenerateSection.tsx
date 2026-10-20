'use client';

import RegionalPromptBuilderPanel from '@/components/RegionalPromptBuilderPanel';
import { SubjectShotScaleControl } from '@/components/ShotScaleControl';
import {
  SceneGenerateFooter,
  SceneHintsField,
  VariationSliderField,
} from '@/components/scene-tool/SceneToolSections';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { ROLL_VARIATION_LABEL, rollVariationLabel } from '@/lib/app/tool-ui-labels';
import { accentFocusClass, accentRingClass } from '@/lib/app/tool-theme';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { ChipButton, FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { RegionalPromptSegment } from '@/lib/prompt/regional-prompt-builder';
import type { useCharacterToolOrchestration } from '@/hooks/useCharacterToolOrchestration';

type Props = ReturnType<typeof useCharacterToolOrchestration>;

export function CharacterToolHintsGenerateSection(vm: Props) {
  const {
    mounted,
    toolSettings,
    updateToolSettings,
    loading,
    error,
    sceneMode,
    accent,
    historySeedTool,
    hintSource,
    historySeedScope,
    generateDisabledReason,
    portraitStyle,
    generate,
    rememberHints,
    soloBatchCount,
  } = vm;

  return (
    <>
      <FieldDivider />

      <HistoryHintSeedPanel
        tool={historySeedTool}
        hintSource={hintSource}
        historySeedScope={historySeedScope}
        hints={toolSettings.hints ?? ''}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={value => {
          updateToolSettings({ hints: value });
          rememberHints(value);
        }}
        onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            hints: result.hints,
            lastHistorySeedEntryId: result.entryId,
          })
        }
        accentFocusClassName={accentFocusClass(accent)}
      />

      {hintSource !== 'random' ? (
        <>
          <FieldDivider />
          <SceneHintsField
            value={toolSettings.hints ?? ''}
            onChange={value => {
              updateToolSettings({ hints: value });
              rememberHints(value);
            }}
            placeholder={
              sceneMode === 'duo'
                ? 'two female gravel cyclists in a fierce competition on a muddy doubletrack'
                : sceneMode === 'compose'
                  ? 'two female gravel cyclists in fierce competition'
                  : 'e.g. young woman in her twenties, long dark hair; on a Tokyo rooftop at night'
            }
            rows={sceneMode === 'duo' ? 4 : 3}
            className={accentFocusClass(accent)}
          />
        </>
      ) : null}

      {hintSource !== 'random' ? (
        <CollapsibleSection
          title="Advanced scene options"
          summary="Regional prompts, duo batch, shot scale, and merge style."
          defaultOpen={false}
          persistKey="character-advanced"
        >
          <RegionalPromptBuilderPanel
            accentClassName={accentFocusClass(accent)}
            segments={toolSettings.regionalSegments}
            onSegmentsChange={(segments: RegionalPromptSegment[]) =>
              updateToolSettings({ regionalSegments: segments })
            }
            onApply={prompt =>
              updateToolSettings({
                hints: toolSettings.hints?.trim()
                  ? `${toolSettings.hints.trim()}. ${prompt}`
                  : prompt,
              })
            }
          />

          {sceneMode === 'duo' || sceneMode === 'compose' ? (
            <>
              <FieldDivider />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
                  <input
                    type="checkbox"
                    checked={toolSettings.teamKit === true}
                    onChange={event => updateToolSettings({ teamKit: event.target.checked })}
                    className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentRingClass(accent)}`}
                  />
                  <span className="space-y-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">Team kit</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      Identical kits for both athletes. Off = rival accent colors.
                    </span>
                  </span>
                </label>

                {sceneMode === 'duo' ? (
                  <div className="space-y-2">
                    <FieldLabel htmlFor="batch-count">Batch count</FieldLabel>
                    <input
                      id="batch-count"
                      type="number"
                      min={1}
                      max={12}
                      value={toolSettings.batchCount ?? 3}
                      onChange={event =>
                        updateToolSettings({
                          batchCount: Math.min(12, Math.max(1, Number(event.target.value) || 3)),
                        })
                      }
                      className="ui-input w-full px-4 py-2 text-sm"
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <FieldDivider />

          <SubjectShotScaleControl
            value={portraitStyle}
            onChange={value => updateToolSettings({ portraitStyle: value })}
          />

          {sceneMode === 'compose' ? (
            <>
              <FieldDivider />
              <FieldLabel>Merge style</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { label: 'Layered sections', value: 'layered' },
                    { label: 'Inline prose', value: 'inline' },
                  ] as const
                ).map(option => (
                  <ChipButton
                    key={option.value}
                    active={(toolSettings.composeStyle ?? 'layered') === option.value}
                    onClick={() => updateToolSettings({ composeStyle: option.value })}
                  >
                    {option.label}
                  </ChipButton>
                ))}
              </div>
            </>
          ) : null}
        </CollapsibleSection>
      ) : null}

      <FieldDivider />

      <VariationSliderField
        label={ROLL_VARIATION_LABEL}
        value={toolSettings.variationStrength ?? 50}
        onChange={value => updateToolSettings({ variationStrength: value })}
        valueLabel={`${rollVariationLabel(toolSettings.variationStrength ?? 50)} (${toolSettings.variationStrength ?? 50})`}
        accentRingClassName={accentRingClass(accent)}
      />

      <SceneGenerateFooter
        accent={accent}
        label={
          sceneMode === 'compose'
            ? 'Compose scene prompt'
            : sceneMode === 'duo'
              ? 'Generate duo'
              : 'Generate character prompt'
        }
        onClick={() => void generate(false)}
        disabled={!mounted || Boolean(generateDisabledReason)}
        loading={loading}
        loadingLabel="Generating character prompt"
        error={error ?? generateDisabledReason}
      >
        {sceneMode !== 'compose' ? (
          <Button
            variant="secondary"
            disabled={!mounted || Boolean(generateDisabledReason)}
            loading={loading}
            loadingLabel="Rolling batch variations"
            onClick={() => void generate(true)}
          >
            Batch {sceneMode === 'duo' ? (toolSettings.batchCount ?? 3) : soloBatchCount}
          </Button>
        ) : null}
      </SceneGenerateFooter>
    </>
  );
}
