'use client';

/**
 * Cut — the film's own step (useCutRoom). Pick what goes in (this Day, the current Story, or
 * both), watch the cut, arrange the shots, set music and the look, then Cut film. The Cast's
 * films sit under it to re-cut, export or share.
 */

import { FILM_PRESET_SIZE, filmResolutionForCutOptions } from '@/lib/video-resolution';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import FilmCutOptionsControls from '@/components/FilmCutOptionsControls';
import CutMonitor from '@/components/cut/CutMonitor';
import CutTimeline from '@/components/cut/CutTimeline';
import CutGalleryPicker from '@/components/cut/CutGalleryPicker';
import CutVersions from '@/components/cut/CutVersions';
import CutGeneratePanel from '@/components/cut/CutGeneratePanel';
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
import { continueDayAsStoryHref } from '@/lib/day/story-seed';
import { resolveQueueFailureGuideLabel } from '@/lib/queue-failure-playbook';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/mobile-studio';

export default function CutRoom() {
  const vm = useCutRoom();
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
  // Split at the playhead: the clip under it, where in its file the playhead is.
  const splitAt = (() => {
    const loaded = preview.loaded;
    if (!loaded || !activeKey) return null;
    const index = loaded.keys.indexOf(activeKey);
    const item = loaded.timeline.items.find(entry => entry.shot === index);
    if (!item || item.kind !== 'clip') return null;
    const local = preview.time - item.startSec;
    if (local < 0.4 || local > item.durSec - 0.4) return null;
    // A sped-up / slowed clip moves `speed` file seconds per cut second.
    return { key: activeKey, fileSec: item.fromSec + local * (item.speed ?? 1) };
  })();
  // Where the playhead is in the clip under it (for I / O: trim in / out there).
  const clipPoint = (() => {
    const loaded = preview.loaded;
    if (!loaded || !activeKey) return null;
    const index = loaded.keys.indexOf(activeKey);
    const item = loaded.timeline.items.find(entry => entry.shot === index);
    if (!item || item.kind !== 'clip') return null;
    const local = Math.max(0, preview.time - item.startSec);
    return { key: activeKey, fileSec: item.fromSec + local * (item.speed ?? 1) };
  })();
  const activeIsClip = clipPoint !== null;
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
  // Ctrl+Z / Ctrl+Shift+Z undo / redo, S split, I / O trim in / out at the playhead, J / K / L
  // back a shot / pause / play, , . one frame, D duplicate. Not while typing in a field.
  const { undo, redo, setOptions, options, split, duplicate, freezeFrame } = vm;
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
      if (!mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 's' && splitAt) {
          event.preventDefault();
          split(splitAt.key, splitAt.fileSec);
          return;
        }
        if ((key === 'i' || key === 'o') && clipPoint) {
          event.preventDefault();
          setOptions({
            ...options,
            shotEdits: withCutShotEdit(
              options.shotEdits,
              order,
              clipPoint.key,
              key === 'i'
                ? { trimStartSec: clipPoint.fileSec > 0.05 ? clipPoint.fileSec : undefined }
                : { trimEndSec: clipPoint.fileSec }
            ),
          });
          return;
        }
        if (key === 'k') {
          event.preventDefault();
          preview.pause();
          return;
        }
        if (key === 'l') {
          event.preventDefault();
          preview.play();
          return;
        }
        if (key === 'j') {
          event.preventDefault();
          preview.pause();
          step(-1);
          return;
        }
        if (key === ',' || key === '.') {
          event.preventDefault();
          preview.pause();
          preview.seek(Math.max(0, preview.time + (key === ',' ? -1 : 1) / 30));
          return;
        }
        if (key === 'f' && clipPoint) {
          event.preventDefault();
          void freezeFrame(clipPoint.key, clipPoint.fileSec);
          return;
        }
        if (key === 'd' && activeKey) {
          event.preventDefault();
          duplicate(activeKey);
          return;
        }
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
  }, [
    activeKey,
    clipPoint,
    duplicate,
    freezeFrame,
    options,
    order,
    preview,
    redo,
    setOptions,
    split,
    splitAt,
    step,
    undo,
  ]);
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
  // Export for an editor (cut-project-export.ts): the monitor's own timeline, packed server-side.
  const exportProject = async () => {
    const loaded = preview.loaded;
    if (!loaded) return;
    setExporting(true);
    setExportError(null);
    try {
      const size = FILM_PRESET_SIZE[filmResolutionForCutOptions(vm.options)];
      const shots = loaded.timeline.items.flatMap(item => {
        if (item.kind !== 'clip' && item.kind !== 'still') return [];
        const shot = loaded.shots[item.shot];
        if (!shot?.url) return [];
        return [
          {
            url: shot.url,
            title: shot.title,
            kind: item.kind,
            entryId: shot.entryId,
            fromSec: item.kind === 'clip' ? item.fromSec : 0,
            durSec: item.durSec,
          },
        ];
      });
      const name = vm.dayCast?.name?.trim() || vm.storyName || 'Castcut film';
      const response = await fetch('/api/cut/export-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          width: size.width,
          height: size.height,
          shots,
          music: vm.options.audioBedUrl.trim()
            ? { url: vm.options.audioBedUrl.trim(), fromSec: vm.options.sound?.musicStartSec ?? 0 }
            : null,
          srt: vm.lastSubtitles?.srt ?? null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Export failed (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'castcut-project.zip';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };
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
                <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3 [&>button:first-child]:w-full">
                  {cutButton}
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || exporting || !preview.loaded}
                      loading={exporting}
                      loadingLabel="Packing"
                      data-testid="cut-export-project"
                      title="This cut as a project for Final Cut, DaVinci Resolve or Premiere: the media, an FCPXML and an EDL timeline (and the subtitles) in one .zip"
                      onClick={() => void exportProject()}
                    >
                      Export for an editor
                    </Button>
                    {exportError ? (
                      <p
                        className="type-caption text-[var(--danger)]"
                        data-testid="cut-export-error"
                      >
                        {exportError}
                      </p>
                    ) : null}
                    {vm.lastSubtitles ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="cut-subtitles-srt"
                        title="The film's subtitles, timed to the cut — for YouTube, a video editor or a player"
                        onClick={() => {
                          const blob = new Blob([vm.lastSubtitles!.srt], {
                            type: 'application/x-subrip',
                          });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = vm.lastSubtitles!.filename;
                          link.click();
                          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                        }}
                      >
                        Subtitles (.srt)
                      </Button>
                    ) : null}
                  </div>
                </div>
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
              bedUrl={vm.options.audioBedUrl.trim() || undefined}
              bedLabel={vm.options.audioBedName}
              onSeek={preview.seek}
              onPick={pick}
              onChange={shotEdits => vm.setOptions({ ...vm.options, shotEdits })}
            />
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Keys: Space or K/L pause/play · J back a shot · ← → shots · , . one frame · Alt+← →
              move the shot · S split · I / O trim in / out · F freeze frame · D duplicate · Delete
              leave it out · Ctrl+Z undo
            </p>
          </ToolSection>
        ) : null}

        {vm.shots.length > 0 ? (
          <ToolSection data-testid="cut-shots" title="Shots">
            <div className="mb-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="cut-add-gallery"
                onClick={() => setGalleryOpen(true)}
              >
                + From Gallery
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                data-testid="cut-add-text"
                title="A card of white words on black, after the shot under the playhead"
                onClick={() => vm.addText(activeKey)}
              >
                + Text card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !activeKey}
                data-testid="cut-duplicate"
                title="The shot under the playhead again, right after it"
                onClick={() => activeKey && vm.duplicate(activeKey)}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !activeKey || vm.takeBusy !== null}
                data-testid="cut-new-take"
                title="Render the picked shot again with a new seed; the new take takes its place when ready (Ctrl+Z / Remove brings the old one back)"
                onClick={() => activeKey && void vm.newTake(activeKey)}
              >
                {vm.takeBusy ? 'Queueing…' : 'New take'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !splitAt}
                data-testid="cut-split"
                title="Cut the clip under the playhead in two, where the playhead is"
                onClick={() => splitAt && vm.split(splitAt.key, splitAt.fileSec)}
              >
                Split at playhead
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !clipPoint || vm.freezeBusy}
                data-testid="cut-freeze"
                title="Hold the clip's frame under the playhead as a still for 2 s, right after the clip (F)"
                onClick={() => clipPoint && void vm.freezeFrame(clipPoint.key, clipPoint.fileSec)}
              >
                {vm.freezeBusy ? 'Freezing…' : 'Freeze frame'}
              </Button>
              <select
                aria-label="Make a reel"
                title="A short vertical reel of this film (faces followed, hard cuts, subtitles, on the beat with music); the full cut is saved as a version first"
                disabled={busy || kept.length === 0}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 type-caption text-[var(--text-primary)]"
                value=""
                data-testid="cut-reel"
                onChange={event => {
                  const seconds = Number(event.target.value);
                  if (seconds !== 15 && seconds !== 30 && seconds !== 60) return;
                  const durations = new Map<string, number>();
                  preview.loaded?.keys.forEach((key, index) => {
                    const sec = preview.loaded?.clipSecs[index];
                    if (key && sec) durations.set(key, sec);
                  });
                  vm.makeReel(seconds, durations);
                }}
              >
                <option value="">Make a reel…</option>
                <option value="15">15 s reel</option>
                <option value="30">30 s reel</option>
                <option value="60">60 s reel</option>
              </select>
              <select
                aria-label="Make the picked clip longer"
                title="Carry the picked clip on in the same shot (a few minutes); the longer clip takes its place when ready"
                disabled={busy || !activeIsClip || vm.extendBusy !== null}
                className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 type-caption text-[var(--text-primary)]"
                value=""
                data-testid="cut-extend"
                onChange={event => {
                  const by = Number(event.target.value);
                  if (activeKey && by > 0) void vm.extendClip(activeKey, by);
                }}
              >
                <option value="">{vm.extendBusy ? 'Starting…' : 'Make longer…'}</option>
                <option value="4">+4 s</option>
                <option value="8">+8 s</option>
                <option value="15">+15 s</option>
              </select>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !activeKey || vm.bridgeBusy !== null}
                data-testid="cut-bridge"
                title="Render a short clip that moves from the end of this shot into the next one, instead of a cut or a fade (a few minutes)"
                onClick={() => activeKey && void vm.bridge(activeKey)}
              >
                {vm.bridgeBusy ? 'Preparing bridge…' : 'Bridge to next'}
              </Button>
            </div>
            {vm.extras.some(extra => extra.kind === 'bridge' && extra.status !== 'ready') ? (
              <ul className="type-caption mb-2 space-y-1" data-testid="cut-bridges">
                {vm.extras.map(extra => {
                  if (extra.kind !== 'bridge' || extra.status === 'ready') return null;
                  const title = (key: string) =>
                    vm.shots.find(shot => shot.key === key)?.title ?? 'a shot';
                  return (
                    <li key={extra.key} className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          extra.status === 'failed'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--text-muted)]'
                        }
                      >
                        Bridge {title(extra.from)} → {title(extra.to)}:{' '}
                        {extra.status === 'failed'
                          ? 'did not render — the two shots join as before.'
                          : 'rendering… it joins the film when ready.'}
                      </span>
                      {extra.status === 'failed' ? (
                        <button
                          type="button"
                          className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                          onClick={() => vm.removeAdded(extra.key)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {vm.extras.some(extra => extra.kind === 'extended' && extra.status !== 'ready') ? (
              <ul className="type-caption mb-2 space-y-1" data-testid="cut-extends">
                {vm.extras.map(extra =>
                  extra.kind === 'extended' && extra.status !== 'ready' ? (
                    <li key={extra.key} className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          extra.status === 'failed'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--text-muted)]'
                        }
                      >
                        {vm.shots.find(shot => shot.key === extra.of)?.title ?? 'A shot'}{' '}
                        {extra.take ? '— new take' : `+${extra.bySec} s`}:{' '}
                        {extra.status === 'failed'
                          ? 'did not render — the shot stays as it was.'
                          : 'rendering… it takes the shot’s place when ready.'}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                        onClick={() => vm.removeAdded(extra.key)}
                      >
                        {extra.status === 'failed' ? 'Remove' : 'Forget'}
                      </button>
                    </li>
                  ) : null
                )}
              </ul>
            ) : null}
            <CutGeneratePanel
              extras={vm.extras}
              busy={vm.generateBusy}
              disabled={busy}
              afterTitle={
                activeKey
                  ? (vm.previewShots.find(shot => shot.key === activeKey)?.title ?? null)
                  : null
              }
              onGenerate={(prompt, shotKind) =>
                void vm.generateShot({ prompt, shotKind, afterKey: activeKey ?? null })
              }
              onRemove={vm.removeAdded}
            />
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
                  ? shot => {
                      const { source } = splitCutRoomKey(shot.key);
                      return source === 'day' ? 'Day' : source === 'story' ? 'Story' : 'Added';
                    }
                  : undefined
              }
              identityFor={shot => {
                const { source, key } = splitCutRoomKey(shot.key);
                return source === 'day' ? dayIdentity({ key }) : null;
              }}
              renderExtra={shot => {
                const extra = vm.extras.find(entry => entry.key === shot.key);
                if (!extra) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {extra.kind === 'text' ? (
                      <input
                        type="text"
                        maxLength={160}
                        aria-label="Words on the card"
                        className="min-w-[12rem] flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-primary)]"
                        value={extra.text}
                        data-testid={`cut-text-${shot.key}`}
                        onChange={event => vm.setText(shot.key, event.target.value)}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
                      data-testid={`cut-remove-${shot.key}`}
                      onClick={() => vm.removeAdded(shot.key)}
                    >
                      Remove
                    </button>
                  </div>
                );
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
                {vm.cutDone.withStory ? (
                  <ButtonLink
                    href={href('/story')}
                    size="sm"
                    variant="secondary"
                    data-testid="cut-continue-the-story"
                  >
                    Continue the story
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

        {vm.shots.length > 0 ? (
          <ToolSection data-testid="cut-versions-section" title="Versions">
            <CutVersions
              versions={vm.versions}
              disabled={busy}
              onSave={vm.saveVersion}
              onOpen={vm.openVersion}
              onDelete={vm.deleteVersion}
            />
          </ToolSection>
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
      <CutGalleryPicker
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        entries={vm.castMedia}
        onAdd={entry => {
          vm.addMedia(entry);
          setGalleryOpen(false);
        }}
      />
    </>
  );
}
