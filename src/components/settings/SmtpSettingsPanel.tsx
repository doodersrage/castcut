'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { PublicEmailConfig } from '@/lib/email/types';

export default function SmtpSettingsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [config, setConfig] = useState<PublicEmailConfig | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [from, setFrom] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void fetch('/api/settings/email')
      .then(response => (response.ok ? response.json() : null))
      .then((data: PublicEmailConfig | null) => {
        if (!data) {
          return;
        }
        setConfig(data);
        setHost(data.smtp.host);
        setPort(String(data.smtp.port));
        setSecure(data.smtp.secure);
        setUser(data.smtp.user ?? '');
        setFrom(data.from);
        setEnabled(data.enabled);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  if (!isAdmin) {
    return null;
  }

  return (
    <ToolSection
      title="SMTP"
      description="Operator mail for invites, password resets, and batch alerts. Env values are the fallback; this overlay persists in SQLite when PROMPT_DATA_DIR is set. Save, then Send test before inviting users."
    >
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => setEnabled(event.target.checked)}
          className="h-4 w-4 rounded"
        />
        Enable outbound mail
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          SMTP host
          <input
            value={host}
            onChange={event => setHost(event.target.value)}
            className="ui-input w-full text-sm"
            placeholder="smtp.example.com"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          Port
          <input
            value={port}
            onChange={event => setPort(event.target.value)}
            className="ui-input w-full text-sm"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          Username
          <input
            value={user}
            onChange={event => setUser(event.target.value)}
            className="ui-input w-full text-sm"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)]">
          Password {config?.smtp.hasPassword ? '(stored)' : ''}
          <input
            type="password"
            value={pass}
            onChange={event => setPass(event.target.value)}
            className="ui-input w-full text-sm"
            placeholder={config?.smtp.hasPassword ? 'Leave blank to keep' : ''}
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)] sm:col-span-2">
          From address
          <input
            value={from}
            onChange={event => setFrom(event.target.value)}
            className="ui-input w-full text-sm"
            placeholder="Castcut <noreply@localhost>"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-muted)] sm:col-span-2">
          Test recipient (optional)
          <input
            type="email"
            value={testTo}
            onChange={event => setTestTo(event.target.value)}
            className="ui-input w-full text-sm"
            placeholder="Defaults to your profile email; required if auth is off"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={secure}
          onChange={event => setSecure(event.target.checked)}
          className="h-4 w-4 rounded"
        />
        TLS from connect (port 465)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={saving}
          onClick={() => {
            setSaving(true);
            setStatus(null);
            void fetch('/api/settings/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                enabled,
                from,
                smtp: {
                  host,
                  port: Number(port) || 587,
                  secure,
                  user: user || undefined,
                  ...(pass ? { pass } : {}),
                },
              }),
            })
              .then(async response => {
                const data = (await response.json()) as PublicEmailConfig & { error?: string };
                if (!response.ok) {
                  throw new Error(data.error ?? 'Save failed.');
                }
                setConfig(data);
                setPass('');
                setStatus(
                  data.persisted
                    ? 'Saved to server storage.'
                    : 'Saved in memory only — set PROMPT_DATA_DIR to persist.'
                );
              })
              .catch(error => {
                setStatus(error instanceof Error ? error.message : 'Save failed.');
              })
              .finally(() => setSaving(false));
          }}
        >
          Save SMTP
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void fetch('/api/email/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(testTo.trim() ? { to: testTo.trim() } : {}),
            })
              .then(async response => {
                const data = (await response.json()) as {
                  error?: string;
                  ok?: boolean;
                  to?: string;
                };
                setStatus(
                  response.ok
                    ? `Test email sent${data.to ? ` to ${data.to}` : '.'}`
                    : (data.error ?? 'Test failed.')
                );
              })
              .catch(() => setStatus('Test failed.'));
          }}
        >
          Send test
        </Button>
      </div>
      {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
    </ToolSection>
  );
}
