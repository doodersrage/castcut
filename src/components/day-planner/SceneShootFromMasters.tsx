'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ScenePageState } from '@/hooks/day-planner/useScenePage';
import { keptTakeOf, type SavedScene } from '@/lib/day/scenes';
import { masterCutsInOrder, sceneMasterGroup, sceneMasters } from '@/lib/day/scene-master';

/** A take cut from a master says which cut: master-both-waist-… */
const masterTakePrefix = (cut: { who: string; shot: string }) => `master-${cut.who}-${cut.shot}-`;

type CutAnswer = {
  available?: boolean;
  image?: { filename: string; subfolder?: string; type?: string };
  reason?: string;
  /** Its master has no detail-pass settings: not cut unless asked plain. */
  noDetail?: boolean;
};

async function askForCut(masterUrl: string, cut: object, plain = false): Promise<CutAnswer | null> {
  const response = await fetch('/api/scene-master', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ masterUrl, ...cut, ...(plain ? { plain: true } : {}) }),
    // One stuck cut doesn't hold up the rest (the flagship, 2026-11-18: 3 hours on one shot).
    signal: AbortSignal.timeout(12 * 60_000),
  }).catch(() => null);
  if (!response) return { reason: 'no answer from the server in 12 minutes' };
  const json = (await response.json().catch(() => null)) as CutAnswer | null;
  return json ?? { reason: `HTTP ${response.status}` };
}

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
  // Shots whose master has no detail-pass settings: cut plain only when you say so.
  const [noDetail, setNoDetail] = useState<string[]>([]);
  const targets = useMemo(() => {
    const masters = sceneMasters(page.castScenes);
    const shotsOf = new Map<string, SavedScene[]>();
    for (const scene of page.castScenes) {
      const group = sceneMasterGroup(scene);
      const master = group ? masters.get(group) : undefined;
      if (!group || !master || master.id === scene.id) continue;
      shotsOf.set(group, [...(shotsOf.get(group) ?? []), scene]);
    }
    return [...shotsOf.entries()].flatMap(([group, shots]) => {
      const master = masters.get(group)!;
      const masterTake = keptTakeOf(master);
      if (!masterTake) return [];
      const cuts = masterCutsInOrder(shots, leadName);
      return shots.flatMap(scene => {
        const cut = cuts.get(scene.id);
        // Already cut this way from this master: done (a newer master, or a new cut, cuts it again).
        const kept = keptTakeOf(scene);
        if (!cut) return [];
        if (kept?.id.startsWith(masterTakePrefix(cut)) && kept.at >= masterTake.at) return [];
        return [{ scene, cut, masterUrl: masterTake.imageUrl }];
      });
    });
  }, [leadName, page.castScenes]);
  // Nothing left to cut: only what the last press did, if anything (every shot cut leaves none —
  // the note went with the button, 2026-11-18).
  if (!targets.length && !note) return null;
  const run = async (plain = false) => {
    setNote(null);
    // Plain: only the shots held back for want of a detail pass.
    const list = plain ? targets.filter(target => noDetail.includes(target.scene.id)) : targets;
    const made: Array<{ sceneId: string; take: { id: string; imageUrl: string } }> = [];
    const failed: string[] = [];
    const heldBack: string[] = [];
    for (const [index, target] of list.entries()) {
      setBusy(`Shot ${index + 1} of ${list.length}: ${target.scene.name}…`);
      let json: CutAnswer | null = null;
      // A cut can fail for a moment (ComfyUI busy, a staged file not there yet): twice more —
      // not when its master has no detail pass (that doesn't change).
      for (let attempt = 0; attempt < 3 && !json?.available && !json?.noDetail; attempt += 1) {
        json = await askForCut(target.masterUrl, target.cut, plain);
      }
      if (json?.noDetail) {
        heldBack.push(target.scene.id);
        continue;
      }
      if (!json?.available || !json.image?.filename) {
        failed.push(`${target.scene.name.split(' ')[0]}: ${json?.reason ?? 'no answer'}`);
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
          id: `${masterTakePrefix(target.cut)}${Date.now().toString(36)}-${index}`,
          imageUrl: `/api/comfyui/view?${view.toString()}`,
        },
      });
    }
    page.keepNewTakes(made);
    setBusy(null);
    setNoDetail(heldBack);
    const heldNames = list
      .filter(target => heldBack.includes(target.scene.id))
      .map(target => target.scene.name.split(' ')[0]);
    setNote(
      `${made.length} shot${made.length === 1 ? '' : 's'} cut from their masters and kept` +
        (heldNames.length
          ? ` · ${heldNames.length} not cut: their master has no detail-pass settings (${heldNames.join(', ')}) — a plain cut is softer`
          : '') +
        (failed.length
          ? ` · ${failed.length} couldn’t be, kept as they were (${failed.join('; ')})`
          : '') +
        ' — Animate the kept takes makes their clips.'
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {targets.length ? (
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
      ) : null}
      {note ? (
        <span
          className="type-caption text-[var(--text-muted)]"
          data-testid="scene-shoot-from-masters-done"
        >
          {note}
        </span>
      ) : null}
      {noDetail.length && busy === null ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          data-testid="scene-shoot-from-masters-plain"
          title="Cut these shots from their masters without the detail pass: the same room and people, softer"
          onClick={() => void run(true)}
        >
          Cut them plain ({noDetail.length})
        </Button>
      ) : null}
    </div>
  );
}
