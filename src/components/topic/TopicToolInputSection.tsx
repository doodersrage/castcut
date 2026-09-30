'use client';

import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  ToolBadge,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { topicVarietyLabel } from '@/lib/tool-ui-labels';
import type { useTopicToolOrchestration } from '@/hooks/useTopicToolOrchestration';

const ACCENT = 'brand' as const;

type ViewModel = ReturnType<typeof useTopicToolOrchestration>;

type Props = Pick<
  ViewModel,
  | 'shared'
  | 'toolSettings'
  | 'updateShared'
  | 'updateToolSettings'
  | 'hintSource'
  | 'historySeedScope'
  | 'historyCandidateCount'
  | 'effectiveSeedTopic'
  | 'loading'
  | 'error'
  | 'generate'
>;

export default function TopicToolInputSection({
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  hintSource,
  historySeedScope,
  historyCandidateCount,
  effectiveSeedTopic,
  loading,
  error,
  generate,
}: Props) {
  return (
    <>
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.topics} />
      <ToolSection>
        <HistoryHintSeedPanel
          tool="generate"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.seedTopic ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({ seedTopic: value });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [value],
            });
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result => {
            updateToolSettings({
              seedTopic: result.hints,
              lastHistorySeedEntryId: result.entryId,
            });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [result.hints],
            });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        <FieldDivider />

        <FieldLabel>Starting theme</FieldLabel>
        <TextArea
          value={toolSettings.seedTopic ?? ''}
          onChange={e => {
            const value = e.target.value;
            updateToolSettings({ seedTopic: value });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [value],
            });
          }}
          placeholder="e.g. solarpunk, lonely robots, underwater cities — or leave blank"
          rows={2}
          className={accentFocusClass(ACCENT)}
          disabled={hintSource !== 'manual'}
        />

        <FieldDivider />

        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Fewer topics</span>
          <span className="font-medium text-[var(--accent-text)]">
            {toolSettings.count ?? 10} topics
          </span>
          <span>More</span>
        </div>
        <input
          type="range"
          aria-label="Topic count"
          min={3}
          max={24}
          step={1}
          value={toolSettings.count ?? 10}
          onChange={e => updateToolSettings({ count: Number(e.target.value) })}
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <FieldDivider />

        <FieldLabel>Topic variety</FieldLabel>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Focused</span>
          <span className="font-medium text-[var(--accent-text)]">
            {topicVarietyLabel(toolSettings.variety ?? 50)} ({toolSettings.variety ?? 50})
          </span>
          <span>Exploratory</span>
        </div>
        <input
          type="range"
          aria-label="Topic variety"
          min={0}
          max={100}
          step={5}
          value={toolSettings.variety ?? 50}
          onChange={e => updateToolSettings({ variety: Number(e.target.value) })}
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          loading={loading}
          loadingLabel="Generating topics"
          disabled={hintSource === 'history' && historyCandidateCount === 0}
          data-action="primary-generate"
        >
          Generate topics
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>
    </>
  );
}

export function TopicToolSidebar({ shared, updateShared, effectiveSeedTopic }: Props) {
  return (
    <SharedToolControls
      shared={shared}
      onModelChange={model => updateShared({ model })}
      onDetailChange={detail => updateShared({ detail })}
      onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
      seedLlmWithIngredients={shared.seedLlmWithIngredients === true}
      onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
      lockedWardrobeId={shared.lockedWardrobeId}
      lockedLocation={shared.lockedLocation}
      lockedVariationSeed={shared.lockedVariationSeed}
      onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
      onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
      onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
      recommendFromText={effectiveSeedTopic}
    />
  );
}
