'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  getInstalledPlugin,
  primaryToolForPlugin,
  type PluginManifest,
} from '@/lib/plugin-manifest';
import {
  isAllowedPluginMessageOrigin,
  isPluginIframeHostMessage,
  postPluginIframeHostApplyResult,
  postPluginIframeHostContext,
  postPluginIframeHostQueueResult,
  postPluginIframeHostReady,
  resolveEmbeddablePluginIframeUrl,
  resolvePluginIframeTargetOrigin,
} from '@/lib/plugin-iframe-host';
import {
  applyModelFromPlugin,
  applyPromptFromPlugin,
  applyQualityFromPlugin,
  applyEngineFromPlugin,
  applyLoraStackFromPlugin,
  patchWorkflowTokensFromPlugin,
  writeGalleryTagFromPlugin,
  buildPluginHostContextSnapshot,
  queuePromptFromPlugin,
} from '@/lib/plugin-iframe-queue';
import { loadLastToolDraft } from '@/lib/tool-draft-memory';
import { toastQueueOutcome } from '@/lib/app-toast';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { loadPluginOriginAllowlist } from '@/lib/plugin-origin-allowlist';

type PluginDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default function PluginDetailPage({ params }: PluginDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [plugin, setPlugin] = useState<PluginManifest | null | undefined>(undefined);
  const [iframeHeight, setIframeHeight] = useState(720);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPlugin(getInstalledPlugin(id));
    });
  }, [id]);

  const pushHostContext = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !plugin) {
      return;
    }
    const tool = primaryToolForPlugin(plugin);
    const iframeUrl = resolveEmbeddablePluginIframeUrl(tool?.iframeUrl);
    if (!iframeUrl) {
      return;
    }
    const draft = loadLastToolDraft();
    const context = buildPluginHostContextSnapshot({
      pluginId: plugin.id,
      pluginLabel: plugin.label,
      tool: draft?.toolKey,
      prompt: draft?.preview?.slice(0, 500),
    });
    const origin = resolvePluginIframeTargetOrigin(iframeUrl);
    postPluginIframeHostReady(iframe, plugin.id, origin);
    postPluginIframeHostContext(iframe, context, origin);
  }, [plugin]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPluginIframeHostMessage(event.data) || !plugin) {
        return;
      }
      const iframeUrl = resolveEmbeddablePluginIframeUrl(primaryToolForPlugin(plugin)?.iframeUrl);
      if (!isAllowedPluginMessageOrigin(event.origin, iframeUrl, loadPluginOriginAllowlist())) {
        return;
      }
      const origin = iframeUrl ? resolvePluginIframeTargetOrigin(iframeUrl) : '*';

      if (event.data.type === 'plugin:resize' && Number.isFinite(event.data.height)) {
        setIframeHeight(Math.min(Math.max(event.data.height, 320), 1200));
        return;
      }
      if (event.data.type === 'plugin:navigate' && event.data.href.startsWith('/')) {
        router.push(event.data.href);
        return;
      }
      if (event.data.type === 'plugin:toast' && event.data.message.trim()) {
        toastQueueOutcome({ ok: true, text: event.data.message.trim() });
        return;
      }
      if (event.data.type === 'plugin:apply-prompt') {
        void applyPromptFromPlugin(plugin.id, event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
        });
        return;
      }
      if (event.data.type === 'plugin:apply-model') {
        void applyModelFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
          pushHostContext();
        });
        return;
      }
      if (event.data.type === 'plugin:apply-quality') {
        void applyQualityFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
          pushHostContext();
        });
        return;
      }
      if (event.data.type === 'plugin:apply-engine') {
        void applyEngineFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
          pushHostContext();
        });
        return;
      }
      if (event.data.type === 'plugin:apply-lora-stack') {
        void applyLoraStackFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
          pushHostContext();
        });
        return;
      }
      if (event.data.type === 'plugin:patch-workflow-tokens') {
        void patchWorkflowTokensFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
        });
        return;
      }
      if (event.data.type === 'plugin:write-gallery-tag') {
        void writeGalleryTagFromPlugin(event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostApplyResult(
            iframeRef.current,
            { pluginId: plugin.id, ok: result.ok, message: result.message },
            origin
          );
        });
        return;
      }
      if (event.data.type === 'plugin:pick-gallery') {
        const target = event.data.target ?? 'compose';
        router.push(galleryPickPath(target));
        return;
      }
      if (event.data.type === 'plugin:queue') {
        void queuePromptFromPlugin(plugin.id, event.data).then(result => {
          toastQueueOutcome({ ok: result.ok, text: result.message });
          postPluginIframeHostQueueResult(
            iframeRef.current,
            {
              pluginId: plugin.id,
              ok: result.ok,
              message: result.message,
              promptId: result.promptId,
            },
            origin
          );
        });
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [plugin, pushHostContext, router]);

  if (plugin === undefined) {
    return (
      <ToolLayout
        accent="brand"
        badge={<ToolBadge accent="brand">Plugin</ToolBadge>}
        title="Loading…"
        description="Resolving installed plugin manifest."
      >
        <p className="type-caption text-[var(--text-muted)]">Loading plugin…</p>
      </ToolLayout>
    );
  }

  if (!plugin) {
    return (
      <ToolLayout
        accent="brand"
        badge={<ToolBadge accent="brand">Plugin</ToolBadge>}
        title="Plugin not found"
        description={`No installed plugin matches “${id}”.`}
      >
        <ToolSection title="Missing manifest">
          <p className="type-caption">
            Import a JSON manifest from the{' '}
            <Link
              href="/plugins"
              className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Plugins
            </Link>{' '}
            page to install a runtime plugin.
          </p>
          <ButtonLink href="/plugins" size="sm" variant="secondary" className="mt-4">
            Back to plugins
          </ButtonLink>
        </ToolSection>
      </ToolLayout>
    );
  }

  const tool = primaryToolForPlugin(plugin);
  const iframeUrl = resolveEmbeddablePluginIframeUrl(tool?.iframeUrl);

  if (iframeUrl) {
    const iframeOrigin =
      resolvePluginIframeTargetOrigin(iframeUrl) || '(unresolved — default deny)';
    return (
      <ToolLayout
        accent="brand"
        width="full"
        badge={<ToolBadge accent="brand">Plugin</ToolBadge>}
        title={tool?.title || plugin.label}
        description={`${plugin.label} · v${plugin.version}`}
      >
        <p className="type-caption mb-3 text-[var(--text-secondary)]">
          Active iframe origin: <code className="ui-inline-code">{iframeOrigin}</code>
          {' · '}
          <Link
            href="/plugins"
            className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Manage allowlist
          </Link>
        </p>
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] shadow-[var(--shadow-soft)]">
          <iframe
            ref={iframeRef}
            title={tool?.title || plugin.label}
            src={iframeUrl}
            onLoad={pushHostContext}
            className="block w-full bg-[var(--surface)]"
            style={{ height: `min(78vh, ${iframeHeight}px)` }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-write"
          />
        </div>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent="brand"
      badge={<ToolBadge accent="brand">Plugin</ToolBadge>}
      title={plugin.label}
      description={`Installed runtime plugin · v${plugin.version}`}
    >
      <ToolSection title="Plugin info">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="type-overline">Id</dt>
            <dd className="type-caption font-mono text-[var(--text-secondary)]">{plugin.id}</dd>
          </div>
          <div className="space-y-1">
            <dt className="type-overline">Version</dt>
            <dd className="type-caption text-[var(--text-secondary)]">{plugin.version}</dd>
          </div>
          <div className="space-y-1">
            <dt className="type-overline">Status</dt>
            <dd className="type-caption text-[var(--text-secondary)]">
              {plugin.enabled === false ? 'Disabled' : 'Enabled'}
            </dd>
          </div>
          {plugin.queueHooks?.url ? (
            <div className="space-y-1 sm:col-span-2">
              <dt className="type-overline">Queue hook</dt>
              <dd className="type-caption break-all text-[var(--text-secondary)]">
                {plugin.queueHooks.url}
                {plugin.queueHooks.events?.length
                  ? ` · ${plugin.queueHooks.events.join(', ')}`
                  : ''}
              </dd>
            </div>
          ) : null}
          {plugin.presetProvider?.catalogUrl ? (
            <div className="space-y-1 sm:col-span-2">
              <dt className="type-overline">Preset catalog</dt>
              <dd className="type-caption break-all text-[var(--text-secondary)]">
                {plugin.presetProvider.kind} · {plugin.presetProvider.catalogUrl}
              </dd>
            </div>
          ) : null}
        </dl>
      </ToolSection>

      {plugin.tools?.length ? (
        <ToolSection title="Tools" variant="secondary">
          <ul className="ui-list">
            {plugin.tools.map(entry => (
              <li key={entry.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{entry.title}</p>
                  <p className="type-caption">
                    {entry.route
                      ? `Route ${entry.route}`
                      : entry.iframeUrl
                        ? `Iframe ${entry.iframeUrl}`
                        : 'No surface configured'}
                  </p>
                </div>
                {entry.route ? (
                  <ButtonLink href={entry.route} size="sm" variant="accent-outline">
                    Open
                  </ButtonLink>
                ) : null}
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      {plugin.nav?.length ? (
        <ToolSection title="Nav entries" variant="secondary">
          <ul className="ui-list">
            {plugin.nav.map(entry => (
              <li key={entry.href} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="type-heading">{entry.label}</p>
                  <p className="type-caption">{entry.description}</p>
                </div>
                <ButtonLink href={entry.href} size="sm" variant="secondary">
                  Open
                </ButtonLink>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      <ButtonLink href="/plugins" size="sm" variant="secondary">
        Manage plugins
      </ButtonLink>
    </ToolLayout>
  );
}
