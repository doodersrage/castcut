/**
 * Episode autopilot (2026-11-06): from a written episode to its film with nobody at the page —
 * what an overnight run needed a driver script for. After Write an episode, one option does each
 * step the guide (docs/guide-episode.md) lists: keep the script; confirm Who's who (the names
 * that match a Cast member); make the recurring parts Cast (script-new-cast.ts); draft every
 * scene's shots (your LLM, else the rules); prepare the run as an episode (keep the best take by
 * its checks, redo, animate) and start it; and, when it is done, cut it (useCutAutopilot). Pure:
 * the choices; the steps run in SceneScripts and the Scene page.
 */

import { RUN_MAX_TAKES, type SceneRun } from './scene-run';
import { EPISODE_REDO_MAX, type EpisodeRunAuto } from './episode-run';
import type { SpeakerResolution } from './script-cast';

export type EpisodeAutopilot = {
  /** Make the recurring parts Cast members (plates and all). */
  makeCast: boolean;
  /** Redos of a take that fails its checks (0–3). */
  redo: number;
  /** Animate the kept takes: none, only the shots with a line, or every shot. */
  animate: 'none' | 'lines' | 'all';
  /** Cut the film when the run is done. */
  cutWhenDone: boolean;
  /** Shoot the stills 16:9 (the Scene's wideStills): an episode is cut wide. Unset = on. */
  wideStills?: boolean;
};

export const DEFAULT_EPISODE_AUTOPILOT: EpisodeAutopilot = {
  makeCast: true,
  redo: 1,
  animate: 'none',
  cutWhenDone: true,
  wideStills: true,
};

export function normalizeEpisodeAutopilot(raw: unknown): EpisodeAutopilot {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<EpisodeAutopilot>;
  return {
    makeCast: value.makeCast !== false,
    redo:
      typeof value.redo === 'number' && Number.isFinite(value.redo)
        ? Math.min(EPISODE_REDO_MAX, Math.max(0, Math.round(value.redo)))
        : DEFAULT_EPISODE_AUTOPILOT.redo,
    animate: value.animate === 'lines' || value.animate === 'all' ? value.animate : 'none',
    cutWhenDone: value.cutWhenDone !== false,
    wideStills: value.wideStills !== false,
  };
}

/** Who's who the autopilot confirms: the parts whose name matches one Cast member. */
export function partsToConfirm(
  parts: readonly SpeakerResolution[]
): Array<{ speaker: string; castId: string }> {
  return parts.flatMap(part =>
    part.status === 'suggested' && part.castId
      ? [{ speaker: part.speaker, castId: part.castId }]
      : []
  );
}

/**
 * The prepared run as the autopilot starts it: an episode run (keep the best take, the redos,
 * the animation), its limits fitted to the script — a take per Scene and its redos, a day.
 */
export function autopilotRun(run: SceneRun, pilot: EpisodeAutopilot): SceneRun {
  const included = run.items.filter(item => item.include).length;
  const auto: EpisodeRunAuto = {
    keep: true,
    redo: pilot.redo,
    animate: pilot.animate !== 'none',
    ...(pilot.animate === 'lines' ? { animateOnly: 'lines' as const } : {}),
    ...(pilot.cutWhenDone ? { cutWhenDone: true } : {}),
  };
  return {
    ...run,
    auto,
    maxTakes: Math.min(RUN_MAX_TAKES, Math.max(1, included * (1 + pilot.redo))),
    maxMinutes: 24 * 60,
    // Unattended: a reload (a restart, a crash) goes on by itself.
    resumeOnReload: true,
  };
}
