'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useAuthLoading } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import ProfileSecurityPanel from '@/components/profile/ProfileSecurityPanel';
import ProfileAppearancePanel from '@/components/profile/ProfileAppearancePanel';
import ProfileNotificationsPanel from '@/components/profile/ProfileNotificationsPanel';
import ProfileBackupPanel from '@/components/profile/ProfileBackupPanel';
import type { SharedPresetEntry } from '@/lib/shared-preset-store';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import Link from 'next/link';
import { settingsTabHref } from '@/lib/settings-nav';

export default function ProfilePanel() {
  const auth = useAuth();
  const authLoading = useAuthLoading();
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [comfyUiUrl, setComfyUiUrl] = useState('');
  const [exportEnabled, setExportEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [emailNotifyBatch, setEmailNotifyBatch] = useState(true);
  const [emailNotifySecurity, setEmailNotifySecurity] = useState(true);
  const [sharedPresets, setSharedPresets] = useState<SharedPresetEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // All hooks run unconditionally; auth guard runs after them.
  const loadProfile = useCallback(async () => {
    if (!auth) return;
    const response = await fetch('/api/auth/profile', { cache: 'no-store' });
    const data = (await response.json()) as {
      user?: {
        comfyUiUrl?: string;
        exportEnabled?: boolean;
        email?: string;
        emailNotifyBatch?: boolean;
        emailNotifySecurity?: boolean;
      };
      error?: string;
    };
    if (response.ok && data.user) {
      setComfyUiUrl(data.user.comfyUiUrl ?? '');
      setExportEnabled(Boolean(data.user.exportEnabled));
      setEmail(data.user.email ?? '');
      setEmailNotifyBatch(data.user.emailNotifyBatch !== false);
      setEmailNotifySecurity(data.user.emailNotifySecurity !== false);
    }
  }, [auth]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void loadProfile();
      void fetch('/api/shared-presets')
        .then(response => response.json())
        .then((data: { presets?: SharedPresetEntry[] }) => setSharedPresets(data.presets ?? []))
        .catch(() => setSharedPresets([]));
    });
  }, [loadProfile]);

  if (!auth) return null;

  const { user, refresh, authEnabled } = auth;

  async function saveProfile() {
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          password: password || undefined,
          comfyUiUrl,
          exportEnabled,
          email,
          emailNotifyBatch,
          emailNotifySecurity,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Save failed.');
      }
      setPassword('');
      setCurrentPassword('');
      setStatus('Profile saved.');
      await refresh();
      await loadProfile();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setLoading(false);
    }
  }

  // Until the session answers, say nothing about sign-in: "Sign-in is disabled" flashed on
  // every load (and was in the server HTML) for signed-in users.
  if (authLoading) {
    return (
      <div className="space-y-8">
        <ProfileAppearancePanel />
      </div>
    );
  }
  if (!authEnabled) {
    return (
      <div className="space-y-8">
        <ToolSection title="Profile">
          <p className="text-sm text-[var(--text-muted)]">
            Sign-in is disabled. Account settings are unavailable; appearance still works below.
          </p>
        </ToolSection>
        <ProfileAppearancePanel />
      </div>
    );
  }

  if (!user) {
    return (
      <ToolSection title="Account settings">
        <p className="text-sm text-[var(--text-muted)]">Loading your profile…</p>
      </ToolSection>
    );
  }

  return (
    <div className="space-y-8">
      {status ? (
        <p className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-sm text-[var(--accent-text)]">
          {status}
        </p>
      ) : null}

      <ProfileAppearancePanel />
      <ProfileNotificationsPanel />

      <ToolSection title="Account">
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Signed in as <span className="text-[var(--text-primary)]">{user.username}</span> (
          {user.role})
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="type-caption text-[var(--text-muted)]">Current password</span>
            <TextInput
              type="password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="type-caption text-[var(--text-muted)]">New password</span>
            <TextInput
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
      </ToolSection>

      <ToolSection title="Email notifications">
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Optional address for batch completion and password-change alerts when SMTP is configured
          on the server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm sm:col-span-2">
            <span className="type-caption text-[var(--text-muted)]">Email</span>
            <TextInput
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={emailNotifyBatch}
              onChange={event => setEmailNotifyBatch(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            Batch & campaign completion
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={emailNotifySecurity}
              onChange={event => setEmailNotifySecurity(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            Password & security updates
          </label>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            setStatus(null);
            try {
              const response = await fetch('/api/email/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: email.trim() || undefined }),
              });
              const data = (await response.json()) as { error?: string; to?: string };
              if (!response.ok) {
                throw new Error(data.error ?? 'Test email failed.');
              }
              setStatus(`Test email sent to ${data.to ?? email}.`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : 'Test email failed.');
            }
          }}
        >
          Send test email
        </Button>
      </ToolSection>

      <ToolSection title="ComfyUI override">
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Optional personal ComfyUI URL. Overrides Settings when queueing from your account.
        </p>
        <TextInput
          value={comfyUiUrl}
          onChange={event => setComfyUiUrl(event.target.value)}
          placeholder="http://127.0.0.1:8188"
        />
      </ToolSection>

      <ToolSection title="Automation">
        <p className="text-sm text-[var(--text-muted)]">
          Scheduled campaigns, webhooks, and browser batch runs live in{' '}
          <Link
            href={settingsTabHref('automation')}
            className="text-[var(--accent-text)] underline underline-offset-2 transition hover:text-[var(--text-primary)]"
          >
            Settings → Automation
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection title="Server export">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={exportEnabled}
            onChange={event => setExportEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
          />
          Include my synced history/gallery in nightly server exports
        </label>
      </ToolSection>

      {sharedPresets.length > 0 ? (
        <ToolSection title="Shared preset library">
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Read-only presets published by admins.
          </p>
          <ul className="space-y-2">
            {sharedPresets.map(preset => (
              <li
                key={preset.id}
                className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-sm"
              >
                <p className="font-medium text-[var(--text-primary)]">{preset.label}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{preset.hints}</p>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(preset.hints);
                    setStatus(`Copied hints for “${preset.label}”.`);
                  }}
                  className="mt-2 text-xs text-[var(--accent-text)] hover:text-[var(--accent-text)]"
                >
                  Copy hints
                </button>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      <ProfileBackupPanel />
      <ProfileSecurityPanel />

      <Button type="button" disabled={loading} onClick={() => void saveProfile()}>
        {loading ? 'Saving…' : 'Save profile'}
      </Button>
    </div>
  );
}
