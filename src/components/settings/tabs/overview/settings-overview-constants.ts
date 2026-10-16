import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { settingsTabHref } from '@/lib/settings-nav';
import { APP_HAS_PLAY } from '@/lib/app-profile';

export const ESSENTIAL_TASKS: Array<{
  title: string;
  description: string;
  section?: ComfyUiSettingsSectionId;
  href?: string;
}> = [
  {
    title: APP_HAS_PLAY ? 'Generate & Video engine' : 'Inference engine',
    description: APP_HAS_PLAY
      ? 'Films always use ComfyUI; this is for the tools under More.'
      : 'Usually ComfyUI; cloud engines only if you need them.',
    section: 'inference-engine',
  },
  {
    title: 'Connection',
    description: 'ComfyUI URL, Heal & ready, then Soft Refresh.',
    section: 'connection',
  },
  {
    title: 'Models',
    description: 'What is on disk, what you use, free space, and per-engine downloads.',
    section: 'model-assets',
  },
  {
    title: 'Quality',
    description: 'Good or Best on every tool, Best jobs, render style.',
    section: 'prompt-quality',
  },
  {
    title: 'LLM',
    description: 'Models, vision tags, and API health.',
    href: settingsTabHref('llm'),
  },
  {
    title: 'Backup & data',
    description: 'Export, sync, and restore studio data.',
    href: settingsTabHref('data'),
  },
];

export { settingsComfyUiSectionHref, settingsTabHref };
