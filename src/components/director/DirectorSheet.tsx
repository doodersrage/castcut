'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { ChipButton, FieldError, TextInput } from '@/components/ui/Field';
import type { PoseRig3d, Rig3dBodyKind } from '@/lib/pose/rig3d';
import type { PoseReference } from '@/lib/pose/references';
import { poseLayoutLabel } from '@/lib/pose/layout-labels';
import { dayPoseWords } from '@/lib/day/pose-presets';
import { ReferencePosePicker } from '@/components/pose/PosePickers';
import { usePoseReferences } from '@/hooks/usePoseReferences';
import { cameraHeightOf } from '@/lib/pose/rig3d-camera';
import type { Posture } from '@/lib/pose/rig3d-posture-points';
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
import { stillShowsSeat } from '@/lib/video/motion-seat-client';
import { ORIGIN, placementOf, toLocal } from '@/lib/director/figure-ops';
import { frameDirection, readStillFraming, type StillFraming } from '@/lib/director/framing';
import { DIRECTOR_MOVE_IDS, DIRECTOR_MOVES, type DirectorMoveId } from '@/lib/director/moves';
import {
  directionMotionLine,
  directionSeat,
  directionSupportNeeds,
  supportFix,
  supportWarning,
} from '@/lib/director/motion-line';
import {
  editorRig,
  figureFromEditor,
  knownStillPoseFigure,
  poseBeat,
  referenceStillPoseFigure,
  realPoseFigure,
  starterFigure,
  readStillCamera,
  stillCameraKnown,
  stillPoseFigure,
} from '@/lib/director/poses';
import {
  addBeat,
  applyPreset,
  DIRECTOR_PRESETS,
  moveBeat,
  removeBeat,
  videoBeat,
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
  subscribeDirections,
  type SavedDirection,
} from '@/lib/director/store';
import DirectorPreview from '@/components/director/DirectorPreview';
import { liftVideoMotionAsync, readVideoPoses } from '@/lib/director/video-motion-client';

const PoseJointEditor3D = dynamic(() => import('@/components/pose/PoseJointEditor3D'), {
  ssr: false,
});

export type DirectorRenderOptions = {
  motion: string;
  place?: string;
  /** A seat Copy moves puts into the still first ("a wooden chair"), when she sits down. */
  seat?: string;
};

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
  /**
   * Her posture in the still when it is known from outside the joints (the slot's or beat's
   * picked pose): her pose in the picture is lifted toward it.
   */
  postures?: Posture[];
  onClose: () => void;
  /**
   * The 3D pose the still was posed with (a custom pose made in the 3D editor): her pose in the
   * picture starts from it while the still still shows it, instead of lifting the still's joints.
   */
  pose3d?: PoseRig3d;
  /**
   * The pose the still was picked in (a Day slot's or beat's layout): a real pose of it with its
   * own 3D that the still shows is the start, instead of lifting the still's joints.
   */
  poseId?: string;
  /** Start Copy moves with the driving video (a background job). */
  onRender: (video: Blob, options: DirectorRenderOptions) => void;
  testId?: string;
};

/**
 * A still's size, read from the picture itself. A load that fails (a busy ComfyUI drops the
 * request) is tried again a few times; null until it loads, or when it never does.
 */
function useStillSize(url: string): { width: number; height: number } | null {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      const image = new Image();
      image.onload = () => {
        if (!cancelled && image.naturalWidth && image.naturalHeight) {
          setSize({ url, width: image.naturalWidth, height: image.naturalHeight });
        }
      };
      image.onerror = () => {
        if (!cancelled && attempt < 3) timer = setTimeout(() => load(attempt + 1), 1500 * attempt);
      };
      image.src = url;
    };
    load(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [url]);
  return size?.url === url ? size : null;
}

/** The real poses the Director offers: one-person poses with 3D (captured, drawn or estimated). */
const hasOwn3d = (reference: PoseReference) =>
  Boolean(reference.world) && reference.people.length === 1;

function startDirection(body: Rig3dBodyKind, place?: string): Direction {
  return {
    version: 1,
    body,
    beats: [poseBeat('Stand', starterFigure('stand', body), { first: true })],
    camera: { ...DEFAULT_DIRECTOR_CAMERA },
    ...(place?.trim() ? { place: place.trim() } : {}),
  };
}

/**
 * The direction starting from her pose as the still shows it, seen through the still's camera
 * when it is read already (readStillCamera), else at eye level until it is.
 */
function directionFromStill(
  direction: Direction,
  pose: { body: NormalizedBody; aspect: number },
  body: Rig3dBodyKind,
  postures?: Posture[],
  known?: { pose3d?: PoseRig3d; poseId?: string; references?: readonly PoseReference[] }
): Direction {
  const { figure, side, turned, view } =
    (known?.pose3d ? knownStillPoseFigure(known.pose3d, pose.body, pose.aspect, body) : null) ??
    (known?.references
      ? referenceStillPoseFigure(known.references, known.poseId, pose.body, pose.aspect, body)
      : null) ??
    stillPoseFigure(pose.body, pose.aspect, body, postures, 'known');
  const start = {
    ...poseBeat('Her pose in the picture', figure, { first: true }),
    hold: direction.beats[0]!.hold,
  };
  const facing: CameraDirection =
    turned < 22.5 ? 'front' : turned < 65 ? 'three-quarter' : turned < 125 ? 'side' : 'back';
  return {
    ...replaceBeat(direction, 0, start),
    camera: { ...direction.camera, direction: facing, side, shot: 'picture', height: 'eye', view },
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
  postures,
  pose3d,
  poseId,
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
  // Put the seat into the still before Copy moves (it draws the room from the still). Unset: on,
  // unless the vision model sees a seat behind her already (the edit may add a second one).
  const [drawSeatChoice, setDrawSeat] = useState<boolean | null>(null);
  const [stillSeat, setStillSeat] = useState<boolean | null>(null);
  // Saved on another device: the list catches up when sync brings them.
  useEffect(() => subscribeDirections(() => setSaved(loadDirections(castId))), [castId]);
  const abortRef = useRef<AbortController | null>(null);
  // Anything the player does keeps the start they chose; until then, her pose in the still is
  // the start once it has been read (a standing figure beside a seated still looked wrong).
  const touched = useRef(false);
  // Bumped by every change the player makes: a start from the still that waited on the still's
  // camera applies only if nothing changed meanwhile.
  const changes = useRef(0);
  // A render started: what it films is what was shown, so a camera read landing later is not
  // swapped in under it.
  const filming = useRef(false);
  // Her posture as the slot or beat picked it (fixed while the sheet is open).
  const [knownPostures] = useState(postures);
  // The 3D pose the still was posed with, and the pose it was picked as, likewise; the real
  // poses with 3D, once loaded, to match the still against.
  const [knownPose3d] = useState(pose3d);
  const [knownPoseId] = useState(poseId);
  const references = usePoseReferences();
  // (Read by the still's start when it lands: the references may load after the sheet opens.)
  const knownRef = useRef({ pose3d: knownPose3d, poseId: knownPoseId, references });
  useEffect(() => {
    knownRef.current = { pose3d: knownPose3d, poseId: knownPoseId, references };
  }, [knownPose3d, knownPoseId, references]);
  // The real-pose picker: open to set the start, or to add a beat.
  const [realPoses, setRealPoses] = useState<'start' | 'add' | null>(null);

  const loaded = useStillSize(stillUrl);

  // Her pose in the still (DWPose on ComfyUI): the framing to match, and a start pose.
  const [detected, setDetected] = useState<{
    framing: StillFraming | null;
    pose: { body: NormalizedBody; aspect: number } | null;
    /** The still's size as the pose read saw it. */
    size?: { width: number; height: number };
    state: 'reading' | 'done' | 'failed';
  }>({ framing: null, pose: null, state: 'reading' });
  // The video takes the still's shape (Copy moves renders at it): from the picture, else from
  // the pose read; 9:16 only when neither has it.
  const size = loaded ?? detected.size ?? null;
  const video = size ? motionTransferSize(size.width, size.height) : { width: 464, height: 832 };
  const aspect = video.width / video.height;
  // Not the still's shape yet: wait for it rather than film the wrong one.
  const sizing = !size && detected.state === 'reading';
  useEffect(() => {
    let cancelled = false;
    const reading = new AbortController();
    detectStillPoseShared(stillUrl)
      .then(result => {
        if (cancelled) return;
        const lead = result.available ? result.pose.people[0] : undefined;
        const canvas = result.available ? result.pose.canvas : null;
        setDetected({
          ...(canvas?.width && canvas.height
            ? { size: { width: canvas.width, height: canvas.height } }
            : {}),
          framing: readStillFraming(lead),
          pose:
            lead && canvas
              ? { body: lead, aspect: canvas.width / Math.max(1, canvas.height) }
              : null,
          state: 'done',
        });
        if (lead && canvas && !touched.current) {
          const pose = { body: lead, aspect: canvas.width / Math.max(1, canvas.height) };
          // At once (eye level unless the still's camera is read already), then through the
          // still's camera when the lift worker has read it — unless the player moved on.
          const fromStill = () =>
            setDirection(current =>
              touched.current
                ? current
                : directionFromStill(current, pose, body, knownPostures, knownRef.current)
            );
          fromStill();
          if (!stillCameraKnown(pose.body, pose.aspect, body, knownPostures)) {
            void readStillCamera(pose.body, pose.aspect, body, knownPostures, reading.signal)
              .then(() => {
                if (!cancelled && !touched.current && !filming.current) fromStill();
              })
              .catch(() => {
                // Eye level stays: the read camera is a refinement.
              });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDetected({ framing: null, pose: null, state: 'failed' });
      });
    return () => {
      cancelled = true;
      reading.abort();
    };
  }, [stillUrl, body, knownPostures]);

  const frames = useMemo(() => directionFrames(direction), [direction]);
  const framing = useMemo(
    () => frameDirection({ frames, camera: direction.camera, aspect, still: detected.framing }),
    [frames, direction.camera, aspect, detected.framing]
  );
  const length = directionLength(direction);
  const check = checkDirection(direction);
  const allSupportNeeds = directionSupportNeeds(direction);
  const seatOffer = directionSeat(allSupportNeeds, direction.place);
  const drawSeat = drawSeatChoice ?? stillSeat !== true;
  const seat = drawSeat ? seatOffer : null;
  // A seat put into (or already in) the still covers the sitting beats; leaning still needs Place.
  const supportNeeds =
    seat || (seatOffer && stillSeat === true)
      ? allSupportNeeds.filter(note => note.support !== 'sit')
      : allSupportNeeds;
  const support = supportWarning(supportNeeds, direction.place);
  const seatFix = support ? supportFix(supportNeeds, direction.place, body) : null;
  // Asked only once a later beat sits; one vision call per still (cached for the session).
  const wantsSeat = seatOffer !== null;
  useEffect(() => {
    if (!wantsSeat) return;
    let cancelled = false;
    void stillShowsSeat(stillUrl).then(answer => {
      if (!cancelled) setStillSeat(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [stillUrl, wantsSeat]);
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
    touched.current = true;
    changes.current += 1;
    setDirection(next);
    setTime(t => Math.min(t, directionLength(next)));
  };
  const setCamera = (patch: Partial<DirectorCamera>) => {
    // A camera pick other than a move replaces the still's own camera.
    const { view, ...rest } = direction.camera;
    const keepView = view && Object.keys(patch).every(key => key === 'move');
    update({ ...direction, camera: { ...rest, ...(keepView ? { view } : {}), ...patch } });
  };

  const startFrom = (id: PoseStarterId) => {
    const label = POSE_STARTERS.find(starter => starter.id === id)?.label ?? 'Stand';
    const start = {
      ...poseBeat(label, starterFigure(id, body), { first: true }),
      hold: direction.beats[0]!.hold,
    };
    const { view: _still, ...camera } = direction.camera;
    update({ ...replaceBeat(direction, 0, start), camera });
  };
  const startFromStill = () => {
    const pose = detected.pose;
    if (!pose) return;
    if (stillCameraKnown(pose.body, pose.aspect, body, knownPostures)) {
      update(directionFromStill(direction, pose, body, knownPostures, knownRef.current));
      return;
    }
    // The still's camera is still being read (the lift worker): start from it once it is, unless
    // the player does something else first.
    touched.current = true;
    const at = changes.current;
    void readStillCamera(pose.body, pose.aspect, body, knownPostures)
      .catch(() => undefined)
      .then(() => {
        if (changes.current !== at || filming.current) return;
        update(directionFromStill(direction, pose, body, knownPostures, knownRef.current));
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
  // From a video: read on ComfyUI, lifted onto the 3D body, added as the next beat.
  const videoInput = useRef<HTMLInputElement>(null);
  const videoAbort = useRef<AbortController | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  useEffect(() => () => videoAbort.current?.abort(), []);
  const addFromVideo = async (file: File) => {
    videoAbort.current?.abort();
    const controller = new AbortController();
    videoAbort.current = controller;
    setError(null);
    setVideoNote('Sending the video');
    try {
      const read = await readVideoPoses(file, {
        signal: controller.signal,
        onNote: note => setVideoNote(note),
      });
      setVideoNote('Following the moves on the 3D body');
      const frames = await liftVideoMotionAsync(read, body);
      if (controller.signal.aborted) return;
      // Added to the direction as it is now (the player may have edited it while this read).
      const beat = videoBeat(frames, file.name);
      touched.current = true;
      changes.current += 1;
      setPlaying(false);
      setDirection(current => addBeat(current, beat));
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Could not read the moves.');
      }
    } finally {
      if (videoAbort.current === controller) {
        videoAbort.current = null;
        setVideoNote(null);
      }
    }
  };
  /** A motion-capture pose, as captured: the start, or the next beat. */
  const pickRealPose = (reference: PoseReference) => {
    const world = reference.world;
    if (!world || !realPoses) return;
    const name = poseLayoutLabel(reference.pose);
    const words = dayPoseWords(reference.pose).slice(0, 200) || undefined;
    const figure = realPoseFigure(world, body);
    if (realPoses === 'start') {
      const start = {
        ...poseBeat(name, figure, { first: true, words }),
        hold: direction.beats[0]!.hold,
      };
      const { view: _still, ...camera } = direction.camera;
      update({ ...replaceBeat(direction, 0, start), camera });
    } else {
      update(addBeat(direction, poseBeat(name, figure, { words })));
    }
    setRealPoses(null);
  };

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

  const realPosePicker = (
    <div
      className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid={`${p}-real-poses`}
    >
      <p className="type-caption text-[var(--text-muted)]">
        Real people&rsquo;s poses in 3D — {she} takes the pose from any side. Motion-capture and
        drawn poses are exact; ones marked &ldquo;est.&rdquo; are read from a photo, so their depth
        is the likeliest one.
      </p>
      <ReferencePosePicker
        testIdPrefix={`${p}-real`}
        twoPeople={false}
        only={hasOwn3d}
        onPick={pickRealPose}
      />
    </div>
  );

  const render = async (use: 'copy' | 'download') => {
    if (check.errors.length || rendering || sizing) return;
    setError(null);
    setPlaying(false);
    const controller = new AbortController();
    abortRef.current = controller;
    filming.current = true;
    setRendering({ done: 0, total: frames.length });
    try {
      const { renderDrivingVideo } = await import('@/lib/director/render-client');
      const blob = await renderDrivingVideo({
        frames,
        framing,
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
        filming.current = false;
        setRendering(null);
        return;
      }
      onRender(blob, {
        motion: directionMotionLine(direction, seat),
        ...(direction.place?.trim() ? { place: direction.place.trim() } : {}),
        ...(seat ? { seat } : {}),
      });
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not film the direction.');
      }
      filming.current = false;
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
  // How high the still's own camera reads, while her start is seen through it.
  const stillHeight = direction.camera.view ? cameraHeightOf(direction.camera.view) : null;
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
        disabled={Boolean(check.errors.length) || rendering !== null || sizing}
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
        disabled={Boolean(check.errors.length) || busy || sizing}
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
              framing={framing}
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
              {framing.from
                ? `It starts framed like the still, then the camera eases back as ${she} moves so the whole move stays in frame.`
                : 'The camera stands a little further back than the still so the whole move stays in frame.'}
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
                <ChipButton
                  active={realPoses === 'start'}
                  title="A real person's pose in 3D (bend, kneel, sit, reach, stretch…)"
                  onClick={() => setRealPoses(open => (open === 'start' ? null : 'start'))}
                  data-testid={`${p}-start-real`}
                >
                  A real pose…
                </ChipButton>
              </div>
              {realPoses === 'start' ? realPosePicker : null}
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
                          {beat.kind === 'pose' ? 'Move in' : 'Length'}
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
                <Button
                  size="sm"
                  variant="secondary"
                  aria-expanded={realPoses === 'add'}
                  data-testid={`${p}-add-real-pose`}
                  onClick={() => setRealPoses(open => (open === 'add' ? null : 'add'))}
                >
                  + Add a real pose…
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(videoNote)}
                  title="Her moves from your own video: a person moving, whole in the frame, up to 10 s"
                  data-testid={`${p}-add-video`}
                  onClick={() => videoInput.current?.click()}
                >
                  + From a video…
                </Button>
                <input
                  ref={videoInput}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  data-testid={`${p}-video-file`}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void addFromVideo(file);
                  }}
                />
              </div>
              {videoNote ? (
                <p
                  className="type-caption text-[var(--text-secondary)]"
                  role="status"
                  data-testid={`${p}-video-note`}
                >
                  {videoNote}…
                </p>
              ) : null}
              {realPoses === 'add' ? realPosePicker : null}
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
              {stillHeight && stillHeight !== 'eye' ? (
                // The still's own camera, as the lift read it: shown, not picked (a fitting aid,
                // not a measurement) — the Height row is still what a pick sets.
                <p
                  className="type-caption text-[var(--text-muted)]"
                  data-testid={`${p}-still-height`}
                >
                  Seen through the still&apos;s own camera, which reads as{' '}
                  {stillHeight === 'low' ? 'from below' : 'from above'} — pick a height to use one
                  of your own.
                </p>
              ) : null}
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
              {seatOffer ? (
                <label
                  className="type-caption flex items-start gap-2 text-[var(--text-muted)]"
                  title="Copy moves draws the room from the still, so a seat only named in Place is not drawn"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={drawSeat}
                    onChange={event => setDrawSeat(event.target.checked)}
                    data-testid={`${p}-seat`}
                  />
                  <span>
                    Put {seatOffer} behind {body === 'male' ? 'him' : 'her'} in the still first, so{' '}
                    {she} sits on it (a quick edit before the clip)
                    {stillSeat === true ? (
                      <span className="block" data-testid={`${p}-seat-seen`}>
                        The picture already shows a seat behind {body === 'male' ? 'him' : 'her'} —
                        this starts off, so a second one isn’t added.
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : null}
              {support ? (
                <p
                  className="type-caption text-[var(--tint-warning-text,var(--text-muted))]"
                  role="status"
                  data-testid={`${p}-support`}
                >
                  {support}
                </p>
              ) : null}
              {seatFix ? (
                <Button
                  size="sm"
                  variant="secondary"
                  title={`Place becomes “${seatFix.place}”, so Copy moves draws it`}
                  data-testid={`${p}-support-fix`}
                  onClick={() => update({ ...direction, place: seatFix.place })}
                >
                  {seatFix.label}
                </Button>
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
                  Saved for {castName?.trim() || 'this Cast member'}, on every device you use.
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
