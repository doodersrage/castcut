/**
 * What the command palette (Ctrl/⌘+K) can find inside Settings: every tab, every ComfyUI
 * section, and the individual settings people look for most — each a deep link that opens
 * the right tab, scrolls to the control and highlights it (`focus` = element id or test id).
 */

import { COMFYUI_SETTINGS_SECTIONS, type ComfyUiSettingsSectionId } from './settings-comfyui-nav';
import { SETTINGS_TABS, settingsTabHref, type SettingsTab } from './settings-nav';

export type SettingsSearchEntry = {
  id: string;
  label: string;
  subtitle: string;
  /** Extra words that should find it. */
  keywords: string;
  tab: SettingsTab;
  section?: ComfyUiSettingsSectionId;
  focus?: string;
};

/** Individual settings worth finding by name. */
const FIELD_ENTRIES: SettingsSearchEntry[] = [
  {
    id: 'pose-guide-style',
    label: 'Pose guide style',
    subtitle: 'Prompt quality · OpenPose keypoints, OpenPose + hands, or legacy mannequin',
    keywords: 'image 3 openpose mannequin skeleton day story',
    tab: 'comfyui',
    section: 'prompt-quality',
    focus: 'settings-pose-guide',
  },
  {
    id: 'pose-controlnet',
    label: 'Lock the pose with ControlNet',
    subtitle: 'Prompt quality · send OpenPose guides through a pose ControlNet',
    keywords: 'controlnet openpose union pose lock strict limbs',
    tab: 'comfyui',
    section: 'prompt-quality',
    focus: 'settings-pose-controlnet',
  },
  {
    id: 'pose-library',
    label: 'Pose library / import pose from photo',
    subtitle: 'Prompt quality · harvested and imported poses',
    keywords: 'pose library import photo dwpose clear',
    tab: 'comfyui',
    section: 'prompt-quality',
    focus: 'pose-library-count',
  },
  {
    id: 'render-realism',
    label: 'Render realism',
    subtitle: 'Prompt quality · realistic render prompt adjustments',
    keywords: 'realism photoreal skin',
    tab: 'comfyui',
    section: 'prompt-quality',
  },
  {
    id: 'anatomy-guard',
    label: 'Anatomy guard',
    subtitle: 'Prompt quality · fewer extra limbs and mutations',
    keywords: 'anatomy hands fingers limbs mutation',
    tab: 'comfyui',
    section: 'prompt-quality',
  },
  {
    id: 'klein-enhancer',
    label: 'Flux2 Klein Enhancer',
    subtitle: 'Prompt quality · Klein enhancer node pack',
    keywords: 'flux klein enhancer',
    tab: 'comfyui',
    section: 'prompt-quality',
  },
  {
    id: 'auto-sync-maps',
    label: 'Map new ComfyUI models automatically',
    subtitle: 'Patching & maps · fill empty loader-map entries when models change',
    keywords: 'auto map models inventory checkpoint vae sync heal',
    tab: 'comfyui',
    section: 'workflow-patching',
    focus: 'settings-auto-sync-loader-maps',
  },
  {
    id: 'loader-maps',
    label: 'Checkpoint / VAE / upscale / ControlNet maps',
    subtitle: 'Patching & maps · which file each model loads',
    keywords: 'checkpoint vae upscale controlnet loader map filename',
    tab: 'comfyui',
    section: 'workflow-patching',
  },
  {
    id: 'comfy-url',
    label: 'ComfyUI address',
    subtitle: 'Connection · ComfyUI URL, test connection, Heal & ready',
    keywords: 'comfyui url address host port 8188 connection heal ready',
    tab: 'comfyui',
    section: 'connection',
  },
  {
    id: 'ip-adapter',
    label: 'Identity lock (IP-Adapter)',
    subtitle: 'Connection · IP-Adapter model and strength',
    keywords: 'ip adapter identity face lock strength',
    tab: 'comfyui',
    section: 'connection',
    focus: 'settings-comfyui-ipadapter',
  },
  {
    id: 'vision-model',
    label: 'Vision model',
    subtitle: 'LLM · the model that reviews stills (Auto-review, Look tile roles)',
    keywords: 'vision vl llava qwen gemma review auto-review image describe',
    tab: 'llm',
    focus: 'settings-llm-models',
  },
  {
    id: 'text-model',
    label: 'LLM text model',
    subtitle: 'LLM · the model that writes prompts and scenes',
    keywords: 'llm model text ollama openai writer',
    tab: 'llm',
    focus: 'settings-llm-models',
  },
  {
    id: 'llm-provider',
    label: 'LLM provider / API key',
    subtitle: 'LLM · server LLM or a hosted provider with your key',
    keywords: 'llm provider api key openrouter groq anthropic openai hosted',
    tab: 'llm',
    focus: 'settings-llm-provider',
  },
  {
    id: 'play-checks',
    label: 'Play checks readiness',
    subtitle: 'Overview · pose check, face check, still review, Cut titles',
    keywords: 'dwpose faceanalysis readiness checks node pack ffmpeg vision',
    tab: 'overview',
    focus: 'play-checks-readiness',
  },
  {
    id: 'server-env',
    label: 'Server environment (.env.local)',
    subtitle: 'Overview · server variables',
    keywords: 'env environment variables server .env.local',
    tab: 'overview',
    focus: 'settings-server-env',
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    subtitle: 'Automation · post events to a URL',
    keywords: 'webhook url secret events notify',
    tab: 'automation',
    focus: 'settings-webhooks',
  },
  {
    id: 'scheduled-batch',
    label: 'Scheduled batch',
    subtitle: 'Automation · queue batches on a timer',
    keywords: 'schedule batch timer interval',
    tab: 'automation',
    focus: 'settings-scheduled-batch',
  },
  {
    id: 'avoided-tokens',
    label: 'Avoided tokens',
    subtitle: 'Automation · words kept out of prompts',
    keywords: 'avoid tokens words ban blocklist negative',
    tab: 'automation',
    focus: 'settings-avoided-token-draft',
  },
  {
    id: 'settings-export',
    label: 'Export / import settings',
    subtitle: 'Data · settings bundle',
    keywords: 'export import backup bundle settings json',
    tab: 'data',
    focus: 'settings-data-bundle',
  },
  {
    id: 'changed-defaults',
    label: 'Settings changed from defaults',
    subtitle: 'Data · see and reset what you changed',
    keywords: 'defaults reset changed modified custom revert',
    tab: 'data',
    focus: 'settings-changed-defaults',
  },
];

/** Deep link for an entry: tab, ComfyUI section, and the control to scroll to. */
export function settingsSearchHref(
  entry: Pick<SettingsSearchEntry, 'tab' | 'section' | 'focus'>
): string {
  const params = new URLSearchParams();
  if (entry.tab !== 'overview') params.set('tab', entry.tab);
  if (entry.section) params.set('section', entry.section);
  if (entry.focus) params.set('focus', entry.focus);
  const query = params.toString();
  return query ? `/settings?${query}` : settingsTabHref(entry.tab);
}

/** Everything searchable in Settings: fields first, then sections, then tabs. */
export function buildSettingsSearchEntries(): SettingsSearchEntry[] {
  const sections: SettingsSearchEntry[] = COMFYUI_SETTINGS_SECTIONS.map(section => ({
    id: `section-${section.id}`,
    label: section.label,
    subtitle: `ComfyUI settings · ${section.keywords.slice(0, 5).join(', ')}`,
    keywords: section.keywords.join(' '),
    tab: 'comfyui',
    section: section.id,
  }));
  const tabs: SettingsSearchEntry[] = SETTINGS_TABS.map(tab => ({
    id: `tab-${tab.id}`,
    label: `${tab.label} settings`,
    subtitle: tab.description,
    keywords: '',
    tab: tab.id,
  }));
  return [...FIELD_ENTRIES, ...sections, ...tabs];
}

/** Every word of the query appears somewhere in the entry (label, subtitle, keywords). */
export function matchesSettingsQuery(
  entry: Pick<SettingsSearchEntry, 'label' | 'subtitle' | 'keywords'>,
  query: string
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = `${entry.label} ${entry.subtitle} ${entry.keywords}`.toLowerCase();
  return words.every(word => haystack.includes(word));
}
