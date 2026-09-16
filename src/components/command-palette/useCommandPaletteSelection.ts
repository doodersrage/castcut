import { useCallback, useMemo } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { AppFeatureId } from '@/lib/auth/features';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import type { CommandItem } from '@/components/command-palette/types';
import { allowPaletteItemOnPath, isCommandItemAllowed } from '@/components/command-palette/catalog';
import {
  createDismissContinueHandler,
  filterCommandPaletteItems,
  type useCommandPaletteOpenState,
} from '@/components/command-palette/useCommandPaletteData';
import { resolvePlayLoopNavHref } from '@/lib/play-campaign';
import { loadSettingsCache } from '@/lib/settings-cache';
type OpenState = ReturnType<typeof useCommandPaletteOpenState>;

function createApplyLastLookHandler(router: AppRouterInstance) {
  return () => {
    void import('@/lib/session-recipes').then(async m => {
      const { loadSettingsCache, saveSharedSettings } = await import('@/lib/settings-cache');
      const recipe = m.latestGenerateLookRecipe();
      if (!recipe) {
        return;
      }
      saveSharedSettings(m.applySessionRecipeShared(loadSettingsCache().shared, recipe), {
        notify: true,
      });
      const { galleryToolHref } = await import('@/lib/gallery-tool-href');
      router.push(galleryToolHref(recipe.toolId));
    });
  };
}

function createRestoreKeeperStackHandler(router: AppRouterInstance) {
  return (entry: ComfyGalleryEntry) => {
    void import('@/lib/gallery-stack-restore').then(async ({ applyGalleryStackToSession }) => {
      applyGalleryStackToSession(entry);
      const { galleryToolHref } = await import('@/lib/gallery-tool-href');
      router.push(galleryToolHref(entry.tool));
    });
  };
}

type UseCommandPaletteSelectionOptions = {
  isNullContext: boolean;
  catalog: CommandItem[];
  query: string;
  pathname: string;
  allowedFeatures: AppFeatureId[] | 'all';
  guestShell: boolean;
  globalMatches: CommandItem[];
  openState: OpenState;
  router: AppRouterInstance;
  setOpen: (open: boolean) => void;
};

export function useCommandPaletteSelection({
  isNullContext,
  catalog,
  query,
  pathname,
  allowedFeatures,
  guestShell,
  globalMatches,
  openState,
  router,
  setOpen,
}: UseCommandPaletteSelectionOptions) {
  const items = useMemo(
    () =>
      isNullContext
        ? []
        : catalog.filter(
            item =>
              isCommandItemAllowed(item, allowedFeatures, guestShell) &&
              allowPaletteItemOnPath(item, pathname)
          ),
    [allowedFeatures, catalog, guestShell, isNullContext, pathname]
  );

  const onDismissContinue = useMemo(
    () => createDismissContinueHandler(openState.setLastDraft, openState.setLastRoute),
    [openState.setLastDraft, openState.setLastRoute]
  );
  const onApplyLastLook = useCallback(() => {
    createApplyLastLookHandler(router)();
  }, [router]);
  const onRestoreKeeperStack = useCallback(
    (entry: ComfyGalleryEntry) => {
      createRestoreKeeperStackHandler(router)(entry);
    },
    [router]
  );

  const filtered = useMemo(
    () =>
      isNullContext
        ? []
        : filterCommandPaletteItems({
            query,
            items,
            favorites: openState.favorites,
            recent: openState.recent,
            globalMatches,
            allowedFeatures,
            guestShell,
            pathname,
            lastDraft: openState.lastDraft,
            lastRoute: openState.lastRoute,
            lastLook: openState.lastLook,
            keeperStack: openState.keeperStack,
            recentGallery: openState.recentGallery,
            activeProjectLabel: openState.activeProjectLabel,
            onDismissContinue,
            onApplyLastLook,
            onRestoreKeeperStack,
          }),
    [
      allowedFeatures,
      globalMatches,
      guestShell,
      isNullContext,
      items,
      onApplyLastLook,
      onDismissContinue,
      onRestoreKeeperStack,
      openState.activeProjectLabel,
      openState.favorites,
      openState.keeperStack,
      openState.lastDraft,
      openState.lastLook,
      openState.lastRoute,
      openState.recent,
      openState.recentGallery,
      pathname,
      query,
    ]
  );

  const runItem = useCallback(
    (item: CommandItem) => {
      if (item.action) {
        item.action();
        if (item.id !== 'dismiss-continue') {
          setOpen(false);
        }
        return;
      }
      setOpen(false);
      if (item.href) {
        const characterId = loadSettingsCache().shared.activeCharacterId;
        router.push(resolvePlayLoopNavHref(item.href, characterId));
      }
    },
    [router, setOpen]
  );

  return { filtered, runItem };
}
