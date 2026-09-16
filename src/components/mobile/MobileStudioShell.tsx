'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import BrandMark from '@/components/BrandMark';
import ReportBugLink from '@/components/ReportBugLink';
import PlayContinueChip from '@/components/PlayContinueChip';
import PlayFunnelStrip from '@/components/PlayFunnelStrip';
import PlayHabitNudgeBanner from '@/components/PlayHabitNudgeBanner';
import { canAccessNavFeature, useAuth } from '@/hooks/useAuth';
import { featureForPath } from '@/lib/auth/features';
import {
  MOBILE_STUDIO_PRIMARY_TAB_IDS,
  MOBILE_STUDIO_TABS,
  mobileStudioTabFromPath,
  type MobileStudioTabId,
} from '@/lib/mobile-studio';
import { resolvePlayLoopNavHref } from '@/lib/play-campaign';
import {
  hasCompletedFirstFilm,
  loadPlayMetrics,
  PLAY_METRICS_UPDATED_EVENT,
} from '@/lib/play-metrics';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadSettingsCache } from '@/lib/settings-cache';
import { accentForPath } from '@/lib/tool-theme';

function deskBridgeHref(): string {
  const characterId =
    typeof window !== 'undefined' ? loadSettingsCache().shared.activeCharacterId?.trim() || '' : '';
  return resolvePlayLoopNavHref('/play', characterId);
}

export default function MobileStudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/m';
  const tab = mobileStudioTabFromPath(pathname);
  const accent = accentForPath(pathname);
  const auth = useAuth();
  const allowed = auth?.allowedFeatures ?? 'all';
  const [firstFilmDone, setFirstFilmDone] = useState(false);

  useEffect(() => {
    const refresh = () => setFirstFilmDone(hasCompletedFirstFilm(loadPlayMetrics()));
    scheduleAfterCommit(refresh);
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

  const deskHref = deskBridgeHref();
  const activeCharacterId =
    typeof window !== 'undefined' ? loadSettingsCache().shared.activeCharacterId?.trim() || '' : '';
  const hint =
    MOBILE_STUDIO_TABS.find(entry => entry.id === tab)?.hint ?? 'Look → Outfit → Day → Cut';
  const moreActive = moreTabs.some(entry => entry.id === tab);

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]"
      data-accent={accent}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="type-brand type-heading truncate tracking-tight">Castcut</p>
            <p className="type-caption text-[var(--text-muted)]">
              Film · {hint}
              <span className="mx-1 text-[var(--border-strong)]">·</span>
              <ReportBugLink className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]" />
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-testid="mobile-desk-bridge">
          <PlayContinueChip variant="secondary" hideWhenHabit />
          <Link
            href={deskHref}
            className="ui-btn-secondary shrink-0 px-3 py-2 text-xs"
            title="Optional desk handoff for large screens"
            data-testid="mobile-desk-play"
          >
            Desk
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 space-y-3">
          <PlayHabitNudgeBanner />
          <PlayFunnelStrip compact />
        </div>
        {children}
      </main>
      <nav
        aria-label="Film"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-muted)] pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-lg gap-0.5 overflow-x-auto px-2 py-2">
          {primaryTabs.map(entry => {
            const active = entry.id === tab;
            const href = resolvePlayLoopNavHref(entry.href, activeCharacterId);
            return (
              <li key={entry.id} className="min-w-[3.25rem] flex-1">
                <Link
                  href={href}
                  data-active={active ? 'true' : 'false'}
                  data-testid={`mobile-tab-${entry.id}`}
                  className={[
                    'flex flex-col items-center rounded-[var(--radius-md)] px-1.5 py-2 text-center transition',
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
          {moreTabs.length > 0 ? (
            <li className="min-w-[3.25rem] flex-1">
              <details className="relative">
                <summary
                  data-active={moreActive ? 'true' : 'false'}
                  data-testid="mobile-tab-more"
                  className={[
                    'flex list-none flex-col items-center rounded-[var(--radius-md)] px-1.5 py-2 text-center transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                    moreActive
                      ? 'bg-[var(--accent-muted)] text-[var(--accent-text)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  <span className="text-xs font-medium leading-tight">More</span>
                </summary>
                <div
                  className="absolute bottom-full right-0 mb-2 min-w-[8rem] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-1 shadow-lg"
                  data-testid="mobile-more-menu"
                >
                  {moreTabs.map(entry => {
                    const href = resolvePlayLoopNavHref(entry.href, activeCharacterId);
                    return (
                      <Link
                        key={entry.id}
                        href={href}
                        data-testid={`mobile-tab-${entry.id}`}
                        className="block px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      >
                        {entry.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
