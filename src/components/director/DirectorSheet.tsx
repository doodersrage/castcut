'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import type { Rig3dBodyKind } from '@/lib/pose/rig3d';
import type { NormalizedBody } from '@/lib/pose/library';
import {
  CAMERA_DIRECTIONS,
  CAMERA_DIRECTION_LABELS,
  CAMERA_HEIGHTS,
  CAMERA_HEIGHT_LABELS,
  CAMERA_LENSES,
  CAMERA_LENS_LABELS,
  CAMERA_SHOTS,
  CAMERA_SHOT_LABELS,
  type CameraDirection,
} from '@/lib/pose/camera-shot';
import { POSE_STARTERS, type PoseStarterId } from '@/lib/pose/starters';
import { describePhotoPose } from '@/lib/pose/describe';
import type { PhotoPose } from '@/lib/pose/types';
import { detectStillPoseShared } from '@/lib/pose/detect-client';
import { motionTransferSize } from '@/lib/video/motion-transfer';
import { ORIGIN, placementOf, toLocal } from '@/lib/director/figure-ops';
import { frameDirection, readStillFraming, type StillFraming } from '@/lib/director/framing';
import { DIRECTOR_MOVE_IDS, DIRECTOR_MOVES, type DirectorMoveId } from '@/lib/director/moves';
import {
  directionMotionLine,
  directionSupportNeeds,
  supportWarning,
} from '@/lib/director/motion-line';
import {
  editorRig,
  figureFromEditor,
  poseBeat,
  starterFigure,
  stillPoseFigure,
} from '@/lib/director/poses';
import {
  addBeat,
  applyPreset,
  DIRECTOR_PRESETS,
  moveBeat,
  removeBeat,
  replaceBeat,
  resizeBeat,
  setBeatTime,
  shiftBeat,
} from '@/lib/director/edit';
import { beatIndexAt, beatStarts, directionFrames, endOfBeats } from '@/lib/director/timeline';
import {
  beatLength,
  checkDirection,
  DEFAULT_DIRECTOR_CAMERA,
  DIRECTOR_CAMERA_MOVES,
  DIRECTOR_CAMERA_MOVE_LABELS,
  DIRECTOR_MAX_SECONDS,
  directionLength,
  directionParts,
  type DirectorBeat,
  type DirectorCamera,
  type Direction,
} from '@/lib/director/types';
import {
  loadDirections,
  removeDirection,
  saveDirection,
  type SavedDirection,
} from '@/lib/director/store';
import DirectorPreview from '@/components/director/DirectorPreview';

const PoseJointEditor3D = dynamic(() => import('@/components/pose/PoseJointEditor3D'), {
  ssr: false,
});

export type DirectorRenderOptions = { motion: string; place?: string };

export type DirectorSheetProps = {
  open: boolean;
  /** The Cast member's still: who moves, and the picture she is framed like. */
  stillUrl: string;
  castId?: string | null;
  castName?: string;
  body?: Rig3dBodyKind;
  /** Where the still is (the slot's place), as Place starts. */
  place?: string;
  /** Another clip job holds the GPU: Render waits. */
  busy?: boolean;
  onClose: () => void;
  /** Start Copy moves with the driving video (a background job). */
  onRender: (video: Blob, options: DirectorRenderOptions) => void;
  testId?: string;
};

/** A still's size, read from the picture itself. */
function useStillSize(url: string): { width: number; height: number } | null {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth && image.naturalHeight) {
        setSize({ url, width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.onerror = () => {
      if (!cancelled) setSize({ url, width: 9, height: 16 });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return size?.url === url ? size : null;
}

function startDirection(body: Rig3dBodyKind, place?: string): Direction {
  return {
    version: 1,
    body,
    beats: [poseBeat('Stand', starterFigure('stand', body), { first: true })],
    camera: { ...DEFAULT_DIRECTOR_CAMERA },
    ...(place?.trim() ? { place: place.trim() } : {}),
  };
}

function beatLabel(beat: DirectorBeat): string {
  return beat.kind === 'move' ? DIRECTOR_MOVES[beat.move].label : beat.name;
}

const fmt = (seconds: number) => `${seconds.toFixed(1)} s`;

export default function DirectorSheet(props: DirectorSheetProps) {
  // Mounted only while open: a new open starts fresh.
  return props.open ? <DirectorSheetOpen {...props} /> : null;
}

function DirectorSheetOpen({
  stillUrl,
  castId,
  castName,
  body = 'female',
  place: initialPlace,
  busy = false,
  onClose,
  onRender,
  testId = 'director',
}: DirectorSheetProps) {
  const p = testId;
  const titleId = useId();
  const she = body === 'male' ? 'he' : 'she';
  const her = body === 'male' ? 'his' : 'her';
  const [direction, setDirection] = useState<Direction>(() => startDirection(body, initialPlace));
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [rendering, setRendering] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedDirection[]>(() => loadDirections(castId));
  const [saveName, setSaveName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const size = useStillSize(stillUrl);
  const video = size ? motionTransferSize(size.width, size.height) : { width: 464, height: 832 };
  const aspect = video.width / video.height;

  // Her pose in the still (DWPose on ComfyUI): the framing to match, and a start pose.
  const [detected, setDetected] = useState<{
    framing: StillFraming | null;
    pose: { body: NormalizedBody; aspect: number } | null;
    state: 'reading' | 'done' | 'failed';
  }>({ framing: null, pose: null, state: 'reading' });
  useEffect(() => {
    let cancelled = false;
    detectStillPoseShared(stillUrl)
      .then(result => {
        if (cancelled) return;
        const lead = result.available ? result.pose.people[0] : undefined;
        const canvas = result.available ? result.pose.canvas : null;
        setDetected({
          framing: readStillFraming(lead),
          pose:
            lead && canvas
              ? { body: lead, aspect: canvas.width / Math.max(1, canvas.height) }
              : null,
          state: 'done',
        });
      })
      .catch(() => {
        if (!cancelled) setDetected({ framing: null, pose: null, state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [stillUrl]);

  const frames = useMemo(() => directionFrames(direction), [direction]);
  const framing = useMemo(
    () => frameDirection({ frames, camera: direction.camera, aspect, still: detected.framing }),
    [frames, direction.camera, aspect, detected.framing]
  );
  const length = directionLength(direction);
  const check = checkDirection(direction);
  const support = supportWarning(directionSupportNeeds(direction), direction.place);
  const starts = beatStarts(direction);
  const current = beatIndexAt(direction, time);
  const parts = directionParts(direction);
  const startName = beatLabel(direction.beats[0]!);

  // Playback: loops until paused.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime(t => (t + dt >= length ? 0 : t + dt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, length]);

  // Leaving mid-render stops it.
  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (next: Direction) => {
    setDirection(next);
    setTime(t => Math.min(t, directionLength(next)));
  };
  const setCamera = (patch: Partial<DirectorCamera>) =>
    update({ ...direction, camera: { ...direction.camera, ...patch } });

  const startFrom = (id: PoseStarterId) => {
    const label = POSE_STARTERS.find(starter => starter.id === id)?.label ?? 'Stand';
    const start = {
      ...poseBeat(label, starterFigure(id, body), { first: true }),
      hold: direction.beats[0]!.hold,
    };
    update(replaceBeat(direction, 0, start));
  };
  const startFromStill = () => {
    if (!detected.pose) return;
    const { figure, side, turned } = stillPoseFigure(
      detected.pose.body,
      detected.pose.aspect,
      body
    );
    const start = {
      ...poseBeat('Her pose in the picture', figure, { first: true }),
      hold: direction.beats[0]!.hold,
    };
    const facing: CameraDirection =
      turned < 22.5 ? 'front' : turned < 65 ? 'three-quarter' : turned < 125 ? 'side' : 'back';
    update({
      ...replaceBeat(direction, 0, start),
      camera: { ...direction.camera, direction: facing, side, shot: 'picture' },
    });
  };

  const addPose = () => {
    const end = endOfBeats(direction, direction.beats.length);
    const beat = poseBeat(`Pose ${direction.beats.length + 1}`, toLocal(end, placementOf(end)));
    const next = addBeat(direction, beat);
    update(next);
    setEditing(next.beats.length - 1);
  };
  const addMove = (move: DirectorMoveId) => update(addBeat(direction, moveBeat(move)));

  const editingAt =
    editing === null ? null : editing === 0 ? ORIGIN : placementOf(endOfBeats(direction, editing));
  const editingBeat = editing === null ? null : direction.beats[editing];
  const editorInput =
    editingBeat?.kind === 'pose' && editingAt
      ? editorRig(editingBeat.figure, editingAt, framing.start, aspect)
      : null;
  const savePose = (pose: PhotoPose) => {
    if (editing === null || !editingAt || editingBeat?.kind !== 'pose') return;
    const figure = figureFromEditor(pose, editingAt);
    if (figure) {
      const words = describePhotoPose(pose, { lead: she });
      update(
        replaceBeat(direction, editing, {
          ...editingBeat,
          figure,
          ...(words ? { words: words.slice(0, 200) } : {}),
        })
      );
      setTime(starts[editing]! + (editing === 0 ? 0 : editingBeat.seconds));
    }
    setEditing(null);
  };

  const render = async (use: 'copy' | 'download') => {
    if (check.errors.length || rendering) return;
    setError(null);
    setPlaying(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setRendering({ done: 0, total: frames.length });
    try {
      const { renderDrivingVideo } = await import('@/lib/director/render-client');
      const blob = await renderDrivingVideo({
        frames,
        start: framing.start,
        end: framing.end,
        body,
        width: video.width,
        height: video.height,
        signal: controller.signal,
        onProgress: (done, total) => setRendering({ done, total }),
      });
      if (use === 'download') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'castcut-direction.avi';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setRendering(null);
        return;
      }
      onRender(blob, {
        motion: directionMotionLine(direction),
        ...(direction.place?.trim() ? { place: direction.place.trim() } : {}),
      });
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not film the direction.');
      }
      setRendering(null);
    }
  };

  // Timeline: tap to scrub, drag a beat's end to make it longer or shorter.
  const barRef = useRef<HTMLDivElement>(null);
  const seekTo = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setTime(Math.max(0, Math.min(length, ((clientX - rect.left) / rect.width) * length)));
  };
  const resizeFrom = (index: number) => (event: PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const perSecond = rect.width / Math.max(0.1, length);
    const startX = event.clientX;
    const base = direction;
    const from = beatLength(base.beats[index]!, index);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => {
      const next = resizeBeat(base.beats[index]!, index, from + (e.clientX - startX) / perSecond);
      update(replaceBeat(base, index, next));
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const pickedShot = direction.camera.shot;
  const sideView =
    direction.camera.direction === 'three-quarter' || direction.camera.direction === 'side';
  const minutes = Math.max(2, Math.round(parts * 2.5));

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-2 md:px-5">
      <p
        className="type-caption mr-auto text-[var(--text-muted)]"
        role="status"
        data-testid={`${p}-summary`}
      >
        {rendering
          ? `Filming the moves… ${rendering.done} of ${rendering.total} frames`
          : `${fmt(length)} · ${parts === 1 ? 'one part' : `${parts} parts`} · about ${minutes} min on ComfyUI`}
      </p>
      <Button
        size="sm"
        variant="ghost"
        disabled={Boolean(check.errors.length) || rendering !== null}
        title="Save the driving video (the 3D body) to look at or use elsewhere"
        data-testid={`${p}-download`}
        onClick={() => void render('download')}
      >
        Save driving video
      </Button>
      <Button size="sm" variant="secondary" data-testid={`${p}-cancel`} onClick={onClose}>
        Cancel
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={Boolean(check.errors.length) || busy}
        loading={rendering !== null}
        loadingLabel={rendering ? `Filming ${rendering.done}/${rendering.total}…` : undefined}
        title={busy ? 'Another clip job is running — one at a time.' : undefined}
        data-testid={`${p}-render`}
        onClick={() => void render('copy')}
      >
        Render
      </Button>
    </div>
  );

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        labelledBy={titleId}
        size="full"
        testId={p}
        overlayClassName="p-3"
        closeOnBackdrop={false}
        footer={footer}
        panelClassName="h-[calc(100dvh-1.5rem)] !max-w-6xl overflow-hidden rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 md:flex-row md:gap-6 md:overflow-hidden md:p-5"
      >
        <div className="flex min-w-0 flex-col items-center gap-2 max-md:shrink-0 md:min-h-0 md:flex-1">
          <div className="h-[min(44dvh,420px)] w-full md:h-[min(62vh,620px)]">
            <DirectorPreview
              body={body}
              aspect={aspect}
              frames={frames}
              start={framing.start}
              end={framing.end}
              time={time}
              stillUrl={stillUrl}
              testId={`${p}-preview`}
            />
          </div>
          <div className="flex w-full max-w-xl items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              aria-label={playing ? 'Pause' : 'Play'}
              data-testid={`${p}-play`}
              data-playing={playing ? 'true' : 'false'}
              onClick={() => setPlaying(on => !on)}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            <input
              type="range"
              min={0}
              max={Math.max(0.01, length)}
              step={1 / 16}
              value={Math.min(time, length)}
              onChange={event => {
                setPlaying(false);
                setTime(Number(event.target.value));
              }}
              aria-label="Scrub through the direction"
              className="min-w-0 flex-1"
              data-testid={`${p}-scrub`}
            />
            <span
              className="type-caption w-20 shrink-0 text-right tabular-nums"
              data-testid={`${p}-time`}
            >
              {time.toFixed(1)} / {length.toFixed(1)} s
            </span>
          </div>
          <div
            ref={barRef}
            className="relative flex h-11 w-full max-w-xl touch-none select-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]"
            onPointerDown={event => {
              setPlaying(false);
              seekTo(event.clientX);
            }}
            data-testid={`${p}-timeline`}
          >
            {direction.beats.map((beat, index) => (
              <div
                key={beat.id}
                className={`relative flex min-w-[2.25rem] items-center border-r border-[var(--border-subtle)] px-1.5 text-xs ${
                  index === current ? 'bg-[var(--accent-soft,var(--bg-raised))]' : ''
                }`}
                style={{ flex: `${Math.max(0.05, beatLength(beat, index))} 1 0` }}
                data-testid={`${p}-block-${index}`}
              >
                <span className="truncate">{beatLabel(beat)}</span>
                <span
                  role="separator"
                  aria-label={`Drag to make beat ${index + 1} longer or shorter`}
                  className="absolute inset-y-0 right-0 w-3 cursor-ew-resize bg-[var(--border-subtle)]/40"
                  onPointerDown={resizeFrom(index)}
                  data-testid={`${p}-block-${index}-end`}
                />
              </div>
            ))}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--accent,#d33)]"
              style={{ left: `${length > 0 ? (Math.min(time, length) / length) * 100 : 0}%` }}
              aria-hidden
            />
          </div>
          {framing.pulledBack > 1.05 ? (
            <p
              className="type-caption max-w-xl text-[var(--text-muted)]"
              data-testid={`${p}-fit-note`}
            >
              The camera stands a little further back than the still so the whole move stays in
              frame.
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 w-full flex-col md:w-[26rem] md:shrink-0">
          <div className="min-h-0 flex-1 space-y-4 pr-1 md:overflow-y-auto">
            <div>
              <h2 id={titleId} className="type-heading">
                Direct {castName?.trim() || 'your Cast member'}
              </h2>
              <p className="type-caption mt-1 text-[var(--text-muted)]">
                Line up a few beats — poses {she} moves into, or ready-made moves. Play to check it,
                then Render: {she} does it in the still, in {her} own clothes. About 5 seconds
                renders in one part.
              </p>
            </div>

            <section className="space-y-1.5" data-testid={`${p}-start`}>
              <p className="type-label">Start from</p>
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  active={startName === 'Her pose in the picture'}
                  disabled={!detected.pose}
                  title={
                    detected.state === 'reading'
                      ? 'Reading her pose in the still…'
                      : detected.pose
                        ? `${her} pose as the still shows it`
                        : 'Could not read a pose in the still.'
                  }
                  onClick={startFromStill}
                  data-testid={`${p}-start-still`}
                >
                  {detected.state === 'reading'
                    ? 'Reading the still…'
                    : `${body === 'male' ? 'His' : 'Her'} pose in the picture`}
                </ChipButton>
                {POSE_STARTERS.map(starter => (
                  <ChipButton
                    key={starter.id}
                    active={startName === starter.label}
                    onClick={() => startFrom(starter.id)}
                    data-testid={`${p}-start-${starter.id}`}
                  >
                    {starter.label}
                  </ChipButton>
                ))}
              </div>
            </section>

            <section className="space-y-2" data-testid={`${p}-beats`}>
              <p className="type-label">Beats</p>
              <ol className="space-y-2">
                {direction.beats.map((beat, index) => (
                  <li
                    key={beat.id}
                    className={`rounded-[var(--radius-md)] border p-2 ${
                      index === current
                        ? 'border-[var(--accent,var(--border-strong))]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                    data-testid={`${p}-beat-${index}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-w-0 flex-1 !justify-start truncate text-left font-medium"
                        title="Show this beat"
                        onClick={() => {
                          setPlaying(false);
                          setTime(starts[index]! + (index === 0 ? 0 : beat.seconds));
                        }}
                      >
                        {index + 1}. {index === 0 ? `Start: ${beatLabel(beat)}` : beatLabel(beat)}
                      </Button>
                      {beat.kind === 'pose' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          data-testid={`${p}-beat-${index}-pose`}
                          onClick={() => {
                            setPlaying(false);
                            setEditing(index);
                          }}
                        >
                          Pose…
                        </Button>
                      ) : null}
                      {index > 0 ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Move beat ${index + 1} earlier`}
                            disabled={index <= 1}
                            onClick={() => update(shiftBeat(direction, index, -1))}
                          >
                            ↑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Move beat ${index + 1} later`}
                            disabled={index >= direction.beats.length - 1}
                            onClick={() => update(shiftBeat(direction, index, 1))}
                          >
                            ↓
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove beat ${index + 1}`}
                            data-testid={`${p}-beat-${index}-remove`}
                            onClick={() => update(removeBeat(direction, index))}
                          >
                            ✕
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                      {index > 0 ? (
                        <label className="flex items-center gap-1">
                          {beat.kind === 'move' ? 'Length' : 'Move in'}
                          <input
                            type="number"
                            step={0.1}
                            min={0.3}
                            max={10}
                            value={beat.seconds}
                            onChange={event =>
                              update(
                                replaceBeat(
                                  direction,
                                  index,
                                  setBeatTime(beat, 'seconds', Number(event.target.value))
                                )
                              )
                            }
                            className="ui-input w-16 px-1.5 py-0.5"
                            data-testid={`${p}-beat-${index}-seconds`}
                          />
                          s
                        </label>
                      ) : null}
                      <label className="flex items-center gap-1">
                        Hold
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={10}
                          value={beat.hold}
                          onChange={event =>
                            update(
                              replaceBeat(
                                direction,
                                index,
                                setBeatTime(beat, 'hold', Number(event.target.value))
                              )
                            )
                          }
                          className="ui-input w-16 px-1.5 py-0.5"
                          data-testid={`${p}-beat-${index}-hold`}
                        />
                        s
                      </label>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`${p}-add-pose`}
                  onClick={addPose}
                >
                  + Add a pose…
                </Button>
              </div>
              <p className="type-caption text-[var(--text-muted)]">Add a ready-made move</p>
              <div className="flex flex-wrap gap-1.5" data-testid={`${p}-moves`}>
                {DIRECTOR_MOVE_IDS.map(id => (
                  <ChipButton
                    key={id}
                    active={false}
                    onClick={() => addMove(id)}
                    data-testid={`${p}-move-${id}`}
                  >
                    {DIRECTOR_MOVES[id].label}
                  </ChipButton>
                ))}
              </div>
              <p className="type-caption text-[var(--text-muted)]">Or a ready-made direction</p>
              <div className="flex flex-wrap gap-1.5">
                {DIRECTOR_PRESETS.map(preset => (
                  <ChipButton
                    key={preset.id}
                    active={false}
                    onClick={() => update(applyPreset(direction, preset))}
                    data-testid={`${p}-preset-${preset.id}`}
                  >
                    {preset.label}
                  </ChipButton>
                ))}
              </div>
            </section>

            <section className="space-y-2" data-testid={`${p}-camera`}>
              <p className="type-label">Camera</p>
              <ChipRow
                label="Framing"
                options={['picture', ...CAMERA_SHOTS] as const}
                labels={{ picture: 'Like the still', ...CAMERA_SHOT_LABELS }}
                value={pickedShot}
                onPick={shot => setCamera({ shot })}
                testId={`${p}-shot`}
              />
              <ChipRow
                label="Height"
                options={CAMERA_HEIGHTS}
                labels={CAMERA_HEIGHT_LABELS}
                value={direction.camera.height}
                onPick={height => setCamera({ height })}
                testId={`${p}-height`}
              />
              <ChipRow
                label="Direction"
                options={CAMERA_DIRECTIONS}
                labels={CAMERA_DIRECTION_LABELS}
                value={direction.camera.direction}
                onPick={value => setCamera({ direction: value })}
                testId={`${p}-direction`}
              />
              {sideView ? (
                <ChipRow
                  label="From"
                  options={['left', 'right'] as const}
                  labels={{
                    left: `${body === 'male' ? 'His' : 'Her'} left`,
                    right: `${body === 'male' ? 'His' : 'Her'} right`,
                  }}
                  value={direction.camera.side === 1 ? 'left' : 'right'}
                  onPick={value => setCamera({ side: value === 'left' ? 1 : -1 })}
                  testId={`${p}-side`}
                />
              ) : null}
              <ChipRow
                label="Lens"
                options={CAMERA_LENSES}
                labels={CAMERA_LENS_LABELS}
                value={direction.camera.lens}
                onPick={lens => setCamera({ lens })}
                testId={`${p}-lens`}
              />
              <ChipRow
                label="Move"
                options={DIRECTOR_CAMERA_MOVES}
                labels={DIRECTOR_CAMERA_MOVE_LABELS}
                value={direction.camera.move}
                onPick={move => setCamera({ move })}
                testId={`${p}-camera-move`}
              />
              <p className="type-caption text-[var(--text-muted)]">
                The camera is framed so {she} stays in the picture for the whole move. Copy moves
                keeps the still&apos;s own camera, so keep this close to how the still was shot.
              </p>
            </section>

            <section className="space-y-1.5">
              <label className="type-label block" htmlFor={`${p}-place-input`}>
                Place <span className="type-caption text-[var(--text-muted)]">(optional)</span>
              </label>
              <TextInput
                id={`${p}-place-input`}
                value={direction.place ?? ''}
                placeholder="e.g. a sunny kitchen with a wooden chair behind her"
                onChange={event =>
                  update({ ...direction, place: event.target.value.slice(0, 300) })
                }
                data-testid={`${p}-place`}
              />
              {support ? (
                <p
                  className="type-caption text-[var(--tint-warning-text,var(--text-muted))]"
                  role="status"
                  data-testid={`${p}-support`}
                >
                  {support}
                </p>
              ) : null}
            </section>

            <section className="space-y-1.5" data-testid={`${p}-saved`}>
              <p className="type-label">Saved directions</p>
              <div className="flex gap-1.5">
                <TextInput
                  value={saveName}
                  placeholder="Name this direction"
                  onChange={event => setSaveName(event.target.value)}
                  className="min-w-0 flex-1"
                  data-testid={`${p}-save-name`}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`${p}-save`}
                  onClick={() => {
                    setSaved(saveDirection(castId, saveName || 'My direction', direction));
                    setSaveName('');
                  }}
                >
                  Save
                </Button>
              </div>
              {saved.length ? (
                <ul className="space-y-1">
                  {saved.map(entry => (
                    <li key={entry.id} className="flex items-center gap-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <span className="type-caption text-[var(--text-muted)]">
                        {fmt(directionLength(entry.direction))}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`${p}-load-${entry.id}`}
                        onClick={() => {
                          update(entry.direction);
                          setTime(0);
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${entry.name}`}
                        onClick={() => setSaved(removeDirection(castId, entry.id))}
                      >
                        ✕
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-caption text-[var(--text-muted)]">
                  Saved here for {castName?.trim() || 'this Cast member'}, in this browser.
                </p>
              )}
            </section>

            {check.errors.map(message => (
              <FieldError key={message}>{message}</FieldError>
            ))}
            {check.warnings.map(message => (
              <p key={message} className="type-caption text-[var(--text-muted)]" role="status">
                {message}
              </p>
            ))}
            {length > 5.1 && length <= DIRECTOR_MAX_SECONDS ? (
              <p className="type-caption text-[var(--text-muted)]">
                Over about 5 seconds renders in {parts} parts, one after the other.
              </p>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </div>
      </Dialog>
      {editorInput && editingBeat ? (
        <PoseJointEditor3D
          key={editingBeat.id}
          bodies={editorInput.bodies}
          rig3d={editorInput.rig}
          aspect={aspect}
          testIdPrefix={`${p}-pose`}
          allowTwo={false}
          possessive={her === 'his' ? 'his' : 'her'}
          backdropUrl={editing === 0 ? stillUrl : null}
          backdropLabel="the still"
          onSave={savePose}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  labels,
  value,
  onPick,
  testId,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onPick: (value: T) => void;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      <span className="type-caption w-16 shrink-0 text-[var(--text-muted)]">{label}</span>
      {options.map(option => (
        <ChipButton
          key={option}
          active={value === option}
          onClick={() => onPick(option)}
          data-testid={`${testId}-${option}`}
        >
          {labels[option]}
        </ChipButton>
      ))}
    </div>
  );
}
