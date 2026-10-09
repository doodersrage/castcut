'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  checkEmbeddingSearchHealth,
  type EmbeddingSearchHealth,
} from '@/lib/embedding-search-health';
import type { WebhookSettings } from '@/lib/webhook-settings';
import { clearWebhookLog, retryWebhookLogEntry, type WebhookLogEntry } from '@/lib/webhook-log';
import type { ScheduledBatchConfig } from '@/lib/scheduled-batch';
import type { ScheduledBatchServerStatus } from '@/lib/scheduled-batch-profile-sync';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';
import UserScheduledCampaignSection from '@/components/settings/UserScheduledCampaignSection';
import WebhookSettingsPanel from '@/components/settings/panels/WebhookSettingsPanel';
import AvoidedTokensPanel from '@/components/settings/panels/AvoidedTokensPanel';
import ScheduledBatchPanel from '@/components/settings/panels/ScheduledBatchPanel';
import { APP_HAS_PLAY } from '@/lib/app-profile';

export type SettingsAutomationTabProps = {
  webhookSettings: WebhookSettings;
  setWebhookSettings: (value: WebhookSettings) => void;
  avoidedTokens: string[];
  avoidedTokenDraft: string;
  setAvoidedTokenDraft: (value: string) => void;
  avoidancePreviewPrompt: string;
  setAvoidancePreviewPrompt: (value: string) => void;
  avoidancePreview: {
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null;
  setAvoidancePreview: (
    value: {
      filtered: string;
      removedTokens: string[];
      instructionLine: string;
    } | null
  ) => void;
  webhookLog: WebhookLogEntry[];
  webhookEventFilter: string;
  setWebhookEventFilter: (value: string) => void;
  expandedWebhookLogId: string | null;
  setExpandedWebhookLogId: (
    value: string | null | ((previous: string | null) => string | null)
  ) => void;
  scheduledBatch: ScheduledBatchConfig;
  setScheduledBatch: (value: ScheduledBatchConfig) => void;
  serverScheduledBatchStatus: ScheduledBatchServerStatus | null;
  sharedSettings: SharedToolSettings;
  setStatus: (status: string | null) => void;
};

export default function SettingsAutomationTab({
  webhookSettings,
  setWebhookSettings,
  avoidedTokens,
  avoidedTokenDraft,
  setAvoidedTokenDraft,
  avoidancePreviewPrompt,
  setAvoidancePreviewPrompt,
  avoidancePreview,
  setAvoidancePreview,
  webhookLog,
  webhookEventFilter,
  setWebhookEventFilter,
  expandedWebhookLogId,
  setExpandedWebhookLogId,
  scheduledBatch,
  setScheduledBatch,
  serverScheduledBatchStatus,
  sharedSettings,
  setStatus,
}: SettingsAutomationTabProps) {
  const [embeddingHealth, setEmbeddingHealth] = useState<EmbeddingSearchHealth | null>(null);

  useEffect(() => {
    void checkEmbeddingSearchHealth().then(setEmbeddingHealth);
  }, []);

  const filteredWebhookLog = useMemo(() => {
    if (webhookEventFilter === 'all') {
      return webhookLog;
    }
    return webhookLog.filter(entry => entry.event === webhookEventFilter);
  }, [webhookEventFilter, webhookLog]);

  const webhookEventOptions = useMemo(() => {
    const events = new Set(webhookLog.map(entry => entry.event));
    return [...events].sort();
  }, [webhookLog]);

  return (
    <>
      <ToolSection title="Automation hub">
        <p className="text-sm text-[var(--text-secondary)]">
          Webhooks, browser scheduled batch, and per-user campaigns live here. ComfyUI queue
          defaults are under{' '}
          <Link href="/settings?tab=comfyui" className="text-[var(--accent-text)] hover:underline">
            ComfyUI settings
          </Link>
          . Appearance, workspace, and email notifications are under{' '}
          <Link href="/profile" className="text-[var(--accent-text)] hover:underline">
            Profile
          </Link>
          .
        </p>
        {embeddingHealth ? (
          <p
            className={`rounded-lg border px-3 py-2 text-xs ${
              embeddingHealth.available
                ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
                : 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
            }`}
          >
            <span className="font-medium">Semantic gallery search · </span>
            {embeddingHealth.message}
          </p>
        ) : null}
      </ToolSection>

      {/* Scheduled scene batches are Prompt Studio's (they run Generate). */}
      {APP_HAS_PLAY ? null : <UserScheduledCampaignSection onStatus={setStatus} />}

      <WebhookSettingsPanel
        webhookSettings={webhookSettings}
        setWebhookSettings={setWebhookSettings}
        scheduledBatch={scheduledBatch}
        setScheduledBatch={setScheduledBatch}
      />

      <AvoidedTokensPanel
        avoidedTokens={avoidedTokens}
        avoidedTokenDraft={avoidedTokenDraft}
        setAvoidedTokenDraft={setAvoidedTokenDraft}
        avoidancePreviewPrompt={avoidancePreviewPrompt}
        setAvoidancePreviewPrompt={setAvoidancePreviewPrompt}
        avoidancePreview={avoidancePreview}
        setAvoidancePreview={setAvoidancePreview}
        setStatus={setStatus}
      />

      <ToolSection title="Webhook event log">
        <p className="text-sm text-[var(--text-secondary)]">
          Recent webhook dispatch attempts (newest first).
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="space-y-1 text-xs text-[var(--text-secondary)]">
            Event filter
            <select
              value={webhookEventFilter}
              onChange={event => setWebhookEventFilter(event.target.value)}
              className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            >
              <option value="all">All events</option>
              {webhookEventOptions.map(eventName => (
                <option key={eventName} value={eventName}>
                  {eventName}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={webhookLog.length === 0}
            onClick={() => {
              clearWebhookLog();
              setStatus('Cleared webhook log.');
            }}
          >
            Clear log
          </Button>
        </div>
        {filteredWebhookLog.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title={webhookLog.length === 0 ? 'No webhook events yet' : 'No events for this filter'}
            description={
              webhookLog.length === 0
                ? 'Dispatch attempts appear here once webhooks fire for queue, gallery, or storage events.'
                : 'Try another event type or clear the filter to see the full log.'
            }
            action={
              webhookLog.length > 0 && webhookEventFilter !== 'all'
                ? {
                    label: 'Show all events',
                    onClick: () => setWebhookEventFilter('all'),
                  }
                : undefined
            }
          />
        ) : (
          <ol className="space-y-2">
            {filteredWebhookLog.slice(0, 12).map(entry => (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 text-xs text-[var(--text-secondary)]"
              >
                <p className={entry.ok ? 'text-[var(--tint-success-text)]' : 'ui-status-danger'}>
                  {entry.ok ? 'OK' : 'FAIL'} · {entry.event} ·{' '}
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                <p>{entry.message ?? entry.url}</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedWebhookLogId(previous => (previous === entry.id ? null : entry.id))
                  }
                  className="mt-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {expandedWebhookLogId === entry.id ? 'Hide payload' : 'Show payload'}
                </button>
                {expandedWebhookLogId === entry.id ? (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-2 text-[11px] text-[var(--text-secondary)]">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void retryWebhookLogEntry(entry).then(ok =>
                      setStatus(ok ? 'Webhook retry succeeded.' : 'Webhook retry failed.')
                    );
                  }}
                  className="mt-2 text-[var(--accent-text)] hover:text-[var(--accent-text)]"
                >
                  Retry
                </button>
              </li>
            ))}
          </ol>
        )}
      </ToolSection>

      {APP_HAS_PLAY ? null : (
        <ScheduledBatchPanel
          scheduledBatch={scheduledBatch}
          setScheduledBatch={setScheduledBatch}
          serverScheduledBatchStatus={serverScheduledBatchStatus}
          sharedSettings={sharedSettings}
          setStatus={setStatus}
        />
      )}
    </>
  );
}
