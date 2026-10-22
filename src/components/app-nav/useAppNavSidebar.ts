'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { featureForPath } from '@/lib/auth/features';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { BUILTIN_TOOL_PLUGINS, type ToolPlugin } from '@/lib/app/tool-plugin-registry';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  APP_NAV_GROUPS,
  APP_NAV_SETTINGS_LINK,
  mergePluginLinksIntoNav,
  type AppNavLink,
} from '@/lib/app/nav-catalog';
import { defaultExpandedNavGroups, navGroupsForPath } from '@/lib/app/workspace-mode';
import { PLUGIN_MANIFEST_UPDATED_EVENT } from '@/lib/plugin/manifest';
import { NSFW_GENERATOR_NAV_LINK } from '@/lib/adult/nsfw-generator-nav';
import { useNsfwGeneratorEnabled } from '@/hooks/useNsfwGeneratorEnabled';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { loadNavFavorites, toggleNavFavorite } from '@/lib/app/nav-favorites';
import {
  loadExpandedNavGroups,
  saveExpandedNavGroups,
  toggleExpandedNavGroup,
} from '@/lib/app/nav-expanded-groups';
import { pushRecentDestination } from '@/lib/history/recent-destinations';
import { saveLastToolRoute } from '@/lib/app/last-tool-route';
import { linkIsActive } from '@/components/app-nav/linkIsActive';

export function useAppNavSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const rawAuth = useAuth();
  const isNullContext = !rawAuth;

  const {
    authEnabled,
    user,
    allowedFeatures,
    logout,
    impersonating,
    impersonatorUsername,
    refresh,
    loading,
  } = rawAuth ?? {
    loading: true,
    authEnabled: false,
    user: null,
    allowedFeatures: 'all' as const,
    impersonating: false,
    refresh: async () => {},
    logout: async () => {},
    isAdmin: false,
  };

  const [customPlugins, setCustomPlugins] = useState<ToolPlugin[]>([]);
  const [manifestNavLinks, setManifestNavLinks] = useState<AppNavLink[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[] | null>(null);
  const workspaceMode = useWorkspaceMode();
  const nsfwGeneratorEnabled = useNsfwGeneratorEnabled();

  useEffect(() => {
    scheduleAfterCommit(() => {
      setFavorites(loadNavFavorites());
    });
    const onStorage = () => {
      setFavorites(loadNavFavorites());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onStorage);
    };
  }, []);

  useEffect(() => {
    if (isNullContext) return;
    const builtinIds = new Set(BUILTIN_TOOL_PLUGINS.map(entry => entry.id));
    const knownHrefs = new Set(
      APP_NAV_GROUPS.flatMap(group => group.links.map(link => link.href.split('?')[0] ?? link.href))
    );

    const loadPlugins = () => {
      void Promise.all([
        import('@/lib/app/tool-plugin-registry'),
        import('@/lib/plugin/manifest'),
      ]).then(([{ loadToolPlugins }, { navLinksFromInstalledPlugins }]) => {
        setCustomPlugins(
          loadToolPlugins().filter(
            entry =>
              !builtinIds.has(entry.id) && !knownHrefs.has(entry.href.split('?')[0] ?? entry.href)
          )
        );
        setManifestNavLinks(navLinksFromInstalledPlugins());
      });
    };

    window.addEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(loadPlugins, { timeout: 5000 });
      return () => {
        window.cancelIdleCallback(idleId);
        window.removeEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);
      };
    }

    const timeoutId = window.setTimeout(loadPlugins, 1500);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(PLUGIN_MANIFEST_UPDATED_EVENT, loadPlugins);
    };
  }, [isNullContext]);

  const visibleGroups = useMemo(() => {
    if (isNullContext || loading) {
      return [{ label: '__placeholder__', links: [] as AppNavLink[] }];
    }

    const bookmarkLinks: AppNavLink[] = customPlugins.map(plugin => ({
      href: plugin.href,
      label: plugin.label,
      description: plugin.description,
    }));
    const envGatedLinks = nsfwGeneratorEnabled ? [NSFW_GENERATOR_NAV_LINK] : [];
    const pluginLinks = [...bookmarkLinks, ...manifestNavLinks, ...envGatedLinks];
    const catalog = navGroupsForPath(
      workspaceMode,
      pathname,
      mergePluginLinksIntoNav(APP_NAV_GROUPS, pluginLinks)
    );

    return catalog
      .map(group => ({
        ...group,
        links: group.links.filter(link =>
          canAccessNavFeature(allowedFeatures, featureForPath(link.href.split('?')[0] ?? link.href))
        ),
      }))
      .filter(group => group.links.length > 0);
  }, [
    isNullContext,
    allowedFeatures,
    loading,
    customPlugins,
    manifestNavLinks,
    pathname,
    workspaceMode,
    nsfwGeneratorEnabled,
  ]);

  const allLinks = useMemo(
    () =>
      isNullContext
        ? [APP_NAV_SETTINGS_LINK]
        : [
            ...visibleGroups
              .filter(g => g.label !== '__placeholder__')
              .flatMap(group => group.links),
            ...(canAccessNavFeature(allowedFeatures, 'settings') ? [APP_NAV_SETTINGS_LINK] : []),
          ],
    [isNullContext, allowedFeatures, visibleGroups]
  );

  const pinnedLinks = useMemo(() => {
    const byHref = new Map(allLinks.map(link => [link.href, link]));
    return favorites
      .map(href => byHref.get(href))
      .filter((link): link is AppNavLink => Boolean(link));
  }, [allLinks, favorites]);

  useEffect(() => {
    if (isNullContext) return;
    if (expandedGroups !== null || visibleGroups.length === 0) {
      return;
    }
    const saved = loadExpandedNavGroups();
    if (saved && saved.length > 0) {
      scheduleAfterCommit(() => {
        setExpandedGroups(saved);
      });
      return;
    }
    if (favorites.length > 0) {
      const activeGroup = visibleGroups.find(group =>
        group.links.some(link => linkIsActive(link, pathname, search))
      );
      scheduleAfterCommit(() => {
        setExpandedGroups(
          [
            ...defaultExpandedNavGroups(workspaceMode, visibleGroups).slice(0, 1),
            ...(activeGroup ? [activeGroup.label] : []),
          ].filter((label, index, list) => list.indexOf(label) === index)
        );
      });
      return;
    }
    scheduleAfterCommit(() => {
      setExpandedGroups(defaultExpandedNavGroups(workspaceMode, visibleGroups));
    });
  }, [
    isNullContext,
    expandedGroups,
    favorites.length,
    pathname,
    search,
    visibleGroups,
    workspaceMode,
  ]);

  useEffect(() => {
    const saved = loadExpandedNavGroups();
    if (saved && saved.length > 0) {
      return;
    }
    scheduleAfterCommit(() => {
      setExpandedGroups(defaultExpandedNavGroups(workspaceMode, visibleGroups));
    });
  }, [workspaceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const match =
      allLinks.find(link => linkIsActive(link, pathname, search)) ??
      allLinks.find(link => (link.href.split('?')[0] || '/') === pathname);
    if (!match) {
      return;
    }
    pushRecentDestination({ href: match.href, label: match.label });
    saveLastToolRoute(match.href);
  }, [allLinks, pathname, search]);

  useEffect(() => {
    if (expandedGroups === null) {
      return;
    }
    const activeGroup = visibleGroups.find(group =>
      group.links.some(link => linkIsActive(link, pathname, search))
    );
    if (!activeGroup || expandedGroups.includes(activeGroup.label)) {
      return;
    }
    const next = [...expandedGroups, activeGroup.label];
    scheduleAfterCommit(() => {
      setExpandedGroups(next);
    });
    saveExpandedNavGroups(next);
  }, [expandedGroups, pathname, search, visibleGroups]);

  const settingsVisible = canAccessNavFeature(allowedFeatures, 'settings');
  const profileVisible = authEnabled && Boolean(user);
  const guestShell = authEnabled && !user;
  const navReady = !loading && (!authEnabled || Boolean(user));
  const openGroups = expandedGroups ?? visibleGroups.map(group => group.label);

  function handleToggleFavorite(href: string) {
    setFavorites(toggleNavFavorite(href));
  }

  function handleToggleGroup(label: string) {
    const next = toggleExpandedNavGroup(label, openGroups);
    setExpandedGroups(next);
  }

  async function endImpersonation() {
    await fetch('/api/auth/impersonate', { method: 'DELETE' });
    await refresh();
    // Full reload on purpose: the session switched users, so nothing client-side may survive.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/settings?tab=users';
  }

  return {
    pathname,
    search,
    authEnabled,
    user,
    logout,
    impersonating,
    impersonatorUsername,
    favorites,
    workspaceMode,
    visibleGroups,
    pinnedLinks,
    settingsVisible,
    profileVisible,
    guestShell,
    navReady,
    openGroups,
    handleToggleFavorite,
    handleToggleGroup,
    endImpersonation,
    setExpandedGroups,
  };
}

export type AppNavSidebarViewModel = ReturnType<typeof useAppNavSidebar>;
