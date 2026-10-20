/**
 * Server plugin registry under PROMPT_DATA_DIR/plugins.
 * Installable via ZIP or URL; optional HMAC verification via PROMPT_PLUGIN_HMAC_SECRET.
 * Client bookmarks (tool-plugin-registry) stay separate.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizePluginManifest,
  type PluginManifest,
  type PluginManifestQueueHooks,
} from './manifest';
import { extractPluginZip, pickPluginManifestFromZip } from './zip';
import { isServerStorageEnabled } from '../storage/server-storage';
import { assertSafeHttpUrl } from '../server/url-safety';

export const MAX_SERVER_PLUGINS = 32;
export const MAX_PLUGIN_ZIP_BYTES = 8 * 1024 * 1024;

export type ServerPluginPrivilege = 'rewrite-prompt' | 'rewrite-workflow' | 'rewrite-params';

export type ServerPluginRecord = PluginManifest & {
  /** Absolute path to the plugin directory under PROMPT_DATA_DIR/plugins. */
  installPath: string;
  installedAt: string;
  sourceUrl?: string;
  /** Privileged rewrite allowlist for server-side queue hooks. */
  privileges: ServerPluginPrivilege[];
};

const PRIVILEGE_SET = new Set<ServerPluginPrivilege>([
  'rewrite-prompt',
  'rewrite-workflow',
  'rewrite-params',
]);

function dataDir(): string {
  const dir = process.env.PROMPT_DATA_DIR?.trim();
  if (!dir) {
    throw new Error('PROMPT_DATA_DIR is not configured.');
  }
  const resolved = path.resolve(/* turbopackIgnore: true */ dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function serverPluginsRoot(): string {
  const root = path.join(dataDir(), 'plugins');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function isServerPluginRegistryEnabled(): boolean {
  return isServerStorageEnabled();
}

export function getPluginHmacSecret(): string | null {
  const secret = process.env.PROMPT_PLUGIN_HMAC_SECRET?.trim();
  return secret || null;
}

export function signPluginPayload(
  payload: Buffer | string,
  secret = getPluginHmacSecret()
): string {
  if (!secret) {
    throw new Error('PROMPT_PLUGIN_HMAC_SECRET is not set.');
  }
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * When PROMPT_PLUGIN_HMAC_SECRET is set, installs must present a matching
 * `X-Prompt-Plugin-Signature` (hex HMAC-SHA256 of the raw body / file bytes).
 * When unset, signature checks are skipped.
 */
export function verifyPluginInstallSignature(
  payload: Buffer | string,
  signatureHeader: string | null | undefined
): { ok: true } | { ok: false; error: string } {
  const secret = getPluginHmacSecret();
  if (!secret) {
    return { ok: true };
  }
  const provided = signatureHeader?.trim().toLowerCase() ?? '';
  if (!/^[0-9a-f]{64}$/.test(provided)) {
    return { ok: false, error: 'Missing or invalid X-Prompt-Plugin-Signature (hex HMAC-SHA256).' };
  }
  const expected = signPluginPayload(payload, secret);
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, error: 'Plugin install signature mismatch.' };
  }
  return { ok: true };
}

function normalizePrivileges(
  raw: unknown,
  hooks?: PluginManifestQueueHooks
): ServerPluginPrivilege[] {
  const fromArray = Array.isArray(raw)
    ? raw
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry): entry is ServerPluginPrivilege =>
          PRIVILEGE_SET.has(entry as ServerPluginPrivilege)
        )
    : [];
  if (fromArray.length > 0) {
    return [...new Set(fromArray)];
  }
  const hookPriv = (hooks as { privileges?: unknown } | undefined)?.privileges;
  if (Array.isArray(hookPriv)) {
    return [
      ...new Set(
        hookPriv
          .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry): entry is ServerPluginPrivilege =>
            PRIVILEGE_SET.has(entry as ServerPluginPrivilege)
          )
      ),
    ];
  }
  // Default: server plugins with queue hooks may rewrite prompts/params only.
  return hooks?.url ? ['rewrite-prompt', 'rewrite-params'] : [];
}

function safePluginDirName(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

function readManifestFile(dir: string): ServerPluginRecord | null {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    const manifest = normalizePluginManifest(raw);
    if (!manifest) {
      return null;
    }
    const meta =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const installedAt =
      typeof meta.installedAt === 'string' && meta.installedAt.trim()
        ? meta.installedAt.trim()
        : new Date(0).toISOString();
    const sourceUrl =
      typeof meta.sourceUrl === 'string' && meta.sourceUrl.trim()
        ? meta.sourceUrl.trim()
        : undefined;
    return {
      ...manifest,
      installPath: dir,
      installedAt,
      ...(sourceUrl ? { sourceUrl } : {}),
      privileges: normalizePrivileges(
        meta.privileges ?? meta.serverPrivileges,
        manifest.queueHooks
      ),
    };
  } catch {
    return null;
  }
}

export function listServerPlugins(): ServerPluginRecord[] {
  if (!isServerPluginRegistryEnabled()) {
    return [];
  }
  const root = serverPluginsRoot();
  const names = fs.readdirSync(root, { withFileTypes: true });
  const plugins: ServerPluginRecord[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) {
      continue;
    }
    const record = readManifestFile(path.join(root, entry.name));
    if (record) {
      plugins.push(record);
    }
    if (plugins.length >= MAX_SERVER_PLUGINS) {
      break;
    }
  }
  return plugins.sort((a, b) => a.id.localeCompare(b.id));
}

export function getServerPlugin(id: string): ServerPluginRecord | null {
  const key = id.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return listServerPlugins().find(plugin => plugin.id === key) ?? null;
}

function writePluginDirectory(
  manifest: PluginManifest,
  files: Array<{ path: string; data: Buffer }>,
  meta: { sourceUrl?: string; privileges?: ServerPluginPrivilege[] }
): ServerPluginRecord {
  if (!isServerPluginRegistryEnabled()) {
    throw new Error('Server plugin registry requires PROMPT_DATA_DIR.');
  }
  const existing = listServerPlugins();
  const replacing = existing.some(plugin => plugin.id === manifest.id);
  if (!replacing && existing.length >= MAX_SERVER_PLUGINS) {
    throw new Error(`At most ${MAX_SERVER_PLUGINS} server plugins can be installed.`);
  }

  const dirName = safePluginDirName(manifest.id);
  const installPath = path.join(serverPluginsRoot(), dirName);
  fs.rmSync(installPath, { recursive: true, force: true });
  fs.mkdirSync(installPath, { recursive: true });

  const privileges =
    meta.privileges && meta.privileges.length > 0
      ? meta.privileges
      : normalizePrivileges(undefined, manifest.queueHooks);

  const installedAt = new Date().toISOString();
  const persisted = {
    ...manifest,
    privileges,
    installedAt,
    ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}),
  };

  // Always write normalized manifest.json last so it wins over a ZIP copy.
  for (const file of files) {
    if (!file.path || file.path === 'manifest.json') {
      continue;
    }
    if (file.path.includes('..') || path.isAbsolute(file.path)) {
      continue;
    }
    const target = path.join(installPath, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.data);
  }
  fs.writeFileSync(
    path.join(installPath, 'manifest.json'),
    JSON.stringify(persisted, null, 2),
    'utf8'
  );

  return {
    ...manifest,
    installPath,
    installedAt,
    ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}),
    privileges,
  };
}

export function installServerPluginFromManifest(
  input: unknown,
  options?: { sourceUrl?: string; privileges?: ServerPluginPrivilege[] }
): ServerPluginRecord {
  const manifest = normalizePluginManifest(input);
  if (!manifest) {
    throw new Error('Invalid plugin manifest.');
  }
  return writePluginDirectory(manifest, [], {
    sourceUrl: options?.sourceUrl,
    privileges: options?.privileges,
  });
}

export function installServerPluginFromZip(
  zipBytes: Buffer,
  options?: { sourceUrl?: string }
): ServerPluginRecord {
  if (zipBytes.length > MAX_PLUGIN_ZIP_BYTES) {
    throw new Error(`Plugin ZIP exceeds ${MAX_PLUGIN_ZIP_BYTES} byte limit.`);
  }
  const extracted = extractPluginZip(zipBytes);
  const picked = pickPluginManifestFromZip(extracted);
  let parsed: unknown;
  try {
    parsed = JSON.parse(picked.manifestRaw) as unknown;
  } catch {
    throw new Error('manifest.json is not valid JSON.');
  }
  const manifest = normalizePluginManifest(parsed);
  if (!manifest) {
    throw new Error('Invalid plugin manifest in ZIP.');
  }
  const privileges = normalizePrivileges(
    parsed && typeof parsed === 'object'
      ? ((parsed as Record<string, unknown>).privileges ??
          (parsed as Record<string, unknown>).serverPrivileges)
      : undefined,
    manifest.queueHooks
  );
  return writePluginDirectory(manifest, picked.files, {
    sourceUrl: options?.sourceUrl,
    privileges,
  });
}

export async function installServerPluginFromUrl(url: string): Promise<ServerPluginRecord> {
  const parsed = assertSafeHttpUrl(url, { allowPrivate: true });
  const response = await fetch(parsed.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json, application/zip, application/octet-stream, */*' },
  });
  if (!response.ok) {
    throw new Error(`Failed to download plugin: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PLUGIN_ZIP_BYTES) {
    throw new Error(`Plugin download exceeds ${MAX_PLUGIN_ZIP_BYTES} byte limit.`);
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const looksZip =
    contentType.includes('zip') ||
    contentType.includes('octet-stream') ||
    parsed.pathname.toLowerCase().endsWith('.zip') ||
    bytes.subarray(0, 2).toString('utf8') === 'PK';

  if (looksZip && bytes.subarray(0, 2).toString('utf8') === 'PK') {
    return installServerPluginFromZip(bytes, { sourceUrl: parsed.toString() });
  }

  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('URL did not return a ZIP or JSON plugin manifest.');
  }
  return installServerPluginFromManifest(json, { sourceUrl: parsed.toString() });
}

export function removeServerPlugin(id: string): boolean {
  const plugin = getServerPlugin(id);
  if (!plugin) {
    return false;
  }
  fs.rmSync(plugin.installPath, { recursive: true, force: true });
  return true;
}

export function setServerPluginEnabled(id: string, enabled: boolean): ServerPluginRecord | null {
  const plugin = getServerPlugin(id);
  if (!plugin) {
    return null;
  }
  const next: PluginManifest = { ...plugin, enabled };
  return writePluginDirectory(next, [], {
    sourceUrl: plugin.sourceUrl,
    privileges: plugin.privileges,
  });
}

/** Enabled server plugins that register a queue hook for the given event. */
export function listServerPluginHooksForEvent(event: string): Array<{
  id: string;
  label: string;
  url: string;
  privileges: ServerPluginPrivilege[];
}> {
  return listServerPlugins()
    .filter(plugin => plugin.enabled !== false && plugin.queueHooks?.url)
    .filter(plugin => {
      const events = plugin.queueHooks?.events ?? ['queue-preflight'];
      return events.includes(event);
    })
    .map(plugin => ({
      id: `server:${plugin.id}:${event}`,
      label: plugin.label,
      url: plugin.queueHooks!.url,
      privileges: plugin.privileges,
    }));
}

/** Strip server-only fields for UI sync payloads. */
export function toClientPluginManifest(plugin: ServerPluginRecord): PluginManifest & {
  source: 'server';
  privileges: ServerPluginPrivilege[];
  installedAt: string;
  sourceUrl?: string;
} {
  return {
    id: plugin.id,
    label: plugin.label,
    version: plugin.version,
    enabled: plugin.enabled,
    ...(plugin.nav ? { nav: plugin.nav } : {}),
    ...(plugin.queueHooks ? { queueHooks: plugin.queueHooks } : {}),
    ...(plugin.tools ? { tools: plugin.tools } : {}),
    ...(plugin.presetProvider ? { presetProvider: plugin.presetProvider } : {}),
    source: 'server',
    privileges: plugin.privileges,
    installedAt: plugin.installedAt,
    ...(plugin.sourceUrl ? { sourceUrl: plugin.sourceUrl } : {}),
  };
}
