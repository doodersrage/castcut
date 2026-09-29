'use client';

import type { MutableRefObject, ReactNode } from 'react';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import SharedAdvancedSections from '@/components/shared-tool-controls/SharedAdvancedSections';
import type { SharedAdvancedSectionsProps } from '@/components/shared-tool-controls/SharedAdvancedSections';
import SharedIdentitySurface from '@/components/shared-tool-controls/SharedIdentitySurface';
import SharedQueueQualityBlock from '@/components/shared-tool-controls/SharedQueueQualityBlock';
import SharedWorkflowBlock from '@/components/shared-tool-controls/SharedWorkflowBlock';
import type { UseComfyWorkflowSelectionResult } from '@/hooks/useComfyWorkflowSelection';
import type { SystemWorkflowChoiceDescription } from '@/lib/system-workflow-runtime';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { QueueQualityProfile } from '@/lib/queue-quality-profile';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model-resolution-defaults';

export type SharedToolAdvancedCollapsibleProps = Omit<
  SharedAdvancedSectionsProps,
  'queueQualityBlock' | 'workflowBlock' | 'identitySurface'
> & {
  selectedWorkflowId: string | undefined;
  systemWorkflowChoice: SystemWorkflowChoiceDescription | null;
  workflowSelection: Pick<
    UseComfyWorkflowSelectionResult,
    'mounted' | 'defaultLabel' | 'localFiles' | 'serverFiles' | 'setSelectedId'
  >;
  workflowManualOverrideRef: MutableRefObject<boolean>;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  recipesShared: SharedToolSettings;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  queueQualityProfile: QueueQualityProfile;
  onRecipesApplied: (next: SharedToolSettings) => void;
};

export default function SharedToolAdvancedCollapsible({
  roleplayVariant,
  advancedOpenByDefault,
  cloudEngine,
  systemPathActive,
  shared,
  selectedWorkflowId,
  systemWorkflowChoice,
  workflowSelection,
  workflowManualOverrideRef,
  onWorkflowPresetChange,
  recipesShared,
  resolutionOrientation,
  resolutionSizeTier,
  queueQualityProfile,
  onRecipesApplied,
  toolId,
  onSharedSettingsChange,
  ...advancedProps
}: SharedToolAdvancedCollapsibleProps) {
  const queueQualityBlock: ReactNode = (
    <SharedQueueQualityBlock
      cloudEngine={cloudEngine}
      systemPathActive={systemPathActive}
      roleplayVariant={roleplayVariant}
      queueQualityProfile={queueQualityProfile}
      lockedVariationSeed={advancedProps.lockedVariationSeed}
      systemWorkflowChoice={systemWorkflowChoice}
      toolId={toolId}
      shared={shared}
      recipesShared={recipesShared}
      resolutionOrientation={resolutionOrientation}
      resolutionSizeTier={resolutionSizeTier}
      onRecipesApplied={onRecipesApplied}
    />
  );

  const workflowBlock: ReactNode = (
    <SharedWorkflowBlock
      roleplayVariant={roleplayVariant}
      cloudEngine={cloudEngine}
      onWorkflowPresetChange={onWorkflowPresetChange}
      workflowMounted={workflowSelection.mounted}
      shared={shared}
      selectedWorkflowId={selectedWorkflowId}
      defaultLabel={workflowSelection.defaultLabel}
      localFiles={workflowSelection.localFiles}
      serverFiles={workflowSelection.serverFiles}
      onWorkflowChange={fileId => {
        workflowManualOverrideRef.current = true;
        workflowSelection.setSelectedId(fileId);
        onWorkflowPresetChange?.(fileId);
      }}
    />
  );

  const identitySurface: ReactNode = (
    <SharedIdentitySurface
      shared={shared}
      cloudEngine={cloudEngine}
      toolId={toolId}
      roleplayVariant={roleplayVariant}
      advancedOpenByDefault={advancedOpenByDefault}
      onSharedSettingsChange={onSharedSettingsChange}
    />
  );

  const advancedSections = (
    <SharedAdvancedSections
      queueQualityBlock={queueQualityBlock}
      workflowBlock={workflowBlock}
      identitySurface={identitySurface}
      cloudEngine={cloudEngine}
      roleplayVariant={roleplayVariant}
      systemPathActive={systemPathActive}
      advancedOpenByDefault={advancedOpenByDefault}
      shared={shared}
      toolId={toolId}
      onSharedSettingsChange={onSharedSettingsChange}
      queueQualityProfile={queueQualityProfile}
      recipesShared={recipesShared}
      onRecipesApplied={onRecipesApplied}
      resolutionOrientation={resolutionOrientation}
      resolutionSizeTier={resolutionSizeTier}
      {...advancedProps}
    />
  );

  return (
    <>
      {roleplayVariant ? identitySurface : null}
      <CollapsibleSection
        title="More"
        summary={
          roleplayVariant
            ? 'Sampler, canvas size, and render style.'
            : 'Identity lock, workflow, sampler & size, pins.'
        }
        defaultOpen={advancedOpenByDefault}
        persistKey="shared-advanced-settings"
      >
        {advancedSections}
      </CollapsibleSection>
    </>
  );
}
