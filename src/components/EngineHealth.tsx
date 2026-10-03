'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import {
  engineForModel,
  engineHealthChipLabel,
  type EngineHealth as EngineHealthResult,
} from '@/lib/engine-health-engines';
import { ENGINE_HEALTH_UPDATED_EVENT, readEngineHealth } from '@/lib/engine-health-store';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';

/** The check builds a graph (queue runtime, preview) — loaded only when one is needed. */
async function checkEngineHealth(
  model: string,
  options?: { force?: boolean }
): Promise<EngineHealthResult> {
  const lib = await import('@/lib/engine-health-client');
  return lib.checkEngineHealth(model, options);
}

const TaskRequirementsCard = dynamic(() => import('@/components/TaskRequirementsCard'), {
  ssr: false,
  loading: () => null,
});

function subscribe(onChange: () => void): () => void {
  window.addEventListener(ENGINE_HEALTH_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(ENGINE_HEALTH_UPDATED_EVENT, onChange);
}

/**
 * Health of a pickable engine (Rapid, Edit 2511, 2.1 Pruna, Klein, WAN, LTX-2.5) on the current
 * ComfyUI — null for other models and until the first check lands. Asks for a check when none
 * is cached.
 */
export function useEngineHealth(model: string | undefined): EngineHealthResult | null {
  const tracked = Boolean(engineForModel(model));
  const health = useSyncExternalStore(
    subscribe,
    () => (tracked ? readEngineHealth(model) : null),
    () => null
  );
  useEffect(() => {
    if (tracked && model && !health) void checkEngineHealth(model);
  }, [health, model, tracked]);
  return health;
}

/** Dot + short state for the header Engine chip; nothing until the engine was checked. */
export function EngineHealthChipBadge({ model }: { model: string | undefined }) {
  const health = useEngineHealth(model);
  if (!health || health.state === 'unknown') return null;
  return (
    <span
      className="tool-engine-chip-health"
      data-state={health.state}
      data-testid="tool-engine-chip-health"
      title={health.summary}
    >
      {health.state === 'ready' ? (
        <span className="sr-only">{health.summary}</span>
      ) : (
        engineHealthChipLabel(health.state)
      )}
    </span>
  );
}

/**
 * Under the Engine's model picker (and Day's Animate): what this ComfyUI lacks for the picked
 * engine, with the install / download action that fixes it. One quiet line when it is ready.
 */
export function EngineHealthNote({
  model,
  testId = 'engine-health-note',
  hideReady = false,
  className = '',
}: {
  model: string | undefined;
  testId?: string;
  hideReady?: boolean;
  className?: string;
}) {
  const health = useEngineHealth(model);
  const engine = engineForModel(model);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    if (!model) return;
    setBusy(true);
    try {
      await checkEngineHealth(model, { force: true });
    } finally {
      setBusy(false);
    }
  }, [model]);

  const install = useCallback(async () => {
    if (!health || !model) return;
    setBusy(true);
    setMessage(null);
    try {
      const { requestComfyManagerInstall } = await import('@/lib/comfyui-manager-install-client');
      const result = await requestComfyManagerInstall({
        nodeTypes: health.missingNodes,
        comfyUrl: health.comfyUrl || undefined,
      });
      setMessage(result.message || null);
      await checkEngineHealth(model, { force: true });
    } finally {
      setBusy(false);
    }
  }, [health, model]);

  if (!engine || !health) return null;
  if (health.state === 'ready') {
    return hideReady ? null : (
      <p
        className={`type-caption text-[var(--tint-success-text)] ${className}`.trim()}
        data-testid={testId}
        data-state="ready"
      >
        {engine.label} is ready on this ComfyUI.
      </p>
    );
  }
  if (health.state === 'unknown') {
    return hideReady ? null : (
      <p
        className={`type-caption text-[var(--text-muted)] ${className}`.trim()}
        data-testid={testId}
        data-state="unknown"
        title={health.error}
      >
        {engine.label}: {health.summary}.{' '}
        <button
          type="button"
          className="ui-text-link"
          disabled={busy}
          onClick={() => void recheck()}
        >
          Check again
        </button>
      </p>
    );
  }
  return (
    <div
      className={`space-y-2 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 ${className}`.trim()}
      data-testid={testId}
      data-state={health.state}
    >
      <p className="text-xs leading-relaxed text-[var(--tint-warning-text)]">
        {engine.label} can’t run on this ComfyUI yet — {health.summary.toLowerCase()}.
      </p>
      {health.missingNodes.length > 0 ? (
        <p className="type-caption text-[var(--text-secondary)]">
          Nodes: {health.missingNodes.join(', ')}
          {health.nodePacks.length > 0 ? ` (${health.nodePacks.join(', ')})` : ''}
        </p>
      ) : null}
      {health.missingModels.length > 0 ? (
        <p className="type-caption break-words text-[var(--text-secondary)]">
          Models: {health.missingModels.map(entry => entry.filename).join(', ')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {health.missingNodes.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            data-testid={`${testId}-install`}
            onClick={() => void install()}
          >
            {busy ? 'Installing…' : 'Install nodes'}
          </Button>
        ) : null}
        {health.missingModels.length > 0 ? (
          <Link
            href={settingsComfyUiSectionHref('model-assets')}
            className="ui-text-link type-caption"
          >
            Models in Settings →
          </Link>
        ) : null}
        <button
          type="button"
          className="ui-text-link type-caption"
          disabled={busy}
          onClick={() => void recheck()}
        >
          Check again
        </button>
      </div>
      {health.missingModels.length > 0 && model ? (
        <TaskRequirementsCard task={engine.label} input={{ model }} testId={`${testId}-download`} />
      ) : null}
      {message ? <p className="type-caption text-[var(--text-secondary)]">{message}</p> : null}
    </div>
  );
}
