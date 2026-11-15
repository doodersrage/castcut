'use client';

import { comfyModelLabel, type ComfyImageModel } from '@/lib/comfy-models/client';
import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { SegmentedControl, ToolSection } from '@/components/ui/ToolPageShell';
import { EPISODE_REDO_MAX } from '@/lib/day/episode-run';
import {
  animateKeptRun,
  flaggedByScene,
  keptTakesWithoutClip,
  RUN_DEFAULT_MAX_MINUTES,
  RUN_DEFAULT_MAX_TAKES,
  RUN_MAX_TAKES,
  runQueue,
  type SceneRun,
} from '@/lib/day/scene-run';
import type { SavedScene } from '@/lib/day/scenes';
import { runTierEngine, sceneHeldFromFinals, withRunTier, type RunTier } from '@/lib/day/run-tier';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { formatEta, typicalRenderMs } from '@/lib/queue/eta';

const FIELD =
  'w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

/**
 * A prepared run of takes (M5 W3): exactly what it will queue — Scene, engine, an estimate —
 * within limits you set, each Scene in or out, before anything renders. It never keeps a take,
 * unless it is an episode run (Part 19 G1): then it keeps the best by its checks, redoes a
 * failing one, animates the kept take, and lists any it wasn't sure of.
 */
export default function SceneRunPanel({
  run,
  scenes,
  disabled,
  onChange,
  onOpenScene,
  model,
  children,
}: {
  /**
   * The engine the run renders on (its takes' typical time, and the summary says which); a
   * tiered run renders on its tier's engine instead.
   */
  model?: string;
  /** Open a Scene (a flagged one, to check its kept take). */
  onOpenScene?: (sceneId: string) => void;
  run: SceneRun;
  scenes: readonly SavedScene[];
  disabled?: boolean;
  onChange: (next: SceneRun | null) => void;
  /** The run's controls (W4). */
  children?: React.ReactNode;
}) {
  const engine = runTierEngine(run.tier) ?? model;
  // A typical take's render time here: the Queue's own measure (recent finished jobs).
  const typicalSec = useMemo(() => typicalRenderMs(loadComfyGallery(), engine) / 1000, [engine]);
  const plan = useMemo(() => runQueue(run, scenes, typicalSec), [run, scenes, typicalSec]);
  const byId = useMemo(() => new Map(scenes.map(scene => [scene.id, scene])), [scenes]);
  const queuedIds = new Set(plan.queued.map(entry => entry.sceneId));
  const leftIds = new Set(plan.left.map(entry => entry.sceneId));
  const set = (patch: Partial<SceneRun>) => onChange({ ...run, ...patch, updatedAt: Date.now() });
  const toAnimate = useMemo(() => keptTakesWithoutClip(run, scenes), [run, scenes]);
  // A Final run holds back the shots whose newest preview you rejected (run-tier.ts).
  const heldCount =
    run.tier === 'final'
      ? run.items.filter(item => {
          const scene = byId.get(item.sceneId);
          return scene && sceneHeldFromFinals(scene);
        }).length
      : 0;
  // Dailies: the takes to check and the shots that failed, by scene (2026-11-12).
  const reviewGroups = useMemo(() => flaggedByScene(run, scenes), [run, scenes]);
  const reviewShots = reviewGroups.flatMap(entry => entry.shots);
  const failedCount = reviewShots.filter(shot => shot.failed).length;
  const checkCount = reviewShots.length - failedCount;
  const reviewSummary = [
    failedCount ? `${failedCount} failed — no take` : '',
    checkCount ? `${checkCount} to check — kept without passing its checks` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ToolSection title={`Run · ${run.label}`} data-testid="scene-run">
      <div className="space-y-2">
        <p className="type-caption" data-testid="scene-run-summary">
          {plan.queued.length
            ? `${run.tier === 'preview' ? 'Preview: ' : run.tier === 'final' ? 'Final: ' : ''}${plan.queued.length} take${plan.queued.length === 1 ? '' : 's'}, one at a time, about ${formatEta(plan.totalSec).replace('~', '')}${engine ? ` on ${comfyModelLabel(engine as ComfyImageModel)}` : ''}`
            : 'Nothing to queue with these limits.'}
          {heldCount
            ? ` · ${heldCount} held back — you rejected its preview (preview it again, or restore the take)`
            : ''}
          {plan.left.length ? ` · ${plan.left.length} past the limits` : ''}
          {plan.gone.length
            ? ` · ${plan.gone.length} Scene${plan.gone.length === 1 ? '' : 's'} gone`
            : ''}
          {run.tier === 'preview'
            ? ' · drafts for the animatic: unchecked, never kept — reject one in its Scene to change it before the Final.'
            : run.auto?.keep
              ? ' · it keeps the best take by its checks; any it isn’t sure of are listed for you.'
              : ' · it never keeps a take: you choose.'}
        </p>
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          title="Preview drafts every shot quickly for the animatic; Final renders the shots you didn't reject on the finishing engine, checked, on the server overnight."
        >
          <span className="type-caption text-[var(--text-muted)]">Tier</span>
          <SegmentedControl<RunTier | 'none'>
            aria-label="Tier"
            value={run.tier ?? 'none'}
            onChange={next => {
              if (disabled || run.state === 'running') return;
              onChange({
                ...withRunTier(run, next === 'none' ? undefined : next, scenes),
                updatedAt: Date.now(),
              });
            }}
            options={[
              { value: 'none', label: 'As set', testId: 'scene-run-tier-none' },
              { value: 'preview', label: 'Preview', testId: 'scene-run-tier-preview' },
              { value: 'final', label: 'Final', testId: 'scene-run-tier-final' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            At most
            <input
              type="number"
              min={1}
              max={RUN_MAX_TAKES}
              aria-label="At most this many takes"
              className={FIELD}
              value={run.maxTakes}
              disabled={disabled || run.state === 'running'}
              data-testid="scene-run-max-takes"
              onChange={event => {
                const value = Math.round(Number(event.target.value));
                if (value >= 1) set({ maxTakes: Math.min(RUN_MAX_TAKES, value) });
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
          <label
            className="flex items-center gap-1"
            title="A reload, a restart or a crash pauses the run — this resumes it a few seconds after the page opens again"
          >
            <input
              type="checkbox"
              checked={run.resumeOnReload === true}
              disabled={disabled}
              data-testid="scene-run-resume-on-reload"
              onChange={event => set({ resumeOnReload: event.target.checked || undefined })}
            />
            Resume by itself after a reload
          </label>
          <label
            className="flex items-center gap-1"
            title="The server renders it: close the page and come back to the takes. Stills only for now — Animate, marks repair and Auto-review stay with the page (a take they didn't see is flagged)."
          >
            <input
              type="checkbox"
              checked={run.onServer === true}
              // A tiered run renders on the server.
              disabled={disabled || run.state === 'running' || Boolean(run.tier)}
              data-testid="scene-run-on-server"
              onChange={event => set({ onServer: event.target.checked || undefined })}
            />
            Render on the server (the page can be closed)
          </label>
        </div>
        <fieldset
          className="flex flex-wrap items-center gap-3 text-sm"
          data-testid="scene-run-episode"
          // A tier sets these itself (run-tier.ts).
          disabled={disabled || run.state === 'running' || Boolean(run.tier)}
        >
          <legend className="type-caption mb-1 text-[var(--text-muted)]">
            Episode — for a whole script, unattended
            {run.onServer ? ' (on the server: no Animate yet)' : ' (keep this page open)'}
          </legend>
          <label
            className="flex items-center gap-1"
            title="After each take and its checks (Auto-review, face and pose), keep the best of the Scene's takes — the run doesn't wait for you"
          >
            <input
              type="checkbox"
              checked={run.auto?.keep === true}
              data-testid="scene-run-auto-keep"
              onChange={event => {
                const keep = event.target.checked;
                const redo = run.auto?.redo ?? 1;
                const included = run.items.filter(item => item.include).length;
                set({
                  auto: {
                    redo,
                    animate: keep && run.auto?.animate === true,
                    ...(run.auto?.animateOnly ? { animateOnly: run.auto.animateOnly } : {}),
                    keep,
                  },
                  // Limits still at their defaults fit the whole script and its redos.
                  ...(keep && run.maxTakes === RUN_DEFAULT_MAX_TAKES
                    ? { maxTakes: Math.min(RUN_MAX_TAKES, Math.max(1, included * (1 + redo))) }
                    : {}),
                  ...(keep && run.maxMinutes === RUN_DEFAULT_MAX_MINUTES
                    ? { maxMinutes: 24 * 60 }
                    : {}),
                });
              }}
            />
            Keep the best take by its checks
          </label>
          <label className="flex items-center gap-1">
            redo a failing take
            <select
              aria-label="Times to render a failing take again"
              className={FIELD}
              value={run.auto?.redo ?? 1}
              disabled={!run.auto?.keep}
              data-testid="scene-run-auto-redo"
              onChange={event =>
                set({
                  auto: {
                    keep: true,
                    animate: run.auto?.animate === true,
                    ...(run.auto?.animateOnly ? { animateOnly: run.auto.animateOnly } : {}),
                    redo: Number(event.target.value),
                  },
                })
              }
            >
              {Array.from({ length: EPISODE_REDO_MAX + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
          <label
            className="flex items-center gap-1"
            title="Animate the kept take with the page's Animate (a talking clip when the shot has a line) before the next Scene"
          >
            <input
              type="checkbox"
              checked={run.auto?.animate === true}
              disabled={!run.auto?.keep}
              data-testid="scene-run-auto-animate"
              onChange={event =>
                set({
                  auto: {
                    keep: true,
                    redo: run.auto?.redo ?? 1,
                    animate: event.target.checked,
                    ...(run.auto?.animateOnly ? { animateOnly: run.auto.animateOnly } : {}),
                  },
                })
              }
            />
            Animate each kept take
          </label>
          <label className="flex items-center gap-1">
            <select
              aria-label="Which kept takes to animate"
              className={FIELD}
              value={run.auto?.animateOnly ?? 'all'}
              disabled={!run.auto?.animate}
              data-testid="scene-run-auto-animate-only"
              title="Every shot, or only the shots where someone speaks (talking clips, the stills between held) — fewer clips, so a night goes further"
              onChange={event =>
                set({
                  auto: {
                    keep: true,
                    redo: run.auto?.redo ?? 1,
                    animate: true,
                    ...(event.target.value === 'lines' ? { animateOnly: 'lines' as const } : {}),
                  },
                })
              }
            >
              <option value="all">every shot</option>
              <option value="lines">shots with a line</option>
            </select>
          </label>
        </fieldset>
        {run.auto?.keep ? (
          <label
            className="flex items-center gap-1 text-sm"
            title="The first shot of each script scene renders its empty room, and every shot of that scene is set in that room (the shots stop changing kitchens). The room photo takes the pose map's place: the pose stays in words."
          >
            <input
              type="checkbox"
              checked={run.auto.oneRoom === true}
              disabled={disabled || run.state === 'running'}
              data-testid="scene-run-one-room"
              onChange={event => {
                const { oneRoom: _was, ...auto } = run.auto!;
                set({ auto: { ...auto, ...(event.target.checked ? { oneRoom: true } : {}) } });
              }}
            />
            One room a scene
          </label>
        ) : null}
        {reviewGroups.length ? (
          <div className="space-y-1" data-testid="scene-run-flagged">
            <p className="type-caption font-medium">{reviewSummary}</p>
            {reviewGroups.map(({ group, shots }) => (
              <div key={group} className="space-y-0.5">
                <p className="type-caption text-[var(--text-muted)]">{group}</p>
                <ul className="space-y-1">
                  {shots.map(shot => (
                    <li
                      key={shot.sceneId}
                      className="flex items-center gap-3 text-sm"
                      data-failed={shot.failed ? 'true' : undefined}
                    >
                      {shot.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI take
                        <img
                          src={shot.thumb}
                          alt=""
                          className="aspect-video w-32 shrink-0 rounded-[var(--radius-sm)] object-cover"
                        />
                      ) : (
                        <span className="type-caption flex aspect-video w-32 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]">
                          {shot.failed ? 'No take' : ''}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{shot.name}</span>
                        <span
                          className={`type-caption block ${shot.failed ? 'text-[var(--tint-danger-text)]' : 'text-[var(--text-muted)]'}`}
                        >
                          {shot.why}
                        </span>
                      </span>
                      {onOpenScene && byId.has(shot.sceneId) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={disabled}
                          data-testid={`scene-run-flagged-open-${shot.sceneId}`}
                          onClick={() => onOpenScene(shot.sceneId)}
                        >
                          Open
                        </Button>
                      ) : null}
                      {shot.failed ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`scene-run-flagged-fine-${shot.sceneId}`}
                          title="You looked: it's fine — off the list"
                          onClick={() => {
                            const { [shot.sceneId]: _gone, ...rest } = run.flagged ?? {};
                            set({ flagged: rest });
                          }}
                        >
                          Looks fine
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
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
          {(run.state === 'done' || run.state === 'cancelled') && toAnimate > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              data-testid="scene-run-animate-kept"
              title="The run again on this page, rendering nothing new: each kept take made a clip (a talking clip when its shot has a line)"
              onClick={() => onChange(animateKeptRun(run))}
            >
              Animate the kept takes ({toAnimate})
            </Button>
          ) : null}
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
