'use client';

import Link from 'next/link';
import { resolveAppNavLinkHref } from '@/lib/gallery-session-state';
import { resolvePlayLoopNavHref } from '@/lib/play-campaign';
import { prefetchGalleryPage } from '@/lib/gallery-warmup';
import { loadSettingsCache } from '@/lib/settings-cache';
import type { AppNavLink } from '@/lib/app-nav-catalog';

export function AppNavSidebarLink({
  link,
  active,
  favorited,
  onToggleFavorite,
}: {
  link: AppNavLink;
  active: boolean;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const characterId =
    typeof window !== 'undefined' ? loadSettingsCache().shared.activeCharacterId?.trim() || '' : '';
  const navHref = resolvePlayLoopNavHref(resolveAppNavLinkHref(link.href), characterId);
  const galleryPath = link.href.split('?')[0] ?? link.href;
  const isGalleryLink = galleryPath === '/gallery' || galleryPath === '/m/gallery';

  return (
    <div className="group/nav flex items-center gap-0.5">
      <Link
        href={navHref}
        title={link.description}
        data-active={active ? 'true' : 'false'}
        className="ui-nav-link min-w-0 flex-1"
        onMouseEnter={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
        onFocus={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
        onClick={() => {
          if (isGalleryLink) {
            prefetchGalleryPage();
          }
        }}
      >
        {link.label}
      </Link>
      {onToggleFavorite ? (
        <button
          type="button"
          aria-label={favorited ? `Unpin ${link.label}` : `Pin ${link.label}`}
          title={favorited ? 'Unpin' : 'Pin'}
          className={`shrink-0 rounded-[var(--radius-md)] px-1.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
            favorited
              ? 'text-[var(--accent-text)] opacity-100'
              : 'text-[var(--text-muted)] opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100'
          }`}
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorited ? '★' : '☆'}
        </button>
      ) : null}
    </div>
  );
}
