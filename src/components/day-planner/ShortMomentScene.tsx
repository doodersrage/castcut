'use client';

import { useMemo } from 'react';
import type { DayShortLink } from '@/lib/day/scene-links';
import { scenePagePath } from '@/lib/day/scene-links';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';
import { loadToolSettings } from '@/lib/settings/cache';
import { normalizeSavedScenes } from '@/lib/day/scenes';
import { loadSceneScriptStore } from '@/lib/day/scene-script-store-client';
import { shortMomentHasMore, shortMomentsOf, type ShortMoment } from '@/lib/day/short-moments';
import { cueAsName } from '@/lib/day/script-shots';
import type { DaySlotId } from '@/lib/day/planner';

/**
 * A linked Short's moments as its script has them (Step 5b-i, 2026-11-09), by the board moment
 * each was made from. `stamp` is what changes when they may have (the board's stills, its slots):
 * the script and Scenes are read again then.
 */
export function useShortMoments(
  link: DayShortLink | undefined,
  castId: string,
  stamp: string
): {
  bySlot: Partial<Record<DaySlotId, ShortMoment>>;
  leadSpeakers: string[];
  /** The last run's takes to check, by Scene id: why (2026-11-11, flags on the card's strip). */
  flagged: Record<string, string>;
} {
  const scriptId = castId && link?.castId === castId ? link.scriptId : '';
  return useMemo(() => {
    void stamp;
    const none = { bySlot: {}, leadSpeakers: [], flagged: {} };
    if (!scriptId || typeof window === 'undefined') return none;
    const script = loadSceneScriptStore().scripts.find(entry => entry.id === scriptId);
    if (!script) return none;
    const sceneTool = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
    const scenes = normalizeSavedScenes(sceneTool.scenes);
    // The run of this short (its script) says which kept takes to check.
    const run = sceneTool.run?.scriptId === scriptId ? sceneTool.run : undefined;
    const flagged = Object.fromEntries(
      Object.entries(run?.flagged ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])
      )
    );
    const out: Partial<Record<DaySlotId, ShortMoment>> = {};
    for (const moment of shortMomentsOf(script, scenes)) {
      if (moment.daySlot && !out[moment.daySlot]) out[moment.daySlot] = moment;
    }
    // The lead's speaking part(s): Who's who's for this Cast.
    const leadSpeakers = Object.entries(script.castMap ?? {})
      .filter(([, id]) => id === castId)
      .map(([speaker]) => speaker.toUpperCase());
    return { bySlot: out, leadSpeakers, flagged };
  }, [castId, scriptId, stamp]);
}

/**
 * Under a Short card: the moment as a scene — its lines by speaker, its shots with the take kept
 * on each (a shot opens its Scene). Shown only when there is more than the card says already.
 */
export default function ShortMomentScene({
  moment,
  castId,
  leadSpeakers,
  flagged = {},
}: {
  moment: ShortMoment | undefined;
  castId: string;
  leadSpeakers: readonly string[];
  /** Kept takes the run listed to check, by Scene id: why. */
  flagged?: Readonly<Record<string, string>>;
}) {
  if (!moment || !shortMomentHasMore(moment, leadSpeakers)) return null;
  const toCheck = moment.shots.filter(entry => entry.scene && flagged[entry.scene.id]).length;
  const sceneHref = (sceneId: string) =>
    `${scenePagePath()}?${new URLSearchParams({ character: castId, scene: sceneId }).toString()}`;
  return (
    <div
      className="border-t border-[var(--border-subtle)] px-3 py-2"
      data-testid={`short-moment-scene-${moment.daySlot ?? moment.sceneId}`}
    >
      {moment.lines.length ? (
        <ul className="space-y-0.5" aria-label="Lines">
          {moment.lines.map((line, index) => (
            <li key={index} className="type-caption leading-snug">
              {/* As a name ("Mr Harris"), not the script's cue ("MR. HARRIS"). */}
              <span className="font-medium">{cueAsName(line.speaker)}</span>
              {line.offscreen ? <span className="text-[var(--text-muted)]"> (V.O.)</span> : null}
              {line.how ? (
                <span className="italic text-[var(--text-muted)]">
                  {' '}
                  ({line.how.charAt(0).toLowerCase() + line.how.slice(1)})
                </span>
              ) : null}
              <span className="text-[var(--text-muted)]">: </span>
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
      {moment.shots.length > 1 ? (
        <div className="mt-1.5">
          <p className="type-caption text-[var(--text-muted)]">
            {moment.shots.length} shots · {moment.rendered} kept
            {toCheck ? (
              <span className="text-[var(--tint-warning-text)]" data-testid="short-moment-to-check">
                {' '}
                · {toCheck} to check
              </span>
            ) : null}
          </p>
          <ol className="mt-1 flex gap-1 overflow-x-auto" aria-label="Shots">
            {moment.shots.map((entry, index) => {
              const why = entry.scene ? flagged[entry.scene.id] : undefined;
              const label = `Shot ${index + 1}: ${entry.shot.purpose}${entry.shot.speaker ? `, ${entry.shot.speaker}` : ''}${why ? ` — to check: ${why}` : ''}`;
              const thumb = entry.kept ? (
                // eslint-disable-next-line @next/next/no-img-element -- a ComfyUI take, not a static asset
                <img
                  src={entry.kept.framedUrl || entry.kept.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="type-caption text-[var(--text-muted)]">{index + 1}</span>
              );
              return (
                <li key={entry.shot.id} className="shrink-0">
                  {entry.scene ? (
                    <a
                      href={sceneHref(entry.scene.id)}
                      data-flagged={why ? 'true' : undefined}
                      className={`flex h-10 w-14 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${why ? 'ring-2 ring-[var(--tint-warning-border)]' : ''}`}
                      aria-label={`${label} — open on Scene`}
                      title={label}
                    >
                      {thumb}
                    </a>
                  ) : (
                    <span
                      className="flex h-10 w-14 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)]"
                      aria-label={`${label} — not made into a Scene yet`}
                      title={label}
                    >
                      {thumb}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
