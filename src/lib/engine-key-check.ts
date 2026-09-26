/**
 * "Check key" for hosted engines: one lightweight authenticated request per provider (list
 * models / read the account), read as works / rejected / couldn't tell. Server-only fetch.
 */

import {
  CLOUD_ENGINE_OPTIONS,
  FAL_QUEUE_HOST,
  GEMINI_API_HOST,
  GROK_API_HOST,
  LUMA_API_HOST,
  OPENAI_API_HOST,
  REPLICATE_API_HOST,
  RUNWAY_API_HOST,
} from './engine/capabilities';

export type KeyCheckEngine = 'fal' | 'replicate' | 'openai' | 'gemini' | 'grok' | 'runway' | 'luma';
export const KEY_CHECK_ENGINES: readonly KeyCheckEngine[] = [
  'fal',
  'replicate',
  'openai',
  'gemini',
  'grok',
  'runway',
  'luma',
];

export type KeyCheckResult = {
  /** true = the provider accepted the key; false = rejected; null = couldn't tell. */
  ok: boolean | null;
  message: string;
};

/** The request that proves a key without spending anything. */
export function keyCheckRequest(
  engine: KeyCheckEngine,
  key: string
): { url: string; headers: Record<string, string> } {
  const bearer = { Authorization: `Bearer ${key}` };
  switch (engine) {
    case 'fal':
      // Status of a request id that can't exist: a good key gets 404, a bad one 401 / 403.
      return {
        url: `${FAL_QUEUE_HOST}/fal-ai/flux/requests/00000000-0000-0000-0000-000000000000/status`,
        headers: { Authorization: `Key ${key}` },
      };
    case 'replicate':
      return { url: `${REPLICATE_API_HOST}/v1/account`, headers: bearer };
    case 'openai':
      return { url: `${OPENAI_API_HOST}/v1/models`, headers: bearer };
    case 'gemini':
      return {
        url: `${GEMINI_API_HOST}/v1beta/models?pageSize=1`,
        headers: { 'x-goog-api-key': key },
      };
    case 'grok':
      return { url: `${GROK_API_HOST}/v1/models`, headers: bearer };
    case 'runway':
      return {
        url: `${RUNWAY_API_HOST}/v1/organization`,
        headers: { ...bearer, 'X-Runway-Version': '2024-11-06' },
      };
    case 'luma':
      return { url: `${LUMA_API_HOST}/dream-machine/v1/generations?limit=1`, headers: bearer };
  }
}

/** Read the provider's answer. Only 401 / 403 (and Gemini's 400 "API key not valid") mean rejected. */
export function interpretKeyCheck(
  engine: KeyCheckEngine,
  status: number,
  body = ''
): KeyCheckResult {
  const invalidGemini = engine === 'gemini' && status === 400 && /api key not valid/i.test(body);
  if (status === 401 || status === 403 || invalidGemini) {
    return { ok: false, message: `The provider rejected this key (HTTP ${status}).` };
  }
  if (status >= 200 && status < 300) return { ok: true, message: 'Key works.' };
  if (engine === 'fal' && (status === 404 || status === 400 || status === 422)) {
    return { ok: true, message: 'Key works.' };
  }
  if (status === 429)
    return { ok: true, message: 'Key works (the provider is rate-limiting right now).' };
  if (status === 402) return { ok: true, message: 'Key works, but the account needs credit.' };
  return {
    ok: null,
    message: `Couldn't tell — the provider answered HTTP ${status}. Try again shortly.`,
  };
}

/** The key to check: the one typed in Settings, else the server's env key. */
export function resolveKeyToCheck(
  engine: KeyCheckEngine,
  typed?: string | null
): {
  key: string;
  source: 'settings' | 'server' | null;
} {
  const fromSettings = typed?.trim();
  if (fromSettings) return { key: fromSettings, source: 'settings' };
  const option = CLOUD_ENGINE_OPTIONS.find(entry => entry.id === engine);
  for (const name of option?.envTokenKeys ?? []) {
    const value = process.env[name]?.trim();
    if (value) return { key: value, source: 'server' };
  }
  return { key: '', source: null };
}

export async function checkEngineKey(
  engine: KeyCheckEngine,
  typed?: string | null
): Promise<KeyCheckResult & { source: 'settings' | 'server' | null }> {
  const { key, source } = resolveKeyToCheck(engine, typed);
  if (!key) return { ok: false, message: 'No key set here or on the server.', source };
  const request = keyCheckRequest(engine, key);
  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(8_000),
      redirect: 'manual',
    });
    const body = await response.text().catch(() => '');
    return { ...interpretKeyCheck(engine, response.status, body.slice(0, 2_000)), source };
  } catch (error) {
    return {
      ok: null,
      message: `Couldn't reach the provider (${error instanceof Error ? error.message : 'network error'}).`,
      source,
    };
  }
}
