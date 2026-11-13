'use client';

import { commandPaletteShortcutLabel, openCommandPalette } from '@/lib/app/command-palette-events';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { AppNavSidebarLink } from '@/components/app-nav/AppNavSidebarLink';
import { linkIsActive } from '@/components/app-nav/linkIsActive';
import { isNavFavorite } from '@/lib/app/nav-favorites';
import type { AppNavSidebarViewModel } from '@/components/app-nav/useAppNavSidebar';
import { APP_HAS_PLAY } from '@/lib/app/profile';

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
  const shortcut = commandPaletteShortcutLabel(
    typeof navigator === 'undefined' ? undefined : navigator.platform
  );
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
        {/*
          Search, as editing tools have it (UI audit 2026-11-12): the line under the logo said
          "Cast · Short · film ⌘K" — the nav again, and a shortcut you couldn't click.
        */}
        <Button
          variant="plain"
          type="button"
          onClick={openCommandPalette}
          className="mt-2 flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-1.5 text-left text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          data-testid="nav-search"
          aria-label={APP_HAS_PLAY ? 'Search or jump to a page' : 'Search tools and pages'}
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden
            className="shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" strokeLinecap="round" />
          </svg>
          <span className="type-caption flex-1">Search or jump to…</span>
          <kbd className="ui-kbd" suppressHydrationWarning>
            {shortcut}
          </kbd>
        </Button>
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
                      <AppNavSidebarLink
                        key={`pinned-${link.href}`}
                        link={link}
                        active={linkIsActive(link, pathname, search)}
                        favorited
                        onToggleFavorite={() => handleToggleFavorite(link.href)}
                        onNavigate={onNavigate}
                      />
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
                  <Button
                    variant="row"
                    type="button"
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    aria-expanded={expanded}
                    onClick={() => handleToggleGroup(group.label)}
                  >
                    <span className="type-overline">{groupLabel}</span>
                    <span className="type-caption text-[var(--text-muted)]" aria-hidden>
                      {expanded ? '▾' : '▸'}
                    </span>
                  </Button>
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
                        <AppNavSidebarLink
                          key={link.href}
                          link={link}
                          active={linkIsActive(link, pathname, search)}
                          favorited={isNavFavorite(link.href, favorites)}
                          onToggleFavorite={() => handleToggleFavorite(link.href)}
                          onNavigate={onNavigate}
                        />
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
