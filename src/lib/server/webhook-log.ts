import type { WebhookJobPayload } from '../settings/webhook-settings';
import { dispatchWebhook } from '../settings/webhook-settings';
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from '../storage/browser-storage';

export const WEBHOOK_LOG_KEY = 'comfy-prompt-webhook-log-v1';
export const WEBHOOK_LOG_UPDATED_EVENT = 'webhook-log-updated';

export type WebhookLogEntry = {
  id: string;
  timestamp: number;
  event: WebhookJobPayload['event'];
  ok: boolean;
  url?: string;
  message?: string;
  payload: WebhookJobPayload;
};

const MAX_LOG_ENTRIES = 40;

export function loadWebhookLog(): WebhookLogEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readBrowserValue<WebhookLogEntry[]>(WEBHOOK_LOG_KEY) ?? [];
  } catch {
    return [];
  }
}

function saveWebhookLog(entries: WebhookLogEntry[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(WEBHOOK_LOG_KEY, entries.slice(0, MAX_LOG_ENTRIES));
  window.dispatchEvent(new CustomEvent(WEBHOOK_LOG_UPDATED_EVENT));
}

export function appendWebhookLogEntry(input: {
  ok: boolean;
  url?: string;
  message?: string;
  payload: WebhookJobPayload;
}): WebhookLogEntry {
  const entry: WebhookLogEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    event: input.payload.event,
    ok: input.ok,
    url: input.url,
    message: input.message,
    payload: input.payload,
  };
  saveWebhookLog([entry, ...loadWebhookLog()]);
  return entry;
}

export function clearWebhookLog(): void {
  if (typeof window === 'undefined') {
    return;
  }
  removeBrowserKey(WEBHOOK_LOG_KEY);
  window.dispatchEvent(new CustomEvent(WEBHOOK_LOG_UPDATED_EVENT));
}

export async function retryWebhookLogEntry(entry: WebhookLogEntry): Promise<boolean> {
  const ok = await dispatchWebhook(entry.payload);
  appendWebhookLogEntry({
    ok,
    url: entry.url,
    message: ok ? 'Retried successfully' : 'Retry failed',
    payload: entry.payload,
  });
  return ok;
}

const WEBHOOK_RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

function webhookRetryDelayMs(failCount: number): number {
  const index = Math.min(failCount, WEBHOOK_RETRY_BACKOFF_MS.length - 1);
  return WEBHOOK_RETRY_BACKOFF_MS[index] ?? WEBHOOK_RETRY_BACKOFF_MS.at(-1)!;
}

/** Retries recent failed webhook log entries with exponential backoff spacing. */
export async function retryFailedWebhookDeliveries(now = Date.now()): Promise<number> {
  const entries = loadWebhookLog().filter(entry => !entry.ok);
  let retried = 0;
  for (const entry of entries.slice(0, 3)) {
    const failCount = Number(
      (entry.payload as { metadata?: Record<string, unknown> }).metadata?.webhookFailCount ?? 0
    );
    const lastAttempt = Number(
      (entry.payload as { metadata?: Record<string, unknown> }).metadata?.webhookLastAttemptAt ??
        entry.timestamp
    );
    if (now - lastAttempt < webhookRetryDelayMs(failCount)) {
      continue;
    }
    const payload = {
      ...entry.payload,
      metadata: {
        ...((entry.payload as { metadata?: Record<string, unknown> }).metadata ?? {}),
        webhookFailCount: failCount,
        webhookLastAttemptAt: now,
      },
    };
    const ok = await dispatchWebhook(payload);
    appendWebhookLogEntry({
      ok,
      url: entry.url,
      message: ok ? 'Auto-retry succeeded' : 'Auto-retry failed',
      payload: {
        ...payload,
        metadata: {
          ...payload.metadata,
          webhookFailCount: failCount + 1,
          webhookLastAttemptAt: now,
        },
      },
    });
    if (ok) {
      retried += 1;
    }
  }
  return retried;
}
