import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export type GalleryLightboxFit = 'contain' | 'cover' | 'actual';

export type GalleryLightboxUiPreferences = {
  fit: GalleryLightboxFit;
  tutorialSeen: boolean;
  /** When true, iterate/handoff actions stay collapsed behind Actions. */
  chromeCompact: boolean;
};

export const GALLERY_LIGHTBOX_UI_KEY = 'comfy-gallery-lightbox-ui-v1';

const DEFAULT_PREFS: GalleryLightboxUiPreferences = {
  fit: 'contain',
  tutorialSeen: false,
  chromeCompact: true,
};

export function isGalleryLightboxFit(value: unknown): value is GalleryLightboxFit {
  return value === 'contain' || value === 'cover' || value === 'actual';
}

export function loadGalleryLightboxUiPreferences(): GalleryLightboxUiPreferences {
  const parsed = readBrowserValue<Partial<GalleryLightboxUiPreferences>>(GALLERY_LIGHTBOX_UI_KEY);
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_PREFS };
  }
  return {
    fit: isGalleryLightboxFit(parsed.fit) ? parsed.fit : DEFAULT_PREFS.fit,
    tutorialSeen: Boolean(parsed.tutorialSeen),
    chromeCompact:
      typeof parsed.chromeCompact === 'boolean'
        ? parsed.chromeCompact
        : DEFAULT_PREFS.chromeCompact,
  };
}

export function saveGalleryLightboxUiPreferences(preferences: GalleryLightboxUiPreferences): void {
  writeBrowserValue(GALLERY_LIGHTBOX_UI_KEY, preferences);
}

export function markGalleryLightboxTutorialSeen(): void {
  const current = loadGalleryLightboxUiPreferences();
  if (current.tutorialSeen) {
    return;
  }
  saveGalleryLightboxUiPreferences({ ...current, tutorialSeen: true });
}
