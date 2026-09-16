/**
 * Route tints — soft functional colors for badges and chips only.
 * Primary actions always use the single brand accent (--accent in globals.css).
 * Legacy stored values may still say `violet`; normalizeToolAccent maps that to `brand`.
 */
export type ToolAccent =
  'brand' | 'emerald' | 'sky' | 'cyan' | 'teal' | 'amber' | 'fuchsia' | 'rose' | 'neutral';

const brandTint = {
  badge: 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]',
  chipActive: 'ui-chip',
  text: 'text-[var(--accent-text)]',
} as const;

export const ROUTE_TINT_CLASSES: Record<
  ToolAccent,
  {
    badge: string;
    chipActive: string;
    text: string;
  }
> = {
  brand: brandTint,
  emerald: {
    badge:
      'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-success-text)]',
  },
  sky: {
    badge: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-info-text)]',
  },
  cyan: {
    badge: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-info-text)]',
  },
  teal: {
    badge:
      'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-success-text)]',
  },
  amber: {
    badge:
      'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-warning-text)]',
  },
  fuchsia: {
    badge: 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--accent-text)]',
  },
  rose: {
    badge:
      'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--tint-danger-text)]',
  },
  neutral: {
    badge: 'border-[var(--border-default)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
    chipActive: 'ui-chip',
    text: 'text-[var(--text-secondary)]',
  },
};

/** @deprecated Use ROUTE_TINT_CLASSES — kept for incremental migration */
export const TOOL_ACCENT_CLASSES = ROUTE_TINT_CLASSES;

export const ROUTE_ACCENT: Record<string, ToolAccent> = {
  '/': 'brand',
  '/format': 'emerald',
  '/prompt': 'sky',
  '/lint': 'amber',
  '/topics': 'brand',
  '/character': 'sky',
  '/characters': 'sky',
  '/background': 'teal',
  '/pet': 'rose',
  '/fantasy': 'brand',
  '/story': 'amber',
  '/play': 'amber',
  '/fitting': 'rose',
  '/day': 'teal',
  '/moodboard': 'cyan',
  '/m': 'amber',
  '/m/film': 'amber',
  '/m/queue': 'neutral',
  '/m/gallery': 'neutral',
  '/m/moodboard': 'cyan',
  '/m/fitting': 'rose',
  '/m/day': 'teal',
  '/m/story': 'amber',
  '/plugins/nsfw-generator': 'fuchsia',
  '/image-prompt': 'fuchsia',
  '/refine': 'fuchsia',
  '/inpaint': 'amber',
  '/compose': 'cyan',
  '/negative': 'rose',
  '/studio': 'brand',
  '/gallery': 'neutral',
  '/variations': 'brand',
  '/logo': 'amber',
  '/settings': 'neutral',
};

export function accentForPath(pathname: string): ToolAccent {
  if (ROUTE_ACCENT[pathname]) {
    return ROUTE_ACCENT[pathname];
  }
  if (pathname.startsWith('/characters/')) {
    return 'sky';
  }
  const base = pathname.split('/').slice(0, 2).join('/') || '/';
  if (ROUTE_ACCENT[base]) {
    return ROUTE_ACCENT[base];
  }
  return 'brand';
}

export function normalizeToolAccent(value: string | undefined | null): ToolAccent {
  if (!value) {
    return 'brand';
  }
  if (value === 'violet') {
    return 'brand';
  }
  if (value in ROUTE_TINT_CLASSES) {
    return value as ToolAccent;
  }
  return 'brand';
}

/** Primary action button — always brand accent */
export function accentButtonClass(_accent?: ToolAccent): string {
  return 'ui-btn-primary';
}

/** Input focus — always brand accent ring */
export function accentFocusClass(_accent?: ToolAccent): string {
  return '';
}

/** Checkbox / range accent */
export function accentRingClass(_accent?: ToolAccent): string {
  return 'accent-[var(--accent)]';
}
