import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type ToolPlugin = {
  id: string;
  label: string;
  description: string;
  href: string;
  category: 'prompt' | 'scene' | 'tools' | 'video' | 'plugin';
  enabled?: boolean;
};

export const TOOL_PLUGIN_REGISTRY_KEY = 'tool-plugin-registry-v1';

export const BUILTIN_TOOL_PLUGINS: ToolPlugin[] = [
  {
    id: 'controlnet',
    label: 'ControlNet',
    description: 'Structure-focused conditioning prompts',
    href: '/controlnet',
    category: 'tools',
  },
  {
    id: 'video',
    label: 'Video prompts',
    description: 'Motion and camera prompts for WAN / Hunyuan Video workflows',
    href: '/video',
    category: 'video',
  },
];

export function loadToolPlugins(): ToolPlugin[] {
  if (typeof window === 'undefined') {
    return BUILTIN_TOOL_PLUGINS;
  }
  try {
    const custom = readBrowserValue<ToolPlugin[]>(TOOL_PLUGIN_REGISTRY_KEY) ?? [];
    return [...BUILTIN_TOOL_PLUGINS, ...custom.filter(entry => entry.enabled !== false)];
  } catch {
    return BUILTIN_TOOL_PLUGINS;
  }
}

export function saveCustomToolPlugins(plugins: ToolPlugin[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(TOOL_PLUGIN_REGISTRY_KEY, plugins.slice(0, 32));
}
