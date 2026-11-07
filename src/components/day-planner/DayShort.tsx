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
 * The Day's short on the Short page (day-as-short.ts): one panel under the cards, just above the
 * action bar (which stays one line over the board) — **Make the short →** and what it animates,
 * the other way to render these moments (on the script road: checks, the best take kept, a
 * redo, the cut); **This Day as a script →** before there is a short; then **Its short**: in step
 * or not, how its run is going, Its script, Cut this short, Its next short — or the question when
 * both sides changed. The hook (useDayShort) holds it; the Day stays as it is.
 */
export type DayShortView = ReturnType<typeof useDayShort>;

export function useDayShort(input: {
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  /** The Day's settings written (its shortLink, the short's kept takes as its stills). */
  updateDay: (patch: Partial<DayToolCache>) => void;
}) {
  const { character, toolSettings, slots, stills, updateDay } = input;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** Make the short's clips: none (a talking animatic), the moments with a line, or all. */
  const [animate, setAnimate] = useState<EpisodeAutopilot['animate']>('none');
  /** The short was changed on Scene and the Day since: which to go on with (render or not). */
  const [choice, setChoice] = useState<{ note: string; render: boolean } | null>(null);
  const link = normalizeDayShortLink(toolSettings.shortLink);
  // The Day and its short kept one (useDayShortSync).
  const sync = useDayShortSync({ character, toolSettings, slots, stills, link, updateDay });
  const castId = character?.id ?? '';
  // The Day's short, for this Cast — and its script here to open (Its script, Cut, the next one).
  const ours = Boolean(castId && link?.castId === castId);
  const linked = ours && Boolean(sync.scriptName);
  // The short's run (Make the short), as Scene left it: how far it got.
  const progress =
    ours && link
      ? scriptRunProgress(
          normalizeSceneRun(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).run),
          link.scriptId
        )
      : null;
  const go = (render: boolean, how: { fresh?: boolean; asIs?: boolean } = {}) => {
    if (!castId) return;
    const result = saveDayAsShort({
      day: { ...toolSettings, slots, stills },
      castId,
      leadName: character?.name ?? '',
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
    updateDay({ shortLink: result.link satisfies DayShortLink });
    const params = new URLSearchParams({ character: castId, script: result.scriptId });
    if (result.runId) params.set('start', result.runId);
    router.push(`${scenePagePath()}?${params.toString()}`);
  };
  const scenePath = (extra: Record<string, string> = {}) =>
    link
      ? `${scenePagePath()}?${new URLSearchParams({ character: castId, script: link.scriptId, ...extra }).toString()}`
      : scenePagePath();
  return {
    castId,
    link,
    linked,
    sync,
    progress,
    animate,
    setAnimate,
    choice,
    error,
    go,
    scenePath,
    cutPath: link
      ? `/cut?${new URLSearchParams({ from: 'scenes', character: castId, script: link.scriptId }).toString()}`
      : '/cut',
  };
}

const SELECT =
  'rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-xs';

/**
 * The action bar's part: Make the short (and what it animates) — the other way to render these
 * moments. Not held back by what holds Queue day: Scene renders it, and says what stops it.
 */
export function DayShortBarActions({ short, busy }: { short: DayShortView; busy?: boolean }) {
  if (!short.castId) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        data-testid="day-make-short"
        title="Render these moments as a short, on Scene: each one's best take kept by its checks, one redo, then the cut"
        onClick={() => short.go(true)}
      >
        Make the short →
      </Button>
      <select
        aria-label="What Make the short animates"
        className={SELECT}
        value={short.animate}
        disabled={busy}
        data-testid="day-make-short-animate"
        title="Each kept take animated before the next (a talking clip for a line) — many times longer than stills"
        onChange={event => short.setAnimate(event.target.value as EpisodeAutopilot['animate'])}
      >
        <option value="none">stills</option>
        <option value="lines">animate the lines</option>
        <option value="all">animate every moment</option>
      </select>
    </span>
  );
}

/** Its short, under the cards: in step or not, its run, its links — or the question to answer. */
export function DayShortPanel({ short, busy }: { short: DayShortView; busy?: boolean }) {
  const { linked, sync, progress, choice, error } = short;
  if (!short.castId) return null;
  return (
    <div
      className="mt-3 space-y-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
      data-testid="day-short-panel"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="type-caption font-medium text-[var(--text-secondary)]">As a short</span>
        <DayShortBarActions short={short} busy={busy} />
        {!linked ? (
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-as-short"
            title="Copy these moments into a script on Scene — a Scene each, any still its kept take — without rendering"
            onClick={() => short.go(false)}
          >
            This Day as a script →
          </Button>
        ) : null}
        {!linked ? (
          <span className="type-caption text-[var(--text-muted)] max-md:hidden">
            Renders these moments on Scene — the best take of each by its checks — and cuts them; or
            copy them as a script.
          </span>
        ) : null}
      </div>
      {linked ? (
        <p className="type-caption" data-testid="day-short-sync">
          <span className="font-medium">Its short: “{sync.scriptName}”</span>
          <span className="text-[var(--text-muted)]">
            {sync.scenesOwn
              ? ' — changed on Scene, so the board’s changes stay here.'
              : ' — the board and its Scenes stay in step.'}
          </span>
        </p>
      ) : null}
      {progress ? (
        <p className="type-caption" role="status" data-testid="day-short-run">
          {progress.state === 'done'
            ? `Its run is done — ${progress.of} Scene${progress.of === 1 ? '' : 's'}${progress.flagged ? `, ${progress.flagged} to check on Scene` : ''}.`
            : progress.state === 'cancelled'
              ? `Its run was cancelled at ${progress.done} of ${progress.of}.`
              : `Making the short: ${progress.done} of ${progress.of} done — it renders with the Scene page open.`}{' '}
          {progress.state !== 'done' && progress.state !== 'cancelled' ? (
            <a className="ui-text-link" href={short.scenePath()} data-testid="day-short-run-open">
              Open Scene →
            </a>
          ) : null}
        </p>
      ) : null}
      {linked && !choice ? (
        <div className="flex flex-wrap items-center gap-x-3">
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-as-short"
            title="Open it on Scene (the board's changes go in first)"
            onClick={() => short.go(false)}
          >
            Its script →
          </Button>
          <a
            className="ui-text-link type-caption"
            href={short.cutPath}
            data-testid="day-cut-short"
            title="Cut on this short's Scenes only, in its order"
          >
            Cut this short →
          </a>
          <a
            className="ui-text-link type-caption"
            href={short.scenePath({ write: 'next' })}
            data-testid="day-next-short"
            title="Write the short that comes after this one — how it ended, as many scenes, its mood"
          >
            Its next short →
          </a>
          {sync.scenesOwn ? (
            <Button
              variant="link"
              size="sm"
              disabled={busy}
              data-testid="day-short-copy-again"
              onClick={() => short.go(false, { fresh: true })}
            >
              Copy again (a new short)
            </Button>
          ) : null}
        </div>
      ) : null}
      {choice ? (
        <div className="flex flex-wrap items-center gap-x-3" data-testid="day-short-choice">
          <span className="type-caption" role="status">
            {choice.note}
          </span>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-as-is"
            onClick={() => short.go(choice.render, { asIs: true })}
          >
            Use it as it is
          </Button>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-copy-again"
            onClick={() => short.go(choice.render, { fresh: true })}
          >
            Copy again (a new short)
          </Button>
        </div>
      ) : null}
      {error ? (
        <p
          className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
          role="status"
          data-testid="day-as-short-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
