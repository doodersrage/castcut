'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChipButton } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { settingsTabHref } from '@/lib/settings-nav';
import { LLM_PUBLIC_PROVIDERS, type SessionLlmProvider } from '@/lib/llm-providers';
import {
  formatCatalogSource,
  type ServerLlmSnapshot,
} from '@/components/settings/panels/llm-panel-shared';

export type LlmProviderPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  server?: ServerLlmSnapshot | null;
  sessionProvider: SessionLlmProvider;
  catalogSource?: string;
  catalogLoading: boolean;
  catalogError?: string;
  catalogNeedsKey: boolean;
  catalogForSelectCount: number;
  catalogEntriesCount: number;
  showOpenRouterAll: boolean;
  onToggleOpenRouterFilter: () => void;
  onReloadCatalog: () => void;
  onProviderChange: (provider: SessionLlmProvider) => void;
  onTestConnection?: () => void;
  testingConnection?: boolean;
};

export default function LlmProviderPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  server,
  sessionProvider,
  catalogSource,
  catalogLoading,
  catalogError,
  catalogNeedsKey,
  catalogForSelectCount,
  catalogEntriesCount,
  showOpenRouterAll,
  onToggleOpenRouterFilter,
  onReloadCatalog,
  onProviderChange,
  onTestConnection,
  testingConnection = false,
}: LlmProviderPanelProps) {
  const hostedPreset = sessionProvider === 'server' ? null : LLM_PUBLIC_PROVIDERS[sessionProvider];
  const sessionKeySet = Boolean(sharedSettings.sessionLlmApiKey?.trim());
  const hostedModelMissing =
    sessionProvider !== 'server' && !sharedSettings.sessionLlmModel?.trim();
  const hostedVisionMissing =
    sessionProvider !== 'server' && !sharedSettings.sessionLlmVisionModel?.trim();
  const hostedKeyMissing = Boolean(hostedPreset) && !sessionKeySet;
  const serverVisionFallback =
    sessionProvider === 'server' &&
    server?.visionModelConfigured === false &&
    !server?.visionModelDetected;

  const [llmUsage, setLlmUsage] = useState<{
    last24h: number;
    last24hTokens: number;
    avgDurationMs: number;
    byModel: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    void fetch('/api/auth/llm-usage')
      .then(response => (response.status === 401 ? null : response.ok ? response.json() : null))
      .then(
        (
          data: {
            summary?: {
              last24h: number;
              last24hTokens: number;
              avgDurationMs: number;
              byModel: Record<string, number>;
            };
          } | null
        ) => setLlmUsage(data?.summary ?? null)
      )
      .catch(() => setLlmUsage(null));
  }, []);

  const statusLabel =
    server?.enabled === false
      ? 'Disabled'
      : server?.ok
        ? 'Connected'
        : server?.error
          ? `Error · ${server.error}`
          : 'Unknown';

  return (
    <>
      <ToolSection title="Server LLM (read-only)" id="settings-llm-provider">
        <p className="text-sm text-[var(--text-muted)]">
          Configured via server env (<code className="text-[var(--text-secondary)]">LLM_*</code>).
          Edit <code className="text-[var(--text-secondary)]">.env.local</code> and restart to
          change models. Full catalog lives on{' '}
          <Link
            href={settingsTabHref('overview')}
            className="text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            Overview → Server environment
          </Link>
          .
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Status</dt>
            <dd className="text-[var(--text-primary)]">{statusLabel}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Text model</dt>
            <dd className="truncate text-[var(--text-primary)]">{server?.model ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Vision model</dt>
            <dd className="truncate text-[var(--text-primary)]">
              {server?.visionModelConfigured === false
                ? server?.visionModelDetected
                  ? `${server.visionModelDetected} (found on the server)`
                  : `${server?.visionModel ?? '—'} (text fallback)`
                : (server?.visionModel ?? '—')}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">API key</dt>
            <dd className="text-[var(--text-primary)]">
              {server?.apiKeyConfigured ? 'Configured on server' : 'Not set (LLM_API_KEY)'}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">API base URL</dt>
            <dd className="truncate text-[var(--text-primary)]">{server?.baseUrl ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Server temperature</dt>
            <dd className="text-[var(--text-primary)]">{server?.serverTemperature ?? '—'}</dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">
              Max concurrent (LLM_MAX_INFLIGHT)
            </dt>
            <dd
              className={
                server?.busy
                  ? 'font-medium text-[var(--tint-warning-text)]'
                  : 'text-[var(--text-primary)]'
              }
            >
              {typeof server?.inFlight === 'number'
                ? `${server.inFlight} in flight / ${server.maxInflight ?? 2} max`
                : typeof server?.maxInflight === 'number'
                  ? `${server.maxInflight} max`
                  : '—'}
            </dd>
          </div>
          <div>
            <dt className="type-caption text-[var(--text-muted)]">Server template fallback</dt>
            <dd className="text-[var(--text-primary)]">
              {server?.allowTemplateFallback === undefined
                ? '—'
                : server.allowTemplateFallback
                  ? 'Allowed'
                  : 'Disabled'}
            </dd>
          </div>
          {server?.embedModel ? (
            <div className="sm:col-span-2">
              <dt className="type-caption text-[var(--text-muted)]">Embed model</dt>
              <dd className="truncate text-[var(--text-primary)]">{server.embedModel}</dd>
            </div>
          ) : null}
        </dl>
        {serverVisionFallback ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            LLM_VISION_MODEL is unset. Image → Prompt still uses the text model above, which will
            fail on vision tools. Set a vision id in .env.local or pick a session vision model.
          </p>
        ) : null}
        {llmUsage ? (
          <p className="type-caption text-[var(--text-muted)]">
            Last 24h: {llmUsage.last24h} call{llmUsage.last24h === 1 ? '' : 's'}
            {llmUsage.last24hTokens > 0 ? ` · ~${llmUsage.last24hTokens} tokens` : ''}
            {llmUsage.avgDurationMs > 0 ? ` · ${llmUsage.avgDurationMs} ms avg` : ''}
            {Object.keys(llmUsage.byModel).length > 0
              ? ` · ${Object.entries(llmUsage.byModel)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([id, count]) => `${id} ×${count}`)
                  .join(', ')}`
              : ''}
          </p>
        ) : null}
        {onTestConnection ? (
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              loading={testingConnection}
              loadingLabel="Testing LLM connection"
              onClick={() => onTestConnection()}
            >
              Test LLM connection
            </Button>
          </div>
        ) : null}
      </ToolSection>

      <ToolSection title="Session LLM preferences">
        <p className="text-sm text-[var(--text-muted)]">
          Browser overrides sent with generation requests. OpenRouter and Groq use your own key — no
          local Ollama/LM Studio required. Leave provider on Local server to use env defaults.
          {catalogSource ? ` Model list from ${formatCatalogSource(catalogSource)}.` : ''}
        </p>

        <fieldset className="space-y-2">
          <legend className="type-caption text-[var(--text-muted)]">
            Provider for this browser
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <ChipButton
              active={sessionProvider === 'server'}
              disabled={!sharedMounted}
              onClick={() => onProviderChange('server')}
            >
              Local server
            </ChipButton>
            {(Object.keys(LLM_PUBLIC_PROVIDERS) as Array<keyof typeof LLM_PUBLIC_PROVIDERS>).map(
              id => (
                <ChipButton
                  key={id}
                  active={sessionProvider === id}
                  disabled={!sharedMounted}
                  onClick={() => onProviderChange(id)}
                >
                  {LLM_PUBLIC_PROVIDERS[id].label}
                </ChipButton>
              )
            )}
          </div>
          {hostedPreset ? (
            <p className="type-caption text-[var(--text-muted)]">{hostedPreset.hint}</p>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              Uses LLM_API_BASE_URL from the server (Ollama, LM Studio, or another OpenAI-compatible
              host).
            </p>
          )}
        </fieldset>

        {hostedPreset ? (
          <label className="block space-y-1.5 text-sm">
            <span className="type-caption text-[var(--text-muted)]">
              {hostedPreset.label} API key
            </span>
            <input
              type="password"
              autoComplete="off"
              value={sharedSettings.sessionLlmApiKey ?? ''}
              disabled={!sharedMounted}
              placeholder={`Paste ${hostedPreset.label} key`}
              onChange={event =>
                updateSharedSettings({
                  sessionLlmApiKey: event.target.value || undefined,
                })
              }
              className={`ui-input w-full font-mono text-sm ${accentFocusClass()}`}
            />
            <p className="type-caption text-[var(--text-muted)]">
              Stored in this browser&apos;s settings. Chat needs a key
              {hostedPreset.listWithoutKey ? '; the model list can load without one' : ''}.{' '}
              <a
                href={hostedPreset.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent-text)] underline-offset-2 hover:underline"
              >
                Get a key
              </a>
              . Click Reload after pasting.
            </p>
            {hostedKeyMissing ? (
              <p className="type-caption text-[var(--tint-warning-text)]">
                Paste an API key or generation will fail against {hostedPreset.label}.
              </p>
            ) : null}
          </label>
        ) : null}

        {hostedModelMissing ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Pick a text model below. Local server default ids will 404 on{' '}
            {hostedPreset?.label ?? 'this provider'}.
          </p>
        ) : null}
        {hostedVisionMissing ? (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Image → Prompt needs a vision model selected for this hosted provider.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={catalogLoading}
            loadingLabel="Loading models"
            disabled={!sharedMounted}
            onClick={onReloadCatalog}
          >
            Reload model list
          </Button>
          {sessionProvider === 'openrouter' && catalogEntriesCount > 0 ? (
            <ChipButton
              active={!showOpenRouterAll}
              disabled={!sharedMounted}
              onClick={onToggleOpenRouterFilter}
            >
              Free models only
            </ChipButton>
          ) : null}
          {catalogError ? (
            <p className="type-caption text-[var(--tint-warning-text)]">
              {catalogError}
              {catalogNeedsKey ? ' Paste a key, then Reload.' : ''}
            </p>
          ) : catalogForSelectCount > 0 ? (
            <p className="type-caption text-[var(--text-muted)]">
              {catalogForSelectCount} model{catalogForSelectCount === 1 ? '' : 's'}
              {sessionProvider === 'openrouter' && !showOpenRouterAll ? ' (free)' : ''} available
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="type-caption text-[var(--text-muted)]">
            LLM path for this browser
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { value: undefined, label: 'Server default' },
                { value: true, label: 'Force LLM on' },
                { value: false, label: 'Template only' },
              ] as const
            ).map(option => (
              <ChipButton
                key={String(option.value)}
                active={sharedSettings.sessionLlmEnabled === option.value}
                disabled={!sharedMounted}
                onClick={() => updateSharedSettings({ sessionLlmEnabled: option.value })}
              >
                {option.label}
              </ChipButton>
            ))}
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Template only skips the LLM for this browser even when the server has it enabled —
            useful offline or when Ollama is down.
          </p>
        </fieldset>
      </ToolSection>
    </>
  );
}
