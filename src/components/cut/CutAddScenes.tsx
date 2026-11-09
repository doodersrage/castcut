'use client';

import { useState, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';

const SELECT =
  'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm';

/**
 * A scene from another script in this script's cut (Step 5e): a short's moment in an episode, say
 * — which script, which of its scenes, after which scene here. Added ones are listed, each with
 * Take out (its Scenes and takes stay where they are).
 */
export default function CutAddScenes({
  scripts,
  afterChoices,
  added,
  busy,
  onAdd,
  onRemove,
  initial,
}: {
  scripts: ReadonlyArray<{
    id: string;
    name: string;
    scenes: ReadonlyArray<{ sceneId: string; heading: string }>;
  }>;
  afterChoices: ReadonlyArray<{ heading: string; afterKey: string }>;
  added: ReadonlyArray<{ scriptName: string; headings: string[]; shots: number }>;
  busy?: boolean;
  onAdd: (scriptId: string, sceneIds: string[], afterKey: string | null) => void;
  onRemove: (index: number) => void;
  /** Arrived to add this (Short's "Add to a cut"): its script and Scene picked. */
  initial?: { scriptId: string; sceneId: string } | null;
}) {
  const [scriptId, setScriptId] = useState(initial?.scriptId ?? scripts[0]?.id ?? '');
  const script = scripts.find(entry => entry.id === scriptId) ?? scripts[0];
  const [sceneId, setSceneId] = useState(initial?.sceneId ?? '');
  const scene = script?.scenes.find(entry => entry.sceneId === sceneId) ?? script?.scenes[0];
  const [after, setAfter] = useState<string>(afterChoices.at(-1)?.afterKey ?? '');
  if (!scripts.length && !added.length) return null;
  return (
    <div className="mt-2 space-y-1 text-sm" data-testid="cut-add-scenes">
      {scripts.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption text-[var(--text-muted)]">Add a scene from</span>
          <select
            aria-label="Script to add a scene from"
            className={SELECT}
            value={script?.id ?? ''}
            disabled={busy}
            data-testid="cut-add-scenes-script"
            onChange={event => {
              setScriptId(event.target.value);
              setSceneId('');
            }}
          >
            {scripts.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Its scene"
            className={SELECT}
            value={scene?.sceneId ?? ''}
            disabled={busy}
            data-testid="cut-add-scenes-scene"
            onChange={event => setSceneId(event.target.value)}
          >
            {script?.scenes.map(entry => (
              <option key={entry.sceneId} value={entry.sceneId}>
                {entry.heading}
              </option>
            ))}
          </select>
          <select
            aria-label="Where it goes"
            className={SELECT}
            value={after}
            disabled={busy}
            data-testid="cut-add-scenes-after"
            onChange={event => setAfter(event.target.value)}
          >
            <option value="">at the start</option>
            {afterChoices.map(choice => (
              <option key={choice.afterKey} value={choice.afterKey}>
                after {choice.heading}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !script || !scene}
            data-testid="cut-add-scenes-add"
            onClick={() => script && scene && onAdd(script.id, [scene.sceneId], after || null)}
          >
            Add
          </Button>
        </div>
      ) : null}
      {added.map((entry, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2"
          data-testid="cut-added-scene"
        >
          <span className="type-caption">
            From “{entry.scriptName}”: {entry.headings.join(', ') || 'its Scenes are gone'}
            <span className="text-[var(--text-muted)]">
              {' '}
              · {entry.shots} shot{entry.shots === 1 ? '' : 's'}
            </span>
          </span>
          <Button
            size="sm"
            variant="link"
            disabled={busy}
            data-testid="cut-added-scene-remove"
            onClick={() => onRemove(index)}
          >
            Take out
          </Button>
        </div>
      ))}
    </div>
  );
}

/**
 * The add box as the URL asks (Short's "Add to a cut": ?add=<script id> picks that script) — or,
 * with no script's cut open, what to do first. Inside a Suspense boundary (it reads the URL).
 */
export function CutAddScenesHere({
  hasScript,
  ...props
}: Omit<ComponentProps<typeof CutAddScenes>, 'initial'> & { hasScript: boolean }) {
  const add = useSearchParams().get('add')?.trim() || '';
  if (hasScript)
    return (
      <CutAddScenes
        key={add || 'none'}
        {...props}
        initial={add ? { scriptId: add, sceneId: '' } : null}
      />
    );
  return add ? (
    <p
      className="type-caption mt-2 text-[var(--text-muted)]"
      data-testid="cut-add-scenes-needs-script"
    >
      To add a short’s scene to a cut, open that cut first — an episode’s, from its Script (Cut its
      Scenes) — then add it there.
    </p>
  ) : null;
}
