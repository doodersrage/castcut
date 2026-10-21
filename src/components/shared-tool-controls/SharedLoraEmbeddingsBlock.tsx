'use client';

import dynamic from 'next/dynamic';
import { countSessionLoraStrengthOverrides } from '@/lib/lora/stack';
import { hasSessionLoraIdsForModel } from '@/lib/model/lora-map';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings/cache';
import { modelSupportsTextualInversion } from '@/lib/lora/textual-inversion';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';
import { DataListSkeleton } from '@/components/ui/ViewState';

const LoraStackSessionPicker = dynamic(() => import('@/components/LoraStackSessionPicker'), {
  ssr: false,
  loading: () => <DataListSkeleton rows={2} />,
});
const EmbeddingSessionChips = dynamic(() => import('@/components/EmbeddingSessionChips'), {
  ssr: false,
  loading: () => null,
});

export type SharedLoraEmbeddingsBlockProps = Pick<
  SharedAdvancedSectionsProps,
  | 'cloudEngine'
  | 'advancedOpenByDefault'
  | 'sessionLoraStrengthOverrides'
  | 'sessionActiveLoraIds'
  | 'sessionActiveLoraIdsByModel'
  | 'shared'
  | 'checkboxClass'
  | 'onSessionActiveLoraIdsChange'
  | 'onSessionLoraStrengthOverridesChange'
  | 'roleplayVariant'
  | 'onSharedSettingsChange'
>;

export default function SharedLoraEmbeddingsBlock({
  cloudEngine,
  advancedOpenByDefault,
  sessionLoraStrengthOverrides,
  sessionActiveLoraIds,
  sessionActiveLoraIdsByModel,
  shared,
  checkboxClass,
  onSessionActiveLoraIdsChange,
  onSessionLoraStrengthOverridesChange,
  roleplayVariant,
  onSharedSettingsChange,
}: SharedLoraEmbeddingsBlockProps) {
  if (cloudEngine) {
    return null;
  }

  return (
    <>
      <CollapsibleSection
        title="LoRA stack"
        summary={(() => {
          const tuned = countSessionLoraStrengthOverrides(sessionLoraStrengthOverrides);
          if (sessionActiveLoraIds !== undefined) {
            return `${sessionActiveLoraIds.length} selected${tuned ? ` · ${tuned} tuned` : ''}`;
          }
          return tuned
            ? `${tuned} strength tweak${tuned === 1 ? '' : 's'}`
            : 'Pick LoRAs for this model';
        })()}
        defaultOpen={advancedOpenByDefault}
        persistKey="shared-lora-stack"
      >
        <LoraStackSessionPicker
          model={shared.model}
          sessionActiveLoraIds={
            hasSessionLoraIdsForModel(sessionActiveLoraIdsByModel, shared.model)
              ? sessionActiveLoraIds
              : undefined
          }
          sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
          checkboxClassName={checkboxClass}
          onChange={onSessionActiveLoraIdsChange}
          onSessionStrengthOverridesChange={onSessionLoraStrengthOverridesChange}
        />
      </CollapsibleSection>

      {roleplayVariant ? null : modelSupportsTextualInversion(shared.model) ? (
        <CollapsibleSection
          title="Embeddings"
          summary={
            (shared.sessionEmbeddingTokens?.length ?? 0) > 0
              ? `${shared.sessionEmbeddingTokens?.length} selected`
              : 'SD/SDXL textual inversion'
          }
          defaultOpen={advancedOpenByDefault}
          persistKey="shared-embeddings"
        >
          <EmbeddingSessionChips
            model={shared.model}
            selected={shared.sessionEmbeddingTokens ?? []}
            onChange={names => {
              if (onSharedSettingsChange) {
                onSharedSettingsChange({ sessionEmbeddingTokens: names });
              } else {
                saveSharedSettings({
                  ...loadSettingsCache().shared,
                  sessionEmbeddingTokens: names,
                });
              }
            }}
          />
        </CollapsibleSection>
      ) : null}
    </>
  );
}
