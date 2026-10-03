export type ComfyUiSettingsSectionId =
  | 'workflow-map'
  | 'model-assets'
  | 'workflow-patching'
  | 'lora-library'
  | 'lora-train'
  | 'workflow-library'
  | 'connection'
  | 'castcut-nodes'
  | 'inference-engine'
  | 'auto-improve'
  | 'queue-params'
  | 'prompt-quality'
  | 'vram-guard'
  | 'sampler-memory';

export type ComfyUiSettingsSection = {
  id: ComfyUiSettingsSectionId;
  label: string;
  keywords: string[];
};

export const COMFYUI_SETTINGS_SECTIONS: ComfyUiSettingsSection[] = [
  {
    id: 'inference-engine',
    label: 'Inference engine',
    keywords: [
      'diffusers',
      'engine',
      'comfyui',
      'backend',
      'txt2img',
      'fal',
      'replicate',
      'openai',
      'chatgpt',
      'gemini',
      'grok',
      'cloud',
    ],
  },
  {
    id: 'connection',
    label: 'Connection',
    keywords: [
      'url',
      'token',
      'injection',
      'placeholder',
      'workflow json',
      'pool',
      'cluster',
      'gpu',
      'export',
      'sidecar',
      'restart',
      'reboot',
      'manager',
    ],
  },
  {
    id: 'castcut-nodes',
    label: 'Castcut nodes',
    keywords: [
      'castcut',
      'node pack',
      'custom nodes',
      'best of two',
      'pose check',
      'cut-out',
      'install',
      'manager',
      'castcut_nodes.py',
    ],
  },
  {
    id: 'auto-improve',
    label: 'Auto-improve',
    keywords: [
      'rating',
      'requeue',
      'mutate',
      'seed',
      'calm',
      'aggressive',
      'preset',
      'iterate',
      'keeper',
      'lab',
      'everyday',
    ],
  },
  {
    id: 'model-assets',
    label: 'Models',
    keywords: [
      'disk',
      'space',
      'delete',
      'unused',
      'download',
      'checkpoint',
      'unet',
      'vae',
      'lora',
      'upscale',
      'clip',
      'text encoder',
      'controlnet',
      'install',
      'huggingface',
      'weights',
      'comfyui_root',
    ],
  },
  {
    id: 'workflow-map',
    label: 'Workflow map',
    keywords: ['model', 'workflow', 'map', 'assignment'],
  },
  {
    id: 'workflow-library',
    label: 'Workflow library',
    keywords: ['library', 'import', 'health', 'diff'],
  },
  {
    id: 'workflow-patching',
    label: 'Patching & maps',
    keywords: ['checkpoint', 'vae', 'refiner', 'upscale', 'controlnet', 'patch'],
  },
  {
    id: 'lora-library',
    label: 'LoRA library',
    keywords: ['lora', 'trigger', 'auto', 'stack', 'lightx2v', 'civitai', 'search', 'download'],
  },
  {
    id: 'lora-train',
    label: 'LoRA train',
    keywords: ['lora', 'train', 'kohya', 'dataset', 'trigger', 'trainer', 'trainer_url'],
  },
  {
    id: 'prompt-quality',
    label: 'Prompt quality',
    keywords: ['detail', 'realism', 'anatomy', 'quality', 'orientation', 'sampler preset'],
  },
  {
    id: 'vram-guard',
    label: 'Best jobs',
    keywords: [
      'vram',
      'max',
      'best',
      'downgrade',
      'memory',
      'gpu',
      'hold',
      'idle',
      'orchestration',
    ],
  },
  {
    id: 'queue-params',
    label: 'Global overrides',
    keywords: ['steps', 'cfg', 'sampler', 'seed', 'params'],
  },
  {
    id: 'sampler-memory',
    label: 'Sampler memory',
    keywords: ['remember', 'cfg', 'steps', 'learned'],
  },
];

export function settingsComfyUiSectionHref(section: ComfyUiSettingsSectionId): string {
  return `/settings?tab=comfyui&section=${section}`;
}

const SECTION_ALIASES: Record<string, ComfyUiSettingsSectionId> = {
  presets: 'auto-improve',
  'hold-max': 'vram-guard',
};

export function normalizeComfyUiSettingsSection(
  value: string | null | undefined
): ComfyUiSettingsSectionId | null {
  if (!value) {
    return null;
  }
  // Merged sections keep their old deep links.
  const aliased = SECTION_ALIASES[value] ?? value;
  return COMFYUI_SETTINGS_SECTIONS.some(section => section.id === aliased)
    ? (aliased as ComfyUiSettingsSectionId)
    : null;
}

/** ComfyUI sections shown when Settings is in essentials / slim mode. */
export const COMFYUI_ESSENTIAL_SECTION_IDS: ComfyUiSettingsSectionId[] = [
  'inference-engine',
  'connection',
  'castcut-nodes',
  'model-assets',
];

const ESSENTIAL_SECTION_ID_SET = new Set<ComfyUiSettingsSectionId>(COMFYUI_ESSENTIAL_SECTION_IDS);

export function isEssentialComfyUiSection(id: ComfyUiSettingsSectionId): boolean {
  return ESSENTIAL_SECTION_ID_SET.has(id);
}

/** Deep links to advanced ComfyUI sections must leave essentials-only view. */
export function comfyUiSectionRequiresFullSettings(
  section: ComfyUiSettingsSectionId | null | undefined
): boolean {
  return Boolean(section && !isEssentialComfyUiSection(section));
}

export function comfyUiSectionsForEssentials(essentialsOnly: boolean): ComfyUiSettingsSection[] {
  if (!essentialsOnly) {
    return COMFYUI_SETTINGS_SECTIONS;
  }
  const byId = new Map(COMFYUI_SETTINGS_SECTIONS.map(section => [section.id, section] as const));
  return COMFYUI_ESSENTIAL_SECTION_IDS.map(id => byId.get(id)).filter(
    (section): section is ComfyUiSettingsSection => Boolean(section)
  );
}

export function filterComfyUiSettingsSections(
  query: string,
  options?: { essentialsOnly?: boolean }
): ComfyUiSettingsSection[] {
  const base = comfyUiSectionsForEssentials(Boolean(options?.essentialsOnly));
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return base;
  }
  return base.filter(section => {
    const haystack = [section.label, section.id, ...section.keywords].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
}
