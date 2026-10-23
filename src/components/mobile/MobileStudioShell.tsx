'use client';

import RenderOfflineBanner from '@/components/RenderOfflineBanner';
import { isPlayStoryLocked } from '@/lib/play/step-machine';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import ReportBugLink from '@/components/ReportBugLink';
import PlayContinueChip from '@/components/PlayContinueChip';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { useBottomDockRef } from '@/hooks/useBottomDockRef';
import { featureForPath } from '@/lib/auth/features';
import { whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import {
  MOBILE_STUDIO_PRIMARY_TAB_IDS,
  MOBILE_STUDIO_TABS,
  mobileStudioTabFromPath,
  type MobileStudioTabId,
} from '@/lib/app/mobile-studio';
import { resolvePlayLoopNavHref } from '@/lib/play/campaign';
import { followCurrentPlayLoopHref } from '@/lib/play/loop-nav-click';
import { loadPlayMetrics, PLAY_METRICS_UPDATED_EVENT } from '@/lib/play/metrics';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { loadSettingsCache } from '@/lib/settings/cache';
import { chooseDeskView } from '@/lib/app/phone-view';
import { accentForPath } from '@/lib/app/tool-theme';

function readActiveCast(): string {
  return loadSettingsCache().shared.activeCharacterId?.trim() || '';
}

function subscribeCastChanges(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('focus', onChange);
  };
}

export default function MobileStudioShell({ children }: { children: ReactNode }) {
  const dockRef = useBottomDockRef<HTMLElement>();
  const pathname = usePathname() ?? '/m';
  const router = useRouter();
  const tab = mobileStudioTabFromPath(pathname);
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const [firstFilmDone, setFirstFilmDone] = useState(false);

  useEffect(() => {
    // Story's tab: after the first cut, or once a whole Day of stills has rendered.
    const refresh = () => setFirstFilmDone(!isPlayStoryLocked(loadPlayMetrics()));
    scheduleAfterCommit(refresh);
    // Read again once IndexedDB has hydrated: a cold load could read before the metrics were.
    void whenBrowserStorageReady().then(refresh);
    window.addEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PLAY_METRICS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const tabs = useMemo(() => {
    const gated = new Set<MobileStudioTabId>(firstFilmDone ? [] : ['story']);
    return MOBILE_STUDIO_TABS.filter(entry => {
      if (gated.has(entry.id)) {
        return false;
      }
      return canAccessNavFeature(allowed, featureForPath(entry.href));
    });
  }, [allowed, firstFilmDone]);
  const primaryTabs = useMemo(
    () => tabs.filter(entry => MOBILE_STUDIO_PRIMARY_TAB_IDS.includes(entry.id)),
    [tabs]
  );
  const moreTabs = useMemo(
    () => tabs.filter(entry => !MOBILE_STUDIO_PRIMARY_TAB_IDS.includes(entry.id)),
    [tabs]
  );

  // The server renders without the browser's settings: read the active Cast through the store's
  // server snapshot (''), or the Desk and tab links hydrated with other hrefs than the server's
  // (a hydration mismatch on every /m page). Re-read on each render (a Cast change navigates).
  const activeCharacterId = useSyncExternalStore(subscribeCastChanges, readActiveCast, () => '');
  const deskHref = resolvePlayLoopNavHref('/play', activeCharacterId);
  const hint = MOBILE_STUDIO_TABS.find(entry => entry.id === tab)?.hint ?? 'Cast → Day → Cut';
  const moreActive = moreTabs.some(entry => entry.id === tab);

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]"
      data-accent={accent}
    >
      <header
        data-testid="mobile-studio-header"
        className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] ui-phone-bar px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="type-brand type-heading truncate tracking-tight">Castcut</p>
            {/* One truncated line — hint + Report a bug wrapped to four lines on a phone.
                Report a bug lives in the More menu. */}
            <p className="type-caption truncate text-[var(--text-muted)]">Film · {hint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-testid="mobile-desk-bridge">
          {tab !== 'film' ? <PlayContinueChip variant="secondary" hideWhenHabit /> : null}
          <Link
            href={deskHref}
            className="ui-btn-secondary shrink-0 px-3 py-2 text-xs"
            title="Optional desk handoff for large screens"
            data-testid="mobile-desk-play"
            // Remembered, or a phone would be sent straight back to /m.
            onClick={() => chooseDeskView()}
          >
            Desk
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 space-y-3">
          <RenderOfflineBanner />
          <PlayHabitNudgeBanner />
          {/* Film, Day and Story show their own step pills; a second row above them repeated the
              dock (UI review 2026-10-15). */}
          {tab !== 'film' && tab !== 'day' && tab !== 'story' ? <PlayFunnelStrip compact /> : null}
        </div>
        {children}
      </main>
      <nav
        ref={dockRef}
        aria-label="Film"
        data-testid="mobile-studio-dock"
        // While the More menu is open the bar goes above the floating job pill (z-90), which
        // otherwise covers the menu's items.
        className="fixed inset-x-0 bottom-0 z-40 has-[details[open]]:z-[95] border-t border-[var(--border-subtle)] ui-phone-bar pb-[env(safe-area-inset-bottom)]"
      >
        {/* The More menu sits beside the scrolling tab list, not inside it: overflow-x on the
            list also clips vertically, and the menu (which opens upward) was never drawn. */}
        <div className="mx-auto flex max-w-lg gap-0.5 px-1.5 py-1.5">
          <ul className="flex min-w-0 flex-[6_1_0%] gap-0.5 overflow-x-auto">
            {primaryTabs.map(entry => {
              const active = entry.id === tab;
              const href = resolvePlayLoopNavHref(entry.href, activeCharacterId);
              return (
                <li key={entry.id} className="min-w-11 flex-1">
                  <Link
                    href={href}
                    onClick={event =>
                      followCurrentPlayLoopHref(event, href, entry.href, next => router.push(next))
                    }
                    data-active={active ? 'true' : 'false'}
                    data-testid={`mobile-tab-${entry.id}`}
                    className={[
                      // 44 px tall; six tabs and More across a 360 px phone.
                      'flex min-h-11 flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1 text-center transition',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                      active
                        ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                    ].join(' ')}
                  >
                    <span className="text-xs font-medium leading-tight">{entry.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* Always shown — it also holds Report a bug. */}
          <div className="min-w-11 flex-[1_1_0%]">
            <details className="relative">
              <summary
                data-active={moreActive ? 'true' : 'false'}
                data-testid="mobile-tab-more"
                className={[
                  'flex min-h-11 list-none flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1 text-center transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                  moreActive
                    ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                <span className="text-xs font-medium leading-tight">More</span>
              </summary>
              <div
                className="ui-menu-panel absolute bottom-full right-0 mb-2 min-w-[8rem] rounded-[var(--radius-md)] border border-[var(--border-subtle)] py-1 shadow-lg"
                data-testid="mobile-more-menu"
              >
                {moreTabs.map(entry => {
                  const href = resolvePlayLoopNavHref(entry.href, activeCharacterId);
                  return (
                    <Link
                      key={entry.id}
                      href={href}
                      onClick={event =>
                        followCurrentPlayLoopHref(event, href, entry.href, next =>
                          router.push(next)
                        )
                      }
                      data-testid={`mobile-tab-${entry.id}`}
                      className="flex min-h-11 items-center px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      {entry.label}
                    </Link>
                  );
                })}
                <div className="my-1 border-t border-[var(--border-subtle)]" />
                <ReportBugLink className="flex min-h-11 items-center px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" />
              </div>
            </details>
          </div>
        </div>
      </nav>
    </div>
  );
}
