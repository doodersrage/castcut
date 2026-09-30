'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { ToolSection } from '@/components/ui/ToolPageShell';
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  loadKeyboardShortcuts,
  saveKeyboardShortcuts,
} from '@/lib/keyboard-shortcuts-store';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { userAgentLabel } from '@/lib/user-agent-label';

type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
};

type SessionRow = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent?: string;
  ip?: string;
};

/** Most recent first — the rest behind "Show all". */
const VISIBLE_SESSIONS = 5;

export default function ProfileSecurityPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [shortcutsJson, setShortcutsJson] = useState('');
  const [shortcutBindings, setShortcutBindings] = useState(DEFAULT_KEYBOARD_SHORTCUTS);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [keysRes, sessionsRes, totpRes] = await Promise.all([
      fetch('/api/auth/api-keys'),
      fetch('/api/auth/sessions'),
      fetch('/api/auth/totp'),
    ]);
    const keysData = (await keysRes.json()) as { keys?: ApiKeyRow[] };
    const sessionsData = (await sessionsRes.json()) as {
      sessions?: SessionRow[];
      currentSessionId?: string;
    };
    const totpData = (await totpRes.json()) as { enabled?: boolean };
    setApiKeys(keysData.keys ?? []);
    setSessions(sessionsData.sessions ?? []);
    setCurrentSessionId(sessionsData.currentSessionId ?? null);
    setTotpEnabled(Boolean(totpData.enabled));
    setShortcutsJson(JSON.stringify(loadKeyboardShortcuts(), null, 2));
    setShortcutBindings(loadKeyboardShortcuts());
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refresh();
    });
  }, [refresh]);

  return (
    <div className="space-y-8">
      {status ? <p className="text-sm text-[var(--tint-success-text)]">{status}</p> : null}

      <ToolSection title="API keys">
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          Personal tokens for CLI and inbound hooks. Use{' '}
          <code className="text-[var(--text-secondary)]">Authorization: Bearer pt_…</code>
        </p>
        <div className="flex flex-wrap gap-2">
          <TextInput
            value={newKeyLabel}
            onChange={event => setNewKeyLabel(event.target.value)}
            placeholder="Key label"
          />
          <Button
            variant="secondary"
            onClick={() =>
              void fetch('/api/auth/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newKeyLabel || 'API key' }),
              })
                .then(response => response.json())
                .then((data: { token?: string }) => {
                  setCreatedToken(data.token ?? null);
                  void refresh();
                })
            }
          >
            Create key
          </Button>
        </div>
        {createdToken ? (
          <p className="mt-2 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] p-3 text-xs text-[var(--tint-warning-text)]">
            Copy now — shown once: <code>{createdToken}</code>
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {apiKeys.map(key => (
            <li
              key={key.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm"
            >
              <span>
                {key.label} · {key.prefix}…
              </span>
              <button
                type="button"
                className="text-xs text-[var(--tint-danger-text)]"
                onClick={() =>
                  void fetch('/api/auth/api-keys', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keyId: key.id }),
                  }).then(() => refresh())
                }
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Active sessions">
        {sessions.length > 1 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <span>
              {sessions.length} signed-in {sessions.length === 1 ? 'device' : 'devices'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void fetch('/api/auth/sessions', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ all: true }),
                }).then(() => refresh())
              }
            >
              Sign out all others
            </Button>
          </div>
        ) : null}
        <ul className="space-y-2">
          {(showAllSessions ? sessions : sessions.slice(0, VISIBLE_SESSIONS)).map(session => (
            <li
              key={session.id}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            >
              <p title={session.userAgent}>{userAgentLabel(session.userAgent)}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {session.ip ?? 'unknown IP'} · last seen{' '}
                {new Date(session.lastSeenAt).toLocaleString()}
                {session.id === currentSessionId ? ' · current' : ''}
              </p>
              {session.id !== currentSessionId ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-[var(--tint-danger-text)]"
                  onClick={() =>
                    void fetch('/api/auth/sessions', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sessionId: session.id }),
                    }).then(() => refresh())
                  }
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {sessions.length > VISIBLE_SESSIONS ? (
          <button
            type="button"
            className="mt-2 text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
            onClick={() => setShowAllSessions(open => !open)}
          >
            {showAllSessions ? 'Show recent only' : `Show all ${sessions.length}`}
          </button>
        ) : null}
      </ToolSection>

      <ToolSection title="Two-factor authentication">
        <p className="mb-3 text-sm text-[var(--text-muted)]">
          TOTP status: {totpEnabled ? 'enabled' : 'disabled'}
        </p>
        {!totpEnabled ? (
          <div className="space-y-2">
            <Button
              variant="secondary"
              onClick={() =>
                void fetch('/api/auth/totp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'begin-setup' }),
                })
                  .then(response => response.json())
                  .then((data: { secret?: string; uri?: string }) =>
                    setTotpSetup(
                      data.secret && data.uri ? { secret: data.secret, uri: data.uri } : null
                    )
                  )
              }
            >
              Begin setup
            </Button>
            {totpSetup ? (
              <div className="space-y-2 text-sm text-[var(--text-muted)]">
                <p>
                  Secret: <code>{totpSetup.secret}</code>
                </p>
                <TextInput
                  value={totpCode}
                  onChange={event => setTotpCode(event.target.value)}
                  placeholder="6-digit code"
                />
                <Button
                  onClick={() =>
                    void fetch('/api/auth/totp', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'confirm', code: totpCode }),
                    }).then(() => {
                      setTotpSetup(null);
                      setTotpCode('');
                      void refresh();
                      setStatus('TOTP enabled.');
                    })
                  }
                >
                  Confirm TOTP
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() =>
              void fetch('/api/auth/totp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disable' }),
              }).then(() => refresh())
            }
          >
            Disable TOTP
          </Button>
        )}
      </ToolSection>

      <ToolSection title="Keyboard shortcuts">
        <ul className="space-y-3">
          {shortcutBindings.map((binding, index) => (
            <li
              key={binding.id}
              className="grid gap-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/35 p-3 sm:grid-cols-3"
            >
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Action
                <TextInput
                  value={binding.action}
                  onChange={event =>
                    setShortcutBindings(previous =>
                      previous.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, action: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Combo
                <TextInput
                  value={binding.combo}
                  onChange={event =>
                    setShortcutBindings(previous =>
                      previous.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, combo: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Selector (optional)
                <TextInput
                  value={binding.selector ?? ''}
                  onChange={event =>
                    setShortcutBindings(previous =>
                      previous.map((entry, entryIndex) =>
                        entryIndex === index
                          ? {
                              ...entry,
                              selector: event.target.value.trim() || undefined,
                            }
                          : entry
                      )
                    )
                  }
                  placeholder="[data-action='…']"
                />
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              saveKeyboardShortcuts(shortcutBindings);
              setShortcutsJson(JSON.stringify(shortcutBindings, null, 2));
              setStatus('Shortcuts saved.');
            }}
          >
            Save shortcuts
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setShortcutBindings(DEFAULT_KEYBOARD_SHORTCUTS);
              setShortcutsJson(JSON.stringify(DEFAULT_KEYBOARD_SHORTCUTS, null, 2));
            }}
          >
            Reset defaults
          </Button>
        </div>
      </ToolSection>
    </div>
  );
}
