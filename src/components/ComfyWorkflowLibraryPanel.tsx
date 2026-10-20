'use client';

import { useComfyWorkflowLibrary } from '@/hooks/useComfyWorkflowLibrary';
import ComfyWorkflowLibrarySections from '@/components/comfy-workflow/ComfyWorkflowLibrarySections';
import type { WorkflowPlaceholderTokens } from '@/lib/comfyui/config';

type ComfyWorkflowLibraryPanelProps = {
  placeholderTokens: WorkflowPlaceholderTokens;
  onStatus?: (message: string) => void;
};

export default function ComfyWorkflowLibraryPanel({
  placeholderTokens,
  onStatus,
}: ComfyWorkflowLibraryPanelProps) {
  const vm = useComfyWorkflowLibrary({ placeholderTokens, onStatus });
  return <ComfyWorkflowLibrarySections {...vm} />;
}
