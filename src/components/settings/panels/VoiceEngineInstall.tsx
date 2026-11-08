'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { VoiceEngineAvailability } from '@/lib/audio/voice-engine-install';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

type VoiceEngineState = VoiceEngineAvailability & { running?: boolean };

const RUNNING = new Set(['copying', 'installing']);

/**
 * The voice engine (addons/voice, voice-engine-install.ts): read lines in a Cast member's kept
 * voice in seconds instead of LTX's minute or more. Not installed: what it is and Install;
 * installed: whether it's answering.
 */
export default function VoiceEngineInstall() {
  const [state, setState] = useState<VoiceEngineState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/voice-engine/install', { credentials: 'same-origin' });
      if (response.ok) setState((await response.json()) as VoiceEngineState);
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

  const install = async () => {
    setError(null);
    const response = await fetch('/api/voice-engine/install', {
      method: 'POST',
      credentials: 'same-origin',
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setError(data.error ?? `Install failed (HTTP ${response.status}).`);
    await load();
  };

  if (!state) return null;
  const failed = state.job.phase === 'failed' ? state.job.error : null;
  const outdated = state.installed && state.wantedVersion && state.version !== state.wantedVersion;
  return (
    <div className="ui-surface-inset space-y-2 sm:col-span-2" data-testid="voice-engine">
      <p className="text-sm text-[var(--text-primary)]">Voice engine (optional)</p>
      <p className="text-xs text-[var(--text-muted)]">
        Reads Cut&rsquo;s lines in each Cast member&rsquo;s kept voice with Qwen3-TTS — a few
        seconds a line instead of a minute or more with LTX in ComfyUI. It runs beside ComfyUI in
        its own Python environment (Python 3.10+, about 7 GB, plus a 5 GB model on first use).
        Without it, lines are read with LTX as before.
      </p>
      {state.installed || state.configuredUrl ? (
        <p className="text-xs text-[var(--text-secondary)]" data-testid="voice-engine-status">
          {state.running
            ? state.configuredUrl
              ? 'Set by VOICE_ENGINE_URL and answering.'
              : 'Installed and answering.'
            : state.configuredUrl
              ? 'Set by VOICE_ENGINE_URL, but not answering.'
              : 'Installed — it starts when a line needs it.'}
          {state.version ? ` Version ${state.version}.` : ''}
        </p>
      ) : null}
      {/* An engine set by VOICE_ENGINE_URL runs elsewhere: nothing to install here. */}
      {state.configuredUrl ? null : state.python === null && !state.installed ? (
        <p className="text-xs text-[var(--tint-warning-text)]" data-testid="voice-engine-no-python">
          This server has no Python 3.10+, so it can&rsquo;t install the voice engine here. In
          Docker, start it with <code className="ui-inline-code">--profile voice</code>; or run it
          on another machine. Then set VOICE_ENGINE_URL.
        </p>
      ) : !state.installed || outdated ? (
        <Button
          size="sm"
          variant="secondary"
          loading={running}
          loadingLabel="Installing"
          data-testid="voice-engine-install-button"
          onClick={() => void install()}
        >
          {outdated ? 'Update' : 'Install'} voice engine {state.wantedVersion ?? ''}
        </Button>
      ) : null}
      {running ? (
        <p className="text-xs text-[var(--text-secondary)]" role="status">
          {state.job.phase === 'copying'
            ? 'Copying the engine…'
            : 'Installing Python packages (several GB, a few minutes)…'}
          {state.job.log.length ? (
            <span className="mt-1 block truncate font-mono text-2xs text-[var(--text-muted)]">
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
