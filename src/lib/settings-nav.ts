import {
  comfyUiSectionRequiresFullSettings,
  normalizeComfyUiSettingsSection,
  type ComfyUiSettingsSectionId,
} from './settings-comfyui-nav';
import type { WorkspaceMode } from './workspace-mode';

export type SettingsTab =
  'overview' | 'llm' | 'comfyui' | 'automation' | 'advanced' | 'data' | 'users';

/** Settings tabs shown by default in Simple workspace. */
export const SIMPLE_SETTINGS_TAB_IDS: SettingsTab[] = ['overview', 'comfyui', 'llm', 'data'];

export type SettingsTabDefinition = {
  id: SettingsTab;
  label: string;
  description: string;
};

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Is everything running, and the server’s settings.',
  },
  {
    id: 'llm',
    label: 'LLM',
    description: 'The language model, its models and vision tags.',
  },
  {
    id: 'comfyui',
    label: 'ComfyUI',
    description: 'Engine, connection, models and queue.',
  },
  {
    id: 'automation',
    label: 'Automation',
    description: 'Webhooks, scheduled batches and avoided words.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Recipes, model shootout, usage and storage sync.',
  },
  {
    id: 'data',
    label: 'Data',
    description: 'Backups, export and the gallery’s storage.',
  },
  {
    id: 'users',
    label: 'Users',
    description: 'Accounts, groups, and per-feature access blocks.',
  },
];

export function normalizeSettingsTab(value: string | null | undefined): SettingsTab {
  if (SETTINGS_TABS.some(tab => tab.id === value)) {
    return value as SettingsTab;
  }
  return 'overview';
}

export function settingsTabHref(tab: SettingsTab): string {
  return tab === 'overview' ? '/settings' : `/settings?tab=${tab}`;
}

export function settingsTabsForWorkspaceMode(
  _mode: WorkspaceMode,
  showAll = false
): SettingsTabDefinition[] {
  if (showAll) {
    return SETTINGS_TABS;
  }
  return SETTINGS_TABS.filter(tab => SIMPLE_SETTINGS_TAB_IDS.includes(tab.id));
}

export function isSimpleSettingsTab(tab: SettingsTab): boolean {
  return SIMPLE_SETTINGS_TAB_IDS.includes(tab);
}

/** Resolve Settings tab/section and whether essentials-only must expand. */
export function settingsViewFromSearchParams(
  tabParam: string | null | undefined,
  sectionParam: string | null | undefined
): {
  tab: SettingsTab;
  section: ComfyUiSettingsSectionId | null;
  showAll: boolean;
} {
  const tab = normalizeSettingsTab(tabParam);
  const section = tab === 'comfyui' ? normalizeComfyUiSettingsSection(sectionParam) : null;
  return {
    tab,
    section,
    showAll: !isSimpleSettingsTab(tab) || comfyUiSectionRequiresFullSettings(section),
  };
}
