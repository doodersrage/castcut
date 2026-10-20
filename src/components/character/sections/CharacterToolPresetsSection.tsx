'use client';

import dynamic from 'next/dynamic';
import BackgroundPresetControls from '@/components/BackgroundPresetControls';
import { applySceneStarterWorkflowHints } from '@/lib/scene/starter-workflow-hints';
import { isSportStarterPreset } from '@/lib/scene/sport-presets';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { ChipButton, FieldDivider, FieldLabel } from '@/components/ui/Field';
import { SceneQuickTags } from '@/components/scene-tool/SceneToolSections';
import { accentFocusClass } from '@/lib/app/tool-theme';
import {
  presetVariantForSceneMode,
  type useCharacterToolOrchestration,
} from '@/hooks/useCharacterToolOrchestration';

const SceneStarterPresetChips = dynamic(() => import('@/components/SceneStarterPresetChips'), {
  loading: () => (
    <div className="h-24 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});
const CharacterPresetControls = dynamic(() => import('@/components/CharacterPresetControls'), {
  loading: () => (
    <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});

type Props = Pick<
  ReturnType<typeof useCharacterToolOrchestration>,
  'mounted' | 'sceneMode' | 'accent' | 'toolSettings' | 'updateToolSettings' | 'updateShared'
>;

export function CharacterToolPresetsSection({
  mounted,
  sceneMode,
  accent,
  toolSettings,
  updateToolSettings,
  updateShared,
}: Props) {
  return (
    <CollapsibleSection
      title="Presets & options"
      summary="Scene starters, character options, environment, and framing."
      defaultOpen={false}
      persistKey="character-presets"
    >
      {sceneMode === 'solo' ? (
        <SceneStarterPresetChips
          mode="solo"
          accent={accent}
          currentHints={toolSettings.hints ?? ''}
          variationsTarget="character"
          category={toolSettings.sceneStarterCategory ?? 'all'}
          onCategoryChange={category => updateToolSettings({ sceneStarterCategory: category })}
          filterState={{
            category: toolSettings.sceneStarterCategory ?? 'all',
            framing: toolSettings.sceneStarterFraming ?? 'all',
            query: toolSettings.sceneStarterQuery ?? '',
            tags: toolSettings.sceneStarterTags ?? [],
          }}
          onFilterChange={filter =>
            updateToolSettings({
              sceneStarterCategory: filter.category,
              sceneStarterFraming: filter.framing,
              sceneStarterQuery: filter.query,
              sceneStarterTags: filter.tags,
            })
          }
          selectedId={toolSettings.sceneStarterPresetId}
          onSelect={preset => {
            updateToolSettings({
              sceneStarterPresetId: preset.id,
              hints: preset.hints,
              portraitStyle: preset.portraitStyle ?? 'portrait',
              sportPresetId: undefined,
              hintSource: 'manual',
            });
            applySceneStarterWorkflowHints(preset, updateShared);
          }}
        />
      ) : null}

      {sceneMode === 'duo' ? (
        <SceneStarterPresetChips
          mode="duo"
          accent={accent}
          currentHints={toolSettings.hints ?? ''}
          variationsTarget="duo"
          category={toolSettings.sceneStarterCategory ?? 'all'}
          onCategoryChange={category => updateToolSettings({ sceneStarterCategory: category })}
          filterState={{
            category: toolSettings.sceneStarterCategory ?? 'all',
            framing: toolSettings.sceneStarterFraming ?? 'all',
            query: toolSettings.sceneStarterQuery ?? '',
            tags: toolSettings.sceneStarterTags ?? [],
          }}
          onFilterChange={filter =>
            updateToolSettings({
              sceneStarterCategory: filter.category,
              sceneStarterFraming: filter.framing,
              sceneStarterQuery: filter.query,
              sceneStarterTags: filter.tags,
            })
          }
          selectedId={toolSettings.sceneStarterPresetId ?? toolSettings.sportPresetId}
          onSelect={preset => {
            updateToolSettings({
              sceneStarterPresetId: preset.id,
              sportPresetId: isSportStarterPreset(preset.id) ? preset.id : undefined,
              hints: preset.hints,
              portraitStyle: preset.portraitStyle ?? 'action',
              teamKit: preset.teamKit ?? false,
              hintSource: 'manual',
            });
            applySceneStarterWorkflowHints(preset, updateShared);
          }}
        />
      ) : null}

      {sceneMode === 'compose' ? (
        <>
          <FieldLabel>Subject in scene</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: 'Solo character', value: 'character' },
                { label: 'Duo / sport', value: 'duo' },
              ] as const
            ).map(option => (
              <ChipButton
                key={option.value}
                active={(toolSettings.composeSubjectMode ?? 'duo') === option.value}
                onClick={() => updateToolSettings({ composeSubjectMode: option.value })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>

          <FieldDivider />

          <SceneQuickTags
            settingType={toolSettings.settingType ?? ''}
            timeOfDay={toolSettings.timeOfDay ?? ''}
            mood={toolSettings.mood ?? ''}
            onSettingTypeChange={value => updateToolSettings({ settingType: value })}
            onTimeOfDayChange={value => updateToolSettings({ timeOfDay: value })}
            onMoodChange={value => updateToolSettings({ mood: value })}
            inputClassName={accentFocusClass(accent)}
          />

          <BackgroundPresetControls
            mounted={mounted}
            settings={toolSettings}
            onChange={patch => updateToolSettings(patch as Partial<typeof toolSettings>)}
          />

          <FieldDivider />
        </>
      ) : null}

      {(sceneMode === 'solo' || sceneMode === 'duo') && <FieldDivider />}

      <CharacterPresetControls
        mounted={mounted}
        settings={toolSettings}
        onChange={updateToolSettings}
        variant={presetVariantForSceneMode(sceneMode)}
      />
    </CollapsibleSection>
  );
}
