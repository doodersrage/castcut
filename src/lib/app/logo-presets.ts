export type LogoStylePresetId =
  'app-icon' | 'minimal-mark' | 'monogram' | 'wordmark' | 'mascot' | 'geometric';

export type LogoMotifId = 'studio-bars' | 'viewport' | 'monogram' | 'geometric';

export type LogoStylePreset = {
  id: LogoStylePresetId;
  label: string;
  summary: string;
  defaultMotif: LogoMotifId;
  promptHints: string;
};

export const LOGO_STYLE_PRESETS: LogoStylePreset[] = [
  {
    id: 'app-icon',
    label: 'App icon',
    summary: 'Square mark for favicons and mobile home screens.',
    defaultMotif: 'studio-bars',
    promptHints:
      'square app icon, centered mark, generous padding, flat vector-friendly shapes, high contrast on solid background',
  },
  {
    id: 'minimal-mark',
    label: 'Minimal mark',
    summary: 'Simple symbol without text — works at small sizes.',
    defaultMotif: 'viewport',
    promptHints:
      'minimal geometric logo mark, 2–3 shapes max, no text, flat design, centered composition',
  },
  {
    id: 'monogram',
    label: 'Monogram',
    summary: 'Initial letter in a rounded container.',
    defaultMotif: 'monogram',
    promptHints:
      'monogram logo, single bold letterform, circular or rounded-square container, flat vector style',
  },
  {
    id: 'wordmark',
    label: 'Wordmark',
    summary: 'Typographic logo emphasizing the brand name.',
    defaultMotif: 'studio-bars',
    promptHints:
      'wordmark logo, custom lettering feel, horizontal layout, clean sans-serif, no extra symbols unless subtle',
  },
  {
    id: 'mascot',
    label: 'Mascot',
    summary: 'Friendly character or object as brand emblem.',
    defaultMotif: 'geometric',
    promptHints:
      'simple mascot logo, bold silhouette, limited palette, sticker-like clarity, centered on solid background',
  },
  {
    id: 'geometric',
    label: 'Geometric',
    summary: 'Abstract shapes and gradients.',
    defaultMotif: 'geometric',
    promptHints:
      'abstract geometric logo, overlapping shapes, subtle gradient, modern tech brand, no photorealism',
  },
];

export function getLogoStylePreset(id: LogoStylePresetId | string | undefined): LogoStylePreset {
  return LOGO_STYLE_PRESETS.find(preset => preset.id === id) ?? LOGO_STYLE_PRESETS[0];
}

export const LOGO_MOTIF_OPTIONS: { id: LogoMotifId; label: string }[] = [
  { id: 'studio-bars', label: 'Studio bars' },
  { id: 'viewport', label: 'Viewport frame' },
  { id: 'monogram', label: 'Monogram letter' },
  { id: 'geometric', label: 'Geometric gem' },
];

export type LogoColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  panel: string;
};

export const DEFAULT_LOGO_COLORS: LogoColors = {
  primary: '#5eead4',
  secondary: '#38bdf8',
  accent: '#f0ab7c',
  background: '#0b0f14',
  panel: '#141b24',
};
