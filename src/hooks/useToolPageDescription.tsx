'use client';

import type { ReactNode } from 'react';
import {
  descriptionForWorkspace,
  HUB_PAGE_DESCRIPTIONS,
  sectionDescriptionForWorkspace,
} from '@/lib/app/tool-page-chrome';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/app/workspace-mode';

/** Pick full vs Simple workspace copy for ToolLayout descriptions. */
export function useToolPageDescription(full: string, simple: string): string {
  const mode = useWorkspaceMode();
  return descriptionForWorkspace(mode, full, simple);
}

/** Hub pages with canonical copy from tool-page-chrome. */
export function useHubPageDescription(hub: keyof typeof HUB_PAGE_DESCRIPTIONS): string {
  const mode = useWorkspaceMode();
  const copy = HUB_PAGE_DESCRIPTIONS[hub];
  return descriptionForWorkspace(mode, copy.full, copy.simple);
}

/** Settings hub — slim vs expanded Simple copy. */
export function useSettingsPageDescription(slimSettings: boolean): string {
  const mode = useWorkspaceMode();
  const copy = slimSettings
    ? HUB_PAGE_DESCRIPTIONS.settings
    : HUB_PAGE_DESCRIPTIONS.settingsExpanded;
  return descriptionForWorkspace(mode, copy.full, copy.simple);
}

/** Profile hub page copy. */
export function useProfilePageDescription(): string {
  return useHubPageDescription('profile');
}

/** ToolSection descriptions — hidden in Simple when the setup banner is enough. */
export function useToolSectionDescription(full: string): string | undefined {
  const mode = useWorkspaceMode();
  if (!full.trim()) {
    return undefined;
  }
  return sectionDescriptionForWorkspace(mode, full);
}

/** Settings full description with env hint (Studio/Full only). */
export function useSettingsPageDescriptionRich(slimSettings: boolean): ReactNode {
  const mode = useWorkspaceMode();
  if (slimSettings) {
    const copy = HUB_PAGE_DESCRIPTIONS.settings;
    return descriptionForWorkspace(mode, copy.full, copy.simple);
  }
  if (isLeanWorkspaceMode(mode)) {
    return descriptionForWorkspace(
      mode,
      HUB_PAGE_DESCRIPTIONS.settingsExpanded.full,
      HUB_PAGE_DESCRIPTIONS.settingsExpanded.simple
    );
  }
  return (
    <>
      Organized by area — use the tabs below. Browser overrides apply per session; server defaults
      come from <code className="ui-inline-code">.env.local</code> (see Overview).
    </>
  );
}
