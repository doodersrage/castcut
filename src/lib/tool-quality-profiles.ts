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
  { id: 'fitting', label: 'Outfit' },
  { id: 'day', label: 'Day' },
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
  // Outfit's Quality preset defaults to Balanced, a Good render (outfit-quality-preset.ts).
  fitting: 'final',
  // Day's Quality preset defaults to Balanced, which renders at Best (day-quality-preset.ts).
  day: 'max',
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

/**
 * Patch that makes every tool queue at `profile`: the global value plus each tool's own entry
 * (the suggested ones included — they are merged back on load, and a tool entry beats the
 * global, so setting the global alone changed nothing on most tools).
 */
export function qualityForEveryToolPatch(
  current: ToolQueueQualityProfiles | undefined,
  profile: QueueQualityProfile
): {
  queueQualityProfile: QueueQualityProfile;
  toolQueueQualityProfiles: ToolQueueQualityProfiles;
} {
  const keys = new Set([
    ...Object.keys(SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES),
    ...Object.keys(current ?? {}),
  ]);
  return {
    queueQualityProfile: profile,
    toolQueueQualityProfiles: Object.fromEntries([...keys].map(key => [key, profile])),
  };
}

/** The quality chip names (Engine panel, Settings → Prompt quality); Fast runs as Good. */
export function qualityChipLabel(profile: QueueQualityProfile | undefined): string {
  if (profile === 'max') return 'Best';
  if (profile === 'followSettings' || !profile) return 'Custom';
  return 'Good';
}

/**
 * Where a tool's queue quality comes from, for one line under its Engine chips. Quality layers —
 * the tool's own choice beats the global one, and Fast runs as Good whenever a model is set
 * (resolveQueueQualityProfile) — so the chips alone didn't say which setting was in charge.
 */
export function describeToolQualitySource(input: {
  tool?: string;
  toolProfiles?: ToolQueueQualityProfiles;
  global?: QueueQualityProfile;
  model?: string | null;
}): string {
  const tool = input.tool?.trim();
  const own = tool ? input.toolProfiles?.[tool] : undefined;
  const profile = own ?? input.global;
  const parts = [
    own
      ? `Set for ${toolQueueQualityLabel(tool!)} — other tools keep their own.`
      : tool
        ? `From Settings → Prompt quality (no choice saved for ${toolQueueQualityLabel(tool)}).`
        : 'From Settings → Prompt quality.',
  ];
  if (profile === 'draft' && input.model?.trim()) {
    parts.push('Fast runs as Good whenever a model is selected.');
  }
  if (profile === 'followSettings' || profile === undefined) {
    parts.push('Custom uses the sampler and size defaults in Settings.');
  }
  return parts.join(' ');
}

/**
 * Each tool's quality grouped by chip ("Good: Generate, Story · Best: Day"), for Settings when
 * tools differ — instead of only saying that they do. Tools without an entry use the global one.
 */
export function summarizeToolQualities(
  toolProfiles: ToolQueueQualityProfiles | undefined,
  global: QueueQualityProfile | undefined
): Array<{ chip: string; tools: string[] }> {
  const groups = new Map<string, string[]>();
  for (const { id, label } of TOOL_QUEUE_QUALITY_OPTIONS) {
    const chip = qualityChipLabel(toolProfiles?.[id] ?? global);
    groups.set(chip, [...(groups.get(chip) ?? []), label]);
  }
  return ['Good', 'Best', 'Custom']
    .filter(chip => groups.has(chip))
    .map(chip => ({ chip, tools: groups.get(chip)! }));
}
