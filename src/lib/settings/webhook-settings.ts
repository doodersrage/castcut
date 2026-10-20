import type { WorkflowParamValues } from '../comfyui/config';
import { appendWebhookLogEntry } from '../server/webhook-log';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const WEBHOOK_SETTINGS_KEY = 'comfy-prompt-webhook-v1';

export type WebhookEvent =
  | 'comfyui.job.completed'
  | 'comfyui.job.error'
  | 'comfyui.job.queued'
  | 'comfyui.batch.completed'
  | 'scheduled.batch.run'
  | 'scheduled.batch.completed'
  | 'prompt.generated'
  | 'prompt.history.saved'
  | 'session.recipe.saved';

export const WEBHOOK_EVENT_CATALOG: { event: WebhookEvent; description: string }[] = [
  { event: 'comfyui.job.queued', description: 'A prompt was sent to the ComfyUI queue.' },
  { event: 'comfyui.job.completed', description: 'ComfyUI finished a job successfully.' },
  { event: 'comfyui.job.error', description: 'ComfyUI reported a queue or execution error.' },
  { event: 'comfyui.batch.completed', description: 'A multi-prompt batch finished.' },
  { event: 'scheduled.batch.run', description: 'Scheduled batch runner started a cycle.' },
  { event: 'scheduled.batch.completed', description: 'Scheduled batch runner finished a cycle.' },
  {
    event: 'prompt.generated',
    description: 'A tool finished LLM prompt generation (e.g. Adult generator).',
  },
  { event: 'prompt.history.saved', description: 'A prompt was saved to Studio history.' },
  { event: 'session.recipe.saved', description: 'A session recipe snapshot was stored.' },
];

export type WebhookSettings = {
  enabled: boolean;
  url?: string;
  secret?: string;
  template?: import('../server/webhook-payload').WebhookTemplate;
  /** When set, only these events are dispatched. Omit = all events; empty array = none. */
  enabledEvents?: WebhookEvent[];
};

export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  enabled: false,
  url: '',
  secret: '',
  template: 'generic',
};

export function isWebhookEventEnabled(settings: WebhookSettings, event: WebhookEvent): boolean {
  const list = settings.enabledEvents;
  if (list === undefined) {
    return true;
  }
  if (list.length === 0) {
    return false;
  }
  return list.includes(event);
}

export function normalizeWebhookEnabledEvents(
  events: WebhookEvent[] | undefined
): WebhookEvent[] | undefined {
  if (events === undefined) {
    return undefined;
  }
  if (events.length === 0) {
    return [];
  }
  const allowed = new Set(WEBHOOK_EVENT_CATALOG.map(item => item.event));
  const next = events.filter(event => allowed.has(event));
  if (next.length === 0) {
    return [];
  }
  if (next.length === WEBHOOK_EVENT_CATALOG.length) {
    return undefined;
  }
  return next;
}

export function loadWebhookSettings(): WebhookSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_WEBHOOK_SETTINGS;
  }
  try {
    const parsed = readBrowserValue<WebhookSettings>(WEBHOOK_SETTINGS_KEY);
    if (!parsed) {
      return DEFAULT_WEBHOOK_SETTINGS;
    }
    return {
      ...DEFAULT_WEBHOOK_SETTINGS,
      ...parsed,
      enabledEvents: normalizeWebhookEnabledEvents(parsed.enabledEvents),
    };
  } catch {
    return DEFAULT_WEBHOOK_SETTINGS;
  }
}

export function saveWebhookSettings(settings: WebhookSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(WEBHOOK_SETTINGS_KEY, settings);
}

export type WebhookJobPayload = {
  metadata?: Record<string, unknown>;
  event: WebhookEvent;
  promptId?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  status?: string;
  imageCount?: number;
  queueParams?: WorkflowParamValues;
  queued?: number;
  failed?: number;
  completedAt: number;
  message?: string;
};

export async function dispatchWebhook(payload: WebhookJobPayload): Promise<boolean> {
  const settings = loadWebhookSettings();
  if (!settings.enabled || !settings.url?.trim()) {
    return false;
  }
  if (!isWebhookEventEnabled(settings, payload.event)) {
    return false;
  }

  try {
    const response = await fetch('/api/webhooks/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: settings.url.trim(),
        secret: settings.secret?.trim() || undefined,
        template: settings.template ?? 'generic',
        payload,
      }),
    });
    const ok = response.ok;
    appendWebhookLogEntry({
      ok,
      url: settings.url.trim(),
      message: ok ? 'Delivered' : 'Dispatch failed',
      payload,
    });
    return ok;
  } catch (error) {
    appendWebhookLogEntry({
      ok: false,
      url: settings.url.trim(),
      message: error instanceof Error ? error.message : 'Dispatch error',
      payload,
    });
    return false;
  }
}
