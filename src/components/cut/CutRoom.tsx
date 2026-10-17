'use client';

/**
 * Cut — the film's own step (useCutRoom). Pick what goes in (this Day, the current Story, or
 * both), watch the cut, arrange the shots, set music and the look, then Cut film. The Cast's
 * films sit under it to re-cut, export or share.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import FilmCutOptionsControls from '@/components/FilmCutOptionsControls';
import CutMonitor from '@/components/cut/CutMonitor';
import CutTimeline from '@/components/cut/CutTimeline';
import { useCutPreview } from '@/hooks/useCutPreview';
import FilmCutShotList from '@/components/FilmCutShotList';
import FilmRecutPanel from '@/components/character/FilmRecutPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import { ToolActionRow, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { useCutRoom } from '@/hooks/useCutRoom';
import { galleryEntryPrimaryViewUrl } from '@/lib/comfyui-gallery';
import { CUT_SOURCES, splitCutRoomKey } from '@/lib/cut-room';
import { useDayShotIdentity } from '@/hooks/useDayPlannerShotIdentity';
import {
  applyCutShotEdits,
  moveCutShot,
  orderedCutShots,
  withCutShotEdit,
} from '@/lib/film-cut-plan';
import { continueDayAsStoryHref } from '@/lib/day-story-seed';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/mobile-studio';

export default function CutRoom() {
  const vm = useCutRoom();
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const titleCard =
    vm.options.titles === true
      ? { title: vm.sources.includes('day') ? vm.dayCast?.name || 'Day' : vm.storyName }
      : null;
  // The monitor: the cut rebuilt a moment after each edit, the playhead kept.
  const preview = useCutPreview({
    shots: vm.previewShots,
    value: vm.options,
    titleCard,
    live: true,
  });
  const activeKey = preview.keyAt(preview.time);
  const ordered = orderedCutShots(vm.previewShots, vm.options.shotEdits);
  const order = ordered.map(shot => shot.key);
  const pick = useCallback(
    (key: string) => {
      preview.seekToKey(key);
      document
        .querySelector(`[data-testid="cut-shot-${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    [preview]
  );
  /** The shot before / after the one under the playhead (left-out shots skipped). */
  const step = useCallback(
    (delta: -1 | 1) => {
      const keys = preview.loaded?.keys.filter((key): key is string => Boolean(key)) ?? [];
      if (keys.length === 0) return;
      const at = activeKey ? keys.indexOf(activeKey) : -1;
      const next = keys[Math.max(0, Math.min(keys.length - 1, at + delta))];
      if (next) preview.seekToKey(next);
    },
    [activeKey, preview]
  );
  // Keys: Space play / pause, ← → shots, Alt+← → move the shot, Delete leave it out / back in,
  // Ctrl+Z / Ctrl+Shift+Z undo / redo. Not while typing in a field.
  const { undo, redo, setOptions, options } = vm;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === ' ' && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        if (preview.playing) preview.pause();
        else preview.play();
        return;
      }
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !mod) {
        event.preventDefault();
        const delta = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.altKey && activeKey) {
          setOptions({
            ...options,
            shotEdits: { ...options.shotEdits, order: moveCutShot(order, activeKey, delta) },
          });
        } else {
          step(delta);
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && activeKey) {
        event.preventDefault();
        const included = options.shotEdits?.shots?.[activeKey]?.include !== false;
        setOptions({
          ...options,
          shotEdits: withCutShotEdit(options.shotEdits, order, activeKey, { include: !included }),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeKey, options, order, preview, redo, setOptions, step, undo]);
  // Face match marks on Day shots (measured on Day; keys without the "day:" prefix there).
  const dayIdentity = useDayShotIdentity(vm.dayStills, vm.dayCast?.name);
  const { mounted, pickOnly } = vm;
  const arrived = useRef(false);
  useEffect(() => {
    if (!mounted || arrived.current) return;
    arrived.current = true;
    const from = new URLSearchParams(window.location.search).get('from');
    if (from === 'day' || from === 'story') pickOnly(from);
  }, [mounted, pickOnly]);
  if (!vm.mounted) return null;

  const phone = typeof window !== 'undefined' && isMobileStudioPath(window.location.pathname);
  const href = (path: string) => (phone ? toMobileStudioHref(path) : path);
  const kept = applyCutShotEdits(vm.shots, vm.options.shotEdits);
  const busy = vm.assembling || vm.checking;
  const cutButton = (
    <Button
      size="sm"
      variant="primary"
      disabled={busy || kept.length === 0}
      loading={vm.checking}
      loadingLabel="Checking the shots"
      data-testid="cut-film"
      onClick={() => void vm.cutFilm()}
    >
      {vm.assembling ? 'Cutting…' : `Cut film · ${kept.length} shot${kept.length === 1 ? '' : 's'}`}
    </Button>
  );

  return (
    <>
      <CutProblemsDialog
        problems={vm.problems}
        onResolve={action =>
          void vm.resolveProblems(action).then(next => {
            if (next) router.push(href(next));
          })
        }
      />
      <ToolLayout
        accent="fuchsia"
        title="Cut"
        description="Put the shots together into a film — watch it, arrange it, add music, then cut."
        headerActions={vm.shots.length > 0 ? cutButton : undefined}
      >
        <ToolSection data-testid="cut-sources" title="What's in it">
          <div className="flex flex-wrap gap-2">
            {CUT_SOURCES.map(source => {
              const count = vm.bySource[source.id].length;
              const on = vm.sources.includes(source.id);
              if (count === 0) {
                return (
                  <ButtonLink
                    key={source.id}
                    href={href(source.href)}
                    size="sm"
                    variant="ghost"
                    data-testid={`cut-source-${source.id}`}
                  >
                    {source.label} · no shots yet — open {source.label}
                  </ButtonLink>
                );
              }
              return (
                <button
                  key={source.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={busy}
                  data-testid={`cut-source-${source.id}`}
                  title={
                    on
                      ? `Leave ${source.label}'s shots out of this film`
                      : `Put ${source.label}'s shots in this film`
                  }
                  data-active={on ? 'true' : undefined}
                  className="ui-chip"
                  onClick={() => vm.toggleSource(source.id)}
                >
                  {on ? '✓ ' : ''}
                  {source.label} · {count} shot{count === 1 ? '' : 's'}
                </button>
              );
            })}
          </div>
          {vm.shots.length === 0 ? (
            <p className="type-body mt-3 text-[var(--text-muted)]" data-testid="cut-empty">
              Nothing to cut yet. Make stills on{' '}
              <a className="underline" href={href('/day')}>
                Day
              </a>{' '}
              or{' '}
              <a className="underline" href={href('/story')}>
                Story
              </a>{' '}
              — every finished still and clip shows up here.
            </p>
          ) : null}
        </ToolSection>

        {vm.shots.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-4">
              <ToolSection data-testid="cut-watch" title="Watch the cut">
                <CutMonitor
                  canvasRef={preview.canvasRef}
                  size={preview.size}
                  shape={preview.shape}
                  loaded={preview.loaded}
                  building={preview.building}
                  error={preview.error}
                  playing={preview.playing}
                  time={preview.time}
                  total={preview.total}
                  onPlay={preview.play}
                  onPause={preview.pause}
                  onSeek={preview.seek}
                  onPrev={() => step(-1)}
                  onNext={() => step(1)}
                  extra={
                    <>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-[var(--radius-sm)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                        disabled={!vm.canUndo}
                        title="Undo (Ctrl+Z)"
                        data-testid="cut-undo"
                        onClick={vm.undo}
                      >
                        ↶ Undo
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-[var(--radius-sm)] px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                        disabled={!vm.canRedo}
                        title="Redo (Ctrl+Shift+Z)"
                        data-testid="cut-redo"
                        onClick={vm.redo}
                      >
                        ↷ Redo
                      </button>
                      {vm.missingDayNarration.length > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || recording}
                          data-testid="cut-preview-record-narration"
                          onClick={() => {
                            setRecording(true);
                            void vm.recordDayNarration().finally(() => setRecording(false));
                          }}
                        >
                          {recording
                            ? 'Recording narration…'
                            : `Record narration to hear it (${vm.missingDayNarration.length} line${vm.missingDayNarration.length === 1 ? '' : 's'})`}
                        </Button>
                      ) : null}
                    </>
                  }
                  timeline={null}
                />
              </ToolSection>
            </div>
            <ToolSection data-testid="cut-options" title="Options" className="lg:self-start">
              <div className="space-y-3">
                <FilmCutOptionsControls
                  value={vm.options}
                  onChange={vm.setOptions}
                  disabled={busy}
                  testIdPrefix="cut"
                  shots={vm.previewShots}
                  withShotPanels={false}
                  storyExtras={vm.sources.includes('story')}
                  previouslyAvailable
                  scoreBrief={
                    vm.sources.includes('day') ? { mood: vm.dayMood } : { tone: vm.storyTone }
                  }
                />
                {cutButton}
              </div>
            </ToolSection>
          </div>
        ) : null}

        {vm.shots.length > 0 ? (
          <ToolSection data-testid="cut-timeline-section" title="Timeline">
            <CutTimeline
              loaded={preview.loaded}
              order={order}
              edits={vm.options.shotEdits}
              time={preview.time}
              activeKey={activeKey}
              holdsLocked={(vm.options.length ?? 'shots') !== 'shots'}
              disabled={busy}
              thumbFor={key => {
                const shot = vm.previewShots.find(entry => entry.key === key);
                if (!shot) return null;
                // A clip shows the still it started from (a video frame may not paint).
                return shot.kind === 'clip' && shot.thumbUrl
                  ? { url: shot.thumbUrl, clip: false }
                  : { url: shot.url, clip: shot.kind === 'clip' };
              }}
              playing={preview.playing}
              onSeek={preview.seek}
              onPick={pick}
              onChange={shotEdits => vm.setOptions({ ...vm.options, shotEdits })}
            />
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Keys: Space play · ← → shots · Alt+← → move the shot · Delete leave it out · Ctrl+Z
              undo
            </p>
          </ToolSection>
        ) : null}

        {vm.shots.length > 0 ? (
          <ToolSection data-testid="cut-shots" title="Shots">
            <FilmCutShotList
              shots={vm.previewShots}
              edits={vm.options.shotEdits}
              captions={vm.options.titles === true}
              holdsLocked={(vm.options.length ?? 'shots') !== 'shots'}
              disabled={busy}
              testIdPrefix="cut"
              onChange={shotEdits => vm.setOptions({ ...vm.options, shotEdits })}
              activeKey={activeKey}
              onPick={pick}
              tagFor={
                vm.sources.length > 1
                  ? shot => (splitCutRoomKey(shot.key).source === 'day' ? 'Day' : 'Story')
                  : undefined
              }
              identityFor={shot => {
                const { source, key } = splitCutRoomKey(shot.key);
                return source === 'day' ? dayIdentity({ key }) : null;
              }}
            />
          </ToolSection>
        ) : null}

        {vm.status || vm.error || vm.cutDone ? (
          <div className="space-y-1" role="status" data-testid="cut-status">
            {vm.status ? (
              <p className="type-caption text-[var(--text-muted)]">{vm.status}</p>
            ) : null}
            {vm.error ? <FieldError>{vm.error}</FieldError> : null}
            {vm.error && vm.guideHref ? (
              <ButtonLink
                href={vm.guideHref}
                size="sm"
                variant="ghost"
                data-testid="film-failure-playbook-link"
              >
                {resolveQueueFailureGuideLabel(vm.guideHref)}
              </ButtonLink>
            ) : null}
            {vm.cutDone && !vm.assembling && !vm.error ? (
              <div className="flex flex-wrap gap-2" data-testid="cut-after">
                {vm.cutDone.castId && vm.cutDone.persisted ? (
                  <ButtonLink
                    href={href(`/characters/${encodeURIComponent(vm.cutDone.castId)}?media=films`)}
                    size="sm"
                    variant="secondary"
                    data-testid="cut-watch-cast"
                  >
                    Watch on Cast
                  </ButtonLink>
                ) : null}
                {vm.cutDone.withDay ? (
                  <ButtonLink
                    href={href('/day?tomorrow=1')}
                    size="sm"
                    variant="secondary"
                    data-testid="cut-start-tomorrow"
                  >
                    Start tomorrow on Day
                  </ButtonLink>
                ) : null}
                {vm.cutDone.withDay && vm.cutDone.castId ? (
                  <ButtonLink
                    href={href(continueDayAsStoryHref(vm.cutDone.castId))}
                    size="sm"
                    variant="ghost"
                    data-testid="cut-continue-story"
                  >
                    Continue as a story
                  </ButtonLink>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <ToolSection
          data-testid="cut-films"
          title="Your films"
          description="Every film cut for this Cast — re-cut it in another shape, export it for an editor, or share it for review."
        >
          {vm.films.length === 0 ? (
            <p className="type-caption text-[var(--text-muted)]">No films yet — cut one above.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {vm.films.map(entry => {
                const url = galleryEntryPrimaryViewUrl(entry);
                return (
                  <li
                    key={entry.id}
                    className={`overflow-hidden rounded-[var(--radius-lg)] border ${entry.id === vm.lastFilmEntryId ? 'border-[var(--accent-border)]' : 'border-[var(--border-subtle)]'}`}
                    data-testid="cut-film-entry"
                  >
                    {url ? (
                      <video src={url} controls preload="metadata" className="w-full bg-black" />
                    ) : null}
                    <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
                      {entry.id === vm.lastFilmEntryId ? 'Just cut · ' : ''}
                      {new Date(entry.completedAt ?? entry.queuedAt).toLocaleString()}
                    </p>
                    <FilmRecutPanel
                      entry={entry}
                      characterName={vm.dayCast?.name || vm.storyName || 'Cast'}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <ToolActionRow className="mt-2">
            <ButtonLink href={href('/day')} size="sm" variant="ghost">
              Back to Day
            </ButtonLink>
            <ButtonLink href={href('/story')} size="sm" variant="ghost">
              Back to Story
            </ButtonLink>
          </ToolActionRow>
        </ToolSection>
      </ToolLayout>
    </>
  );
}
