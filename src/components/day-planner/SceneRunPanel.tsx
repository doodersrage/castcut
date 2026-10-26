'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { runQueue, type SceneRun } from '@/lib/day/scene-run';
import type { SavedScene } from '@/lib/day/scenes';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { formatEta, typicalRenderMs } from '@/lib/queue/eta';

const FIELD =
  'w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

/**
 * A prepared run of takes (M5 W3): exactly what it will queue — Scene, engine, an estimate —
 * within limits you set, each Scene in or out, before anything renders. It never keeps a take.
 */
export default function SceneRunPanel({
  run,
  scenes,
  disabled,
  onChange,
  children,
}: {
  run: SceneRun;
  scenes: readonly SavedScene[];
  disabled?: boolean;
  onChange: (next: SceneRun | null) => void;
  /** The run's controls (W4). */
  children?: React.ReactNode;
}) {
  // A typical take's render time here: the Queue's own measure (recent finished jobs).
  const typicalSec = useMemo(() => typicalRenderMs(loadComfyGallery()) / 1000, []);
  const plan = useMemo(() => runQueue(run, scenes, typicalSec), [run, scenes, typicalSec]);
  const byId = useMemo(() => new Map(scenes.map(scene => [scene.id, scene])), [scenes]);
  const queuedIds = new Set(plan.queued.map(entry => entry.sceneId));
  const leftIds = new Set(plan.left.map(entry => entry.sceneId));
  const set = (patch: Partial<SceneRun>) => onChange({ ...run, ...patch, updatedAt: Date.now() });

  return (
    <ToolSection title={`Run · ${run.label}`} data-testid="scene-run">
      <div className="space-y-2">
        <p className="type-caption" data-testid="scene-run-summary">
          {plan.queued.length
            ? `${plan.queued.length} take${plan.queued.length === 1 ? '' : 's'}, one at a time, about ${formatEta(plan.totalSec).replace('~', '')}`
            : 'Nothing to queue with these limits.'}
          {plan.left.length ? ` · ${plan.left.length} past the limits` : ''}
          {plan.gone.length
            ? ` · ${plan.gone.length} Scene${plan.gone.length === 1 ? '' : 's'} gone`
            : ''}
          {' · it never keeps a take: you choose.'}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            At most
            <input
              type="number"
              min={1}
              max={60}
              aria-label="At most this many takes"
              className={FIELD}
              value={run.maxTakes}
              disabled={disabled || run.state === 'running'}
              data-testid="scene-run-max-takes"
              onChange={event => {
                const value = Math.round(Number(event.target.value));
                if (value >= 1) set({ maxTakes: Math.min(60, value) });
              }}
            />
            takes
          </label>
          <label className="flex items-center gap-1">
            about
            <input
              type="number"
              min={1}
              aria-label="About this many minutes"
              className={FIELD}
              value={run.maxMinutes}
              disabled={disabled || run.state === 'running'}
              data-testid="scene-run-max-minutes"
              onChange={event => {
                const value = Math.round(Number(event.target.value));
                if (value >= 1) set({ maxMinutes: value });
              }}
            />
            min
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={run.skipKept}
              disabled={disabled || run.state === 'running'}
              data-testid="scene-run-skip-kept"
              onChange={event => set({ skipKept: event.target.checked })}
            />
            Leave out Scenes with a kept take
          </label>
        </div>
        <ol className="space-y-0.5">
          {run.items.map(item => {
            const scene = byId.get(item.sceneId);
            const entry =
              plan.queued.find(e => e.sceneId === item.sceneId) ??
              plan.left.find(e => e.sceneId === item.sceneId);
            const status = !scene
              ? 'gone'
              : !item.include
                ? 'left out'
                : run.skipKept && scene.keptTakeId
                  ? 'has a kept take'
                  : queuedIds.has(item.sceneId)
                    ? `${entry?.engine} · ${formatEta(entry?.estimateSec ?? 0)}`
                    : leftIds.has(item.sceneId)
                      ? 'past the limits'
                      : '';
            return (
              <li
                key={item.sceneId}
                className="flex items-center gap-2 text-sm"
                data-testid={`scene-run-item-${item.sceneId}`}
                data-queued={queuedIds.has(item.sceneId)}
              >
                <input
                  type="checkbox"
                  aria-label={`Include ${scene?.name ?? 'this Scene'}`}
                  checked={item.include}
                  disabled={disabled || run.state === 'running' || !scene}
                  onChange={event =>
                    set({
                      items: run.items.map(entry =>
                        entry.sceneId === item.sceneId
                          ? { ...entry, include: event.target.checked }
                          : entry
                      ),
                    })
                  }
                />
                <span
                  className={`min-w-0 flex-1 truncate ${queuedIds.has(item.sceneId) ? '' : 'text-[var(--text-muted)]'}`}
                >
                  {scene?.name ?? item.sceneId}
                </span>
                <span className="type-caption text-[var(--text-muted)]">{status}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || run.state === 'running'}
            data-testid="scene-run-discard"
            onClick={() =>
              void confirmAction({
                title: 'Discard this run?',
                body: 'Its Scenes stay, with their takes. Only the run’s list goes.',
                confirmLabel: 'Discard run',
              }).then(ok => {
                if (ok) onChange(null);
              })
            }
          >
            Discard run
          </Button>
        </div>
      </div>
    </ToolSection>
  );
}
