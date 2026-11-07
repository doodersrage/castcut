'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useDayShortSync } from '@/components/day-planner/useDayShortSync';
import type { EpisodeAutopilot } from '@/lib/day/episode-autopilot';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';
import { loadToolSettings } from '@/lib/settings/cache';
import { normalizeSceneRun, scriptRunProgress } from '@/lib/day/scene-run';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import type { DaySlot, DaySlotStill } from '@/lib/day/planner';
import {
  normalizeDayShortLink,
  saveDayAsShort,
  scenePagePath,
  type DayShortLink,
} from '@/lib/day/scene-links';

/**
 * "This Day as a script →" (day-as-short.ts): the Day's moments copied into a script with a
 * Scene each — the stills as their kept takes — and opened on the Scene page, where it is run,
 * storyboarded and cut like any script. "Make the short →" does that and starts its run (the
 * script road's Queue: checks, the best take kept, a redo, the cut). The Day stays as it is.
 */
export default function DayAsShortButton({
  character,
  toolSettings,
  slots,
  stills,
  busy,
  updateDay,
  className = '',
}: {
  /** The Day's settings written (its shortLink, the short's kept takes as its stills). */
  updateDay: (patch: Partial<DayToolCache>) => void;
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  busy?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** Make the short's clips: none (a talking animatic), the moments with a line, or all. */
  const [animate, setAnimate] = useState<EpisodeAutopilot['animate']>('none');
  // The Day and its short kept one (useDayShortSync).
  const sync = useDayShortSync({
    character,
    toolSettings,
    slots,
    stills,
    link: normalizeDayShortLink(toolSettings.shortLink),
    updateDay,
  });
  /** The short was changed on Scene and the Day since: which to go on with (render or not). */
  const [choice, setChoice] = useState<{ note: string; render: boolean } | null>(null);
  if (!character?.id) return null;
  const castId = character.id;
  const link = normalizeDayShortLink(toolSettings.shortLink);
  const linked = link?.castId === castId;
  const onLinked = (next: DayShortLink) => updateDay({ shortLink: next });
  // The short's run (Make the short), as Scene left it: how far it got.
  const progress =
    linked && link
      ? scriptRunProgress(
          normalizeSceneRun(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).run),
          link.scriptId
        )
      : null;
  const go = (render: boolean, how: { fresh?: boolean; asIs?: boolean } = {}) => {
    const result = saveDayAsShort({
      day: { ...toolSettings, slots, stills },
      castId,
      leadName: character.name ?? '',
      ...(link ? { link } : {}),
      ...how,
      // Make the short: an episode run over the moments with no still kept — the best take by
      // its checks, a redo when it misses one, then the cut (episode-autopilot.ts).
      ...(render ? { render: { makeCast: false, redo: 1, animate, cutWhenDone: true } } : {}),
    });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    if ('choose' in result) {
      setChoice({ note: result.choose, render });
      return;
    }
    setError(null);
    setChoice(null);
    onLinked(result.link);
    const params = new URLSearchParams({ character: castId, script: result.scriptId });
    if (result.runId) params.set('start', result.runId);
    router.push(`${scenePagePath()}?${params.toString()}`);
  };
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 ${className}`}>
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        data-testid="day-make-short"
        onClick={() => go(true)}
      >
        Make the short →
      </Button>
      <select
        aria-label="What Make the short animates"
        className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-xs"
        value={animate}
        disabled={busy}
        data-testid="day-make-short-animate"
        title="Each kept take animated before the next (a talking clip for a line) — many times longer than stills"
        onChange={event => setAnimate(event.target.value as EpisodeAutopilot['animate'])}
      >
        <option value="none">stills</option>
        <option value="lines">animate the lines</option>
        <option value="all">animate every moment</option>
      </select>
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        data-testid="day-as-short"
        onClick={() => go(false)}
      >
        {linked ? 'Its script →' : 'This Day as a script →'}
      </Button>
      {progress && link ? (
        <span className="type-caption" role="status" data-testid="day-short-run">
          {progress.state === 'done'
            ? `Its run is done — ${progress.of} Scene${progress.of === 1 ? '' : 's'}${progress.flagged ? `, ${progress.flagged} to check on Scene` : ''}.`
            : progress.state === 'cancelled'
              ? `Its run was cancelled at ${progress.done} of ${progress.of}.`
              : `Making the short: ${progress.done} of ${progress.of} done — it renders with the Scene page open.`}{' '}
          {progress.state !== 'done' && progress.state !== 'cancelled' ? (
            <a
              className="ui-text-link"
              href={`${scenePagePath()}?${new URLSearchParams({ character: castId, script: link.scriptId }).toString()}`}
              data-testid="day-short-run-open"
            >
              Open Scene →
            </a>
          ) : null}
        </span>
      ) : null}
      {linked && link && sync.scriptName ? (
        <a
          className="ui-text-link type-caption"
          href={`/cut?${new URLSearchParams({ from: 'scenes', character: castId, script: link.scriptId }).toString()}`}
          data-testid="day-cut-short"
          title="Cut on this short's Scenes only, in its order"
        >
          Cut this short →
        </a>
      ) : null}
      {linked && link && sync.scriptName ? (
        <a
          className="ui-text-link type-caption"
          href={`${scenePagePath()}?${new URLSearchParams({ character: castId, script: link.scriptId, write: 'next' }).toString()}`}
          data-testid="day-next-short"
          title="Write the short that comes after this one — how it ended, as many scenes, its mood"
        >
          Its next short →
        </a>
      ) : null}
      {linked && sync.scriptName && !choice ? (
        <span className="type-caption text-[var(--text-muted)]" data-testid="day-short-sync">
          {sync.scenesOwn
            ? `“${sync.scriptName}” has been changed on Scene, so the board's changes stay here — Copy again for a new short.`
            : `Its short: “${sync.scriptName}” — the board and its Scenes stay in step.`}
        </span>
      ) : null}
      {sync.scenesOwn && !choice ? (
        <Button
          variant="link"
          size="sm"
          disabled={busy}
          data-testid="day-short-copy-again"
          onClick={() => go(false, { fresh: true })}
        >
          Copy again (a new short)
        </Button>
      ) : null}
      {choice ? (
        <span className="inline-flex flex-wrap items-center gap-x-3" data-testid="day-short-choice">
          <span className="type-caption" role="status">
            {choice.note}
          </span>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-as-is"
            onClick={() => go(choice.render, { asIs: true })}
          >
            Use it as it is
          </Button>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-copy-again"
            onClick={() => go(choice.render, { fresh: true })}
          >
            Copy again (a new short)
          </Button>
        </span>
      ) : null}
      {error ? (
        <span
          className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
          role="status"
          data-testid="day-as-short-error"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
