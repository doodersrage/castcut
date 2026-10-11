'use client';

/**
 * Lightweight connection status for Dashboard / sidebar.
 * Polls /api/health on an idle interval so new installs see LLM + Comfy at a glance.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { settingsTabHref } from '@/lib/settings-nav';
import {
  refreshSharedHealth,
  subscribeSharedHealth,
  type RawHealthResponse,
} from '@/lib/shared-health-poll';

type ChipHealth = {
  llmOk: boolean;
  comfyOk: boolean;
  diffusersOk: boolean;
};

const POLL_MS = 60_000;

function deriveChipHealth(data: RawHealthResponse): ChipHealth {
  const typed = data as {
    llm?: { ok?: boolean };
    comfyui?: { ok?: boolean };
    diffusers?: { ok?: boolean };
  } | null;
  return {
    llmOk: Boolean(typed?.llm?.ok),
    comfyOk: Boolean(typed?.comfyui?.ok),
    diffusersOk: Boolean(typed?.diffusers?.ok),
  };
}

function toneClass(ok: boolean | 'warn' | null): string {
  if (ok === 'warn') {
    return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
  }
  if (ok == null) {
    return 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-muted)]';
  }
  return ok
    ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
    : 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
}

export default function ConnectionHealthChip({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<ChipHealth | null>(null);

  useEffect(() => {
    // Shared with SystemTray/QueueTool/QueueOrchestrationPanel/MobileQueueTool — see
    // shared-health-poll.ts. This used to run its own independent fetch + 60s interval.
    const unsubscribe = subscribeSharedHealth(data => {
      scheduleAfterCommit(() => setHealth(deriveChipHealth(data)));
    }, POLL_MS);
    const onFocus = () => void refreshSharedHealth({ force: true });
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Diffusers is optional — chip "connected" means LLM + at least one image backend.
  const imageOk = Boolean(health?.comfyOk || health?.diffusersOk);
  const connected = Boolean(health?.llmOk && imageOk);
  // Rendering down is the one that stops work (red); the LLM only writes suggestions (amber).
  // Both are named in words, also in the compact header — a bare red dot meant nothing (UI audit
  // 2026-10-11).
  const label =
    health == null
      ? 'Checking…'
      : connected
        ? 'Ready'
        : !imageOk
          ? health.diffusersOk
            ? 'Image engine offline'
            : 'ComfyUI offline'
          : 'LLM offline';
  const tone: boolean | 'warn' | null =
    health == null ? null : connected ? true : !imageOk ? false : 'warn';
  const title =
    health == null
      ? 'Checking ComfyUI and the LLM…'
      : connected
        ? 'ComfyUI and the LLM answer — open Settings → Overview'
        : !imageOk
          ? 'ComfyUI isn’t reachable: nothing can render. Open Settings → Overview to fix the connection.'
          : 'The LLM isn’t reachable: rendering works, but suggested lines, written beats and reviews are off.';

  return (
    <Link
      href={settingsTabHref('overview')}
      title={title}
      data-testid="connection-health-chip"
      data-state={
        tone === true
          ? 'ready'
          : tone === false
            ? 'offline'
            : tone === 'warn'
              ? 'llm-offline'
              : 'checking'
      }
      className={`inline-flex items-center gap-2 rounded-[var(--radius-lg)] border px-2.5 py-1.5 text-[11px] font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${compact ? 'max-sm:min-h-8 max-sm:min-w-8 max-sm:justify-center ' : ''}${toneClass(tone)}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          tone == null
            ? 'bg-[var(--text-muted)]'
            : tone === true
              ? 'bg-[var(--tint-success-text)]'
              : tone === 'warn'
                ? 'bg-[var(--tint-warning-text)]'
                : 'bg-[var(--tint-danger-text)]'
        }`}
        aria-hidden
      />
      {compact ? (
        // Phone headers are tight: a dot alone while all is well; a problem is always in words.
        <span className={tone === true || tone == null ? 'sr-only' : 'whitespace-nowrap'}>
          {label}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{label}</span>
          {health ? (
            <span className="font-normal opacity-80">
              LLM {health.llmOk ? 'ok' : '—'} · Comfy {health.comfyOk ? 'ok' : '—'} · Diff{' '}
              {health.diffusersOk ? 'ok' : '—'}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );
}
