'use client';

import Link from 'next/link';
import { APP_NAV_SETTINGS_LINK } from '@/lib/app-nav-catalog';
import NotificationBell from '@/components/NotificationBell';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import ActiveJobsChip from '@/components/ActiveJobsChip';
import ReportBugLink from '@/components/ReportBugLink';
import type { AppNavSidebarViewModel } from '@/components/app-nav/useAppNavSidebar';

type Props = Pick<
  AppNavSidebarViewModel,
  | 'pathname'
  | 'authEnabled'
  | 'user'
  | 'logout'
  | 'navReady'
  | 'settingsVisible'
  | 'profileVisible'
  | 'guestShell'
> & {
  onNavigate?: () => void;
};

const footerLink =
  'rounded-[var(--radius-sm)] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]';

/**
 * Two compact rows: status (health, jobs, alerts, Settings) and account. Workspace mode and
 * theme live in Profile → Appearance — here they took over half the sidebar and squeezed the
 * menu into a small scroll box.
 */
export function AppNavSidebarFooter({
  pathname,
  authEnabled,
  user,
  logout,
  navReady,
  settingsVisible,
  profileVisible,
  guestShell,
  onNavigate,
}: Props) {
  const settingsActive = pathname === APP_NAV_SETTINGS_LINK.href;
  return (
    <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 pt-3">
      {navReady ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2" onClick={onNavigate}>
            <ConnectionHealthChip compact />
            <ActiveJobsChip compact />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            {settingsVisible ? (
              <Link
                href={APP_NAV_SETTINGS_LINK.href}
                onClick={onNavigate}
                aria-current={settingsActive ? 'page' : undefined}
                data-active={settingsActive ? 'true' : 'false'}
                data-testid="nav-settings"
                className="ui-nav-link px-2 py-1 text-sm"
              >
                Settings
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        key="auth-profile"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        data-testid="nav-account"
      >
        <span className="min-w-0 truncate font-medium text-[var(--text-secondary)]">
          {authEnabled && user ? user.username : 'Guest'}
        </span>
        {profileVisible ? (
          <Link href="/profile" onClick={onNavigate} className={footerLink}>
            Profile
          </Link>
        ) : null}
        {authEnabled && user ? (
          <button type="button" onClick={() => void logout()} className={footerLink}>
            Sign out
          </button>
        ) : guestShell ? (
          <Link href="/login" onClick={onNavigate} className={footerLink}>
            Sign in
          </Link>
        ) : null}
        <ReportBugLink className={`ml-auto ${footerLink}`} />
      </div>
    </div>
  );
}
