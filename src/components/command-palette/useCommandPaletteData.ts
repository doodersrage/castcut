import { useEffect, useMemo, useState } from 'react';
import type { AppFeatureId } from '@/lib/auth/features';
import { NSFW_GENERATOR_NAV_LINK } from '@/lib/nsfw-generator-nav';
import { loadNavFavorites } from '@/lib/nav-favorites';
import { loadRecentDestinations, type RecentDestination } from '@/lib/recent-destinations';
import { clearLastToolRoute, loadLastToolRoute } from '@/lib/last-tool-route';
import {
  clearLastToolDraft,
  loadLastToolDraft,
  type ToolDraftSummary,
} from '@/lib/tool-draft-memory';
import type { GlobalSearchResult } from '@/lib/global-search';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadWorkspaceMode, usesPlayChrome } from '@/lib/workspace-mode';
import {
  buildNavItems,
  isCommandItemAllowed,
  allowPaletteItemOnPath,
} from '@/components/command-palette/catalog';
import type { CommandItem } from '@/components/command-palette/types';
import type { SessionRecipe } from '@/lib/session-recipes';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';

type UseCommandPaletteDataOptions = {
  open: boolean;
  pathname: string;
  allowedFeatures: AppFeatureId[] | 'all';
  guestShell: boolean;
  nsfwGeneratorEnabled: boolean;
  onOpenShortcuts: () => void;
};

export function useCommandPaletteCatalog({
  pathname,
  nsfwGeneratorEnabled,
  onOpenShortcuts,
}: Pick<UseCommandPaletteDataOptions, 'pathname' | 'nsfwGeneratorEnabled' | 'onOpenShortcuts'>) {
  const [pluginNavItems, setPluginNavItems] = useState<CommandItem[]>([]);
  const playChrome = usesPlayChrome(loadWorkspaceMode(), pathname);

  const catalog = useMemo(() => {
    const base = buildNavItems(pathname);
    const existing = new Set(base.map(item => item.href).filter(Boolean));
    const pluginExtras = playChrome
      ? []
      : pluginNavItems.filter(item => item.href && !existing.has(item.href));
    const envGatedExtras =
      !playChrome && nsfwGeneratorEnabled && !existing.has(NSFW_GENERATOR_NAV_LINK.href)
        ? [
            {
              id: 'plugin-nav-nsfw-generator',
              label: NSFW_GENERATOR_NAV_LINK.label,
              subtitle: NSFW_GENERATOR_NAV_LINK.description,
              href: NSFW_GENERATOR_NAV_LINK.href,
              group: 'Plugins',
            } satisfies CommandItem,
          ]
        : [];
    return [
      ...base,
      ...pluginExtras,
      ...envGatedExtras,
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts',
        subtitle: 'Cheat sheet · palette also lists Resume draft & Continue',
        group: 'Actions',
        action: onOpenShortcuts,
      } satisfies CommandItem,
    ];
  }, [nsfwGeneratorEnabled, onOpenShortcuts, pathname, playChrome, pluginNavItems]);

  return { catalog, setPluginNavItems, playChrome };
}

export function useCommandPaletteOpenState(open: boolean) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentDestination[]>([]);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<ToolDraftSummary | null>(null);
  const [lastLook, setLastLook] = useState<SessionRecipe | null>(null);
  const [keeperStack, setKeeperStack] = useState<ComfyGalleryEntry | null>(null);
  const [recentGallery, setRecentGallery] = useState<ComfyGalleryEntry[]>([]);
  const [activeProjectLabel, setActiveProjectLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    scheduleAfterCommit(() => {
      setFavorites(loadNavFavorites());
      setRecent(loadRecentDestinations());
      setLastRoute(loadLastToolRoute());
      setLastDraft(loadLastToolDraft());
    });
    void import('@/lib/session-recipes').then(({ latestGenerateLookRecipe }) => {
      setLastLook(latestGenerateLookRecipe());
    });
    void import('@/lib/gallery-stack-restore').then(async ({ pickKeeperStackEntry }) => {
      const { loadComfyGallery } = await import('@/lib/comfyui-gallery');
      const gallery = loadComfyGallery();
      setKeeperStack(pickKeeperStackEntry(gallery));
      setRecentGallery(
        gallery
          .filter(entry => entry.status === 'completed')
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
          .slice(0, 5)
      );
    });
    void import('@/lib/prompt-projects').then(({ loadActiveProjectId, loadPromptProjects }) => {
      const activeId = loadActiveProjectId();
      if (!activeId) {
        setActiveProjectLabel(null);
        return;
      }
      const project = loadPromptProjects().find(entry => entry.id === activeId);
      setActiveProjectLabel(project?.name ?? activeId);
    });
  }, [open]);

  return {
    favorites,
    setFavorites,
    recent,
    lastRoute,
    setLastRoute,
    lastDraft,
    setLastDraft,
    lastLook,
    keeperStack,
    recentGallery,
    activeProjectLabel,
  };
}

export function useCommandPalettePluginNav(
  open: boolean,
  setPluginNavItems: (items: CommandItem[]) => void
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    void import('@/lib/plugin-nav-links').then(({ resolveAllPluginNavLinks }) => {
      setPluginNavItems(
        resolveAllPluginNavLinks().map(link => ({
          id: `plugin-nav-${link.href}`,
          label: link.label,
          subtitle: link.description,
          href: link.href,
          group: 'Plugins',
        }))
      );
    });
  }, [open, setPluginNavItems]);
}

export function useCommandPaletteGlobalSearch(query: string) {
  const [globalMatches, setGlobalMatches] = useState<CommandItem[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      scheduleAfterCommit(() => setGlobalMatches([]));
      return;
    }

    let cancelled = false;
    void import('@/lib/global-search').then(({ searchGlobal }) => {
      if (cancelled) {
        return;
      }
      setGlobalMatches(
        searchGlobal(query).map((result: GlobalSearchResult) => ({
          id: result.id,
          label: result.label,
          subtitle: result.subtitle,
          href: result.href,
          group: result.group,
        }))
      );
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return globalMatches;
}

export function filterCommandPaletteItems(options: {
  query: string;
  items: CommandItem[];
  favorites: string[];
  recent: RecentDestination[];
  globalMatches: CommandItem[];
  allowedFeatures: AppFeatureId[] | 'all';
  guestShell: boolean;
  pathname: string;
  lastDraft: ToolDraftSummary | null;
  lastRoute: string | null;
  lastLook: SessionRecipe | null;
  keeperStack: ComfyGalleryEntry | null;
  recentGallery: ComfyGalleryEntry[];
  activeProjectLabel: string | null;
  onDismissContinue: () => void;
  onApplyLastLook: () => void;
  onRestoreKeeperStack: (entry: ComfyGalleryEntry) => void;
}): CommandItem[] {
  const {
    query,
    items,
    favorites,
    recent,
    globalMatches,
    allowedFeatures,
    guestShell,
    pathname,
    lastDraft,
    lastRoute,
    lastLook,
    keeperStack,
    recentGallery,
    activeProjectLabel,
    onDismissContinue,
    onApplyLastLook,
    onRestoreKeeperStack,
  } = options;

  const q = query.trim().toLowerCase();
  const favoriteHrefs = new Set(favorites);
  const continueItems: CommandItem[] = [];

  if (lastDraft) {
    continueItems.push({
      id: 'resume-draft',
      label: `Resume draft · ${lastDraft.label}`,
      subtitle: lastDraft.preview,
      href: lastDraft.href,
      group: 'Continue',
    });
  }
  if (lastRoute && lastRoute !== lastDraft?.href) {
    continueItems.push({
      id: 'continue-route',
      label: 'Continue where you left off',
      subtitle: lastRoute,
      href: lastRoute,
      group: 'Continue',
    });
  }
  if (lastLook) {
    continueItems.push({
      id: 'apply-last-look',
      label: `Apply last look · ${lastLook.label}`,
      subtitle: 'Model, LoRAs, embeddings, identity, quality',
      group: 'Continue',
      action: onApplyLastLook,
    });
  }
  if (keeperStack) {
    continueItems.push({
      id: 'restore-keeper-stack',
      label: `Restore keeper stack · ${keeperStack.model ?? 'session'}`,
      subtitle: keeperStack.reviewRating
        ? `${keeperStack.reviewRating}★ · ${keeperStack.tool ?? 'generate'}`
        : (keeperStack.tool ?? 'generate'),
      group: 'Continue',
      action: () => onRestoreKeeperStack(keeperStack),
    });
  }
  if (activeProjectLabel) {
    continueItems.push({
      id: 'active-project',
      label: `Active project · ${activeProjectLabel}`,
      subtitle: 'Studio projects tab',
      href: '/studio?tab=projects',
      group: 'Continue',
    });
  }
  for (const entry of recentGallery) {
    const preview = entry.prompt.trim().slice(0, 72) || entry.model || 'Gallery output';
    continueItems.push({
      id: `recent-gallery-${entry.id}`,
      label: `Gallery · ${preview}`,
      subtitle: entry.tool ?? 'completed',
      href: `/gallery?focus=${encodeURIComponent(entry.id)}`,
      group: 'Gallery',
    });
  }
  if (lastDraft || lastRoute) {
    continueItems.push({
      id: 'dismiss-continue',
      label: 'Dismiss continue',
      subtitle: 'Clear resume draft and last tool',
      group: 'Continue',
      action: onDismissContinue,
    });
  }

  const recentItems: CommandItem[] = recent.map(entry => ({
    id: `recent-${entry.href}`,
    label: entry.label,
    subtitle: entry.href,
    href: entry.href,
    group: 'Recent',
  }));

  const withFavFirst = [...items].sort((a, b) => {
    const aFav = a.href ? favoriteHrefs.has(a.href) : false;
    const bFav = b.href ? favoriteHrefs.has(b.href) : false;
    if (aFav === bFav) {
      return 0;
    }
    return aFav ? -1 : 1;
  });

  const isAllowed = (item: CommandItem) =>
    isCommandItemAllowed(item, allowedFeatures, guestShell) &&
    allowPaletteItemOnPath(item, pathname);

  if (!q) {
    const seen = new Set<string>();
    return [...continueItems, ...recentItems, ...withFavFirst]
      .filter(isAllowed)
      .filter(item => !item.searchOnly)
      .filter(item => {
        const key = item.group === 'Continue' ? item.id : (item.href ?? item.id);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  const staticMatches = [...continueItems, ...recentItems, ...withFavFirst]
    .filter(isAllowed)
    .filter(item => {
      // Every word somewhere in the item ("pose controlnet" finds the pose lock switch).
      const haystack =
        `${item.label} ${item.group} ${item.subtitle ?? ''} ${item.keywords ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every(word => haystack.includes(word));
    });
  const seen = new Set<string>();
  return [...staticMatches, ...globalMatches].filter(isAllowed).filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function createDismissContinueHandler(
  setLastDraft: (value: ToolDraftSummary | null) => void,
  setLastRoute: (value: string | null) => void
) {
  return () => {
    clearLastToolDraft();
    clearLastToolRoute();
    setLastDraft(null);
    setLastRoute(null);
  };
}
