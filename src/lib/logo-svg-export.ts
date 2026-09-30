import {
  DEFAULT_LOGO_COLORS,
  type LogoColors,
  type LogoMotifId,
  getLogoStylePreset,
  type LogoStylePresetId,
} from './logo-presets';

export type LogoSvgInput = {
  brandName: string;
  tagline?: string;
  motif?: LogoMotifId;
  stylePreset?: LogoStylePresetId;
  colors?: Partial<LogoColors>;
  includeWordmark?: boolean;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeHex(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

function monogramLetter(brandName: string): string {
  const letter = brandName
    .trim()
    .match(/[A-Za-z0-9]/)?.[0]
    ?.toUpperCase();
  return letter ?? 'P';
}

function studioBarsMark(colors: LogoColors): string {
  return `
  <rect width="512" height="512" rx="128" fill="${colors.background}"/>
  <rect x="12" y="12" width="488" height="488" rx="116" fill="none" stroke="url(#logo-grad)" stroke-opacity="0.35" stroke-width="12"/>
  <rect x="112" y="112" width="288" height="288" rx="72" fill="url(#logo-panel)" stroke="url(#logo-grad)" stroke-width="14"/>
  <rect x="168" y="192" width="144" height="26" rx="13" fill="url(#logo-grad)" opacity="0.95"/>
  <rect x="168" y="244" width="104" height="26" rx="13" fill="url(#logo-grad)" opacity="0.7"/>
  <rect x="168" y="296" width="128" height="26" rx="13" fill="url(#logo-grad)" opacity="0.45"/>
  <rect x="324" y="188" width="18" height="64" rx="9" fill="${colors.accent}"/>
  `.trim();
}

function viewportMark(colors: LogoColors): string {
  return `
  <rect width="512" height="512" rx="128" fill="${colors.background}"/>
  <rect x="96" y="96" width="320" height="320" rx="48" fill="none" stroke="url(#logo-grad)" stroke-width="16"/>
  <rect x="128" y="128" width="256" height="256" rx="36" fill="url(#logo-panel)" stroke="${colors.secondary}" stroke-opacity="0.35" stroke-width="4"/>
  <circle cx="256" cy="256" r="56" fill="url(#logo-grad)" opacity="0.85"/>
  `.trim();
}

function monogramMark(colors: LogoColors, letter: string): string {
  return `
  <rect width="512" height="512" rx="128" fill="${colors.background}"/>
  <circle cx="256" cy="256" r="168" fill="url(#logo-panel)" stroke="url(#logo-grad)" stroke-width="14"/>
  <text x="256" y="296" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-size="168" font-weight="600" fill="url(#logo-grad)">${escapeXml(letter)}</text>
  `.trim();
}

function geometricMark(colors: LogoColors): string {
  return `
  <rect width="512" height="512" rx="128" fill="${colors.background}"/>
  <polygon points="256,96 416,352 96,352" fill="url(#logo-grad)" opacity="0.9"/>
  <circle cx="256" cy="280" r="72" fill="${colors.accent}" opacity="0.95"/>
  <rect x="196" y="160" width="120" height="24" rx="12" fill="${colors.secondary}" opacity="0.75"/>
  `.trim();
}

function markForMotif(motif: LogoMotifId, colors: LogoColors, brandName: string): string {
  switch (motif) {
    case 'viewport':
      return viewportMark(colors);
    case 'monogram':
      return monogramMark(colors, monogramLetter(brandName));
    case 'geometric':
      return geometricMark(colors);
    case 'studio-bars':
    default:
      return studioBarsMark(colors);
  }
}

export function buildLogoSvg(input: LogoSvgInput): string {
  const preset = getLogoStylePreset(input.stylePreset);
  const motif = input.motif ?? preset.defaultMotif;
  const colors: LogoColors = {
    primary: normalizeHex(input.colors?.primary, DEFAULT_LOGO_COLORS.primary),
    secondary: normalizeHex(input.colors?.secondary, DEFAULT_LOGO_COLORS.secondary),
    accent: normalizeHex(input.colors?.accent, DEFAULT_LOGO_COLORS.accent),
    background: normalizeHex(input.colors?.background, DEFAULT_LOGO_COLORS.background),
    panel: normalizeHex(input.colors?.panel, DEFAULT_LOGO_COLORS.panel),
  };
  const brandName = input.brandName.trim() || 'Brand';
  const includeWordmark = input.includeWordmark !== false;
  const tagline = input.tagline?.trim();

  const defs = `
  <defs>
    <linearGradient id="logo-grad" x1="96" y1="64" x2="416" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${colors.primary}"/>
      <stop offset="55%" stop-color="${colors.secondary}"/>
      <stop offset="100%" stop-color="${colors.accent}"/>
    </linearGradient>
    <linearGradient id="logo-panel" x1="144" y1="128" x2="368" y2="384" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${colors.panel}"/>
      <stop offset="100%" stop-color="#0f141c"/>
    </linearGradient>
  </defs>`;

  const wordmark = includeWordmark
    ? `
  <text x="256" y="448" text-anchor="middle" font-family="Georgia, 'Iowan Old Style', serif" font-size="44" font-weight="600" fill="#ececef">${escapeXml(brandName)}</text>
  ${
    tagline
      ? `<text x="256" y="486" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" fill="#9eb6e0">${escapeXml(tagline)}</text>`
      : ''
  }`
    : '';

  // The wordmark sits inside the 512 tile — a shorter viewBox cut off the tile's rounded bottom.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${escapeXml(brandName)} logo">
${defs}
${markForMotif(motif, colors, brandName)}
${wordmark}
</svg>`;
}

export function logoSvgFilename(brandName: string): string {
  const slug = brandName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'logo'}-mark.svg`;
}

export function downloadLogoSvg(svg: string, filename: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
