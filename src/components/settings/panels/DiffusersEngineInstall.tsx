'use client';

import { PRODUCT_NAME } from '@/lib/brand';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { DiffusersEngineAvailability } from '@/lib/diffusers-engine-install';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const RUNNING = new Set(['downloading', 'unpacking', 'installing']);
const PHASE_LABEL: Record<string, string> = {
  downloading: 'Downloading the engine…',
  unpacking: 'Unpacking…',
  installing: 'Installing Python packages (several GB, a few minutes)…',
};

/** Whether the optional Diffusers engine is here, and an install that is running. */
export function useDiffusersEngine() {
  const [state, setState] = useState<DiffusersEngineAvailability | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/diffusers/install', { credentials: 'same-origin' });
      if (response.ok) setState((await response.json()) as DiffusersEngineAvailability);
    } catch {
      // offline — leave the last state
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  const running = RUNNING.has(state?.job.phase ?? '');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const install = useCallback(async () => {
    setError(null);
    const response = await fetch('/api/diffusers/install', {
      method: 'POST',
      credentials: 'same-origin',
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(data.error ?? `Install failed (HTTP ${response.status}).`);
    await load();
  }, [load]);

  return { state, running, error, install };
}

/**
 * The Diffusers engine is an add-on (github.com/doodersrage/castcut-diffusers): not installed,
 * it shows only this — what it is and an Install button.
 */
export default function DiffusersEngineInstall({
  engine,
}: {
  engine: ReturnType<typeof useDiffusersEngine>;
}) {
  const { state, running, error, install } = engine;
  if (!state || state.available) return null;
  const failed = state.job.phase === 'failed' ? state.job.error : null;
  const noPython = state.python === null;
  return (
    <div
      className="ui-surface-inset space-y-2 sm:col-span-2"
      data-testid="diffusers-engine-install"
    >
      <p className="text-sm text-[var(--text-primary)]">Diffusers engine (optional)</p>
      <p className="text-xs text-[var(--text-muted)]">
        A second stills engine that runs Hugging Face Diffusers instead of ComfyUI. It isn&rsquo;t
        part of {PRODUCT_NAME} — install it here if you want it (Python 3.10+ and a CUDA GPU on this
        server, about 6 GB), or run it on another machine from{' '}
        <a
          className="ui-text-link"
          href="https://github.com/doodersrage/castcut-diffusers"
          target="_blank"
          rel="noreferrer"
        >
          castcut-diffusers
        </a>{' '}
        and set DIFFUSERS_API_URL.
      </p>
      {noPython ? (
        <p className="text-xs text-[var(--tint-warning-text)]">
          This server has no Python 3.10+, so it can&rsquo;t install the engine itself (the Docker
          image has none) — run the engine elsewhere and set DIFFUSERS_API_URL.
        </p>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={running}
          loadingLabel="Installing"
          data-testid="diffusers-engine-install-button"
          onClick={() => void install()}
        >
          Install Diffusers engine {state.wantedVersion}
        </Button>
      )}
      {running ? (
        <p className="text-xs text-[var(--text-secondary)]" role="status">
          {PHASE_LABEL[state.job.phase]}
          {state.job.log.length ? (
            <span className="mt-1 block truncate font-mono text-[11px] text-[var(--text-muted)]">
              {state.job.log[state.job.log.length - 1]}
            </span>
          ) : null}
        </p>
      ) : null}
      {error || failed ? (
        <p className="text-xs ui-status-danger" role="alert">
          {error ?? failed}
        </p>
      ) : null}
    </div>
  );
}
