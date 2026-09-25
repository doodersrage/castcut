import { canAccessNavFeature } from '@/hooks/useAuth';
import type { AppFeatureId } from '@/lib/auth/features';
import { featureForPath } from '@/lib/auth/features';
import {
  APP_NAV_GROUPS,
  APP_NAV_PROFILE_LINK,
  APP_NAV_SETTINGS_LINK,
  flattenAppNavLinks,
} from '@/lib/app-nav-catalog';
import {
  isLeanWorkspaceMode,
  isRoleplayFocusNavHref,
  loadWorkspaceMode,
  navGroupsForPath,
  usesPlayChrome,
} from '@/lib/workspace-mode';
import { SETTINGS_TABS, settingsTabHref, SIMPLE_SETTINGS_TAB_IDS } from '@/lib/settings-nav';
import { buildSettingsSearchEntries, settingsSearchHref } from '@/lib/settings-search-index';
import { studioTabHref, studioTabsForWorkspaceMode } from '@/lib/studio-nav';
import { ACTION_ITEMS } from '@/components/command-palette/action-items';
import type { CommandItem } from '@/components/command-palette/types';

export function allowPaletteItemOnPath(item: CommandItem, pathname: string): boolean {
  if (!usesPlayChrome(loadWorkspaceMode(), pathname)) {
    return true;
  }
  if (!item.href) {
    return (
      item.id === 'keyboard-shortcuts' ||
      item.id === 'reload' ||
      item.id === 'report-bug' ||
      item.id === 'heal-connection' ||
      item.id === 'dismiss-continue'
    );
  }
  return isRoleplayFocusNavHref(item.href);
}

export function isCommandItemAllowed(
  item: CommandItem,
  allowedFeatures: AppFeatureId[] | 'all',
  guestShell: boolean
): boolean {
  if (
    item.id === 'keyboard-shortcuts' ||
    item.id === 'reload' ||
    item.id === 'dismiss-continue' ||
    item.id === 'report-bug'
  ) {
    return true;
  }
  if (guestShell) {
    if (item.href) {
      const path = item.href.split('?')[0] ?? item.href;
      return canAccessNavFeature(allowedFeatures, featureForPath(path));
    }
    return false;
  }
  if (!item.href) {
    return true;
  }
  const path = item.href.split('?')[0] ?? item.href;
  return canAccessNavFeature(allowedFeatures, featureForPath(path));
}

export function buildNavItems(pathname: string): CommandItem[] {
  const mode = loadWorkspaceMode();
  const focused = usesPlayChrome(mode, pathname);
  const groups = navGroupsForPath(mode, pathname, APP_NAV_GROUPS);
  const nav = flattenAppNavLinks(groups, { includeSceneAliases: true }).map(link => ({
    id: `nav-${link.href}`,
    label: link.label,
    subtitle: link.description,
    href: link.href,
    group: 'Navigate',
  }));
  const settingsTabIds = isLeanWorkspaceMode(mode)
    ? SIMPLE_SETTINGS_TAB_IDS
    : SETTINGS_TABS.map(tab => tab.id);
  const settingsTabs = settingsTabIds
    .map(id => SETTINGS_TABS.find(tab => tab.id === id))
    .filter((tab): tab is (typeof SETTINGS_TABS)[number] => Boolean(tab))
    .map(tab => ({
      id: `settings-${tab.id}`,
      label: `Settings · ${tab.label}`,
      subtitle: tab.description,
      href: settingsTabHref(tab.id),
      group: 'Settings',
    }));
  // Sections and individual settings, found by typing ("pose", "vision", "controlnet"…).
  const settingsDeep: CommandItem[] = buildSettingsSearchEntries()
    .filter(entry => !entry.id.startsWith('tab-'))
    .map(entry => ({
      id: `settings-find-${entry.id}`,
      label: `Settings · ${entry.label}`,
      subtitle: entry.subtitle,
      keywords: entry.keywords,
      href: settingsSearchHref(entry),
      group: 'Settings',
      searchOnly: true,
    }));
  const studioTabs = studioTabsForWorkspaceMode(mode).map(tab => ({
    id: `studio-${tab.id}`,
    label: `Studio · ${tab.label}`,
    subtitle: tab.description,
    href: studioTabHref(tab.id),
    group: 'Studio',
  }));
  const actionItems = focused
    ? ACTION_ITEMS.filter(item => item.id === 'reload' || item.id === 'report-bug')
    : ACTION_ITEMS;
  return [
    ...nav,
    {
      id: 'nav-settings',
      label: APP_NAV_SETTINGS_LINK.label,
      subtitle: APP_NAV_SETTINGS_LINK.description,
      href: APP_NAV_SETTINGS_LINK.href,
      group: 'Navigate',
    },
    {
      id: 'nav-profile',
      label: APP_NAV_PROFILE_LINK.label,
      subtitle: APP_NAV_PROFILE_LINK.description,
      href: APP_NAV_PROFILE_LINK.href,
      group: 'Navigate',
    },
    ...(focused ? [] : settingsTabs),
    ...(focused ? [] : settingsDeep),
    ...(focused ? [] : studioTabs),
    ...actionItems,
  ];
}
