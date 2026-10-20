'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { PRODUCT_NAME } from '@/lib/app/brand';
import type { LocalLlmStatus } from '@/lib/llm/local';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

const CONTEXTS = [8192, 16384, 32768];

function gb(bytes = 0): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/**
 * Settings → LLM → Built-in LLM (llm-local-server.ts): Castcut runs llama.cpp with one
 * vision-language model itself, so Story and the checks need no LM Studio.
 */
export default function LocalLlmPanel({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<LocalLlmStatus | null>(null);
  const [model, setModel] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/llm/local', { credentials: 'same-origin' });
      if (response.ok) setStatus((await response.json()) as LocalLlmStatus);
    } catch {
      // offline — keep the last status
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  const installing = status?.job?.phase === 'server' || status?.job?.phase === 'model';
  useEffect(() => {
    if (!installing) return;
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, [installing, load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/llm/local', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as LocalLlmStatus & { error?: string };
      if (!response.ok) setError(data.error ?? `HTTP ${response.status}`);
      else setStatus(data);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const picked = model || status.modelId || status.models[0]?.id || '';
  const job = status.job;

  return (
    <ToolSection
      title="Built-in LLM"
      id="settings-llm-local"
      description={`${PRODUCT_NAME} runs the language model itself (llama.cpp, the engine inside LM Studio) — no LM Studio needed. One vision model writes Story and reads stills for the checks. It starts when a call needs it and stops after 15 idle minutes, or when ComfyUI needs the GPU memory.`}
    >
      <div className="space-y-3" data-testid="llm-local">
        {!status.supported ? (
          <p
            className="text-xs text-[var(--tint-warning-text)]"
            data-testid="llm-local-unsupported"
          >
            {/* The reason may end with a docs address: show it as a link. */}
            {(status.unsupportedReason ?? '').split(/(https:\/\/\S+)/).map((part, index) =>
              part.startsWith('https://') ? (
                <a
                  key={index}
                  href={part}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {part.includes('#llm-in-docker') ? 'Built-in LLM in Docker' : part}
                </a>
              ) : (
                <span key={index}>{part}</span>
              )
            )}
          </p>
        ) : null}

        {status.supported && !status.installed ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs text-[var(--text-secondary)]">Model</legend>
              {status.models.map(choice => (
                <label key={choice.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="llm-local-model"
                    checked={picked === choice.id}
                    onChange={() => setModel(choice.id)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="text-[var(--text-primary)]">{choice.label}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {choice.onDisk
                        ? 'Already on this machine (LM Studio) — nothing to download.'
                        : `About ${choice.sizeGb} GB to download.`}{' '}
                      {choice.note}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Button
              size="sm"
              variant="secondary"
              loading={busy || installing}
              loadingLabel="Installing"
              data-testid="llm-local-install"
              onClick={() => void act({ action: 'install', model: picked })}
            >
              Install the built-in LLM
            </Button>
          </>
        ) : null}

        {installing && job ? (
          <p className="text-xs text-[var(--text-secondary)]" role="status">
            {job.phase === 'server' ? 'Downloading llama.cpp' : `Downloading ${job.file}`}
            {job.total ? ` — ${gb(job.done)} of ${gb(job.total)}` : '…'}
          </p>
        ) : null}
        {job?.phase === 'failed' ? (
          <p className="text-xs ui-status-danger" role="alert">
            {job.error}
          </p>
        ) : null}

        {status.installed ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={status.enabled}
                disabled={busy}
                onChange={event => void act({ action: 'use', enabled: event.target.checked })}
                data-testid="llm-local-enabled"
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Use the built-in LLM (in place of the server&rsquo;s LLM_API_BASE_URL)
            </label>
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <dt className="text-[var(--text-muted)]">Model</dt>
              <dd className="text-[var(--text-primary)]">
                {status.models.find(choice => choice.id === status.modelId)?.label ??
                  status.modelId}
              </dd>
              <dt className="text-[var(--text-muted)]">State</dt>
              <dd className="text-[var(--text-primary)]" data-testid="llm-local-state">
                {status.running
                  ? `Running${status.contextLength ? ` · ${status.contextLength.toLocaleString('en-US')}-token context` : ''}`
                  : 'Stopped — starts when needed'}
              </dd>
              <dt className="text-[var(--text-muted)]">llama.cpp</dt>
              <dd className="text-[var(--text-primary)]">{status.release}</dd>
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                Context
                <select
                  value={status.context}
                  disabled={busy}
                  onChange={event =>
                    void act({
                      action: 'use',
                      enabled: status.enabled,
                      context: Number(event.target.value),
                    })
                  }
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-xs"
                >
                  {CONTEXTS.map(size => (
                    <option key={size} value={size}>
                      {size.toLocaleString('en-US')} tokens
                    </option>
                  ))}
                </select>
              </label>
              {status.running ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() => void act({ action: 'stop' })}
                >
                  Stop (free GPU memory)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  disabled={!status.enabled}
                  data-testid="llm-local-start"
                  onClick={() => void act({ action: 'start' })}
                >
                  Start now
                </Button>
              )}
            </div>
          </>
        ) : null}
        {error ? (
          <p className="text-xs ui-status-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </ToolSection>
  );
}
