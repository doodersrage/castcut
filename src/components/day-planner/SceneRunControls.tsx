'use client';

import { Button } from '@/components/ui/Button';
import { runProgress, type SceneRun } from '@/lib/day/scene-run';
import type { SavedScene } from '@/lib/day/scenes';

const STATE_LABELS: Record<SceneRun['state'], string> = {
  prepared: 'Ready',
  running: 'Running',
  paused: 'Paused',
  handed: 'In ComfyUI',
  done: 'Done',
  cancelled: 'Cancelled',
};

/**
 * A run's controls and record (M5 W4 / W5): Start or Resume, Pause and Cancel (after the take in
 * flight), how far it got, why it stopped, and every step it took. Queue all hands every take to
 * ComfyUI so the page can close (Part 14 A).
 */
export default function SceneRunControls({
  run,
  scenes,
  looping,
  stopping,
  disabled,
  onStart,
  onQueueAll,
  onStop,
}: {
  run: SceneRun;
  scenes: readonly SavedScene[];
  looping: boolean;
  stopping: 'pause' | 'cancel' | null;
  disabled?: boolean;
  onStart: () => void;
  onQueueAll?: () => void;
  onStop: (how: 'pause' | 'cancel') => void;
}) {
  const progress = runProgress(run, scenes);
  const nameOf = (id?: string) => scenes.find(scene => scene.id === id)?.name ?? id ?? '';
  const finished = run.state === 'done' || run.state === 'cancelled';
  const handed = run.handOff ? Object.keys(run.handOff.handed).length : 0;
  return (
    <div className="w-full space-y-2" data-testid="scene-run-controls">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="type-caption font-medium"
          data-testid="scene-run-state"
          data-state={run.state}
        >
          {STATE_LABELS[run.state]} · {progress.done} of {progress.total} done
          {run.handOff && handed > progress.done ? ` · ${handed - progress.done} in ComfyUI` : ''}
          {run.current ? ` · now: ${nameOf(run.current.sceneId)}` : ''}
          {stopping ? ` · ${stopping === 'pause' ? 'pausing' : 'cancelling'} after this take` : ''}
        </span>
        {!finished && !looping && run.state !== 'handed' ? (
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || progress.total === progress.done}
            data-testid="scene-run-start"
            onClick={onStart}
          >
            {run.state === 'prepared' ? 'Start the run' : 'Resume'}
          </Button>
        ) : null}
        {run.state === 'prepared' && !looping && onQueueAll ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || progress.total === progress.done}
            data-testid="scene-run-queue-all"
            title="Put every take together now and hand them all to ComfyUI — then this page can close. Checks that run on the card (face finish, review) don’t run on them."
            onClick={onQueueAll}
          >
            Queue all
          </Button>
        ) : null}
        {looping ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(stopping)}
              data-testid="scene-run-pause"
              title="Stop after the take rendering now"
              onClick={() => onStop('pause')}
            >
              Pause
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={stopping === 'cancel'}
              data-testid="scene-run-cancel"
              title="Stop for good after the take rendering now (nothing else is queued)"
              onClick={() => onStop('cancel')}
            >
              Cancel
            </Button>
          </>
        ) : !finished && run.state !== 'prepared' ? (
          <Button
            size="sm"
            variant="ghost"
            data-testid="scene-run-cancel"
            title={
              run.state === 'handed'
                ? 'Take the takes ComfyUI hasn’t started out of its queue'
                : undefined
            }
            onClick={() => onStop('cancel')}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {run.stopReason && run.state === 'paused' ? (
        <p className="type-caption ui-status-danger" data-testid="scene-run-stop-reason">
          {run.stopReason}
        </p>
      ) : null}
      {(run.state === 'running' || looping) && run.handOff ? (
        <p className="type-caption text-[var(--text-muted)]">
          Handing each take to ComfyUI — keep this page open until they are all queued (the first
          take in an outfit dresses its plate first).
        </p>
      ) : run.state === 'running' || looping ? (
        <p className="type-caption text-[var(--text-muted)]">
          It runs while this page is open — closing it pauses the run, and it resumes from here.
        </p>
      ) : null}
      {run.state === 'handed' ? (
        <p className="type-caption text-[var(--text-muted)]" data-testid="scene-run-handed-note">
          Every take is in ComfyUI’s queue — this page can close. Each lands on its own Scene.
        </p>
      ) : null}
      <details data-testid="scene-run-log">
        <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
          What it did ({run.log.length})
        </summary>
        <ol className="mt-1 max-h-48 space-y-0.5 overflow-auto">
          {[...run.log].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="type-caption" data-event={entry.event}>
              <span className="text-[var(--text-muted)]">
                {new Date(entry.at).toLocaleTimeString()}
              </span>{' '}
              <span className="font-medium">{entry.event}</span>
              {entry.sceneId ? ` · ${nameOf(entry.sceneId)}` : ''}
              {entry.detail ? ` · ${entry.detail}` : ''}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
