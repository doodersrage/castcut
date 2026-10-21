'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { ButtonLink } from '@/components/ui/Button';
import UsersAdminPanel from '@/components/settings/UsersAdminPanel';
import SmtpSettingsPanel from '@/components/settings/SmtpSettingsPanel';
import { DataListSkeleton } from '@/components/ui/ViewState';

export default function UsersSettingsPanel() {
  const auth = useAuth();
  // During hydration / HMR boundaries the provider may not be wired up.
  if (!auth) {
    return (
      <ToolSection title="Users">
        <DataListSkeleton rows={3} label="Loading account settings" />
      </ToolSection>
    );
  }

  const { loading, authEnabled, user, isAdmin } = auth;

  if (loading) {
    return (
      <ToolSection title="Users">
        <DataListSkeleton rows={3} label="Loading account settings" />
      </ToolSection>
    );
  }

  if (!authEnabled) {
    return (
      <>
        <ToolSection title="Enable user accounts">
          <p className="text-sm text-[var(--text-muted)]">
            User accounts are off. Add these to{' '}
            <code className="text-[var(--text-secondary)]">.env.local</code> and restart the dev
            server to unlock login, per-user history, and this admin panel.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/60 p-4 text-xs text-[var(--text-secondary)]">
            {`PROMPT_AUTH_ENABLED=true
PROMPT_ADMIN_USERNAME=admin
PROMPT_ADMIN_PASSWORD="change-me"
PROMPT_SESSION_SECRET=use-a-long-random-string
PROMPT_DATA_DIR=/path/to/persist/auth-and-analytics`}
          </pre>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Quote passwords that contain <code className="text-[var(--text-muted)]">$</code> or{' '}
            <code className="text-[var(--text-muted)]">#</code>. After changing admin credentials in{' '}
            <code className="text-[var(--text-muted)]">.env.local</code>, restart the server — the
            bootstrap admin account syncs from env on startup.
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            After restart, sign in at{' '}
            <Link
              href="/login"
              className="text-[var(--accent-text)] hover:text-[var(--accent-text)]"
            >
              /login
            </Link>{' '}
            with the admin credentials above, then return here.
          </p>
        </ToolSection>
        <SmtpSettingsPanel isAdmin />
      </>
    );
  }

  if (!user) {
    return (
      <ToolSection title="Sign in required">
        <p className="text-sm text-[var(--text-muted)]">
          User accounts are enabled. Sign in as an admin to manage users, groups, and analytics
          snapshots.
        </p>
        <ButtonLink href="/login" variant="primary" className="mt-4 inline-flex">
          Sign in
        </ButtonLink>
      </ToolSection>
    );
  }

  if (!isAdmin) {
    return (
      <ToolSection title="Admin only">
        <p className="text-sm text-[var(--text-muted)]">
          Signed in as <span className="text-[var(--text-primary)]">{user.username}</span>. Only
          admin accounts can manage users and groups. Ask an admin to promote your account or adjust
          blocked features.
        </p>
      </ToolSection>
    );
  }

  return (
    <>
      <SmtpSettingsPanel isAdmin />
      <UsersAdminPanel />
    </>
  );
}
