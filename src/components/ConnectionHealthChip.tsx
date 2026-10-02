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

function toneClass(ok: boolean | null): string {
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
  const label =
    health == null
      ? 'Checking…'
      : connected
        ? 'Ready'
        : !health.llmOk && !imageOk
          ? 'LLM & engines down'
          : !health.llmOk
            ? 'LLM unreachable'
            : health.comfyOk === false
              ? 'ComfyUI unreachable'
              : 'Image engine unreachable';

  return (
    <Link
      href={settingsTabHref('overview')}
      title="Open Settings → Overview for Heal & ready"
      className={`inline-flex items-center gap-2 rounded-[var(--radius-lg)] border px-2.5 py-1.5 text-[11px] font-medium transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${compact ? 'max-sm:min-h-8 max-sm:min-w-8 max-sm:justify-center ' : ''}${toneClass(
        health == null ? null : connected
      )}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          health == null
            ? 'bg-[var(--text-muted)]'
            : connected
              ? 'bg-[var(--tint-success-text)]'
              : 'bg-[var(--tint-danger-text)]'
        }`}
        aria-hidden
      />
      {compact ? (
        // Phone headers are tight: dot only below sm, the word beside it from sm up.
        <span className="sr-only sm:not-sr-only">{label}</span>
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
