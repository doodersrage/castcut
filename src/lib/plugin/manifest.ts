/**
 * Plugin runtime manifests — JSON imported via Settings / Plugins page.
 * Bookmarks stay in tool-plugin-registry; this is the installable runtime schema.
 */

import type { AppNavGroup, AppNavLink } from '../app/nav-catalog';
import { APP_NAV_GROUPS, mergePluginLinksIntoNav } from '../app/nav-catalog';
import {
  isNsfwGeneratorPlugin,
  shouldExposeNsfwGeneratorPlugin,
} from '../adult/nsfw-generator-plugin';
import { loadSettingsCache, saveSettingsCache } from '../settings/cache';

export type PluginManifestNavLink = {
  href: string;
  label: string;
  description: string;
};

export type PluginQueueHookPrivilege = 'rewrite-prompt' | 'rewrite-workflow' | 'rewrite-params';

export type PluginManifestQueueHooks = {
  url: string;
  /** Event names this hook handles (e.g. "queue-preflight", "queue-post"). */
  events: string[];
  /** Server-side rewrite allowlist (ignored for browser-only manual hooks). */
  privileges?: PluginQueueHookPrivilege[];
};

export type PluginManifestTool = {
  id: string;
  title: string;
  iframeUrl?: string;
  route?: string;
};

export type PluginManifestPresetProvider = {
  kind: 'nsfw-generator' | 'scene-starter';
  /** Relative app route or absolute URL returning preset JSON. */
  catalogUrl: string;
};

export type PluginManifest = {
  id: string;
  label: string;
  version: string;
  enabled?: boolean;
  nav?: PluginManifestNavLink[];
  queueHooks?: PluginManifestQueueHooks;
  tools?: PluginManifestTool[];
  /** Optional remote preset catalog merged into search / preset pickers. */
  presetProvider?: PluginManifestPresetProvider;
};

/** Client Dexie install cap (server registry has its own MAX_SERVER_PLUGINS). */
export const MAX_INSTALLED_PLUGINS = 48;

const QUEUE_HOOK_PRIVILEGES = new Set<PluginQueueHookPrivilege>([
  'rewrite-prompt',
  'rewrite-workflow',
  'rewrite-params',
]);

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNavLink(value: unknown): PluginManifestNavLink | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const href = asTrimmedString(raw.href);
  const label = asTrimmedString(raw.label);
  if (!href || !label) {
    return null;
  }
  if (!href.startsWith('/')) {
    return null;
  }
  return {
    href,
    label,
    description: asTrimmedString(raw.description) || label,
  };
}

function normalizeQueueHooks(value: unknown): PluginManifestQueueHooks | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const url = asTrimmedString(raw.url);
  if (!url) {
    return undefined;
  }
  if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) {
    return undefined;
  }
  const eventsRaw = raw.events;
  let events: string[] = [];
  if (Array.isArray(eventsRaw)) {
    events = eventsRaw
      .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  } else if (typeof eventsRaw === 'string' && eventsRaw.trim()) {
    events = [eventsRaw.trim()];
  }
  if (events.length === 0) {
    events = ['queue-preflight'];
  }
  const privilegesRaw = raw.privileges;
  const privileges = Array.isArray(privilegesRaw)
    ? [
        ...new Set(
          privilegesRaw
            .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
            .filter((entry): entry is PluginQueueHookPrivilege =>
              QUEUE_HOOK_PRIVILEGES.has(entry as PluginQueueHookPrivilege)
            )
        ),
      ]
    : undefined;
  return {
    url,
    events,
    ...(privileges && privileges.length > 0 ? { privileges } : {}),
  };
}

function normalizeTool(value: unknown): PluginManifestTool | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = asTrimmedString(raw.id)?.toLowerCase().replace(/\s+/g, '-');
  const title = asTrimmedString(raw.title);
  if (!id || !title) {
    return null;
  }
  const iframeUrl = asTrimmedString(raw.iframeUrl) ?? undefined;
  const route = asTrimmedString(raw.route) ?? undefined;
  if (iframeUrl && !/^https?:\/\//i.test(iframeUrl) && !iframeUrl.startsWith('/')) {
    return null;
  }
  if (route && !route.startsWith('/')) {
    return null;
  }
  return {
    id,
    title,
    ...(iframeUrl ? { iframeUrl } : {}),
    ...(route ? { route } : {}),
  };
}

function normalizePresetProvider(value: unknown): PluginManifestPresetProvider | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const catalogUrl = asTrimmedString(raw.catalogUrl);
  const kindRaw = asTrimmedString(raw.kind);
  const kind =
    kindRaw === 'scene-starter' || kindRaw === 'nsfw-generator' ? kindRaw : 'nsfw-generator';
  if (!catalogUrl) {
    return undefined;
  }
  if (!catalogUrl.startsWith('/') && !/^https?:\/\//i.test(catalogUrl)) {
    return undefined;
  }
  return { kind, catalogUrl };
}

/**
 * Validate + normalize a raw JSON manifest. Returns null when required fields
 * are missing or invalid.
 */
export function normalizePluginManifest(input: unknown): PluginManifest | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const id = asTrimmedString(raw.id)?.toLowerCase().replace(/\s+/g, '-');
  const label = asTrimmedString(raw.label);
  const version = asTrimmedString(raw.version);
  if (!id || !label || !version) {
    return null;
  }

  const nav = Array.isArray(raw.nav)
    ? raw.nav
        .map(normalizeNavLink)
        .filter((entry): entry is PluginManifestNavLink => Boolean(entry))
    : undefined;
  const tools = Array.isArray(raw.tools)
    ? raw.tools.map(normalizeTool).filter((entry): entry is PluginManifestTool => Boolean(entry))
    : undefined;
  const queueHooks = normalizeQueueHooks(raw.queueHooks);
  const presetProvider = normalizePresetProvider(raw.presetProvider);

  return {
    id,
    label,
    version,
    enabled: raw.enabled !== false,
    ...(nav && nav.length > 0 ? { nav } : {}),
    ...(queueHooks ? { queueHooks } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(presetProvider ? { presetProvider } : {}),
  };
}

export function normalizeInstalledPlugins(input: unknown): PluginManifest[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const next: PluginManifest[] = [];
  for (const entry of input) {
    const normalized = normalizePluginManifest(entry);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }
    seen.add(normalized.id);
    next.push(normalized);
    if (next.length >= MAX_INSTALLED_PLUGINS) {
      break;
    }
  }
  return next;
}

export const PLUGIN_MANIFEST_UPDATED_EVENT = 'plugin-manifest-updated';

export function loadInstalledPlugins(): PluginManifest[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return normalizeInstalledPlugins(loadSettingsCache().installedPlugins);
  } catch {
    return [];
  }
}

export function saveInstalledPlugins(plugins: PluginManifest[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  const cache = loadSettingsCache();
  saveSettingsCache({
    ...cache,
    installedPlugins: normalizeInstalledPlugins(plugins).slice(0, MAX_INSTALLED_PLUGINS),
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PLUGIN_MANIFEST_UPDATED_EVENT));
  }
}

export function upsertInstalledPlugin(manifest: PluginManifest): PluginManifest[] {
  const normalized = normalizePluginManifest(manifest);
  if (!normalized) {
    throw new Error('Invalid plugin manifest.');
  }
  const existing = loadInstalledPlugins().filter(entry => entry.id !== normalized.id);
  const next = [...existing, normalized].slice(0, MAX_INSTALLED_PLUGINS);
  saveInstalledPlugins(next);
  return next;
}

export function setInstalledPluginEnabled(id: string, enabled: boolean): PluginManifest[] {
  const key = id.trim().toLowerCase();
  const next = loadInstalledPlugins().map(entry =>
    entry.id === key ? { ...entry, enabled } : entry
  );
  saveInstalledPlugins(next);
  return next;
}

export function removeInstalledPlugin(id: string): PluginManifest[] {
  const key = id.trim().toLowerCase();
  const next = loadInstalledPlugins().filter(entry => entry.id !== key);
  saveInstalledPlugins(next);
  return next;
}

export function getInstalledPlugin(id: string): PluginManifest | null {
  const key = id.trim().toLowerCase();
  return loadInstalledPlugins().find(entry => entry.id === key) ?? null;
}

/** Nav links contributed by enabled installed plugins. */
export function navLinksFromInstalledPlugins(
  plugins: PluginManifest[] = loadInstalledPlugins()
): AppNavLink[] {
  const links: AppNavLink[] = [];
  const seen = new Set<string>();

  const push = (link: AppNavLink) => {
    const path = link.href.split('?')[0] ?? link.href;
    if (seen.has(path)) {
      return;
    }
    seen.add(path);
    links.push(link);
  };

  for (const plugin of plugins) {
    if (plugin.enabled === false) {
      continue;
    }
    if (isNsfwGeneratorPlugin(plugin) && !shouldExposeNsfwGeneratorPlugin()) {
      continue;
    }
    if (plugin.nav?.length) {
      for (const entry of plugin.nav) {
        push(entry);
      }
    }
    if (plugin.tools?.length) {
      for (const tool of plugin.tools) {
        if (tool.route) {
          push({
            href: tool.route,
            label: tool.title,
            description: `${plugin.label} · v${plugin.version}`,
          });
        } else if (tool.iframeUrl) {
          push({
            href: `/plugins/${plugin.id}`,
            label: tool.title,
            description: `${plugin.label} · v${plugin.version}`,
          });
        }
      }
    }
    if (!plugin.nav?.length && !plugin.tools?.some(tool => tool.route || tool.iframeUrl)) {
      push({
        href: `/plugins/${plugin.id}`,
        label: plugin.label,
        description: `Plugin v${plugin.version}`,
      });
    }
  }

  return links;
}

/** Merge installed plugin nav into the Tools group (or a Plugins group fallback). */
export function appNavGroupsWithInstalledPlugins(
  plugins: PluginManifest[] = loadInstalledPlugins(),
  groups: AppNavGroup[] = APP_NAV_GROUPS
): AppNavGroup[] {
  return mergePluginLinksIntoNav(groups, navLinksFromInstalledPlugins(plugins));
}

export function primaryToolForPlugin(plugin: PluginManifest): PluginManifestTool | null {
  if (!plugin.tools?.length) {
    return null;
  }
  return (
    plugin.tools.find(tool => tool.iframeUrl) ??
    plugin.tools.find(tool => tool.route) ??
    plugin.tools[0] ??
    null
  );
}

/** Installed plugins that expose a remote preset catalog URL. */
export function presetProvidersFromInstalledPlugins(
  plugins: PluginManifest[] = loadInstalledPlugins()
): PluginManifestPresetProvider[] {
  return plugins
    .filter(plugin => plugin.enabled !== false && plugin.presetProvider?.catalogUrl)
    .map(plugin => plugin.presetProvider!)
    .slice(0, 16);
}
