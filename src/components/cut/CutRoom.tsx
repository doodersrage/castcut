'use client';

/**
 * Cut — the film's own step (useCutRoom). Pick what goes in (this Day, the current Story, or
 * both), watch the cut, arrange the shots, set music and the look, then Cut film. The Cast's
 * films sit under it to re-cut, export or share.
 */

import { FILM_PRESET_SIZE, filmResolutionForCutOptions } from '@/lib/video/resolution';
import { STILL_MOTION_FPS } from '@/lib/video/polish';
import CutPartRender from '@/components/cut/CutPartRender';
import CutFoley from '@/components/cut/CutFoley';
import { cutChangesSince } from '@/lib/film/cut-changes';
import CutTempMusic from '@/components/cut/CutTempMusic';
import CutColourScript from '@/components/cut/CutColourScript';
import { CONTINUITY_RULE_LABELS } from '@/lib/checks/check-quality';
import { continuityReportSections } from '@/lib/film/continuity-report';
import { DIALOGUE_LIST_COLUMNS, dialogueListRows } from '@/lib/film/dialogue-list';
import { loadComfyGallery } from '@/lib/gallery/comfyui-gallery';
import { SHOT_PROVENANCE_COLUMNS, shotProvenanceRows } from '@/lib/film/provenance-report';
import { pressKitHtml, tableSheetHtml } from '@/lib/print/print-sheets';
import { normalizeFilmCredits } from '@/lib/video/polish';
import { openPrintSheet } from '@/lib/print/print-sheets-client';
import CutRenderQueue from '@/components/cut/CutRenderQueue';
import { formatCutTimecode } from '@/lib/film/cut-preview';
import { srtToVtt } from '@/lib/video/film-finish';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import CutProblemsDialog from '@/components/CutProblemsDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FilmCutOptionsControls from '@/components/FilmCutOptionsControls';
import CutMonitor from '@/components/cut/CutMonitor';
import CutContinuity from '@/components/cut/CutContinuity';
import { shotStateSummary } from '@/lib/film/shot-state';
import CutShotPin from '@/components/cut/CutShotPin';
import { detectTempoBpmFromUrl } from '@/lib/film/cut-media';
import CutTimeline, { CUT_TIMELINE_ZOOM_EVENT } from '@/components/cut/CutTimeline';
import CutGalleryPicker from '@/components/cut/CutGalleryPicker';
import CutMissingMedia from '@/components/cut/CutMissingMedia';
import CutEffects from '@/components/cut/CutEffects';
import { CutTrackHeader, CutTracksNote } from '@/components/cut/CutTracks';
import CutExport from '@/components/cut/CutExport';
import CutPackage from '@/components/cut/CutPackage';
import { cutHasSound, cutPreflight } from '@/lib/film/export-profiles';
import { filmSubtitleCues, subtitleIssues } from '@/lib/video/cut-subtitle-track';
import CutSubtitles, { type CutSubtitleRow } from '@/components/cut/CutSubtitles';
import { filmShotSubtitle } from '@/lib/media/kind';
import FilmLoudness from '@/components/cut/FilmLoudness';
import { CUT_TRACKS, cutTrackGain, type CutTrack } from '@/lib/video/cut-sound';
import CutVersions from '@/components/cut/CutVersions';
import { importLocalImagesToGallery } from '@/lib/gallery/local-import';
import CutMarkers from '@/components/cut/CutMarkers';
import {
  addCutMarker,
  editCutMarker,
  setCutMarkerChapter,
  normalizeCutMarkers,
  removeCutMarker,
} from '@/lib/film/cut-markers';
import CutReviewNotes from '@/components/cut/CutReviewNotes';
import { normalizeSubtitleStyle, wordChunks } from '@/lib/video/subtitle-style';
import CutTranscript from '@/components/cut/CutTranscript';
import { useCutReviewNotes } from '@/hooks/useCutReviewNotes';
import { useCutAutopilot } from '@/components/cut/useCutAutopilot';
import CutGeneratePanel from '@/components/cut/CutGeneratePanel';
import { useCutPreview } from '@/hooks/useCutPreview';
import FilmCutShotList from '@/components/FilmCutShotList';
import FilmRecutPanel from '@/components/character/FilmRecutPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import { FieldError } from '@/components/ui/Field';
import {
  SegmentedControl,
  ToolActionRow,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { useCutRoom } from '@/hooks/useCutRoom';
import { useCommandActions } from '@/hooks/useCommandActions';
import { PLAY_COMMAND_ACTION_IDS } from '@/lib/play/command-actions';
import {
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryViewUrl,
} from '@/lib/gallery/comfyui-gallery';
import { isGalleryClipEntry } from '@/lib/story/roleplay-film';
import { CUT_SOURCES, cutSourceFromParam, splitCutRoomKey } from '@/lib/film/cut-room';
import { useDayShotIdentity } from '@/hooks/useDayPlannerShotIdentity';
import {
  applyCutShotEdits,
  moveCutShot,
  orderedCutShots,
  withCutShotEdit,
} from '@/lib/film/cut-plan';
import { continueDayAsStoryHref } from '@/lib/day/story-seed';
import { resolveQueueFailureGuideLabel } from '@/lib/queue/failure-playbook';
import { isMobileStudioPath, toMobileStudioHref } from '@/lib/app/mobile-studio';

/** The panel beside the monitor, and the tab below it. */
type CutPanel =
  'shots' | 'options' | 'transcript' | 'subtitles' | 'continuity' | 'notes' | 'missing';
type CutKeep = 'films' | 'versions' | 'package';

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readHash = () => window.location.hash;

export default function CutRoom() {
  const vm = useCutRoom();
  // Review comments on this cut's shared films (Notes tab, timeline marks).
  const review = useCutReviewNotes(vm.films, vm.previewShots);
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  /** Relink from Gallery (M4 F3): the shot the picker relinks. */
  const [relinkKey, setRelinkKey] = useState<string | null>(null);
  // The shot a moving cutaway is being picked for (its overlay editor's "Clip from Gallery…").
  const [cutawayKey, setCutawayKey] = useState<string | null>(null);
  // Pictures dropped on the timeline from the computer: into the Gallery, then onto the cut.
  const [dropping, setDropping] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  const dropFiles = async (files: File[]) => {
    const pictures = files.filter(file => file.type.startsWith('image/'));
    const others = files.length - pictures.length;
    if (!pictures.length) {
      setDropNote(
        others
          ? 'Only pictures can be dropped here — a video file can’t be brought into the cut this way.'
          : null
      );
      return;
    }
    setDropNote(`Adding ${pictures.length} picture${pictures.length === 1 ? '' : 's'}…`);
    const result = await importLocalImagesToGallery(pictures, {
      ...(vm.filmCastId ? { characterId: vm.filmCastId } : {}),
    });
    for (const entry of result.entries) vm.addMedia(entry);
    setDropNote(
      [
        result.entries.length
          ? `Added ${result.entries.length} to the end of the cut (and the Gallery).`
          : '',
        result.errors[0] ?? '',
        others
          ? `${others} that ${others === 1 ? 'was not a picture was' : 'were not pictures were'} left out.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    );
  };
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const titleCard =
    vm.options.titles === true
      ? {
          title: vm.sources.includes('day')
            ? vm.dayCast?.name || 'Day'
            : vm.sources.includes('story')
              ? vm.storyName
              : vm.sceneCast?.name || 'Scenes',
        }
      : null;
  // The monitor: the cut rebuilt a moment after each edit, the playhead kept.
  // Solo (M4 F4): hear one track in the monitor — not saved, not encoded.
  const [solo, setSolo] = useState<CutTrack | null>(null);
  const [pickedPanel, setPanel] = useState<CutPanel | null>(null);
  const [keepShown, setKeep] = useState<CutKeep>('films');
  // A link to the continuity list (Production's next step) opens its panel.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const shownPanel: CutPanel =
    pickedPanel ?? (hash === '#cut-continuity-section' ? 'continuity' : 'shots');
  const preview = useCutPreview({
    shots: vm.previewShots,
    value: vm.options,
    titleCard,
    live: true,
    solo,
  });
  const activeKey = preview.keyAt(preview.time);
  // A shot's feeling, for Music by scene (the button below, and the episode autopilot's cut).
  const { shotStates, shotBeatText } = vm;
  const feelingOf = useCallback(
    (key: string) => [shotStates[key]?.emotion, shotBeatText[key]].filter(Boolean).join(' · '),
    [shotBeatText, shotStates]
  );
  const autopilotNote = useCutAutopilot({ vm, loaded: preview.loaded, feelingOf });
  // The music's beat grid, for snapping an edge on the beat (the tempo "Fit to the music" reads).
  const bedUrl = vm.options.audioBedUrl.trim();
  const [beatSec, setBeatSec] = useState<{ url: string; sec: number } | null>(null);
  useEffect(() => {
    if (!bedUrl || beatSec?.url === bedUrl) return;
    let cancelled = false;
    void detectTempoBpmFromUrl(bedUrl)
      .then(bpm => {
        if (!cancelled && bpm) setBeatSec({ url: bedUrl, sec: 60 / bpm });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bedUrl, beatSec?.url]);
  /** The shot under the playhead, as a loop range. */
  const shotRange = (() => {
    const loaded = preview.loaded;
    if (!loaded || !activeKey) return null;
    const index = loaded.keys.indexOf(activeKey);
    const item = loaded.timeline.items.find(entry => entry.shot === index);
    return item ? { from: item.startSec, to: item.startSec + item.durSec } : null;
  })();
  // The subtitle track (M4 F5): each shot on the monitor's timeline, its subtitle and window.
  const subtitleRows = useMemo((): CutSubtitleRow[] => {
    const loaded = preview.loaded;
    if (!loaded) return [];
    return loaded.timeline.items.flatMap(item => {
      const key = item.shot >= 0 ? loaded.keys[item.shot] : null;
      const shot = item.shot >= 0 ? loaded.shots[item.shot] : undefined;
      if (!key || !shot) return [];
      const edit = vm.options.shotEdits?.shots?.[key];
      return [
        {
          key,
          title: shot.title,
          startSec: item.startSec,
          durSec: item.durSec,
          text: filmShotSubtitle(shot),
          sourceText: filmShotSubtitle({ spoken: shot.spoken, narrationText: shot.narrationText }),
          ...(edit?.subtitleFromSec !== undefined ? { fromSec: edit.subtitleFromSec } : {}),
          ...(edit?.subtitleToSec !== undefined ? { toSec: edit.subtitleToSec } : {}),
          ...(edit?.subtitleCues?.length ? { cues: edit.subtitleCues } : {}),
          set: {
            ...(edit?.subtitle !== undefined ? { text: edit.subtitle } : {}),
            ...(edit?.subtitleFromSec !== undefined ? { fromSec: edit.subtitleFromSec } : {}),
            ...(edit?.subtitleToSec !== undefined ? { toSec: edit.subtitleToSec } : {}),
            ...(edit?.subtitleCues?.length ? { cues: edit.subtitleCues } : {}),
          },
        },
      ];
    });
  }, [preview.loaded, vm.options.shotEdits]);

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
    return {
      key: activeKey,
      fileSec: item.fromSec + local * (item.speed ?? 1),
      // Where the clip stops playing (file seconds): how much is left for a ramp.
      endFileSec: item.fromSec + item.durSec * (item.speed ?? 1),
    };
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
  // Shift- / Ctrl-clicked shots: Delete leaves them all out (Escape clears).
  const [selected, setSelected] = useState<string[]>([]);
  // Your markers and the review comments' moments, in film order ([ and ] jump between them).
  const markTimes = useMemo(
    () =>
      [
        ...normalizeCutMarkers(options.markers).map(marker => marker.timeSec),
        ...review.notes.flatMap(note => (note.timeSec !== undefined ? [note.timeSec] : [])),
      ].sort((a, b) => a - b),
    [options.markers, review.notes]
  );
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
      // Shift+← →: a second; Home / End: the start and the end.
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.shiftKey && !mod) {
        event.preventDefault();
        preview.seek(preview.time + (event.key === 'ArrowLeft' ? -1 : 1));
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        preview.seek(event.key === 'Home' ? 0 : preview.total);
        return;
      }
      if (event.key === 'Escape' && selected.length) {
        setSelected([]);
        return;
      }
      // [ ]: the marker (or review comment) before / after the playhead.
      if ((event.key === '[' || event.key === ']') && !mod) {
        event.preventDefault();
        const next =
          event.key === '['
            ? [...markTimes].reverse().find(t => t < preview.time - 0.05)
            : markTimes.find(t => t > preview.time + 0.05);
        if (next !== undefined) preview.seek(next);
        return;
      }
      // + − zoom the timeline, \ fits the cut to it.
      if (
        (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '\\') &&
        !mod
      ) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent(CUT_TIMELINE_ZOOM_EVENT, {
            detail: event.key === '-' ? 'out' : event.key === '\\' ? 'fit' : 'in',
          })
        );
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
        if (key === 'm') {
          event.preventDefault();
          setOptions({
            ...options,
            markers: addCutMarker(options.markers, preview.time, crypto.randomUUID().slice(0, 8)),
          });
          return;
        }
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
          preview.seek(Math.max(0, preview.time + (key === ',' ? -1 : 1) / STILL_MOTION_FPS));
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
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 1) {
        event.preventDefault();
        let shotEdits = options.shotEdits;
        for (const key of selected) {
          shotEdits = withCutShotEdit(shotEdits, order, key, { include: false });
        }
        setOptions({ ...options, shotEdits });
        setSelected([]);
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
  }, [
    markTimes,
    selected,
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
  const { mounted, pickOnly, pickAnimatic, setScenesScript } = vm;
  const arrived = useRef(false);
  useEffect(() => {
    if (!mounted || arrived.current) return;
    arrived.current = true;
    const params = new URLSearchParams(window.location.search);
    const from = cutSourceFromParam(params.get('from'));
    if (from === 'script') pickAnimatic(params.get('script')?.trim() || undefined);
    else if (from) pickOnly(from);
    // Scenes from one script (an episode, a short: ?from=scenes&script=…), else all of them.
    if (from === 'scenes') setScenesScript(params.get('script')?.trim() || null);
  }, [mounted, pickAnimatic, pickOnly, setScenesScript]);
  const kept = applyCutShotEdits(vm.shots, vm.options.shotEdits);
  // The preflight (M4 F6): what's checked now, before the encode (cheap: no hook needed).
  const preflightCues = filmSubtitleCues(subtitleRows);
  const preflight = cutPreflight({
    options: vm.options,
    shotCount: kept.length,
    durationSec: preview.total,
    missing: vm.missingMedia,
    subtitleCount: preflightCues.length,
    subtitleIssueCount: subtitleIssues(preflightCues).length,
    hasSound: cutHasSound(vm.options, kept),
    server: vm.encodeServer,
  });
  // M6 D1: with a ✗ in the preflight, Cut film asks first (naming it) instead of just encoding.
  const failing = preflight.checks.filter(check => check.status === 'fail');
  const [askBlocked, setAskBlocked] = useState(false);
  const startCut = () => {
    if (preflight.blocks) setAskBlocked(true);
    else void vm.cutFilm();
  };
  // Command palette: "Cut the film" cuts here (elsewhere it opens Cut) — the button's own handler.
  useCommandActions([
    {
      id: PLAY_COMMAND_ACTION_IDS.cutFilm,
      label: 'Cut the film',
      subtitle: 'Cut · put the kept shots together',
      keywords: 'cut film assemble edit export movie',
      run: startCut,
      available: () =>
        vm.mounted &&
        !vm.assembling &&
        !vm.checking &&
        applyCutShotEdits(vm.shots, vm.options.shotEdits).length > 0,
    },
  ]);
  if (!vm.mounted) return null;

  const phone = typeof window !== 'undefined' && isMobileStudioPath(window.location.pathname);
  const href = (path: string) => (phone ? toMobileStudioHref(path) : path);
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
      onClick={startCut}
    >
      {vm.assembling ? 'Cutting…' : `Cut film · ${kept.length} shot${kept.length === 1 ? '' : 's'}`}
    </Button>
  );

  // The editing loop on one screen: the monitor and timeline beside one panel at a time.
  const flagged = vm.continuity.filter(item => item.decision?.decision !== 'dismissed').length;
  const openNotes =
    review.notes.filter(note => !note.resolved).length +
    normalizeCutMarkers(vm.options.markers).length;
  const panels: Array<{ value: CutPanel; label: string; tone?: 'danger'; testId: string }> = [
    { value: 'shots', label: `Shots · ${vm.previewShots.length}`, testId: 'cut-tab-shots' },
    { value: 'options', label: 'Options', testId: 'cut-tab-options' },
    { value: 'transcript', label: 'Transcript', testId: 'cut-tab-transcript' },
    { value: 'subtitles', label: 'Subtitles', testId: 'cut-tab-subtitles' },
    {
      value: 'continuity',
      label: flagged ? `Continuity · ${flagged}` : 'Continuity',
      testId: 'cut-tab-continuity',
    },
    {
      value: 'notes',
      label: openNotes ? `Notes · ${openNotes}` : 'Notes',
      testId: 'cut-tab-notes',
    },
    ...(vm.missingMedia.length > 0
      ? [
          {
            value: 'missing' as const,
            label: `Missing · ${vm.missingMedia.length}`,
            tone: 'danger' as const,
            testId: 'cut-tab-missing',
          },
        ]
      : []),
  ];
  const panel: CutPanel =
    shownPanel === 'missing' && vm.missingMedia.length === 0 ? 'shots' : shownPanel;
  const keepTabs: Array<{ value: CutKeep; label: string; testId: string }> = [
    { value: 'films', label: `Your films · ${vm.films.length}`, testId: 'cut-tab-films' },
    ...(vm.shots.length > 0 || vm.versions.length > 0
      ? [{ value: 'versions' as const, label: 'Versions', testId: 'cut-tab-versions' }]
      : []),
    { value: 'package', label: 'Package', testId: 'cut-tab-package' },
  ];
  const keep: CutKeep =
    keepShown === 'versions' && !keepTabs.some(tab => tab.value === 'versions')
      ? 'films'
      : keepShown;

  return (
    <>
      <ConfirmDialog
        open={askBlocked}
        title="Cut it anyway?"
        body={
          <div className="space-y-2" data-testid="cut-blocked-ask">
            <p>Before cutting found what stops this film:</p>
            <ul className="list-disc pl-5">
              {failing.map(check => (
                <li key={check.id}>
                  <span className="font-medium">{check.label}</span> — {check.detail}
                </li>
              ))}
            </ul>
            <p>The encode will likely fail. Fix these first, or cut anyway.</p>
          </div>
        }
        confirmLabel="Cut anyway"
        cancelLabel="Fix them first"
        tone="danger"
        testId="cut-blocked-dialog"
        onCancel={() => setAskBlocked(false)}
        onConfirm={() => {
          setAskBlocked(false);
          void vm.cutFilm();
        }}
      />
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
        width="full"
        title="Cut"
        description="Put the shots together into a film — watch it, arrange it, add music, then cut."
        headerActions={vm.shots.length > 0 ? cutButton : undefined}
      >
        <div data-testid="cut-sources" role="group" aria-label="What's in it">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-overline text-[var(--text-muted)]">What&apos;s in it</span>
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
          {vm.scenesScript && vm.sources.includes('scenes') ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-sm"
              data-testid="cut-scenes-script"
            >
              <span className="type-caption text-[var(--text-muted)]">
                Scenes: only “{vm.scenesScript.name}”&apos;s, in its order
              </span>
              <Button
                size="sm"
                variant="link"
                disabled={busy}
                data-testid="cut-scenes-script-all"
                onClick={() => vm.setScenesScript(null)}
              >
                Every Scene
              </Button>
            </div>
          ) : null}
          {vm.sources.includes('script') ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-2 text-sm"
              data-testid="cut-animatic"
            >
              <span className="type-caption text-[var(--text-muted)]">
                An animatic: each planned shot plays as its Scene&apos;s kept take, or a card, for
                its planned length.
              </span>
              {vm.animaticScripts.length > 1 ? (
                <label className="flex items-center gap-1">
                  <span className="type-caption">Script</span>
                  <select
                    className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-0.5 text-sm"
                    data-testid="cut-animatic-script"
                    value={vm.animaticScriptId ?? ''}
                    disabled={busy}
                    onChange={event => vm.setAnimaticScript(event.target.value)}
                  >
                    {vm.animaticScripts.map(script => (
                      <option key={script.id} value={script.id}>
                        {script.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {(vm.sources.includes('scenes') || vm.sources.includes('script')) &&
          vm.scriptCoverage.length ? (
            <ul className="type-caption mt-2 space-y-0.5" data-testid="cut-script-coverage">
              {vm.scriptCoverage.map(entry => (
                <li key={entry.id}>
                  <a
                    className="underline"
                    href={href(`/script?script=${encodeURIComponent(entry.id)}`)}
                  >
                    Script “{entry.name}”
                  </a>
                  <span className="text-[var(--text-muted)]">: {entry.summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
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
        </div>

        {vm.shots.length > 0 ? (
          <>
            {/* An editor's layout: the monitor and the inspector side by side, the timeline the
              full width under both (2026-11-04: the timeline sat under the monitor only). */}
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-stretch">
              <div className="min-w-0 space-y-4">
                <ToolSection data-testid="cut-watch" aria-label="Watch the cut">
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
                    rate={preview.rate}
                    onRate={preview.setRate}
                    looping={preview.loop !== null}
                    onLoop={() => preview.setLoop(preview.loop ? null : shotRange)}
                    onExportFrame={() =>
                      void preview.exportFrame().then(blob => {
                        if (!blob) return;
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `frame-${formatCutTimecode(preview.time).replace(/:/g, '.')}.png`;
                        link.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                      })
                    }
                    onPrev={() => step(-1)}
                    onNext={() => step(1)}
                    subtitle={(() => {
                      const cue = preflightCues.find(
                        entry => preview.time >= entry.from && preview.time < entry.to
                      );
                      if (!cue) return null;
                      // Word by word: the few words the film shows at this moment.
                      return normalizeSubtitleStyle(vm.options.subtitleStyle) === 'words'
                        ? (wordChunks([cue]).find(
                            chunk => preview.time >= chunk.from && preview.time < chunk.to
                          )?.text ?? cue.text)
                        : cue.text;
                    })()}
                    subtitleStyle={normalizeSubtitleStyle(vm.options.subtitleStyle)}
                    extra={
                      <>
                        <Button
                          variant="icon"
                          className="w-auto px-2 text-xs"
                          disabled={!vm.canUndo}
                          title="Undo (Ctrl+Z)"
                          data-testid="cut-undo"
                          onClick={vm.undo}
                        >
                          ↶ Undo
                        </Button>
                        <Button
                          variant="icon"
                          className="w-auto px-2 text-xs"
                          disabled={!vm.canRedo}
                          title="Redo (Ctrl+Shift+Z)"
                          data-testid="cut-redo"
                          onClick={vm.redo}
                        >
                          ↷ Redo
                        </Button>
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
              <aside className="relative min-w-0" data-testid="cut-inspector">
                {/* As tall as the monitor beside it (it scrolls inside), so the timeline follows. */}
                <ToolSection className="sidebar-scroll xl:absolute xl:inset-0 xl:overflow-y-auto">
                  <div className="mb-3">
                    <SegmentedControl
                      aria-label="Shots, options, transcript, subtitles, continuity and review notes"
                      wrap
                      value={panel}
                      onChange={setPanel}
                      options={panels}
                    />
                  </div>
                  {panel === 'shots' ? (
                    <div data-testid="cut-shots">
                      <div className="mb-2 space-y-2">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a shot">
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
                        </div>
                        <div
                          className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2 py-1"
                          role="group"
                          aria-label="The picked shot"
                          data-testid="cut-picked-tools"
                        >
                          <span className="type-overline mr-1 text-[var(--text-muted)]">
                            Picked shot
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2 text-xs"
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
                            className="px-2 text-xs"
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
                            className="px-2 text-xs"
                            disabled={busy || !splitAt}
                            data-testid="cut-split"
                            title="Cut the clip under the playhead in two, where the playhead is"
                            onClick={() => splitAt && vm.split(splitAt.key, splitAt.fileSec)}
                          >
                            Split at playhead
                          </Button>
                          <select
                            aria-label="Change speed from the playhead"
                            title="A speed ramp: from the playhead the clip eases over a second into another speed — slowed (smooth slow motion) or sped up — and plays on at it"
                            disabled={busy || !splitAt}
                            className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 type-caption text-[var(--text-primary)]"
                            value=""
                            data-testid="cut-ramp"
                            onChange={event => {
                              const speed = Number(event.target.value);
                              if (splitAt && speed > 0) {
                                vm.ramp(splitAt.key, splitAt.fileSec, splitAt.endFileSec, speed);
                              }
                            }}
                          >
                            <option value="">Speed from here…</option>
                            <option value="0.5">½× slow from here</option>
                            <option value="0.25">¼× slow from here</option>
                            <option value="2">2× fast from here</option>
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2 text-xs"
                            disabled={busy || !clipPoint || vm.freezeBusy}
                            data-testid="cut-freeze"
                            title="Hold the clip's frame under the playhead as a still for 2 s, right after the clip (F)"
                            onClick={() =>
                              clipPoint && void vm.freezeFrame(clipPoint.key, clipPoint.fileSec)
                            }
                          >
                            {vm.freezeBusy ? 'Freezing…' : 'Freeze frame'}
                          </Button>
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
                            className="px-2 text-xs"
                            disabled={busy || !activeKey || vm.bridgeBusy !== null}
                            data-testid="cut-bridge"
                            title="Render a short clip that moves from the end of this shot into the next one, instead of a cut or a fade (a few minutes)"
                            onClick={() => activeKey && void vm.bridge(activeKey)}
                          >
                            {vm.bridgeBusy ? 'Preparing bridge…' : 'Bridge to next'}
                          </Button>
                        </div>
                      </div>
                      {vm.extras.some(
                        extra => extra.kind === 'bridge' && extra.status !== 'ready'
                      ) ? (
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
                                  <Button
                                    variant="quiet"
                                    type="button"
                                    className="text-2xs hover:underline"
                                    onClick={() => vm.removeAdded(extra.key)}
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {vm.extras.some(
                        extra => extra.kind === 'extended' && extra.status !== 'ready'
                      ) ? (
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
                                <Button
                                  variant="quiet"
                                  type="button"
                                  className="text-2xs hover:underline"
                                  onClick={() => vm.removeAdded(extra.key)}
                                >
                                  {extra.status === 'failed' ? 'Remove' : 'Forget'}
                                </Button>
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
                        withCast={vm.generateWithCast}
                        onGenerate={(prompt, shotKind, withCast) =>
                          void vm.generateShot({
                            prompt,
                            shotKind,
                            afterKey: activeKey ?? null,
                            withCast,
                          })
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
                        onPickCutawayClip={setCutawayKey}
                        matchToKey={vm.options.matchToKey}
                        onMatchTo={key =>
                          vm.setOptions({
                            ...vm.options,
                            matchToKey: key,
                            // Matching to a shot needs Match shots on.
                            ...(key ? { matchShots: true } : {}),
                          })
                        }
                        activeKey={activeKey}
                        onPick={pick}
                        tagFor={
                          vm.sources.length > 1
                            ? shot => {
                                const { source } = splitCutRoomKey(shot.key);
                                return source === 'day'
                                  ? 'Short'
                                  : source === 'story'
                                    ? 'Story'
                                    : source === 'scenes'
                                      ? 'Scene'
                                      : source === 'script'
                                        ? 'Animatic'
                                        : 'Added';
                              }
                            : undefined
                        }
                        identityFor={shot => {
                          const { source, key } = splitCutRoomKey(shot.key);
                          return source === 'day' ? dayIdentity({ key }) : null;
                        }}
                        renderExtra={shot => {
                          const extra = vm.extras.find(entry => entry.key === shot.key);
                          if (!extra) {
                            const base = shot.key.replace(/~\d+$/, '');
                            const state = vm.shotStates[shot.key];
                            const summary = state ? shotStateSummary(state) : '';
                            return (
                              <>
                                {summary ? (
                                  <p
                                    className="type-caption text-[var(--text-muted)]"
                                    data-testid={`cut-shot-state-${shot.key}`}
                                    title="Who, look, clothing, place, time and things in this shot"
                                  >
                                    {summary}
                                  </p>
                                ) : null}
                                <CutShotPin
                                  shotKey={shot.key}
                                  state={vm.pinStates[shot.key]}
                                  hasCopies={vm.previewShots.some(
                                    entry =>
                                      entry.key !== shot.key &&
                                      entry.key.replace(/~\d+$/, '') === base
                                  )}
                                  disabled={busy}
                                  onToggle={() => vm.togglePin(shot.key)}
                                  onUse={everywhere => void vm.takeOffered(shot.key, everywhere)}
                                  onKeep={() => vm.keepPinned(shot.key)}
                                  onBack={() => vm.backToEarlierTake(shot.key)}
                                />
                              </>
                            );
                          }
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
                              <Button
                                variant="quiet"
                                type="button"
                                className="text-2xs hover:underline"
                                data-testid={`cut-remove-${shot.key}`}
                                onClick={() => vm.removeAdded(shot.key)}
                              >
                                Remove
                              </Button>
                            </div>
                          );
                        }}
                      />
                    </div>
                  ) : null}
                  {panel === 'options' ? (
                    <div data-testid="cut-options">
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
                            vm.sources.includes('day')
                              ? { mood: vm.dayMood }
                              : { tone: vm.storyTone }
                          }
                        />
                        <div className="border-t border-[var(--border-subtle)] pt-3">
                          <CutExport
                            profile={vm.options.exportProfile}
                            preflight={preflight}
                            output={vm.outputChecks}
                            disabled={busy}
                            onProfile={vm.applyProfile}
                          />
                        </div>
                        <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-3 [&>button:first-child]:w-full">
                          {cutButton}
                          {vm.lastCutOptions ? (
                            <CutChangesSince
                              changes={cutChangesSince(
                                vm.lastCutOptions,
                                vm.options,
                                key => vm.previewShots.find(shot => shot.key === key)?.title ?? key
                              )}
                            />
                          ) : null}
                          <CutPartRender
                            time={preview.time}
                            total={preview.total}
                            loop={preview.loop}
                            chapters={vm.lastChapters}
                            chapterMarkers={
                              normalizeCutMarkers(vm.options.markers).filter(m => m.chapter).length
                            }
                            disabled={busy || !preview.loaded}
                            onRender={part => void vm.cutPart(part)}
                            onMaster={() => void vm.cutMaster()}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-self-start"
                            data-testid="cut-shot-report"
                            title="What made each shot — tool, model, seed, size, LoRAs, prompt — to remake or credit it; print or save as PDF"
                            onClick={() =>
                              openPrintSheet(
                                tableSheetHtml({
                                  title: 'Shot report',
                                  subtitle: new Date().toLocaleDateString(),
                                  sections: [
                                    {
                                      heading: 'What made each shot',
                                      note: 'From each shot’s Gallery record — enough to make it again.',
                                      columns: [...SHOT_PROVENANCE_COLUMNS],
                                      rows: shotProvenanceRows(
                                        ordered
                                          .filter(
                                            shot =>
                                              vm.options.shotEdits?.shots?.[shot.key]?.include !==
                                              false
                                          )
                                          .map(shot => ({
                                            key: shot.key,
                                            title: shot.title,
                                            kind: shot.kind,
                                            entryId: shot.entryId,
                                          })),
                                        loadComfyGallery()
                                      ),
                                    },
                                  ],
                                })
                              )
                            }
                          >
                            Shot report
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-self-start"
                            data-testid="cut-dialogue-list"
                            title="Every line and voice-over, shot by shot, with who says it and whether it is recorded — print or save as PDF"
                            onClick={() =>
                              openPrintSheet(
                                tableSheetHtml({
                                  title: 'Dialogue list',
                                  subtitle: new Date().toLocaleDateString(),
                                  sections: [
                                    {
                                      heading: 'Lines and voice-overs',
                                      columns: [...DIALOGUE_LIST_COLUMNS],
                                      rows: dialogueListRows(
                                        ordered
                                          .filter(
                                            shot =>
                                              vm.options.shotEdits?.shots?.[shot.key]?.include !==
                                              false
                                          )
                                          .map(shot => ({
                                            ...shot,
                                            speaker: vm.shotStates[shot.key]?.castName,
                                          }))
                                      ),
                                      empty: 'Nothing is said in this film.',
                                    },
                                  ],
                                })
                              )
                            }
                          >
                            Dialogue list
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-self-start"
                            data-testid="cut-press-kit"
                            title="The poster, the story in brief, who is in it, stills and the credits on one page — print or save as PDF and send with the film"
                            onClick={() => {
                              const included = ordered.filter(
                                shot => vm.options.shotEdits?.shots?.[shot.key]?.include !== false
                              );
                              const posterKey = vm.options.shotEdits?.poster?.key;
                              const poster =
                                included.find(shot => shot.key === posterKey) ?? included[0];
                              const pictureOf = (shot: (typeof included)[number]) =>
                                shot.kind === 'clip' ? shot.thumbUrl : shot.url;
                              const cast = [
                                ...new Set(
                                  included.flatMap(shot => {
                                    const state = vm.shotStates[shot.key];
                                    return [state?.castName, ...(state?.others ?? [])].filter(
                                      (name): name is string => Boolean(name)
                                    );
                                  })
                                ),
                              ];
                              const lead = cast[0];
                              openPrintSheet(
                                pressKitHtml({
                                  title: lead ? `${lead}'s film` : 'The film',
                                  poster: poster ? pictureOf(poster) : undefined,
                                  story: included
                                    .map(shot => vm.shotBeatText[shot.key] ?? '')
                                    .map(text => text.split(' · ')[0]!.trim())
                                    .filter(Boolean)
                                    .slice(0, 12),
                                  cast,
                                  stills: included
                                    .filter(shot => shot !== poster)
                                    .map(pictureOf)
                                    .filter((url): url is string => Boolean(url)),
                                  credits: normalizeFilmCredits(vm.options.credits),
                                  facts: `${formatCutTimecode(preview.total).slice(3, 8)} · ${included.length} shots`,
                                  origin: window.location.origin,
                                })
                              );
                            }}
                          >
                            Press kit
                          </Button>
                          <CutRenderQueue
                            queue={vm.renderQueue}
                            disabled={!preview.loaded}
                            onQueue={vm.enqueueRender}
                            onRemove={vm.removeQueuedRender}
                            onClear={vm.clearFinishedRenders}
                          />
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                            <select
                              aria-label="Make a reel"
                              title="A short vertical reel (faces followed, hard cuts, subtitles, on the beat) or a trailer (the film's shape, its title card, soft crossfades, a closing card); the full cut is saved as a version first"
                              disabled={busy || kept.length === 0}
                              className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1 py-1 type-caption text-[var(--text-primary)]"
                              value=""
                              data-testid="cut-reel"
                              onChange={event => {
                                // "30" a reel, "t30" a trailer.
                                const trailer = event.target.value.startsWith('t');
                                const seconds = Number(event.target.value.replace(/^t/, ''));
                                if (seconds !== 15 && seconds !== 30 && seconds !== 60) return;
                                const durations = new Map<string, number>();
                                preview.loaded?.keys.forEach((key, index) => {
                                  const sec = preview.loaded?.clipSecs[index];
                                  if (key && sec) durations.set(key, sec);
                                });
                                vm.makeReel(seconds, durations, trailer ? 'trailer' : 'reel');
                              }}
                            >
                              <option value="">Make a reel…</option>
                              <option value="15">15 s reel</option>
                              <option value="30">30 s reel</option>
                              <option value="60">60 s reel</option>
                              <option value="t30">30 s trailer</option>
                              <option value="t60">60 s trailer</option>
                            </select>
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
                            {vm.lastSubtitles ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid="cut-subtitles-vtt"
                                title="The same subtitles as WebVTT — for a web player (<track>) or a site that takes .vtt"
                                onClick={() => {
                                  const blob = new Blob([srtToVtt(vm.lastSubtitles!.srt)], {
                                    type: 'text/vtt',
                                  });
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = vm.lastSubtitles!.filename.replace(
                                    /\.srt$/i,
                                    '.vtt'
                                  );
                                  link.click();
                                  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                                }}
                              >
                                .vtt
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {panel === 'transcript' ? (
                    <CutTranscript
                      rows={subtitleRows}
                      fixHrefOf={key => {
                        const { source, key: id } = splitCutRoomKey(key.replace(/~\d+$/, ''));
                        const base = id.split('#')[0]!;
                        if (source === 'day') return `/day?slot=${encodeURIComponent(base)}`;
                        if (source === 'scenes') return `/scene?scene=${encodeURIComponent(base)}`;
                        return source === 'story' ? '/story' : null;
                      }}
                      soundOf={key => {
                        const loaded = preview.loaded;
                        const index = loaded ? loaded.keys.indexOf(key) : -1;
                        const shot = index >= 0 ? loaded!.shots[index] : undefined;
                        if (!shot) return null;
                        const speaker = vm.shotStates[key]?.castName;
                        if (shot.spoken?.trim()) {
                          return { speaker, state: shot.kind === 'clip' ? 'talking' : 'silent' };
                        }
                        return shot.narrationText?.trim() ? { speaker, state: 'voice-over' } : null;
                      }}
                      activeKey={activeKey}
                      disabled={busy}
                      onSeek={preview.seek}
                      onLeaveOut={key =>
                        vm.setOptions({
                          ...vm.options,
                          shotEdits: withCutShotEdit(vm.options.shotEdits, order, key, {
                            include: false,
                          }),
                        })
                      }
                    />
                  ) : null}
                  {panel === 'subtitles' ? (
                    <div data-testid="cut-subtitles-section">
                      <CutSubtitles
                        rows={subtitleRows}
                        disabled={busy}
                        filename={`${(titleCard?.title || 'film').replace(/[^\w.-]+/g, '-')}.srt`}
                        onChange={vm.setShotSubtitle}
                        onApplySrt={vm.applySrtSubtitles}
                        onPick={pick}
                      />
                    </div>
                  ) : null}
                  {panel === 'continuity' ? (
                    <div id="cut-continuity-section" data-testid="cut-continuity-section">
                      <div className="mb-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid="cut-continuity-report"
                          title="Every shot's outfit, place, time, what she carries and how she has changed, the open findings and a prop list — to print or save as PDF"
                          onClick={() => {
                            const shots = ordered
                              .filter(
                                shot => vm.options.shotEdits?.shots?.[shot.key]?.include !== false
                              )
                              .map(shot => ({
                                key: shot.key,
                                title: shot.title,
                                state: vm.shotStates[shot.key],
                              }));
                            const findings = vm.continuity
                              .filter(item => item.decision?.decision !== 'dismissed')
                              .map(item => ({
                                shotTitle: item.shotTitle,
                                label:
                                  CONTINUITY_RULE_LABELS[item.finding.rule] ?? item.finding.rule,
                                evidence: item.finding.evidence,
                                suggestion: item.finding.suggestion,
                              }));
                            openPrintSheet(
                              tableSheetHtml({
                                title: 'Continuity report',
                                subtitle: new Date().toLocaleDateString(),
                                facts: [
                                  ['Shots', String(shots.length)],
                                  ['Open findings', String(findings.length)],
                                ],
                                sections: continuityReportSections({ shots, findings }),
                              })
                            );
                          }}
                        >
                          Continuity report
                        </Button>
                      </div>
                      <CutColourScript
                        loaded={preview.loaded}
                        colours={preview.shotColours}
                        onPick={pick}
                      />
                      <CutContinuity
                        items={vm.continuity}
                        disabled={busy}
                        onPick={pick}
                        onDecide={vm.decide}
                      />
                    </div>
                  ) : null}
                  {panel === 'notes' ? (
                    <div className="space-y-4" data-testid="cut-notes-section">
                      <CutMarkers
                        markers={normalizeCutMarkers(vm.options.markers)}
                        time={preview.time}
                        disabled={busy}
                        onAdd={() =>
                          vm.setOptions({
                            ...vm.options,
                            markers: addCutMarker(
                              vm.options.markers,
                              preview.time,
                              crypto.randomUUID().slice(0, 8)
                            ),
                          })
                        }
                        onSeek={preview.seek}
                        onNote={(id, note) =>
                          vm.setOptions({
                            ...vm.options,
                            markers: editCutMarker(vm.options.markers, id, note),
                          })
                        }
                        onChapter={(id, chapter) =>
                          vm.setOptions({
                            ...vm.options,
                            markers: setCutMarkerChapter(vm.options.markers, id, chapter),
                          })
                        }
                        onRemove={id =>
                          vm.setOptions({
                            ...vm.options,
                            markers: removeCutMarker(vm.options.markers, id),
                          })
                        }
                      />
                      <CutReviewNotes
                        notes={review.notes}
                        loading={review.loading}
                        error={review.error}
                        onSeek={preview.seek}
                        onResolve={(note, resolved) => void review.setResolved(note, resolved)}
                      />
                    </div>
                  ) : null}
                  {panel === 'missing' && vm.missingMedia.length > 0 ? (
                    <div data-testid="cut-missing-section">
                      <CutMissingMedia
                        items={vm.missingMedia}
                        checking={vm.mediaChecking}
                        disabled={busy}
                        takesFor={vm.relinkTakesFor}
                        onRelink={(key, media) => void vm.relink(key, media)}
                        onPickFromGallery={setRelinkKey}
                        onPick={pick}
                        onRecheck={() => void vm.recheckMedia()}
                      />
                    </div>
                  ) : null}
                </ToolSection>
              </aside>
            </div>
            <div
              className={`rounded-[var(--radius-lg)] ${dropping ? 'ring-2 ring-[var(--accent)]' : ''}`}
              data-testid="cut-timeline-drop"
              onDragOver={event => {
                // Pictures from the computer only — a shot dragged along the timeline stays a move.
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                setDropping(true);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropping(false);
                }
              }}
              onDrop={event => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                setDropping(false);
                void dropFiles([...event.dataTransfer.files]);
              }}
            >
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
                  sound={vm.options.sound}
                  audible={Object.fromEntries(
                    CUT_TRACKS.map(track => [
                      track,
                      cutTrackGain(vm.options.sound, track, solo) === 1,
                    ])
                  )}
                  trackHeader={track => (
                    <CutTrackHeader
                      track={track}
                      sound={vm.options.sound}
                      solo={solo}
                      disabled={busy}
                      onMute={vm.setTrackMuted}
                      onSolo={setSolo}
                    />
                  )}
                  snapTimes={[
                    preview.time,
                    ...markTimes,
                    ...(beatSec && beatSec.url === bedUrl
                      ? Array.from(
                          { length: Math.floor(preview.total / beatSec.sec) },
                          (_, i) => (i + 1) * beatSec.sec
                        )
                      : []),
                  ]}
                  selected={selected}
                  onSelect={(key, add) =>
                    setSelected(list =>
                      add
                        ? list.includes(key)
                          ? list.filter(entry => entry !== key)
                          : [...(list.length ? list : activeKey ? [activeKey] : []), key]
                        : []
                    )
                  }
                  onSkim={preview.skim}
                  markers={[
                    ...normalizeCutMarkers(vm.options.markers).map(marker => ({
                      id: `own-${marker.id}`,
                      timeSec: marker.timeSec,
                      label: marker.note || 'Your marker',
                      own: true,
                    })),
                    ...review.notes
                      .filter(note => note.timeSec !== undefined)
                      .map(note => ({
                        id: `${note.token}-${note.id}`,
                        timeSec: note.timeSec!,
                        label: `${note.name}: ${note.text}`,
                        ...(note.resolved ? { resolved: true } : {}),
                      })),
                  ]}
                  onSeek={preview.seek}
                  onPick={pick}
                  onChange={shotEdits => vm.setOptions({ ...vm.options, shotEdits })}
                  onMusicKeys={keys =>
                    vm.setOptions({
                      ...vm.options,
                      sound: { ...vm.options.sound, musicKeys: keys.length ? keys : undefined },
                    })
                  }
                />
                {selected.length > 1 ? (
                  <div
                    className="mt-1 flex flex-wrap items-center gap-2"
                    role="status"
                    data-testid="cut-selection"
                  >
                    <span className="type-caption text-[var(--text-secondary)]">
                      {selected.length} shots picked
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      data-testid="cut-selection-leave-out"
                      onClick={() => {
                        let shotEdits = vm.options.shotEdits;
                        for (const key of selected) {
                          shotEdits = withCutShotEdit(shotEdits, order, key, { include: false });
                        }
                        vm.setOptions({ ...vm.options, shotEdits });
                        setSelected([]);
                      }}
                    >
                      Leave them out
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                      Clear
                    </Button>
                  </div>
                ) : null}
                <div className="mt-1">
                  <CutTracksNote sound={vm.options.sound} />
                </div>
                <div className="mt-2">
                  <CutEffects
                    sound={vm.options.sound}
                    time={preview.time}
                    disabled={busy}
                    onChange={vm.setEffect}
                    onSeek={preview.seek}
                  />
                  <CutFoley
                    loaded={preview.loaded}
                    beatText={vm.shotBeatText}
                    sound={vm.options.sound}
                    disabled={busy}
                    onAdd={(id, effect) => vm.setEffect(id, effect, true)}
                  />
                  <CutTempMusic
                    loaded={preview.loaded}
                    feelingOf={feelingOf}
                    disabled={busy}
                    onAdd={(id, effect) => vm.setEffect(id, effect, true)}
                  />
                </div>
                <p className="type-caption mt-2 text-[var(--text-muted)]">
                  Keys: Space or K/L pause/play · J back a shot · ← → shots · , . one frame · Alt+←
                  → move the shot · S split · I / O trim in / out · F freeze frame · D duplicate ·
                  Delete leave it out · M marker · [ ] markers · Shift+← → a second · Home / End · +
                  − {'\\'} zoom · Shift-click to pick several · Alt while dragging an edge: no
                  snapping · Ctrl+Z undo · drop pictures here to add them
                </p>
                {dropNote ? (
                  <p
                    className="type-caption mt-1 text-[var(--text-muted)]"
                    role="status"
                    data-testid="cut-drop-note"
                  >
                    {dropNote}
                  </p>
                ) : null}
              </ToolSection>
            </div>
          </>
        ) : null}

        {autopilotNote ? (
          <p className="type-caption font-medium" role="status" data-testid="cut-autopilot">
            {autopilotNote}
          </p>
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

        <ToolSection data-testid="cut-keep" title="Films and versions">
          <div className="mb-3">
            <SegmentedControl
              aria-label="Your films, versions and package"
              value={keep}
              onChange={setKeep}
              options={keepTabs}
            />
          </div>
          {keep === 'films' ? (
            <div data-testid="cut-films">
              <p className="type-caption mb-2 text-[var(--text-muted)]">
                Every film cut for this Cast — re-cut it in another shape, export it for an editor,
                or share it for review.
              </p>
              {vm.films.length === 0 ? (
                <p className="type-caption text-[var(--text-muted)]">
                  No films yet — cut one above.
                </p>
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
                          <video
                            src={url}
                            controls
                            preload="metadata"
                            className="w-full bg-black"
                          />
                        ) : null}
                        <p className="type-caption truncate px-2 py-1 text-[var(--text-muted)]">
                          {entry.id === vm.lastFilmEntryId ? 'Just cut · ' : ''}
                          {new Date(entry.completedAt ?? entry.queuedAt).toLocaleString()}
                        </p>
                        <FilmRecutPanel
                          entry={entry}
                          characterName={vm.dayCast?.name || vm.storyName || 'Cast'}
                        />
                        {url ? <FilmLoudness url={url} entryId={entry.id} /> : null}
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
            </div>
          ) : null}
          {keep === 'versions' ? (
            <div data-testid="cut-versions-section">
              <CutVersions
                versions={vm.versions}
                disabled={busy}
                onSave={vm.saveVersion}
                onOpen={vm.openVersion}
                onDelete={vm.deleteVersion}
              />
            </div>
          ) : null}
          {keep === 'package' ? (
            <div data-testid="cut-package-section">
              <p className="type-caption mb-2 text-[var(--text-muted)]">
                Take this cut to another machine, or keep it safe: the edit, its versions and (with
                media) the files it plays.
              </p>
              <CutPackage
                canPackage={vm.shots.length > 0}
                busy={vm.packaging}
                disabled={busy}
                onPackage={full =>
                  void vm.packageCut(
                    full,
                    titleCard?.title || vm.sceneCast?.name || 'cut',
                    vm.dayCast?.name || vm.sceneCast?.name || undefined
                  )
                }
                onImport={file => void vm.importPackage(file)}
              />
            </div>
          ) : null}
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
      <CutGalleryPicker
        open={relinkKey !== null}
        onClose={() => setRelinkKey(null)}
        entries={vm.castMedia}
        title="Relink from Gallery"
        description="The still or clip this shot plays from now on — its trim kept where it fits."
        onAdd={entry => {
          if (relinkKey) void vm.relinkFromGallery(relinkKey, entry);
          setRelinkKey(null);
        }}
      />
      <CutGalleryPicker
        open={cutawayKey !== null}
        onClose={() => setCutawayKey(null)}
        entries={vm.castMedia.filter(entry =>
          isGalleryClipEntry({ ...entry, mediaKind: galleryEntryPrimaryMediaKind(entry) })
        )}
        title="A cutaway clip"
        description="It plays full frame over part of the shot (from / to in its overlay), while the shot's own sound carries on."
        onAdd={entry => {
          const url = galleryEntryPrimaryViewUrl(entry);
          if (cutawayKey && url) {
            const own = vm.options.shotEdits?.shots?.[cutawayKey];
            vm.setOptions({
              ...vm.options,
              shotEdits: withCutShotEdit(vm.options.shotEdits, order, cutawayKey, {
                pipUrl: url,
                pipKind: 'clip',
                pipFull: true,
                pipFromSec: own?.pipFromSec ?? 1,
                pipToSec: own?.pipToSec ?? 3,
              }),
            });
          }
          setCutawayKey(null);
        }}
      />
    </>
  );
}

/** Under Cut film: what changed since the last film was rendered (cut-changes.ts). */
function CutChangesSince({ changes }: { changes: string[] }) {
  return (
    <div className="type-caption text-[var(--text-muted)]" data-testid="cut-changes-since">
      {changes.length ? (
        <>
          <p className="font-medium text-[var(--text-secondary)]">Since the last cut</p>
          <ul className="list-disc pl-5">
            {changes.map(change => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Nothing changed since the last cut.</p>
      )}
    </div>
  );
}
