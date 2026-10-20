'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import type { PublicQueueExportConfig } from '@/lib/queue/export-types';

export default function QueueExportSettingsPanel() {
  const auth = useAuth();
  const isAdmin = !auth?.authEnabled || Boolean(auth?.isAdmin);
  const [config, setConfig] = useState<PublicQueueExportConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [dir, setDir] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void fetch('/api/settings/queue-export')
      .then(response => (response.ok ? response.json() : null))
      .then((data: PublicQueueExportConfig | null) => {
        if (!data) {
          return;
        }
        setConfig(data);
        setEnabled(data.enabled);
        setDir(data.dir || data.envDir);
      })
      .catch(() => undefined);
  }, [isAdmin]);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Queue artifact export</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Writes JSON sidecars after each queue. Env{' '}
          <code className="ui-inline-code">COMFYUI_QUEUE_EXPORT_DIR</code> wins when set. Overlay
          persists in SQLite when <code className="ui-inline-code">PROMPT_DATA_DIR</code> is set.
        </p>
      </div>
      {config?.envWins ? (
        <p className="text-xs text-[var(--tint-warning-text)]">
          Env path is active ({config.envDir}). Restart the Next.js process after changing env.
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={enabled}
          disabled={config?.envWins}
          onChange={event => setEnabled(event.target.checked)}
          className="h-4 w-4 rounded"
        />
        Enable queue sidecar export
      </label>
      <label className="block space-y-1 text-xs text-[var(--text-muted)]">
        Absolute export directory
        <input
          value={dir}
          disabled={config?.envWins}
          onChange={event => setDir(event.target.value)}
          className="ui-input w-full font-mono text-sm"
          placeholder="/var/lib/prompt-studio/queue-export"
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={saving}
        disabled={config?.envWins}
        onClick={() => {
          setSaving(true);
          setStatus(null);
          void fetch('/api/settings/queue-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, dir }),
          })
            .then(async response => {
              const data = (await response.json()) as PublicQueueExportConfig & { error?: string };
              if (!response.ok) {
                throw new Error(data.error ?? 'Save failed.');
              }
              setConfig(data);
              setEnabled(data.enabled);
              setDir(data.dir || data.envDir);
              setStatus(
                data.persisted
                  ? data.enabled
                    ? `Exporting to ${data.dir}`
                    : 'Queue export disabled.'
                  : 'Set PROMPT_DATA_DIR to persist this overlay.'
              );
            })
            .catch(error => {
              setStatus(error instanceof Error ? error.message : 'Save failed.');
            })
            .finally(() => setSaving(false));
        }}
      >
        Save export path
      </Button>
      {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
    </div>
  );
}
