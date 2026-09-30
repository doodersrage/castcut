'use client';

import { useState } from 'react';
import Link from 'next/link';
import ServerEnvPanel from '@/components/settings/ServerEnvPanel';
import StorageHealthChip from '@/components/StorageHealthChip';
import { ToolSection, HealthCard } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { formatPoolQueueStrip, summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';

type Props = {
  health: HealthResponse | null;
  loading: boolean;
  refreshHealth: () => void | Promise<void>;
  sharedSettings: SharedToolSettings;
  setStatus: (status: string | null) => void;
  slimSettings?: boolean;
};

export function SettingsOverviewHealthSection({
  health,
  loading,
  refreshHealth,
  sharedSettings,
  setStatus,
  slimSettings = false,
}: Props) {
  return (
    <>
      <ToolSection title="Appearance & chrome">
        <p className="text-sm text-[var(--text-secondary)]">
          Theme (Auto / Light / Dark), ambient intensity, density, and queue toasts live in{' '}
          <a href="/profile" className="text-[var(--accent-text)] underline underline-offset-2">
            Profile → Appearance
          </a>
          . Prompt quality and VRAM guards are under the ComfyUI tab.
        </p>
      </ToolSection>

      <ToolSection title="Service health">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StorageHealthChip />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            loadingLabel="Checking service health"
            onClick={() => void refreshHealth()}
            className="type-caption"
          >
            Refresh
          </Button>
        </div>

        {health && (
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthCard
              title="LLM API"
              ok={health.llm.ok}
              detail={[
                health.llm.enabled ? health.llm.model : 'disabled',
                health.llm.baseUrl,
                health.llm.enabled && typeof health.llm.inFlight === 'number'
                  ? `LLM busy: ${health.llm.inFlight}/${health.llm.maxInflight ?? '?'} in flight`
                  : null,
                health.llm.error,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <HealthCard
              title="ComfyUI"
              ok={health.comfyui.ok}
              detail={[
                health.comfyui.url,
                health.comfyui.version ? `ComfyUI ${health.comfyui.version}` : null,
                health.comfyui.deviceName,
                health.comfyuiPool?.enabled && health.comfyuiPool.endpoints.length > 0
                  ? formatPoolQueueStrip(summarizePoolQueueDepth(health.comfyuiPool.endpoints))
                  : health.comfyui.queuePending != null
                    ? `queue ${health.comfyui.queueRunning ?? 0} running · ${health.comfyui.queuePending} pending`
                    : null,
                health.comfyui.vram?.total
                  ? `VRAM ${Math.round((health.comfyui.vram.free ?? 0) / 1e9)} / ${Math.round(health.comfyui.vram.total / 1e9)} GB free`
                  : null,
                health.comfyui.ram?.total
                  ? `RAM ${Math.round((health.comfyui.ram.free ?? 0) / 1e9)} / ${Math.round(health.comfyui.ram.total / 1e9)} GB free`
                  : null,
                health.comfyui.extensionPacks
                  ? `${health.comfyui.extensionPacks} custom node pack${health.comfyui.extensionPacks === 1 ? '' : 's'}`
                  : null,
                health.comfyui.embeddingCount
                  ? `${health.comfyui.embeddingCount} embedding${health.comfyui.embeddingCount === 1 ? '' : 's'}`
                  : null,
                health.comfyui.features?.length ? health.comfyui.features.join(', ') : null,
                health.comfyui.error,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            {!slimSettings && health.diffusers ? (
              <HealthCard
                title="Diffusers"
                ok={health.diffusers.ok}
                detail={[
                  health.diffusers.url,
                  health.diffusers.device,
                  health.diffusers.model,
                  health.diffusers.mock ? 'mock' : null,
                  health.diffusers.error,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
            {!slimSettings && health.collab ? (
              <HealthCard
                title="Collab backend"
                ok={health.collab.redisConfigured ? health.collab.redisConnected : true}
                detail={[
                  health.collab.backend,
                  health.collab.redisConfigured
                    ? health.collab.redisConnected
                      ? 'Redis connected'
                      : 'Redis configured but unreachable'
                    : health.collab.filePersistence
                      ? 'sqlite persistence'
                      : 'in-memory only',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
          </div>
        )}

        {!slimSettings &&
        health?.comfyuiPool?.enabled &&
        health.comfyuiPool.endpoints.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="type-caption text-[var(--text-secondary)]">ComfyUI pool endpoints</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {health.comfyuiPool.endpoints.map(endpoint => (
                <HealthCard
                  key={endpoint.url}
                  title={`Pool #${endpoint.index + 1}${
                    sharedSettings.preferredComfyHost?.replace(/\/+$/, '') ===
                    endpoint.url.replace(/\/+$/, '')
                      ? ' · preferred'
                      : ''
                  }`}
                  ok={endpoint.ok}
                  detail={[
                    endpoint.url,
                    endpoint.version ? `ComfyUI ${endpoint.version}` : null,
                    endpoint.deviceName,
                    endpoint.queuePending != null
                      ? `${endpoint.queueRunning ?? 0} running · ${endpoint.queuePending} pending`
                      : null,
                    endpoint.vram?.total
                      ? `VRAM ${Math.round((endpoint.vram.free ?? 0) / 1e9)} / ${Math.round(endpoint.vram.total / 1e9)} GB`
                      : null,
                    endpoint.error,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Add, test, and prefer hosts in{' '}
              <Link
                href={settingsComfyUiSectionHref('connection')}
                className="text-[var(--accent-text)]"
              >
                ComfyUI → Connection
              </Link>
              . Env pool members stay in <code className="ui-inline-code">COMFYUI_POOL</code>.
            </p>
          </div>
        ) : null}

        {!slimSettings && health?.apiUsage ? (
          <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
            <li>
              API usage (in-memory): {health.apiUsage.total} requests · {health.apiUsage.lastHour}{' '}
              last hour · {health.apiUsage.rateLimited} rate limited
            </li>
            <li>Server storage: {health.storage?.enabled ? 'enabled' : 'disabled'}</li>
          </ul>
        ) : null}

        {!slimSettings && health && (
          <>
            <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
              <li>Vision model: {health.config.visionModel}</li>
              <li>
                Template fallback: {health.config.allowTemplateFallback ? 'allowed' : 'disabled'}
              </li>
              {health.workflow && (
                <li>
                  Active workflow: {health.workflow.workflowSource}
                  {health.workflow.hasWorkflow
                    ? ` · ${health.workflow.placeholders.positive}× ${health.workflow.placeholderTokens.positive}${
                        health.workflow.placeholders.negative > 0
                          ? ` · ${health.workflow.placeholders.negative}× ${health.workflow.placeholderTokens.negative}`
                          : ''
                      }`
                    : ' · minimal fallback workflow'}
                  {health.workflow.legacyNodeFallback ? ' · env node-ID fallback available' : ''}
                </li>
              )}
            </ul>
            <ComfyLogsSnippet comfyUrl={health.comfyui.url} />
          </>
        )}
      </ToolSection>

      {health?.serverEnv ? (
        slimSettings ? (
          <details className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]">
              Server environment (.env.local)
            </summary>
            <div className="mt-4">
              <ServerEnvPanel
                groups={health.serverEnv.groups}
                llmOk={health.llm.ok}
                comfyOk={health.comfyui.ok}
                onRefreshHealth={() => void refreshHealth()}
                onStatus={setStatus}
              />
            </div>
          </details>
        ) : (
          <ServerEnvPanel
            groups={health.serverEnv.groups}
            llmOk={health.llm.ok}
            comfyOk={health.comfyui.ok}
            onRefreshHealth={() => void refreshHealth()}
            onStatus={setStatus}
          />
        )
      ) : null}
    </>
  );
}

function ComfyLogsSnippet({ comfyUrl }: { comfyUrl?: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (comfyUrl?.trim()) {
        params.set('comfyUrl', comfyUrl.trim());
      }
      const response = await fetch(`/api/comfyui/logs?${params.toString()}`);
      const data = (await response.json()) as {
        lines?: string[];
        error?: string;
        unsupported?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not load ComfyUI logs.');
        setLines([]);
        return;
      }
      if (data.unsupported) {
        setError('This ComfyUI build does not expose /internal/logs.');
        setLines([]);
        return;
      }
      setLines(data.lines ?? []);
    } catch {
      setError('Could not load ComfyUI logs.');
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">ComfyUI logs</p>
        <Button size="sm" variant="secondary" loading={loading} onClick={() => void loadLogs()}>
          {lines ? 'Refresh logs' : 'Load logs'}
        </Button>
      </div>
      {error ? <p className="text-xs ui-status-danger">{error}</p> : null}
      {lines && lines.length === 0 && !error ? (
        <p className="text-xs text-[var(--text-muted)]">No recent log lines.</p>
      ) : null}
      {lines && lines.length > 0 ? (
        <pre className="ui-scroll-region max-h-48 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          {lines.join('\n')}
        </pre>
      ) : null}
    </div>
  );
}
