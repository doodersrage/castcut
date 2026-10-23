'use client';

import { SETTINGS_SYNCED_WITH_SERVER_EVENT } from '@/lib/settings/push-flush';
import { loadSettingsCache } from '@/lib/settings/cache';
import { isPlayStoryLocked } from '@/lib/play/step-machine';

import { loadLocalObservability } from '@/lib/server/local-observability';
import { loadLookPack } from '@/lib/look/pack';
import { playEffectiveProgressLabel } from '@/lib/play/campaign';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import ActiveJobsChip from '@/components/ActiveJobsChip';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import ReportBugLink from '@/components/ReportBugLink';
import { dockGridColsClass } from '@/lib/play/dock-cols';
import PlayContinueChip from '@/components/PlayContinueChip';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { useBottomDockRef } from '@/hooks/useBottomDockRef';
import { featureForPath } from '@/lib/auth/features';
import { APP_NAV_PROFILE_LINK, APP_NAV_SETTINGS_LINK } from '@/lib/app/nav-catalog';
import { ROLEPLAY_FOCUS_ESCAPE_HREF, saveWorkspaceMode } from '@/lib/app/workspace-mode';
import { galleryNavHref } from '@/lib/gallery/session-state';
import { accentForPath } from '@/lib/app/tool-theme';
import { loadActivePlayCampaign, PLAY_CAMPAIGN_UPDATED_EVENT } from '@/lib/play/campaign';
import { loadPlayMetrics, PLAY_METRICS_UPDATED_EVENT } from '@/lib/play/metrics';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { choosePhoneView } from '@/lib/app/phone-view';
import ActionMenu, {
  ACTION_MENU_ITEM_CLASS,
  type ActionMenuHandle,
} from '@/components/ui/ActionMenu';

type KioskTab = {
  href: string;
  label: string;
  requiresFirstFilm?: boolean;
  /** Primary film-loop dock vs More overflow. */
  primary?: boolean;
  /** Desktop: in the header's tab row beside the film steps (on phones it stays in More). */
  desk?: boolean;
};

const PLAY_KIOSK_TABS: KioskTab[] = [
  { href: '/play', label: 'Film', primary: true },
  { href: '/day', label: 'Day', primary: true },
  { href: '/fitting', label: 'Outfit', primary: true },
  { href: '/story', label: 'Story', requiresFirstFilm: true, primary: true },
  // The film's own step: put the shots together (cut-room.ts).
  { href: '/cut', label: 'Cut', primary: true },
  // Optional and rarely needed now that Day plans the scenes: in More, not the dock.
  { href: '/characters', label: 'Cast', desk: true },
  // Optional: one shot exactly as wanted (Day's engine on one slot) — More, not a step.
  { href: '/scene', label: 'Scene' },
  { href: '/gallery', label: 'Gallery', desk: true },
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

export default function PlayKioskShell() {
  const dockRef = useBottomDockRef<HTMLElement>();
  const pathname = usePathname() ?? '/play';
  const galleryHref = galleryNavHref('/gallery');
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const [firstFilmDone, setFirstFilmDone] = useState(false);
  const [progressLabel, setProgressLabel] = useState('Film · start');
  const moreMenu = useRef<ActionMenuHandle>(null);

  useEffect(() => {
    const refresh = () => {
      const metrics = loadPlayMetrics();
      const campaign = loadActivePlayCampaign(loadSettingsCache().shared.activeCharacterId);
      // Story's tab: after the first cut, or once a whole Day of stills has rendered.
      setFirstFilmDone(!isPlayStoryLocked(metrics, loadLocalObservability()));
      setProgressLabel(
        playEffectiveProgressLabel({
          metrics,
          funnel: loadLocalObservability(),
          campaign,
          lookPack: loadLookPack(),
          activeCharacterId: loadSettingsCache().shared.activeCharacterId,
        })
      );
    };
    scheduleAfterCommit(refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    window.addEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    // The picked Cast can land after mount (server sync): re-read whose film it is.
    window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
    return () => {
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
      window.removeEventListener(PLAY_CAMPAIGN_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, refresh);
    };
  }, []);

  const visibleTabs = useMemo(
    () =>
      PLAY_KIOSK_TABS.filter(entry => {
        if (entry.requiresFirstFilm && !firstFilmDone) {
          return false;
        }
        return canAccessNavFeature(allowed, featureForPath(entry.href));
      }),
    [allowed, firstFilmDone]
  );
  const primaryTabs = useMemo(() => visibleTabs.filter(entry => entry.primary), [visibleTabs]);
  const moreTabs = useMemo(() => visibleTabs.filter(entry => !entry.primary), [visibleTabs]);
  const settingsVisible = canAccessNavFeature(allowed, 'settings');
  // More sits in the same row on phones — counted, or it wrapped onto a second row.
  const colClass = dockGridColsClass(primaryTabs.length, moreTabs.length > 0);
  const moreActive = moreTabs.some(entry => tabIsActive(entry.href, pathname));
  const deskTabs = useMemo(
    () => visibleTabs.filter(entry => entry.primary || entry.desk),
    [visibleTabs]
  );

  return (
    <div data-accent={accent}>
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_88%,transparent)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            {/* Logo only on phones — beside the Continue button the name truncated to "Ca…". */}
            <p className="type-brand type-heading hidden truncate tracking-tight sm:block">
              Castcut
            </p>
            {/* One truncated line from sm up. On a phone it only had room for "Fil…" beside the
                buttons — the bottom tabs already mark the step. Report a bug lives in More. */}
            <p
              className="type-caption hidden truncate whitespace-nowrap text-[var(--text-muted)] sm:block"
              data-testid="play-kiosk-progress"
            >
              {progressLabel}
            </p>
          </div>
        </div>
        {/* Desktop: the sections are a tab row in the header, not a phone dock along the bottom
            of a wide screen (UI review 2026-10-15). */}
        <nav aria-label="Film sections" className="hidden min-w-0 flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {deskTabs.map((entry, index) => {
              const active = tabIsActive(entry.href, pathname);
              const href = entry.href === '/gallery' ? galleryHref : entry.href;
              const firstAfterSteps = !entry.primary && deskTabs[index - 1]?.primary;
              return (
                <li
                  key={entry.href}
                  className={
                    firstAfterSteps ? 'ml-2 border-l border-[var(--border-subtle)] pl-3' : undefined
                  }
                >
                  <Link
                    href={href}
                    data-active={active ? 'true' : 'false'}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'block rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                      active
                        ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                    ].join(' ')}
                  >
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="relative flex shrink-0 items-center justify-end gap-2">
          {/* Desktop only: phones keep the corner card (a wrapper — the chip's own inline-flex
              beat a passed `hidden`). */}
          <span className="hidden md:contents">
            <ActiveJobsChip compact trayToggle />
          </span>
          <ConnectionHealthChip compact />
          <PlayContinueChip variant="secondary" />
          <ActionMenu
            label="More"
            caret={false}
            summaryClassName="ui-btn-secondary px-3 py-2 text-xs"
            handleRef={moreMenu}
            triggerTestId="play-kiosk-more"
            panelTestId="play-kiosk-more-menu"
          >
            {moreTabs.map(entry => {
              const href = entry.href === '/gallery' ? galleryHref : entry.href;
              return (
                <Link
                  key={entry.href}
                  href={href}
                  className={`${entry.desk ? 'lg:!hidden ' : ''}${ACTION_MENU_ITEM_CLASS}`}
                >
                  {entry.label}
                </Link>
              );
            })}
            {settingsVisible ? (
              <Link href={APP_NAV_SETTINGS_LINK.href} className={ACTION_MENU_ITEM_CLASS}>
                Settings
              </Link>
            ) : null}
            <Link href={APP_NAV_PROFILE_LINK.href} className={ACTION_MENU_ITEM_CLASS}>
              Profile
            </Link>
            {/* The way back after Desk on a phone (lib/app/phone-view.ts). */}
            <Link
              href="/m/film"
              className={`${ACTION_MENU_ITEM_CLASS} lg:!hidden`}
              data-testid="film-phone-view"
              onClick={() => choosePhoneView()}
            >
              Phone view
            </Link>
            <ReportBugLink className={ACTION_MENU_ITEM_CLASS} />
            <Link
              href={ROLEPLAY_FOCUS_ESCAPE_HREF}
              className={`${ACTION_MENU_ITEM_CLASS} border-t !border-t-[var(--border-subtle)]`}
              data-testid="film-all-tools"
              onClick={() => {
                // A real switch: Film sends "/" back to Play, so leaving it means Studio.
                saveWorkspaceMode('studio');
              }}
            >
              All tools
            </Link>
          </ActionMenu>
        </div>
      </header>
      <nav
        ref={dockRef}
        aria-label="Film"
        // Solid: page text showed through the translucent bar on phones (UI review 2026-10-15).
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className={`mx-auto grid max-w-4xl ${colClass} gap-0.5 px-2 py-2`}>
          {primaryTabs.map(entry => {
            const active = tabIsActive(entry.href, pathname);
            const href = entry.href === '/gallery' ? galleryHref : entry.href;
            return (
              <li key={entry.href}>
                <Link
                  href={href}
                  data-active={active ? 'true' : 'false'}
                  className={[
                    'flex flex-col items-center rounded-[var(--radius-md)] px-1 py-2 text-center transition',
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
          {moreTabs.length > 0 ? (
            <li className="sm:hidden">
              <button
                type="button"
                data-active={moreActive ? 'true' : 'false'}
                className={[
                  'flex w-full flex-col items-center rounded-[var(--radius-md)] px-1 py-2 text-center transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                  moreActive
                    ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                ].join(' ')}
                onClick={() => moreMenu.current?.open()}
              >
                <span className="text-sm font-medium">More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
