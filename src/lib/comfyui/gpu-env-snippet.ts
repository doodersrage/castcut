/**
 * Operator clipboard helper for adding a second ComfyUI box.
 * Builds .env.local lines only — it never writes allowlists from the browser.
 */

export type NewGpuEnvSnippetInput = {
  newUrl: string;
  existingPoolUrls?: readonly string[];
  existingAllowedHosts?: readonly string[];
};

export type NewGpuEnvSnippet = {
  snippet: string;
  hostname: string;
  normalizedUrl: string;
};

export function parseComfyGpuUrl(raw: string): { url: string; hostname: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return {
      url: parsed.toString().replace(/\/+$/, ''),
      hostname: parsed.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function uniquePreserve(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

export function parseAllowedHostsField(value: string | undefined): string[] {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('any (')) {
    return [];
  }
  return uniquePreserve(trimmed.split(/[\s,]+/));
}

export function buildNewGpuEnvSnippet(
  input: NewGpuEnvSnippetInput
): NewGpuEnvSnippet | { error: string } {
  const parsed = parseComfyGpuUrl(input.newUrl);
  if (!parsed) {
    return { error: 'Enter a valid http(s) ComfyUI URL.' };
  }

  const poolUrls = uniquePreserve([
    ...(input.existingPoolUrls ?? [])
      .map(entry => parseComfyGpuUrl(entry)?.url)
      .filter((entry): entry is string => Boolean(entry)),
    parsed.url,
  ]);

  const hosts = uniquePreserve([
    ...(input.existingAllowedHosts ?? []).map(entry => entry.trim().toLowerCase()),
    ...poolUrls
      .map(url => parseComfyGpuUrl(url)?.hostname)
      .filter((entry): entry is string => Boolean(entry)),
  ]);

  const snippet = [
    '# New ComfyUI host — paste into .env.local and restart the server.',
    '# Queue and /api/comfyui/probe still require this hostname on COMFYUI_ALLOWED_HOSTS',
    '# when that list is set. Settings extras cannot change the allowlist.',
    `COMFYUI_POOL=${poolUrls.join(',')}`,
    `COMFYUI_ALLOWED_HOSTS=${hosts.join(',')}`,
  ].join('\n');

  return {
    snippet,
    hostname: parsed.hostname,
    normalizedUrl: parsed.url,
  };
}
