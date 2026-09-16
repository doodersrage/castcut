'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import ReportBugLink from '@/components/ReportBugLink';
import PlayContinueChip from '@/components/PlayContinueChip';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath } from '@/lib/auth/features';
import { APP_NAV_PROFILE_LINK, APP_NAV_SETTINGS_LINK } from '@/lib/app-nav-catalog';
import { ROLEPLAY_FOCUS_ESCAPE_HREF } from '@/lib/workspace-mode';
import { galleryNavHref } from '@/lib/gallery-session-state';
import { accentForPath } from '@/lib/tool-theme';
import {
  loadPlayCampaignState,
  playCampaignProgressLabel,
  PLAY_CAMPAIGN_UPDATED_EVENT,
} from '@/lib/play-campaign';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type KioskTab = {
  href: string;
  label: string;
  requiresFirstFilm?: boolean;
};

const PLAY_KIOSK_TABS: KioskTab[] = [
  { href: '/characters', label: 'Cast' },
  { href: '/play', label: 'Film' },
  { href: '/moodboard', label: 'Look' },
  { href: '/fitting', label: 'Outfit' },
  { href: '/day', label: 'Day' },
  { href: '/story', label: 'Story', requiresFirstFilm: true },
  { href: '/gallery', label: 'Gallery' },
  { href: '/queue', label: 'Queue' },
];

function tabIsActive(href: string, pathname: string): boolean {
  if (href === '/characters') {
    return pathname === '/characters' || pathname.startsWith('/characters/');
  }
  if (href === '/story') {
    return (
      pathname === '/story' ||
      pathname.startsWith('/story/') ||
      pathname === '/roleplay' ||
      pathname.startsWith('/roleplay/')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function gridColsClass(count: number): string {
  if (count <= 4) {
    return 'grid-cols-4';
  }
  if (count === 5) {
    return 'grid-cols-5';
  }
  if (count === 6) {
    return 'grid-cols-6';
  }
  if (count === 7) {
    return 'grid-cols-7';
  }
  return 'grid-cols-4 sm:grid-cols-8';
}

export default function PlayKioskShell() {
  const pathname = usePathname() ?? '/play';
  const galleryHref = galleryNavHref('/gallery');
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const [firstFilmDone, setFirstFilmDone] = useState(false);
  const [progressLabel, setProgressLabel] = useState('Film · start');

  useEffect(() => {
    const refresh = () => {
      const metrics = loadPlayMetrics();
      const campaign = loadPlayCampaignState();
      setFirstFilmDone(hasCompletedFirstFilm(metrics));
      setProgressLabel(playCampaignProgressLabel(campaign));
    };
    scheduleAfterCommit(refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    window.addEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
      window.removeEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const tabs = useMemo(
    () =>
      PLAY_KIOSK_TABS.filter(entry => {
        if (entry.requiresFirstFilm && !firstFilmDone) {
          return false;
        }
        return canAccessNavFeature(allowed, featureForPath(entry.href));
      }),
    [allowed, firstFilmDone]
  );
  const settingsVisible = canAccessNavFeature(allowed, 'settings');
  const colClass = gridColsClass(tabs.length);

  return (
    <div data-accent={accent}>
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_88%,transparent)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="type-brand type-heading truncate tracking-tight">Castcut</p>
            <p className="type-caption text-[var(--text-muted)]" data-testid="play-kiosk-progress">
              {progressLabel}
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <ReportBugLink className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ConnectionHealthChip compact />
          <PlayContinueChip />
          {settingsVisible ? (
            <Link href={APP_NAV_SETTINGS_LINK.href} className="ui-btn-secondary px-3 py-2 text-xs">
              Settings
            </Link>
          ) : null}
          <Link href={APP_NAV_PROFILE_LINK.href} className="ui-btn-secondary px-3 py-2 text-xs">
            Profile
          </Link>
          <Link href={ROLEPLAY_FOCUS_ESCAPE_HREF} className="ui-btn-secondary px-3 py-2 text-xs">
            All tools
          </Link>
        </div>
      </header>
      <nav
        aria-label="Film"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className={`mx-auto grid max-w-4xl ${colClass} gap-0.5 px-2 py-2`}>
          {tabs.map(entry => {
            const active = tabIsActive(entry.href, pathname);
            const href = entry.href === '/gallery' ? galleryHref : entry.href;
            return (
              <li key={entry.href}>
                <Link
                  href={href}
                  data-active={active ? 'true' : 'false'}
                  className={[
                    'flex flex-col items-center rounded-[var(--radius-md)] px-2 py-2 text-center transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                    active
                      ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium">{entry.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
