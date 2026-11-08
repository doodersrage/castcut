'use client';

import { useMemo, useState } from 'react';
import PortraitTileStrip, { type PortraitTile } from '@/components/ui/PortraitTileStrip';
import { Button } from '@/components/ui/Button';
import { ChipButton, SelectInput } from '@/components/ui/Field';
import {
  sceneListGroupSummary,
  sceneListGroups,
  sceneListSourceOf,
  sceneListSources,
  type SceneListFilter,
  type SceneListItem,
  type SceneListScript,
} from '@/lib/day/scene-list';

const FILTERS: Array<{ id: SceneListFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unkept', label: 'No take kept' },
  { id: 'flagged', label: 'Needs a look' },
];

/**
 * Scene's list of the Cast's Scenes (lib/day/scene-list.ts). With no Scenes from a script it is
 * the one strip of tiles it always was; with them, one source at a time — a script, or the ones
 * made by hand — its Scenes by the script's scenes, only the open row showing its shots, and a
 * filter for what's left to do. The source and the open row follow the Scene you open.
 */
export default function SceneList<T extends SceneListItem>({
  scenes,
  scripts,
  flagged,
  activeId,
  onOpen,
  tileOf,
}: {
  /** In the list's order. */
  scenes: readonly T[];
  scripts: readonly SceneListScript[];
  /** The Scenes the Cast's run flagged for a look. */
  flagged: ReadonlySet<string>;
  activeId: string;
  onOpen: (sceneId: string) => void;
  tileOf: (scene: T) => PortraitTile;
}) {
  const sources = useMemo(() => sceneListSources(scenes, scripts), [scenes, scripts]);
  const active = scenes.find(scene => scene.id === activeId);
  const activeSource = active ? sceneListSourceOf(active, scripts) : null;
  const activeGroup =
    active?.fromScript && activeSource !== 'loose' ? active.fromScript.sceneId : '';
  // Picked by hand, until another Scene is opened: then the list follows that Scene.
  // group: a row opened by hand; null, the open row closed.
  const [picked, setPicked] = useState<{ for: string; source?: string; group?: string | null }>({
    for: activeId,
  });
  const choice = picked.for === activeId ? picked : { for: activeId };
  const [filter, setFilter] = useState<SceneListFilter>('all');
  const source =
    (choice.source && sources.some(entry => entry.id === choice.source) && choice.source) ||
    (activeSource && sources.some(entry => entry.id === activeSource) && activeSource) ||
    sources[0]?.id ||
    '';
  const groups = useMemo(
    () => sceneListGroups({ scenes, scripts, source, filter, flagged }),
    [scenes, scripts, source, filter, flagged]
  );

  // Nothing from a script: the strip as it was.
  if (!scenes.some(scene => scene.fromScript)) {
    return (
      <PortraitTileStrip
        label="Scenes"
        className="min-w-0 flex-1"
        value={activeId}
        testIdPrefix="scene-list-item"
        size="lg"
        onChange={onOpen}
        tiles={scenes.map(tileOf)}
      />
    );
  }

  const open =
    choice.group === null
      ? undefined
      : (groups.find(group => group.key === (choice.group ?? activeGroup)) ??
        (groups.length === 1 ? groups[0] : undefined));
  return (
    <div className="min-w-0 flex-1 space-y-2" data-testid="scene-list-grouped">
      <div className="flex flex-wrap items-center gap-2">
        {sources.length > 1 ? (
          <SelectInput
            aria-label="Which Scenes"
            className="w-auto max-w-[18rem]"
            value={source}
            data-testid="scene-list-source"
            onChange={event => setPicked({ for: activeId, source: event.target.value })}
          >
            {sources.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label} ({entry.count})
              </option>
            ))}
          </SelectInput>
        ) : (
          <span className="type-caption text-[var(--text-muted)]">{sources[0]?.label}</span>
        )}
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
          {FILTERS.map(entry => (
            <ChipButton
              key={entry.id}
              active={filter === entry.id}
              data-testid={`scene-list-filter-${entry.id}`}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
      </div>
      {groups.length ? (
        <ul className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
          {groups.map(group => {
            const isOpen = group.key === open?.key;
            return (
              <li
                key={group.key || 'loose'}
                data-testid={`scene-list-group-${group.key || 'loose'}`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full flex-wrap justify-between gap-x-3 text-left"
                  aria-expanded={isOpen}
                  data-testid={`scene-list-group-toggle-${group.key || 'loose'}`}
                  onClick={() =>
                    setPicked({
                      for: activeId,
                      source,
                      group: isOpen ? null : group.key,
                    })
                  }
                >
                  <span className="font-medium">
                    {isOpen ? '▾' : '▸'} {group.label}
                  </span>
                  <span className="type-caption text-[var(--text-muted)]">
                    {sceneListGroupSummary(group)}
                  </span>
                </Button>
                {isOpen ? (
                  <PortraitTileStrip
                    label={group.label}
                    className="mt-1"
                    value={activeId}
                    testIdPrefix="scene-list-item"
                    onChange={onOpen}
                    tiles={group.scenes.map(tileOf)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]" data-testid="scene-list-none">
          {filter === 'flagged'
            ? 'Nothing here needs a look.'
            : 'Every Scene here has a kept take.'}
        </p>
      )}
    </div>
  );
}
