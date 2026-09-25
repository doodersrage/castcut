'use client';

import {
  saveWebhookSettings,
  WEBHOOK_EVENT_CATALOG,
  isWebhookEventEnabled,
  normalizeWebhookEnabledEvents,
  type WebhookSettings,
} from '@/lib/webhook-settings';
import { saveScheduledBatchConfig, type ScheduledBatchConfig } from '@/lib/scheduled-batch';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';

export type WebhookSettingsPanelProps = {
  webhookSettings: WebhookSettings;
  setWebhookSettings: (value: WebhookSettings) => void;
  scheduledBatch: ScheduledBatchConfig;
  setScheduledBatch: (value: ScheduledBatchConfig) => void;
};

export default function WebhookSettingsPanel({
  webhookSettings,
  setWebhookSettings,
  scheduledBatch,
  setScheduledBatch,
}: WebhookSettingsPanelProps) {
  return (
    <ToolSection title="Webhooks" id="settings-webhooks">
      <p className="text-sm text-[var(--text-secondary)]">
        POST queue, prompt, and session events to an external URL (via server proxy).
      </p>
      <details className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3 text-xs text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--text-primary)]">
          Supported events
        </summary>
        <ul className="mt-2 space-y-1.5">
          {WEBHOOK_EVENT_CATALOG.map(item => (
            <li key={item.event}>
              <code className="text-[var(--text-primary)]">{item.event}</code> — {item.description}
            </li>
          ))}
        </ul>
      </details>
      <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={webhookSettings.enabled}
          onChange={event => {
            const next = { ...webhookSettings, enabled: event.target.checked };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Enable webhooks
      </label>
      <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={Boolean(scheduledBatch.webhookAutoRetry)}
          disabled={!webhookSettings.enabled}
          onChange={event => {
            const next = {
              ...scheduledBatch,
              webhookAutoRetry: event.target.checked,
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className={`h-4 w-4 rounded ${accentFocusClass()}`}
        />
        Auto-retry failed webhook deliveries (exponential backoff, browser tab open)
      </label>
      <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
      <input
        id="webhook-url"
        value={webhookSettings.url ?? ''}
        onChange={event => {
          const next = { ...webhookSettings, url: event.target.value };
          setWebhookSettings(next);
          saveWebhookSettings(next);
        }}
        placeholder="https://example.com/hooks/comfyui"
        className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
      />
      <FieldLabel htmlFor="webhook-secret">Shared secret (optional)</FieldLabel>
      <input
        id="webhook-secret"
        value={webhookSettings.secret ?? ''}
        onChange={event => {
          const next = { ...webhookSettings, secret: event.target.value };
          setWebhookSettings(next);
          saveWebhookSettings(next);
        }}
        className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
      />
      <FieldLabel htmlFor="webhook-template">Payload template</FieldLabel>
      <select
        id="webhook-template"
        value={webhookSettings.template ?? 'generic'}
        onChange={event => {
          const next = {
            ...webhookSettings,
            template: event.target.value as WebhookSettings['template'],
          };
          setWebhookSettings(next);
          saveWebhookSettings(next);
        }}
        className="ui-input w-full max-w-xs"
      >
        <option value="generic">Generic JSON</option>
        <option value="discord">Discord embed</option>
        <option value="slack">Slack blocks</option>
      </select>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Leave all unchecked to receive every event. Check only the events you want dispatched.
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {WEBHOOK_EVENT_CATALOG.map(item => {
          const checked = isWebhookEventEnabled(webhookSettings, item.event);
          return (
            <li key={item.event}>
              <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={event => {
                    const allEvents = WEBHOOK_EVENT_CATALOG.map(entry => entry.event);
                    const current =
                      webhookSettings.enabledEvents === undefined
                        ? allEvents
                        : [...webhookSettings.enabledEvents];
                    const nextEvents = event.target.checked
                      ? [...new Set([...current, item.event])]
                      : current.filter(entry => entry !== item.event);
                    const next = {
                      ...webhookSettings,
                      enabledEvents: normalizeWebhookEnabledEvents(nextEvents),
                    };
                    setWebhookSettings(next);
                    saveWebhookSettings(next);
                  }}
                  className={`mt-0.5 h-4 w-4 rounded ${accentFocusClass()}`}
                />
                <span>
                  <code className="text-[var(--text-primary)]">{item.event}</code>
                  <span className="mt-0.5 block text-[var(--text-muted)]">{item.description}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </ToolSection>
  );
}
