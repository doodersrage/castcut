'use client';

import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { AppNavSidebarLink } from '@/components/app-nav/AppNavSidebarLink';
import { linkIsActive } from '@/components/app-nav/linkIsActive';
import { isNavFavorite } from '@/lib/nav-favorites';
import type { AppNavSidebarViewModel } from '@/components/app-nav/useAppNavSidebar';
import { APP_HAS_PLAY } from '@/lib/app-profile';

type Props = Pick<
  AppNavSidebarViewModel,
  | 'pathname'
  | 'search'
  | 'navReady'
  | 'guestShell'
  | 'pinnedLinks'
  | 'visibleGroups'
  | 'workspaceMode'
  | 'openGroups'
  | 'favorites'
  | 'handleToggleFavorite'
  | 'handleToggleGroup'
> & {
  onNavigate?: () => void;
};

export function AppNavSidebarGroups({
  pathname,
  search,
  navReady,
  guestShell,
  pinnedLinks,
  visibleGroups,
  workspaceMode,
  openGroups,
  favorites,
  handleToggleFavorite,
  handleToggleGroup,
  onNavigate,
}: Props) {
  return (
    <>
      <div className="px-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="ui-nav-brand inline-flex items-center gap-2.5 rounded-[var(--radius-md)] px-1 py-1 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        >
          <BrandMark
            size={32}
            withWordmark
            wordmarkClassName="type-brand type-title tracking-tight"
          />
        </Link>
        <p className="type-caption mt-1.5 px-3 text-[var(--text-tertiary)]">
          {APP_HAS_PLAY ? 'Cast · Day · film' : 'Prompt · queue · gallery'}
          <span className="mx-1.5 text-[var(--border-strong)]">·</span>
          <kbd className="ui-kbd">⌘K</kbd>
        </p>
      </div>

      <div className="sidebar-scroll ui-scroll-region flex-1 space-y-4 overflow-y-auto px-2 pb-2">
        {navReady ? (
          <>
            <div key="pinned" className="space-y-2">
              {pinnedLinks.length > 0 ? (
                <>
                  <p className="type-overline px-3">Pinned</p>
                  <div className="space-y-1">
                    {pinnedLinks.map(link => (
                      <div key={`pinned-${link.href}`} onClick={onNavigate}>
                        <AppNavSidebarLink
                          link={link}
                          active={linkIsActive(link, pathname, search)}
                          favorited
                          onToggleFavorite={() => handleToggleFavorite(link.href)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {visibleGroups.map(group => {
              const expanded = openGroups.includes(group.label);
              const isMoreTools = workspaceMode === 'simple' && group.label === 'More tools';
              const groupLabel =
                isMoreTools && !expanded ? `${group.label} (${group.links.length})` : group.label;
              return (
                <div key={group.label} className="space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-1 text-left transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-expanded={expanded}
                    onClick={() => handleToggleGroup(group.label)}
                  >
                    <span className="type-overline">{groupLabel}</span>
                    <span className="type-caption text-[var(--text-muted)]" aria-hidden>
                      {expanded ? '▾' : '▸'}
                    </span>
                  </button>
                  {isMoreTools && !expanded ? (
                    <p className="type-caption px-3 text-[var(--text-muted)]">
                      Press{' '}
                      <kbd className="rounded border border-[var(--border-default)] px-1">⌘K</kbd>{' '}
                      to jump to any tool
                    </p>
                  ) : null}
                  {expanded ? (
                    <div className="space-y-1">
                      {group.links.map(link => (
                        <div key={link.href} onClick={onNavigate}>
                          <AppNavSidebarLink
                            link={link}
                            active={linkIsActive(link, pathname, search)}
                            favorited={isNavFavorite(link.href, favorites)}
                            onToggleFavorite={() => handleToggleFavorite(link.href)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        ) : guestShell ? (
          <p className="type-caption px-3 text-[var(--text-muted)]">
            Sign in to open tools, pin destinations, and save workspace preferences.
          </p>
        ) : null}
      </div>
    </>
  );
}
