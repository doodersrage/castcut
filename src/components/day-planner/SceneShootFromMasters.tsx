'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ScenePageState } from '@/hooks/day-planner/useScenePage';
import { keptTakeOf } from '@/lib/day/scenes';
import { masterCutFor, sceneMasterGroup, sceneMasters } from '@/lib/day/scene-master';

/**
 * Shoot from the masters (scene-master.ts): each script scene's shots cut from its wide master
 * and given their detail back, each kept on its Scene — then Animate the kept takes makes their
 * clips. One place, one light, each person on one side, through the scene.
 */
export default function SceneShootFromMasters({
  page,
  leadName,
  disabled,
}: {
  page: ScenePageState;
  leadName?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const targets = useMemo(() => {
    const masters = sceneMasters(page.castScenes);
    return page.castScenes.flatMap(scene => {
      const group = sceneMasterGroup(scene);
      const master = group ? masters.get(group) : undefined;
      if (!master || master.id === scene.id) return [];
      const cut = masterCutFor(scene, leadName);
      const masterTake = keptTakeOf(master);
      return cut && masterTake ? [{ scene, cut, masterUrl: masterTake.imageUrl }] : [];
    });
  }, [leadName, page.castScenes]);
  if (!targets.length) return null;
  const run = async () => {
    setNote(null);
    const made: Array<{ sceneId: string; take: { id: string; imageUrl: string } }> = [];
    let failed = 0;
    for (const [index, target] of targets.entries()) {
      setBusy(`Shot ${index + 1} of ${targets.length}: ${target.scene.name}…`);
      const response = await fetch('/api/scene-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ masterUrl: target.masterUrl, ...target.cut }),
      }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as {
        available?: boolean;
        image?: { filename: string; subfolder?: string; type?: string };
        reason?: string;
      } | null;
      if (!json?.available || !json.image?.filename) {
        failed += 1;
        continue;
      }
      const view = new URLSearchParams({
        filename: json.image.filename,
        subfolder: json.image.subfolder ?? '',
        type: json.image.type ?? 'output',
      });
      made.push({
        sceneId: target.scene.id,
        take: {
          id: `master-${Date.now().toString(36)}-${index}`,
          imageUrl: `/api/comfyui/view?${view.toString()}`,
        },
      });
    }
    page.keepNewTakes(made);
    setBusy(null);
    setNote(
      `${made.length} shot${made.length === 1 ? '' : 's'} cut from their masters and kept` +
        (failed ? ` · ${failed} couldn’t be (kept as they were)` : '') +
        ' — Animate the kept takes makes their clips.'
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || busy !== null}
        data-testid="scene-shoot-from-masters"
        title="Each script scene's shots cut from its wide shot (the master) and given their detail back — the same room, light and places in every shot"
        onClick={() => void run()}
      >
        {busy ?? `Shoot from the masters (${targets.length})`}
      </Button>
      {note ? (
        <span
          className="type-caption text-[var(--text-muted)]"
          data-testid="scene-shoot-from-masters-done"
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}
