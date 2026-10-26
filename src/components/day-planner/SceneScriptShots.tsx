'use client';

import { Button } from '@/components/ui/Button';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import type { SavedScene } from '@/lib/day/scenes';
import {
  addedShot,
  draftShots,
  SHOT_FRAMING_LABELS,
  SHOT_PURPOSE_LABELS,
  SHOT_PURPOSES,
  SHOTS_PER_SCENE,
  shotLabel,
  type PlannedShot,
  type ShotPurpose,
} from '@/lib/day/script-shots';
import type { CameraShot } from '@/lib/pose/camera-shot';
import type { ScriptScene } from '@/lib/script/parse';

const FIELD =
  'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

/** Where a planned shot is in production: its Scene, and whether that has a take or a keeper. */
function shotStatus(shot: PlannedShot, scenes: readonly SavedScene[]) {
  const scene = shot.madeSceneId ? scenes.find(entry => entry.id === shot.madeSceneId) : undefined;
  if (!scene) return { scene, label: 'Planned', tone: 'text-[var(--text-muted)]' };
  if (scene.keptTakeId) return { scene, label: 'Kept take', tone: 'ui-status-success' };
  if (scene.takes.length) {
    return {
      scene,
      label: `${scene.takes.length} take${scene.takes.length === 1 ? '' : 's'}`,
      tone: '',
    };
  }
  return { scene, label: 'Scene made', tone: '' };
}

/**
 * A script scene's shot list (M3 S4): draft it, edit each shot (purpose, framing, what happens,
 * length), add or remove shots, and Make it a Scene — or open the Scene it already is.
 */
export default function SceneScriptShots({
  scene,
  sceneIndex,
  shots,
  scenes,
  onShots,
  onMake,
  onOpenScene,
}: {
  scene: ScriptScene;
  sceneIndex: number;
  /** This script scene's shots. */
  shots: readonly PlannedShot[];
  /** The Cast's Scenes, to show what each shot became. */
  scenes: readonly SavedScene[];
  onShots: (next: PlannedShot[]) => void;
  onMake: (shot: PlannedShot, shotIndex: number) => void;
  onOpenScene: (sceneId: string) => void;
}) {
  const number = scene.number ?? String(sceneIndex + 1);
  const change = (id: string, patch: Partial<PlannedShot>) =>
    onShots(shots.map(shot => (shot.id === id ? { ...shot, ...patch } : shot)));
  const remove = async (shot: PlannedShot, made: boolean) => {
    if (made) {
      const ok = await confirmAction({
        title: 'Remove this shot from the list?',
        body: 'Its Scene and takes stay on the Scene page.',
        confirmLabel: 'Remove shot',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onShots(shots.filter(entry => entry.id !== shot.id));
  };
  const seconds = shots.reduce((sum, shot) => sum + shot.seconds, 0);

  return (
    <div
      className="mt-2 space-y-1 border-t border-[var(--border-subtle)] pt-2"
      data-testid={`script-shots-${scene.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="type-caption font-medium">Shots</h5>
        {shots.length ? (
          <span className="type-caption text-[var(--text-muted)]">
            {shots.length} · about {seconds}s
          </span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            data-testid={`script-shots-draft-${scene.id}`}
            onClick={() => onShots(draftShots(scene))}
          >
            Draft shots
          </Button>
        )}
      </div>
      {shots.length ? (
        <ol className="space-y-1">
          {shots.map((shot, index) => {
            const status = shotStatus(shot, scenes);
            return (
              <li
                key={shot.id}
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] px-2 py-1"
                data-testid={`script-shot-${shot.id}`}
                data-status={status.scene ? 'made' : 'planned'}
              >
                <span className="w-10 font-mono text-xs font-medium">
                  {shotLabel(number, index)}
                </span>
                <select
                  aria-label={`Shot ${shotLabel(number, index)} purpose`}
                  className={FIELD}
                  value={shot.purpose}
                  onChange={event =>
                    change(shot.id, { purpose: event.target.value as ShotPurpose })
                  }
                >
                  {SHOT_PURPOSES.map(purpose => (
                    <option key={purpose} value={purpose}>
                      {SHOT_PURPOSE_LABELS[purpose]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Shot ${shotLabel(number, index)} framing`}
                  className={FIELD}
                  value={shot.framing}
                  onChange={event => change(shot.id, { framing: event.target.value as CameraShot })}
                >
                  {(Object.keys(SHOT_FRAMING_LABELS) as CameraShot[]).map(framing => (
                    <option key={framing} value={framing}>
                      {SHOT_FRAMING_LABELS[framing]}
                    </option>
                  ))}
                </select>
                {shot.line ? (
                  <span className="min-w-[10rem] flex-1 text-sm">
                    <span className="font-medium">{shot.speaker}</span>: “{shot.line}”
                  </span>
                ) : (
                  <input
                    aria-label={`Shot ${shotLabel(number, index)}: what happens`}
                    className={`${FIELD} min-w-[10rem] flex-1`}
                    placeholder={
                      shot.purpose === 'reaction'
                        ? `${shot.who[0] ?? 'They'} reacts`
                        : 'What happens'
                    }
                    defaultValue={shot.action ?? ''}
                    onBlur={event => {
                      const action = event.target.value.trim();
                      if (action !== (shot.action ?? ''))
                        change(shot.id, { action: action || undefined });
                    }}
                  />
                )}
                <label className="type-caption flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    aria-label={`Shot ${shotLabel(number, index)} seconds`}
                    className={`${FIELD} w-14`}
                    value={shot.seconds}
                    onChange={event => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 1)
                        change(shot.id, { seconds: Math.min(120, Math.round(value)) });
                    }}
                  />
                  s
                </label>
                <span
                  className={`type-caption ${status.tone}`}
                  data-testid={`script-shot-status-${shot.id}`}
                >
                  {status.label}
                </span>
                {status.scene ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`script-shot-open-${shot.id}`}
                    onClick={() => onOpenScene(status.scene!.id)}
                  >
                    Open scene
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`script-shot-make-${shot.id}`}
                    onClick={() => onMake(shot, index)}
                  >
                    Make it a Scene
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove shot ${shotLabel(number, index)}`}
                  data-testid={`script-shot-remove-${shot.id}`}
                  onClick={() => void remove(shot, Boolean(status.scene))}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {shots.length && shots.length < SHOTS_PER_SCENE ? (
        <Button
          size="sm"
          variant="ghost"
          data-testid={`script-shots-add-${scene.id}`}
          onClick={() => onShots([...shots, addedShot(shots, scene)])}
        >
          Add a shot
        </Button>
      ) : null}
    </div>
  );
}
