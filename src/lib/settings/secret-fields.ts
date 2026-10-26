/**
 * Credentials typed into Settings stay in this browser (R3, M0 audit D5): the cloud engines' and
 * the LLM provider's API keys, and the webhook signing secret. Settings has always said "Stored
 * in this browser only", but they went out with the rest — in every backup file, settings file
 * and server push.
 *
 * So: what leaves the browser has none (`…WithoutSecrets`), and what comes in — a server pull, a
 * merge, a restored backup or settings file — keeps this browser's own (`…WithLocalSecrets`),
 * whatever the copy carries; an older copy that still has keys does not bring them back. A key
 * for every device goes in the server's environment (FAL_KEY, OPENAI_API_KEY, LLM_API_KEY, …).
 */
import type { SharedToolSettings } from './cache';
import type { WebhookSettings } from './webhook-settings';

/**
 * Shared settings fields that hold a credential. Every cloud engine's `sessionTokenField`
 * (engine/capabilities.ts) must be here — secret-fields.test.ts checks.
 */
export const SHARED_SECRET_FIELDS = [
  'sessionFalApiKey',
  'sessionReplicateApiToken',
  'sessionOpenaiApiKey',
  'sessionGeminiApiKey',
  'sessionGrokApiKey',
  'sessionRunwayApiKey',
  'sessionLumaApiKey',
  'sessionLlmApiKey',
] as const satisfies ReadonlyArray<keyof SharedToolSettings>;

type WithShared = { shared?: object | null };

/** Shared settings with no credential fields (same object when it has none). */
export function sharedWithoutSecrets<T extends object>(shared: T): T {
  if (!SHARED_SECRET_FIELDS.some(field => field in shared)) return shared;
  const rest = { ...shared } as Record<string, unknown>;
  for (const field of SHARED_SECRET_FIELDS) delete rest[field];
  return rest as T;
}

/** Incoming shared settings with this browser's credentials, not the copy's. */
export function sharedWithLocalSecrets<T extends object>(
  incoming: T,
  local: object | null | undefined
): T {
  const out = sharedWithoutSecrets(incoming) as Record<string, unknown>;
  const mine = (local ?? {}) as Record<string, unknown>;
  const kept = SHARED_SECRET_FIELDS.filter(
    field => typeof mine[field] === 'string' && (mine[field] as string).trim()
  );
  if (!kept.length) return out as T;
  const next = out === (incoming as unknown) ? { ...out } : out;
  for (const field of kept) next[field] = mine[field];
  return next as T;
}

/** A settings cache as it may leave the browser. */
export function settingsWithoutSecrets<T extends WithShared>(cache: T): T {
  if (!cache?.shared) return cache;
  const shared = sharedWithoutSecrets(cache.shared);
  return shared === cache.shared ? cache : { ...cache, shared };
}

/** A settings cache from elsewhere, with this browser's credentials. */
export function settingsWithLocalSecrets<T extends WithShared>(
  incoming: T,
  local: WithShared | null | undefined
): T {
  if (!incoming?.shared) return incoming;
  return { ...incoming, shared: sharedWithLocalSecrets(incoming.shared, local?.shared) };
}

/** Webhook settings as they may leave the browser. */
export function webhookWithoutSecret<T extends Partial<WebhookSettings>>(settings: T): T {
  if (!settings || !('secret' in settings)) return settings;
  const { secret: _secret, ...rest } = settings;
  return rest as T;
}

/** Webhook settings from elsewhere, with this browser's signing secret. */
export function webhookWithLocalSecret<T extends Partial<WebhookSettings>>(
  incoming: T,
  local: Partial<WebhookSettings> | null | undefined
): T {
  const out = webhookWithoutSecret(incoming);
  const secret = local?.secret?.trim();
  return secret ? { ...out, secret } : out;
}

/** studio-extras as it may leave the browser (its webhook settings carry the secret). */
export function extrasWithoutSecrets<T extends object>(extras: T): T {
  const webhook = (extras as { webhookSettings?: Partial<WebhookSettings> }).webhookSettings;
  if (!webhook || !('secret' in webhook)) return extras;
  return { ...extras, webhookSettings: webhookWithoutSecret(webhook) };
}
