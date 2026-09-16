import type { QueueQualityProfile } from './queue-quality-profile';

export type ToolQueueQualityOption = {
  id: string;
  label: string;
};

/** Tools that commonly queue to ComfyUI — used for per-tool quality overrides. */
export const TOOL_QUEUE_QUALITY_OPTIONS: ToolQueueQualityOption[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'character', label: 'Character' },
  { id: 'format', label: 'Format' },
  { id: 'refine', label: 'Refine' },
  { id: 'inpaint', label: 'Inpaint' },
  { id: 'outpaint', label: 'Outpaint' },
  { id: 'imagePrompt', label: 'Image → Prompt' },
  { id: 'controlnet', label: 'ControlNet' },
  { id: 'compose', label: 'Compose' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'mesh', label: '3D Mesh' },
  { id: 'variations', label: 'Variations' },
  { id: 'topics', label: 'Topics' },
  { id: 'duo', label: 'Duo' },
  { id: 'pet', label: 'Pet' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'roleplay', label: 'Story' },
  { id: 'background', label: 'Background' },
  { id: 'recipe', label: 'Prompt recipes' },
  { id: 'campaign', label: 'Prompt batch' },
];

export function toolQueueQualityLabel(toolId: string): string {
  return TOOL_QUEUE_QUALITY_OPTIONS.find(entry => entry.id === toolId)?.label ?? toolId;
}

export type ToolQueueQualityProfiles = Partial<Record<string, QueueQualityProfile>>;

/** Suggested per-tool queue profiles (merged into Settings; explicit tool overrides win). */
export const SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES: ToolQueueQualityProfiles = {
  generate: 'final',
  variations: 'final',
  topics: 'final',
  character: 'final',
  refine: 'final',
  inpaint: 'final',
  outpaint: 'final',
  compose: 'final',
  video: 'final',
  audio: 'final',
  mesh: 'final',
  duo: 'final',
  pet: 'final',
  fantasy: 'final',
  roleplay: 'final',
  background: 'final',
  format: 'followSettings',
};

export function normalizeToolQueueQualityProfiles(value: unknown): ToolQueueQualityProfiles {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalized: ToolQueueQualityProfiles = {};
  for (const [toolId, profile] of Object.entries(value as Record<string, unknown>)) {
    if (
      profile === 'followSettings' ||
      profile === 'draft' ||
      profile === 'final' ||
      profile === 'max'
    ) {
      normalized[toolId] = profile;
    }
  }
  return normalized;
}
