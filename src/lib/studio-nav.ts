/** Studio tab catalog for deep links + command palette. */

import type { WorkspaceMode } from './workspace-mode';
import { isLeanWorkspaceMode } from './workspace-mode';

export type StudioTabId =
  | 'history'
  | 'compare'
  | 'catalog'
  | 'templates'
  | 'presets'
  | 'diff'
  | 'iteration'
  | 'projects'
  | 'portfolio'
  | 'campaign'
  | 'analytics'
  | 'experiments';

export type StudioTabDefinition = {
  id: StudioTabId;
  label: string;
  group: string;
  description: string;
};

export const STUDIO_TABS: StudioTabDefinition[] = [
  {
    id: 'history',
    label: 'History',
    group: 'History',
    description: 'Saved prompts and regenerations',
  },
  {
    id: 'iteration',
    label: 'Iteration tree',
    group: 'History',
    description: 'Prompt lineage forest',
  },
  {
    id: 'projects',
    label: 'Projects',
    group: 'History',
    description: 'Project folders and active project',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    group: 'Library',
    description: 'Curated portfolio picks',
  },
  {
    id: 'catalog',
    label: 'Catalog',
    group: 'Library',
    description: 'Clothing and location catalog',
  },
  {
    id: 'templates',
    label: 'Templates',
    group: 'Library',
    description: 'Builtin and user prompt templates',
  },
  {
    id: 'presets',
    label: 'Presets',
    group: 'Library',
    description: 'Scene presets and packs',
  },
  {
    id: 'compare',
    label: 'Compare',
    group: 'Analyze',
    description: 'Side-by-side model compare',
  },
  {
    id: 'campaign',
    label: 'Batch',
    group: 'Analyze',
    description: 'Prompt batch runner and reviews',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    group: 'Analyze',
    description: 'Usage and rating analytics',
  },
  {
    id: 'diff',
    label: 'Diff',
    group: 'Analyze',
    description: 'Prompt word diff',
  },
  {
    id: 'experiments',
    label: 'Experiments',
    group: 'Experiments',
    description: 'A/B and experiment notes',
  },
];

export function isStudioTabId(value: string | null | undefined): value is StudioTabId {
  return STUDIO_TABS.some(tab => tab.id === value);
}

export function studioTabHref(tab: StudioTabId): string {
  return tab === 'history' ? '/studio' : `/studio?tab=${tab}`;
}

/** Essentials for Simple workspace — power tabs stay available in Studio/Full. */
export const SIMPLE_STUDIO_TAB_IDS: StudioTabId[] = ['history', 'compare', 'templates', 'presets'];

export function studioTabsForWorkspaceMode(mode: WorkspaceMode): StudioTabDefinition[] {
  if (isLeanWorkspaceMode(mode)) {
    return STUDIO_TABS.filter(tab => SIMPLE_STUDIO_TAB_IDS.includes(tab.id));
  }
  return STUDIO_TABS;
}

export function studioTabGroupsForWorkspaceMode(
  mode: WorkspaceMode
): { label: string; tabs: StudioTabDefinition[] }[] {
  const tabs = studioTabsForWorkspaceMode(mode);
  const order = ['History', 'Library', 'Analyze', 'Experiments'] as const;
  return order
    .map(label => ({
      label,
      tabs: tabs.filter(tab => tab.group === label),
    }))
    .filter(group => group.tabs.length > 0);
}
