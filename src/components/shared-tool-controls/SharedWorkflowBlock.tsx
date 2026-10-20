'use client';

import dynamic from 'next/dynamic';
import type { ComfyWorkflowFile } from '@/lib/comfyui/workflow-files';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { usesSystemWorkflowPath } from '@/lib/workflow/system-workflow-runtime';

const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});

export type SharedWorkflowBlockServerFile = {
  id: string;
  name: string;
  source: 'server';
};

export type SharedWorkflowBlockProps = {
  roleplayVariant: boolean;
  cloudEngine: boolean;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  workflowMounted: boolean;
  shared: SharedToolSettings;
  selectedWorkflowId: string | undefined;
  defaultLabel: string;
  localFiles: ComfyWorkflowFile[];
  serverFiles: SharedWorkflowBlockServerFile[];
  onWorkflowChange: (fileId: string | undefined) => void;
};

export default function SharedWorkflowBlock({
  roleplayVariant,
  cloudEngine,
  onWorkflowPresetChange,
  workflowMounted,
  shared,
  selectedWorkflowId,
  defaultLabel,
  localFiles,
  serverFiles,
  onWorkflowChange,
}: SharedWorkflowBlockProps) {
  if (
    roleplayVariant ||
    cloudEngine ||
    !onWorkflowPresetChange ||
    !workflowMounted ||
    usesSystemWorkflowPath(shared, shared.model)
  ) {
    return null;
  }

  return (
    <ComfyWorkflowSelector
      selectedId={selectedWorkflowId}
      defaultLabel={defaultLabel}
      localFiles={localFiles}
      serverFiles={serverFiles}
      helpText={
        shared.useSystemWorkflows === true
          ? 'This model is outside the system-workflow families — pick a library graph (or map one in Settings).'
          : shared.autoSelectWorkflowForModel !== false
            ? 'Your picker choice is used at queue time unless Settings → model→workflow map assigns a file for this model.'
            : undefined
      }
      onChange={onWorkflowChange}
    />
  );
}
