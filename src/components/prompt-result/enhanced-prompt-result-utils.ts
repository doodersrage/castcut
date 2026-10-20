import type { StatusToastNote } from '@/components/ui/StatusToastStrip';
import { PINNED_VARIATION_SEED_LABEL } from '@/lib/app/tool-ui-labels';

export function buildEnhancedPromptStatusNotes({
  pipelineStatus,
  previewStatus,
  fixStatus,
  compactStatus,
  reformatStatus,
  comfyUiStatus,
  variationSeed,
}: {
  pipelineStatus?: string | null;
  previewStatus?: string | null;
  fixStatus?: string | null;
  compactStatus?: string | null;
  reformatStatus?: string | null;
  comfyUiStatus?: string | null;
  variationSeed?: string | null;
}): StatusToastNote[] {
  const notes: StatusToastNote[] = [];
  const push = (
    id: string,
    text: string | null | undefined,
    tone: StatusToastNote['tone'] = 'neutral'
  ) => {
    const trimmed = text?.trim();
    if (trimmed) {
      notes.push({ id, text: trimmed, tone });
    }
  };
  push('pipeline', pipelineStatus, 'info');
  push('preview', previewStatus, 'info');
  push('fix', fixStatus, 'warning');
  push('compact', compactStatus, 'warning');
  push('reformat', reformatStatus, 'info');
  push('comfy', comfyUiStatus, /fail|error/i.test(comfyUiStatus ?? '') ? 'danger' : 'success');
  if (
    !fixStatus &&
    !comfyUiStatus &&
    !pipelineStatus &&
    !previewStatus &&
    !compactStatus &&
    !reformatStatus &&
    variationSeed
  ) {
    const seed = variationSeed.length > 120 ? `${variationSeed.slice(0, 120)}…` : variationSeed;
    push('seed', `${PINNED_VARIATION_SEED_LABEL}: ${seed}`, 'neutral');
  }
  return notes;
}
