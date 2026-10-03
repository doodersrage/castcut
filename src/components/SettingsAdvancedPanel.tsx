'use client';

import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery-storage-meta';
import { useEffect, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';
import { syncNamespaceToServer, pullNamespaceFromServer } from '@/lib/storage-sync';
import { SyncStatusLine } from '@/components/SyncStatusLine';
import ObservabilityDashboard from '@/components/ObservabilityDashboard';
import PromptRecipesPanel from '@/components/settings/PromptRecipesPanel';
import NegativeLearnerPanel from '@/components/settings/NegativeLearnerPanel';
import ModelShootoutPanel from '@/components/settings/ModelShootoutPanel';
import { loadSettingsCache, saveSettingsCache, type SettingsCache } from '@/lib/settings-cache';
import { initAppDb } from '@/lib/app-db-init';
import { loadPromptHistoryStore, savePromptHistoryStore } from '@/lib/prompt-history';
import {
  loadComfyGallery,
  saveComfyGalleryAsync,
  MAX_GALLERY_ENTRIES,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import {
  fetchServerGalleryCount,
  pullAndMergeGalleryFromServer,
  pushGalleryToServer,
} from '@/lib/gallery-server-sync';

type UsageSummary = {
  total: number;
  lastHour: number;
  rateLimited: number;
  avgDurationMs: number;
};

export default function SettingsAdvancedPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [serverGalleryCount, setServerGalleryCount] = useState<number | null>(null);
  const [localGalleryCount, setLocalGalleryCount] = useState<number | null>(null);
  const [gallerySyncBusy, setGallerySyncBusy] = useState(false);

  const [llmUsage, setLlmUsage] = useState<{
    last24h: number;
    last24hTokens: number;
    byModel: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    void fetch('/api/usage')
      .then(response => response.json())
      .then((data: { summary?: UsageSummary }) => setUsage(data.summary ?? null))
      .catch(() => setUsage(null));
    void fetch('/api/health')
      .then(response => response.json())
      .then((data: { storage?: { enabled?: boolean } }) => {
        const enabled = Boolean(data.storage?.enabled);
        setStorageEnabled(enabled);
        if (enabled) {
          void fetchServerGalleryCount().then(setServerGalleryCount);
        }
      })
      .catch(() => setStorageEnabled(false));
    // Count again when the gallery loads: the first read ran before it had hydrated and showed
    // "Local gallery: 0 entries" next to Push gallery to server.
    const countLocal = () => setLocalGalleryCount(loadComfyGallery().length);
    void Promise.resolve().then(countLocal);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, countLocal);
    void fetch('/api/auth/llm-usage')
      .then(response => (response.ok ? response.json() : null))
      .then(
        (
          data: {
            summary?: { last24h: number; last24hTokens: number; byModel: Record<string, number> };
          } | null
        ) => setLlmUsage(data?.summary ?? null)
      )
      .catch(() => setLlmUsage(null));
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, countLocal);
  }, []);

  async function runServerBatch() {
    setStatus(null);
    try {
      const response = await fetch('/api/scheduled-batch/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'random-scene', count: 3, autoQueueComfyUi: false }),
      });
      const data = (await response.json()) as { prompts?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Server batch failed.');
      }
      setStatus(`Server batch generated ${data.prompts?.length ?? 0} prompt(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Server batch failed.');
    }
  }

  async function pushLocalStorageToServer() {
    if (!storageEnabled) {
      setStatus('Set PROMPT_DATA_DIR on the server to enable storage sync.');
      return;
    }
    await initAppDb();
    const settings = loadSettingsCache();
    const history = loadPromptHistoryStore();
    const gallery = loadComfyGallery();
    const tasks: Promise<boolean>[] = [];
    if (settings.tools || settings.shared) {
      tasks.push(syncNamespaceToServer('settings-cache', settings));
    }
    if (history) {
      tasks.push(syncNamespaceToServer('prompt-history', history));
    }
    // Always push gallery (including []) so server deletes stick.
    tasks.push(syncNamespaceToServer('comfy-gallery', gallery));
    const { loadGalleryDeletedIds } = await import('@/lib/gallery-deleted-ids');
    tasks.push(syncNamespaceToServer('gallery-deleted-ids', loadGalleryDeletedIds()));
    const { collectStudioExtras } = await import('@/lib/studio-extras');
    tasks.push(syncNamespaceToServer('studio-extras', collectStudioExtras()));
    const results = await Promise.all(tasks);
    setStatus(
      results.every(Boolean)
        ? 'Synced local settings, history, gallery, and studio extras to server storage.'
        : 'Some namespaces failed to sync.'
    );
  }

  async function pushGalleryOnly() {
    if (!storageEnabled) {
      setStatus('Set PROMPT_DATA_DIR on the server to enable storage sync.');
      return;
    }
    setGallerySyncBusy(true);
    try {
      await initAppDb();
      const result = await pushGalleryToServer();
      setStatus(
        result.ok
          ? `Pushed ${result.count} gallery entr${result.count === 1 ? 'y' : 'ies'} to server.`
          : (result.error ?? 'Push failed.')
      );
      if (result.ok) {
        setServerGalleryCount(result.count);
      }
    } finally {
      setGallerySyncBusy(false);
    }
  }

  async function pullGalleryOnly() {
    if (!storageEnabled) {
      setStatus('Set PROMPT_DATA_DIR on the server to enable storage sync.');
      return;
    }
    setGallerySyncBusy(true);
    try {
      await initAppDb();
      const result = await pullAndMergeGalleryFromServer();
      if (!result.ok) {
        setStatus(result.error ?? 'Pull failed.');
        return;
      }
      setStatus(
        result.changed
          ? `Merged server gallery — added ${result.addedFromServer}, updated ${result.updatedFromServer}${
              result.evictedLocally > 0
                ? ` (local cap kept favorites/high ratings, dropped ${result.evictedLocally} low-value entries — server still has the full history)`
                : ''
            }.`
          : 'Local gallery already up to date with server.'
      );
      setLocalGalleryCount(loadComfyGallery().length);
      void fetchServerGalleryCount().then(setServerGalleryCount);
    } finally {
      setGallerySyncBusy(false);
    }
  }

  async function pullServerStorageToBrowser() {
    if (!storageEnabled) {
      setStatus('Set PROMPT_DATA_DIR on the server to enable storage sync.');
      return;
    }
    const settings = await pullNamespaceFromServer<SettingsCache>('settings-cache');
    const history = await pullNamespaceFromServer<unknown>('prompt-history');
    const gallery = await pullNamespaceFromServer<ComfyGalleryEntry[]>('comfy-gallery');
    const deletedPayload = await pullNamespaceFromServer<string[] | { ids?: string[] }>(
      'gallery-deleted-ids'
    );
    const extras =
      await pullNamespaceFromServer<import('@/lib/studio-extras').StudioExtrasPayload>(
        'studio-extras'
      );
    const {
      filterOutDeletedGalleryEntries,
      loadGalleryDeletedIds,
      mergeGalleryDeletedIds,
      saveGalleryDeletedIds,
    } = await import('@/lib/gallery-deleted-ids');
    const { applyStudioExtras } = await import('@/lib/studio-extras');
    const serverDeleted = Array.isArray(deletedPayload)
      ? deletedPayload
      : Array.isArray(deletedPayload?.ids)
        ? deletedPayload.ids
        : [];
    if (serverDeleted.length > 0) {
      saveGalleryDeletedIds(mergeGalleryDeletedIds(loadGalleryDeletedIds(), serverDeleted));
    }
    if (settings) {
      saveSettingsCache(settings);
    }
    if (history) {
      savePromptHistoryStore(history as import('@/lib/prompt-history').PromptHistoryEntry[]);
    }
    if (gallery) {
      await saveComfyGalleryAsync(filterOutDeletedGalleryEntries(gallery));
    }
    if (extras) {
      applyStudioExtras(extras);
    }
    setStatus(
      settings || history || gallery || extras
        ? 'Restored server storage into the app database. Reload the page.'
        : 'No server namespaces found to restore.'
    );
  }

  return (
    <>
      {/* Scopes named: this list is the signed-in user's calls, Observability below counts the
          whole server (background vision ranking included) — unlabelled, "0" sat beside "89". */}
      <ToolSection title="Your LLM usage">
        {llmUsage ? (
          <ul className="space-y-1 text-sm text-[var(--text-muted)]">
            <li>Your LLM calls, last 24 hours: {llmUsage.last24h}</li>
            <li>Estimated tokens: {llmUsage.last24hTokens}</li>
            <li>
              By model:{' '}
              {Object.entries(llmUsage.byModel)
                .map(([model, count]) => `${model} (${count})`)
                .join(', ') || '—'}
            </li>
          </ul>
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="Sign in for LLM usage"
            description="LLM call counts and token estimates are available when authentication is enabled and you are signed in."
            action={{ label: 'Open login', href: '/login' }}
          />
        )}
      </ToolSection>

      <ToolSection title="API usage">
        {usage ? (
          <ul className="space-y-1 text-sm text-[var(--text-muted)]">
            <li>Recent requests kept (the last 500 at most): {usage.total}</li>
            <li>Last hour: {usage.lastHour}</li>
            <li>Rate limited: {usage.rateLimited}</li>
            <li>Average duration: {usage.avgDurationMs}ms</li>
          </ul>
        ) : (
          <EmptyState
            compact
            icon="inbox"
            title="No API usage recorded yet"
            description="In-memory request stats appear here after the server handles a few API calls."
          />
        )}
      </ToolSection>

      <ToolSection title="Server storage">
        <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 p-3 text-xs text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)]">Enablement checklist</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Durable gallery/history: set{' '}
              <code className="text-[var(--text-secondary)]">PROMPT_DATA_DIR</code>
            </li>
            <li>
              Headless scheduled batch: that <em>plus</em>{' '}
              <code className="text-[var(--text-secondary)]">SERVER_SCHEDULED_BATCH=true</code>
            </li>
            <li>
              Browser scheduled batch (Settings → Automation) only runs while a tab stays open —
              unrelated to the env flag
            </li>
          </ul>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Optional SQLite storage when{' '}
          <code className="text-[var(--text-secondary)]">PROMPT_DATA_DIR</code> is set on the server
          (<code className="text-[var(--text-secondary)]">studio.sqlite</code>). When signed in,
          history and gallery sync to your personal scope in that database.
        </p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Status: {storageEnabled ? 'enabled' : 'disabled (browser database only)'}
        </p>
        {storageEnabled ? <SyncStatusLine /> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void pushLocalStorageToServer()}>
            Push browser data to server
          </Button>
          <Button variant="secondary" onClick={() => void pullServerStorageToBrowser()}>
            Pull server data to browser
          </Button>
        </div>
        {storageEnabled ? (
          <div className="mt-4 space-y-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/35 p-3">
            <p className="text-sm text-[var(--text-muted)]">
              Encrypted server export (sign-in required). Writes a snapshot under your user
              namespace on the server.
            </p>
            <label className="block space-y-1.5 text-sm">
              <span className="type-caption text-[var(--text-muted)]">
                Passphrase (optional — encrypts export)
              </span>
              <input
                type="password"
                value={exportPassphrase}
                onChange={event => setExportPassphrase(event.target.value)}
                className="ui-input w-full max-w-md px-3 py-2"
                placeholder="Leave empty for plain JSON export"
              />
            </label>
            <Button
              variant="secondary"
              onClick={async () => {
                setStatus(null);
                try {
                  const response = await fetch('/api/storage/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      passphrase: exportPassphrase.trim() || undefined,
                    }),
                  });
                  const data = (await response.json()) as {
                    error?: string;
                    filename?: string;
                    encrypted?: boolean;
                  };
                  if (!response.ok) {
                    throw new Error(data.error ?? 'Export failed.');
                  }
                  setStatus(
                    `Server export saved as ${data.filename ?? 'snapshot'}${data.encrypted ? ' (encrypted)' : ''}.`
                  );
                  setExportPassphrase('');
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : 'Export failed.');
                }
              }}
            >
              Export my server data
            </Button>
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Comfy gallery sync">
        <p className="text-sm text-[var(--text-muted)]">
          Keeps the browser gallery and server storage (
          <code className="text-[var(--text-secondary)]">comfy-gallery</code>) durably in sync —
          merges rather than overwrites, and prefers newer entries by completion time. Local storage
          caps at{' '}
          <code className="text-[var(--text-secondary)]">
            {MAX_GALLERY_ENTRIES.toLocaleString()}
          </code>{' '}
          entries, keeping favorites and 4-5★ ratings first; the server always keeps the full
          history.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
          <li>
            Local gallery: {localGalleryCount != null ? localGalleryCount.toLocaleString() : '—'}{' '}
            entries
          </li>
          <li>
            Server gallery:{' '}
            {storageEnabled
              ? serverGalleryCount != null
                ? `${serverGalleryCount.toLocaleString()} entries`
                : 'unknown (not pulled yet)'
              : 'disabled (browser database only)'}
          </li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={gallerySyncBusy}
            onClick={() => void pullGalleryOnly()}
          >
            Pull gallery from server
          </Button>
          <Button
            variant="secondary"
            disabled={gallerySyncBusy}
            onClick={() => void pushGalleryOnly()}
          >
            Push gallery to server
          </Button>
        </div>
      </ToolSection>

      <ToolSection title="Server scheduled batch">
        <p className="text-sm text-[var(--text-muted)]">
          Headless runner via{' '}
          <code className="text-[var(--text-secondary)]">POST /api/scheduled-batch/run</code>.
          Automatic ticks need{' '}
          <code className="text-[var(--text-secondary)]">SERVER_SCHEDULED_BATCH=true</code> (and{' '}
          <code className="text-[var(--text-secondary)]">PROMPT_DATA_DIR</code> to persist the
          profile). This is separate from the browser “Enable browser scheduled batch” toggle.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => void runServerBatch()}>
          Run server batch now
        </Button>
      </ToolSection>

      <ToolSection title="Email">
        <p className="text-sm text-[var(--text-muted)]">
          Requires SMTP env vars and a signed-in user with an email on Profile.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            setStatus(null);
            try {
              const response = await fetch('/api/email/test', { method: 'POST' });
              const data = (await response.json()) as { error?: string; to?: string };
              if (!response.ok) {
                throw new Error(data.error ?? 'Test email failed.');
              }
              setStatus(`Test email sent to ${data.to ?? 'your address'}.`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : 'Test email failed.');
            }
          }}
        >
          Send test email
        </Button>
      </ToolSection>

      <ObservabilityDashboard />

      <PromptRecipesPanel />
      <NegativeLearnerPanel />
      <ModelShootoutPanel />

      {status ? <p className="text-sm text-[var(--tint-success-text)]">{status}</p> : null}
    </>
  );
}
