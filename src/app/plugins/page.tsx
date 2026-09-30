'use client';

import { useEffect, useRef, useState } from 'react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldLabel, MonoTextArea, SelectInput, TextInput } from '@/components/ui/Field';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  BUILTIN_TOOL_PLUGINS,
  loadToolPlugins,
  saveCustomToolPlugins,
  type ToolPlugin,
} from '@/lib/tool-plugin-registry';
import {
  loadPluginQueueHooks,
  savePluginQueueHooks,
  type PluginQueueHook,
} from '@/lib/plugin-queue-hooks';
import {
  loadInstalledPlugins,
  normalizePluginManifest,
  removeInstalledPlugin,
  setInstalledPluginEnabled,
  upsertInstalledPlugin,
  type PluginManifest,
} from '@/lib/plugin-manifest';
import {
  loadPluginOriginAllowlist,
  savePluginOriginAllowlist,
} from '@/lib/plugin-origin-allowlist';
import queueRewriteExample from '../../../examples/queue-rewrite-plugin.json';
import { settingsTabHref } from '@/lib/settings-nav';

const EMPTY_FORM = {
  id: '',
  label: '',
  description: '',
  href: '',
  category: 'plugin' as ToolPlugin['category'],
};

const EMPTY_HOOK = {
  id: '',
  label: '',
  url: '',
};

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<ToolPlugin[]>(BUILTIN_TOOL_PLUGINS);
  const [customJson, setCustomJson] = useState('[]');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<PluginQueueHook[]>([]);
  const [hookForm, setHookForm] = useState(EMPTY_HOOK);
  const [hookError, setHookError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<PluginManifest[]>([]);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestStatus, setManifestStatus] = useState<string | null>(null);
  const [originAllowlistText, setOriginAllowlistText] = useState('');
  const [originStatus, setOriginStatus] = useState<string | null>(null);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [serverHmacRequired, setServerHmacRequired] = useState(false);
  const [serverPlugins, setServerPlugins] = useState<
    Array<PluginManifest & { source?: string; privileges?: string[]; installedAt?: string }>
  >([]);
  const [serverUrl, setServerUrl] = useState('');
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [serverOpenHref, setServerOpenHref] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pageOrigin] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : '—'
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const serverZipRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refreshFromStorage();
      void refreshServerPlugins();
    });
  }, []);

  async function refreshServerPlugins() {
    try {
      const response = await fetch('/api/plugins/server', { credentials: 'include' });
      if (!response.ok) {
        setServerEnabled(false);
        setServerPlugins([]);
        return [];
      }
      const data = (await response.json()) as {
        enabled?: boolean;
        hmacRequired?: boolean;
        plugins?: Array<
          PluginManifest & { source?: string; privileges?: string[]; installedAt?: string }
        >;
      };
      setServerEnabled(data.enabled === true);
      setServerHmacRequired(data.hmacRequired === true);
      const list = Array.isArray(data.plugins) ? data.plugins : [];
      setServerPlugins(list);
      return list;
    } catch {
      setServerEnabled(false);
      setServerPlugins([]);
      return [];
    }
  }

  function syncServerPluginsToClient(
    list: Array<PluginManifest & { source?: string; privileges?: string[]; installedAt?: string }>
  ) {
    for (const entry of list) {
      const normalized = normalizePluginManifest(entry);
      if (!normalized) {
        continue;
      }
      upsertInstalledPlugin(normalized);
    }
    refreshFromStorage();
  }

  function refreshFromStorage() {
    const loaded = loadToolPlugins();
    setPlugins(loaded);
    const custom = loaded.filter(
      plugin => !BUILTIN_TOOL_PLUGINS.some(builtIn => builtIn.id === plugin.id)
    );
    setCustomJson(JSON.stringify(custom, null, 2));
    setHooks(loadPluginQueueHooks());
    setInstalled(loadInstalledPlugins());
    setOriginAllowlistText(loadPluginOriginAllowlist().join('\n'));
  }

  function saveCustom() {
    try {
      const parsed = JSON.parse(customJson) as ToolPlugin[];
      saveCustomToolPlugins(parsed);
      refreshFromStorage();
      setFormError(null);
    } catch {
      setFormError('Invalid plugin JSON.');
    }
  }

  function addFromForm() {
    const id = form.id.trim().toLowerCase().replace(/\s+/g, '-');
    const label = form.label.trim();
    const href = form.href.trim();
    if (!id || !label || !href) {
      setFormError('id, label, and href are required.');
      return;
    }
    if (!href.startsWith('/')) {
      setFormError('href should be an in-app path starting with /.');
      return;
    }
    const existing = loadToolPlugins().filter(
      plugin => !BUILTIN_TOOL_PLUGINS.some(builtIn => builtIn.id === plugin.id)
    );
    if (existing.some(plugin => plugin.id === id) || BUILTIN_TOOL_PLUGINS.some(p => p.id === id)) {
      setFormError('That id is already registered.');
      return;
    }
    const next: ToolPlugin[] = [
      ...existing,
      {
        id,
        label,
        description: form.description.trim() || 'Custom plugin bookmark',
        href,
        category: form.category,
        enabled: true,
      },
    ];
    saveCustomToolPlugins(next);
    setForm(EMPTY_FORM);
    setFormError(null);
    refreshFromStorage();
  }

  function addHook() {
    const id = hookForm.id.trim().toLowerCase().replace(/\s+/g, '-');
    const url = hookForm.url.trim();
    if (!id || !url) {
      setHookError('id and url are required.');
      return;
    }
    if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) {
      setHookError('url must be http(s) or a same-origin path.');
      return;
    }
    if (hooks.some(hook => hook.id === id)) {
      setHookError('That hook id already exists.');
      return;
    }
    const next = [
      ...hooks,
      {
        id,
        label: hookForm.label.trim() || id,
        url,
        enabled: true,
      },
    ];
    savePluginQueueHooks(next);
    setHooks(next);
    setHookForm(EMPTY_HOOK);
    setHookError(null);
  }

  function importManifestText(raw: string) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      let imported = 0;
      for (const candidate of candidates) {
        const normalized = normalizePluginManifest(candidate);
        if (!normalized) {
          continue;
        }
        upsertInstalledPlugin(normalized);
        imported += 1;
      }
      if (!imported) {
        setManifestError('No valid plugin manifests found in that JSON.');
        setManifestStatus(null);
        return;
      }
      setManifestError(null);
      setManifestStatus(
        imported === 1
          ? `Installed ${loadInstalledPlugins().at(-1)?.label ?? 'plugin'}.`
          : `Installed ${imported} plugins.`
      );
      refreshFromStorage();
    } catch {
      setManifestError('Invalid JSON — expected a plugin manifest object or array.');
      setManifestStatus(null);
    }
  }

  async function onManifestFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    importManifestText(text);
  }

  return (
    <ToolLayout
      accent="brand"
      badge={<ToolBadge accent="brand">More tools</ToolBadge>}
      title="Plugins"
      description="Runtime plugins add tools and queue hooks; bookmarks only add sidebar links."
    >
      <ToolSection
        title="Runtime plugins"
        description="Manifest JSON → nav entries, queue preflight hooks, and optional iframe tools at /plugins/[id]. Bookmarks never receive postMessage."
      >
        <p className="type-caption">
          See <code className="ui-inline-code">examples/queue-rewrite-plugin.json</code> and{' '}
          <code className="ui-inline-code">docs/plugin-iframe-host.md</code>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={event => {
              const file = event.target.files?.[0];
              void onManifestFile(file);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON manifest
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              importManifestText(JSON.stringify(queueRewriteExample));
            }}
          >
            Load denoise example
          </Button>
        </div>
        {manifestError ? (
          <p className="type-caption mt-2 text-[var(--tint-danger-text)]">{manifestError}</p>
        ) : null}
        {manifestStatus ? (
          <p className="type-caption mt-2 text-[var(--text-secondary)]">{manifestStatus}</p>
        ) : null}
        {installed.length === 0 ? (
          <p className="type-caption mt-4 text-[var(--text-muted)]">
            No runtime plugins installed yet.
          </p>
        ) : (
          <ul className="ui-list mt-4">
            {installed.map(plugin => (
              <li key={plugin.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{plugin.label}</p>
                  <p className="type-caption">
                    v{plugin.version}
                    {plugin.queueHooks?.url ? ` · hook ${plugin.queueHooks.url}` : ''}
                    {plugin.tools?.length ? ` · ${plugin.tools.length} tool(s)` : ''}
                  </p>
                  <p className="type-overline">
                    {plugin.enabled === false ? 'disabled' : 'enabled'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/plugins/${plugin.id}`} size="sm" variant="accent-outline">
                    Open
                  </ButtonLink>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setInstalled(setInstalledPluginEnabled(plugin.id, plugin.enabled === false));
                      setManifestStatus(
                        plugin.enabled === false
                          ? `Enabled ${plugin.label}.`
                          : `Disabled ${plugin.label}.`
                      );
                    }}
                  >
                    {plugin.enabled === false ? 'Enable' : 'Disable'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setInstalled(removeInstalledPlugin(plugin.id));
                      setManifestStatus(`Removed ${plugin.label}.`);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ToolSection>

      <ToolSection
        title="Server plugins"
        description="Privileged registry under PROMPT_DATA_DIR/plugins. Hooks run inside the Comfy queue path (not only browser fetch). Bookmarks stay separate."
      >
        {!serverEnabled ? (
          <p className="type-caption text-[var(--text-muted)]">
            Server plugins need <code className="ui-inline-code">PROMPT_DATA_DIR</code> on the host.
            See{' '}
            <a
              className="text-[var(--accent-text)] underline-offset-2 hover:underline"
              href={settingsTabHref('overview')}
            >
              Settings overview
            </a>{' '}
            for heal / path readiness. Optional{' '}
            <code className="ui-inline-code">PROMPT_PLUGIN_HMAC_SECRET</code> requires{' '}
            <code className="ui-inline-code">X-Prompt-Plugin-Signature</code> on installs.
          </p>
        ) : (
          <>
            <p className="type-caption">
              {serverHmacRequired
                ? 'HMAC signature required for installs.'
                : 'HMAC optional (PROMPT_PLUGIN_HMAC_SECRET unset).'}{' '}
              Auth on → admin required to install or remove.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-[16rem] flex-1 space-y-1.5">
                <FieldLabel>Install from URL</FieldLabel>
                <TextInput
                  value={serverUrl}
                  onChange={event => setServerUrl(event.target.value)}
                  placeholder="https://…/manifest.json or .zip"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  void (async () => {
                    setServerError(null);
                    setServerStatus(null);
                    setServerOpenHref(null);
                    try {
                      const response = await fetch('/api/plugins/server', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'install', url: serverUrl.trim() }),
                      });
                      const data = (await response.json()) as {
                        error?: string;
                        plugin?: PluginManifest;
                      };
                      if (!response.ok) {
                        setServerError(data.error || `HTTP ${response.status}`);
                        return;
                      }
                      setServerStatus(`Installed ${data.plugin?.label ?? 'plugin'} on server.`);
                      setServerUrl('');
                      const list = await refreshServerPlugins();
                      syncServerPluginsToClient(list);
                    } catch (error) {
                      setServerError(error instanceof Error ? error.message : 'Install failed.');
                    }
                  })();
                }}
              >
                Install URL
              </Button>
              <input
                ref={serverZipRef}
                type="file"
                accept=".zip,application/zip,.json,application/json"
                className="sr-only"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  void (async () => {
                    setServerError(null);
                    setServerStatus(null);
                    setServerOpenHref(null);
                    try {
                      const form = new FormData();
                      form.set('action', 'install');
                      form.set('file', file);
                      const response = await fetch('/api/plugins/server', {
                        method: 'POST',
                        credentials: 'include',
                        body: form,
                      });
                      const data = (await response.json()) as {
                        error?: string;
                        plugin?: PluginManifest;
                      };
                      if (!response.ok) {
                        setServerError(data.error || `HTTP ${response.status}`);
                        return;
                      }
                      setServerStatus(`Installed ${data.plugin?.label ?? file.name} on server.`);
                      const list = await refreshServerPlugins();
                      syncServerPluginsToClient(list);
                    } catch (error) {
                      setServerError(error instanceof Error ? error.message : 'Upload failed.');
                    }
                  })();
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => serverZipRef.current?.click()}
              >
                Upload ZIP/JSON
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void (async () => {
                    setServerError(null);
                    setServerStatus(null);
                    setServerOpenHref(null);
                    try {
                      const response = await fetch('/api/plugins/server', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'install',
                          manifest: queueRewriteExample,
                        }),
                      });
                      const data = (await response.json()) as {
                        error?: string;
                        plugin?: PluginManifest;
                      };
                      if (!response.ok) {
                        setServerError(data.error || `HTTP ${response.status}`);
                        return;
                      }
                      const list = await refreshServerPlugins();
                      syncServerPluginsToClient(list);
                      const installed =
                        data.plugin ?? list.find(entry => entry.id === 'queue-rewrite-denoise');
                      const enabled = installed?.enabled !== false;
                      setServerStatus(
                        enabled
                          ? `Installed ${installed?.label ?? 'denoise example'}.`
                          : `Installed ${installed?.label ?? 'denoise example'} (disabled).`
                      );
                      if (enabled) {
                        setServerOpenHref('/plugins/queue-rewrite-denoise');
                      }
                    } catch (error) {
                      setServerError(
                        error instanceof Error
                          ? error.message
                          : 'Could not install denoise example.'
                      );
                    }
                  })();
                }}
              >
                Install denoise example
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  syncServerPluginsToClient(serverPlugins);
                  setServerStatus(
                    serverPlugins.length
                      ? `Synced ${serverPlugins.length} server plugin(s) into local runtime list.`
                      : 'No server plugins to sync.'
                  );
                }}
              >
                Sync to UI
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void refreshServerPlugins();
                }}
              >
                Refresh
              </Button>
            </div>
            {serverError ? (
              <p className="type-caption mt-2 text-[var(--tint-danger-text)]">{serverError}</p>
            ) : null}
            {serverStatus ? (
              <p className="type-caption mt-2 flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                <span>{serverStatus}</span>
                {serverOpenHref ? (
                  <ButtonLink href={serverOpenHref} size="sm" variant="ghost">
                    Open
                  </ButtonLink>
                ) : null}
              </p>
            ) : null}
            {serverPlugins.length === 0 ? (
              <p className="type-caption mt-4 text-[var(--text-muted)]">
                No server plugins installed yet.
              </p>
            ) : (
              <ul className="ui-list mt-4">
                {serverPlugins.map(plugin => (
                  <li key={`server-${plugin.id}`} className="ui-list-row items-start">
                    <div className="ui-list-primary min-w-0 space-y-1">
                      <p className="type-heading">{plugin.label}</p>
                      <p className="type-caption">
                        v{plugin.version}
                        {plugin.queueHooks?.url ? ` · ${plugin.queueHooks.url}` : ''}
                        {plugin.privileges?.length ? ` · ${plugin.privileges.join(', ')}` : ''}
                      </p>
                      <p className="type-overline">
                        server · {plugin.enabled === false ? 'disabled' : 'enabled'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          void (async () => {
                            const response = await fetch('/api/plugins/server', {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: plugin.enabled === false ? 'enable' : 'disable',
                                id: plugin.id,
                              }),
                            });
                            if (response.ok) {
                              await refreshServerPlugins();
                            }
                          })();
                        }}
                      >
                        {plugin.enabled === false ? 'Enable' : 'Disable'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void (async () => {
                            const response = await fetch(
                              `/api/plugins/server?id=${encodeURIComponent(plugin.id)}`,
                              { method: 'DELETE', credentials: 'include' }
                            );
                            if (response.ok) {
                              setServerStatus(`Removed ${plugin.label} from server.`);
                              await refreshServerPlugins();
                            }
                          })();
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </ToolSection>

      <ToolSection title="Iframe origin allowlist">
        <p className="type-caption">
          Default-deny for remote posts: same-origin iframe tools always work; remote iframes must
          match their URL origin or an entry below. Add{' '}
          <code className="ui-inline-code">https://host</code> origins (one per line). Unresolvable
          / wildcard targets never accept messages unless listed here.
        </p>
        <p className="type-caption mt-2 text-[var(--text-secondary)]">
          This page origin: <code className="ui-inline-code">{pageOrigin}</code>
        </p>
        <MonoTextArea
          className="mt-3 min-h-28"
          value={originAllowlistText}
          onChange={event => setOriginAllowlistText(event.target.value)}
          placeholder={'https://plugins.example.com'}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = savePluginOriginAllowlist(originAllowlistText.split(/\r?\n/));
              setOriginAllowlistText(next.join('\n'));
              setOriginStatus(
                next.length
                  ? `Saved ${next.length} allowed origin${next.length === 1 ? '' : 's'}.`
                  : 'Allowlist cleared — same-origin iframes only.'
              );
            }}
          >
            Save allowlist
          </Button>
        </div>
        {originStatus ? (
          <p className="type-caption mt-2 text-[var(--text-secondary)]">{originStatus}</p>
        ) : null}
      </ToolSection>

      <ToolSection title="Queue preflight hooks">
        <p className="type-caption">
          Enabled hooks receive a POST with{' '}
          <code className="ui-inline-code">
            {'{ event, prompt, negativePrompt?, model?, tool?, denoise?, cfg? }'}
          </code>
          . Respond with JSON to rewrite <code className="ui-inline-code">prompt</code> /{' '}
          <code className="ui-inline-code">negativePrompt</code> /{' '}
          <code className="ui-inline-code">denoise</code> /{' '}
          <code className="ui-inline-code">cfg</code>, or set{' '}
          <code className="ui-inline-code">blocked: true</code> with a{' '}
          <code className="ui-inline-code">reason</code> to stop the queue.
        </p>
        {hooks.length === 0 ? (
          <p className="type-caption text-[var(--text-muted)]">No hooks configured yet.</p>
        ) : (
          <ul className="ui-list">
            {hooks.map(hook => (
              <li key={hook.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{hook.label}</p>
                  <p className="type-caption break-all">{hook.url}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const next = hooks.map(entry =>
                        entry.id === hook.id
                          ? { ...entry, enabled: entry.enabled === false }
                          : entry
                      );
                      savePluginQueueHooks(next);
                      setHooks(next);
                    }}
                  >
                    {hook.enabled === false ? 'Enable' : 'Disable'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const next = hooks.filter(entry => entry.id !== hook.id);
                      savePluginQueueHooks(next);
                      setHooks(next);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <FieldLabel>Id</FieldLabel>
            <TextInput
              value={hookForm.id}
              onChange={event => setHookForm(prev => ({ ...prev, id: event.target.value }))}
              placeholder="rewrite-nsfw"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>Label</FieldLabel>
            <TextInput
              value={hookForm.label}
              onChange={event => setHookForm(prev => ({ ...prev, label: event.target.value }))}
              placeholder="NSFW filter"
            />
          </label>
          <label className="block space-y-1.5">
            <FieldLabel>URL</FieldLabel>
            <TextInput
              value={hookForm.url}
              onChange={event => setHookForm(prev => ({ ...prev, url: event.target.value }))}
              placeholder="/api/my-hook or https://…"
            />
          </label>
        </div>
        {hookError ? (
          <p className="type-caption text-[var(--tint-danger-text)]">{hookError}</p>
        ) : null}
        <Button type="button" variant="primary" size="sm" className="mt-3" onClick={addHook}>
          Add queue hook
        </Button>
      </ToolSection>

      <ToolSection
        title="Sidebar bookmarks"
        description="Href-only shortcuts in the tool list. Not a runnable plugin — no iframe host, no queue hooks."
      >
        <ul className="ui-list">
          {plugins.map(plugin => (
            <li key={plugin.id} className="ui-list-row items-start">
              <div className="ui-list-primary min-w-0 space-y-1">
                <p className="type-heading">{plugin.label}</p>
                <p className="type-caption">{plugin.description}</p>
                <p className="type-overline">{plugin.category} · bookmark</p>
              </div>
              <ButtonLink href={plugin.href} size="sm" variant="accent-outline">
                Open
              </ButtonLink>
            </li>
          ))}
        </ul>
      </ToolSection>

      <CollapsibleSection
        title="Advanced: manage bookmarks"
        summary="Add sidebar shortcuts or edit the custom bookmark JSON. Prefer Runtime plugins above for iframe tools or queue hooks."
        defaultOpen={false}
        persistKey="plugins-bookmarks-advanced"
      >
        <ToolSection
          title="Add custom bookmark"
          description="Registers an in-app path in the sidebar. Use Runtime plugins when you need an iframe or queue hook."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <FieldLabel>Id</FieldLabel>
              <TextInput
                value={form.id}
                onChange={event => setForm(prev => ({ ...prev, id: event.target.value }))}
                placeholder="my-tool"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Label</FieldLabel>
              <TextInput
                value={form.label}
                onChange={event => setForm(prev => ({ ...prev, label: event.target.value }))}
                placeholder="My tool"
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <TextInput
                value={form.description}
                onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                placeholder="Short note shown in the list"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Href</FieldLabel>
              <TextInput
                value={form.href}
                onChange={event => setForm(prev => ({ ...prev, href: event.target.value }))}
                placeholder="/lint"
              />
            </label>
            <label className="block space-y-1.5">
              <FieldLabel>Category</FieldLabel>
              <SelectInput
                value={form.category}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    category: event.target.value as ToolPlugin['category'],
                  }))
                }
              >
                <option value="plugin">plugin</option>
                <option value="prompt">prompt</option>
                <option value="scene">scene</option>
                <option value="tools">tools</option>
                <option value="video">video</option>
              </SelectInput>
            </label>
          </div>
          {formError ? (
            <p className="type-caption text-[var(--tint-danger-text)]">{formError}</p>
          ) : null}
          <Button type="button" variant="primary" size="sm" className="mt-3" onClick={addFromForm}>
            Add bookmark
          </Button>
        </ToolSection>

        <ToolSection title="Custom bookmarks (JSON)">
          <p className="type-caption">
            Advanced: edit the full custom bookmark array. Each item needs id, label, description,
            href, and category. See{' '}
            <code className="ui-inline-code">examples/custom-plugin.example.json</code>. This is not
            a runtime manifest.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mb-3"
            onClick={() => {
              setCustomJson(
                JSON.stringify(
                  [
                    {
                      id: 'my-custom-tool',
                      label: 'My custom tool',
                      description: 'Example plugin entry — change href to your route.',
                      href: '/lint',
                      category: 'plugin',
                      enabled: true,
                    },
                  ],
                  null,
                  2
                )
              );
            }}
          >
            Load example
          </Button>
          <MonoTextArea
            value={customJson}
            onChange={event => setCustomJson(event.target.value)}
            rows={10}
            spellCheck={false}
          />
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={saveCustom}>
            Save JSON
          </Button>
        </ToolSection>
      </CollapsibleSection>
    </ToolLayout>
  );
}
