import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { settingsTabHref } from '@/lib/settings-nav';

export const ESSENTIAL_TASKS: Array<{
  title: string;
  description: string;
  section?: ComfyUiSettingsSectionId;
  href?: string;
}> = [
  {
    title: 'Inference engine',
    description: 'Usually ComfyUI for Play; cloud engines only if you need them.',
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
    title: 'Queue parameters',
    description: 'Default seed, size, CFG, and steps.',
    section: 'queue-params',
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
