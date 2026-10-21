import type { CommandItem } from '@/components/command-palette/types';

export const ACTION_ITEMS: CommandItem[] = [
  {
    id: 'sync-now',
    label: 'Sync storage now',
    action: () =>
      void import('@/lib/storage/auto-storage-sync').then(m => m.autoPushStorageDebounced()),
    group: 'Actions',
  },
  {
    id: 'save-session-recipe',
    label: 'Save session snapshot',
    subtitle: 'Model, quality, LoRAs, sampler — restore anytime',
    action: () => {
      void import('@/lib/prompt/session-recipes').then(async m => {
        const { loadSettingsCache } = await import('@/lib/settings/cache');
        const shared = loadSettingsCache().shared;
        const recipe = m.buildSessionRecipeFromShared({ shared });
        m.pushSessionRecipe(recipe);
      });
    },
    group: 'Actions',
  },
  {
    id: 'restore-session-recipe',
    label: 'Restore latest session snapshot',
    subtitle: 'Applies the most recent Save session snapshot',
    action: () => {
      void import('@/lib/prompt/session-recipes').then(async m => {
        const { loadSettingsCache, saveSharedSettings } = await import('@/lib/settings/cache');
        const latest = m.loadSessionRecipes()[0];
        if (!latest) {
          return;
        }
        const next = m.applySessionRecipeShared(loadSettingsCache().shared, latest);
        saveSharedSettings(next);
        window.location.reload();
      });
    },
    group: 'Actions',
  },
  {
    id: 'review-gallery',
    label: 'Open gallery review',
    href: '/gallery?review=1',
    group: 'Actions',
  },
  {
    id: 'heal-connection',
    label: 'Heal & ready',
    subtitle: 'Checks ComfyUI, your models and the system workflows in one click',
    group: 'Actions',
    action: () => {
      void import('@/lib/app/first-run-setup').then(async ({ runHealAndReady }) => {
        const result = await runHealAndReady({
          onProgress: progress => {
            window.dispatchEvent(
              new CustomEvent('command-palette-heal-progress', { detail: progress.message })
            );
          },
        });
        if (result.ok || result.systemWorkflowsEnabled) {
          void import('@/lib/app/first-run-dismiss').then(({ dismissFirstRunSetupSurfaces }) => {
            dismissFirstRunSetupSurfaces();
          });
        }
        window.dispatchEvent(new CustomEvent('settings-cache-updated'));
        window.dispatchEvent(
          new CustomEvent('command-palette-heal-done', { detail: result.message })
        );
      });
    },
  },
  {
    id: 'reload',
    label: 'Reload page',
    action: () => window.location.reload(),
    group: 'Actions',
  },
  {
    id: 'upload-gallery',
    label: 'Upload images to gallery',
    subtitle: 'Add stills from disk',
    href: '/gallery?upload=1',
    group: 'Actions',
  },
  {
    id: 'report-bug',
    label: 'Report a bug',
    subtitle: 'Open a GitHub issue',
    action: () => {
      void import('@/lib/app/project-links').then(m => m.openGitHubBugReport());
    },
    group: 'Actions',
  },
];
