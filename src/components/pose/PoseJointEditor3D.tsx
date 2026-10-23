'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Button } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { POSE_FIGURE_COLORS } from '@/components/pose/PoseBodiesSvg';
import { DayPosePicker, ReferencePosePicker } from '@/components/pose/PosePickers';
import {
  BACKDROP_OPACITY,
  SHOW_BACKDROP_KEY,
  figureName,
  readBackdropOpacity,
  readShown,
  rememberBackdropOpacity,
  rememberShown,
} from '@/components/pose/pose-joint-editor-model';
import { BONE_WORDS, PoseScene, type HandleId } from '@/components/pose/pose-3d-scene';
import {
  CAMERA_DIRECTIONS,
  CAMERA_DIRECTION_LABELS,
  CAMERA_HEIGHTS,
  CAMERA_HEIGHT_LABELS,
  CAMERA_LENSES,
  CAMERA_LENS_LABELS,
  CAMERA_SHOTS,
  CAMERA_SHOT_LABELS,
  DEFAULT_CAMERA_CHOICE,
  cameraChoiceIsSet,
  cameraChoiceLine,
  type FullCameraChoice,
  type PoseCameraChoice,
} from '@/lib/pose/camera-shot';
import { cameraForChoice, faceCamera, rigCameraChoice } from '@/lib/pose/rig3d-camera';
import { dayPoseAsPhotoPose, dayPoseWords } from '@/lib/day/pose-presets';
import type { PhotoPose } from '@/lib/day/pose-guide';
import { describePhotoPose } from '@/lib/pose/describe';
import type { NormalizedBody } from '@/lib/pose/library';
import { saveMyPose } from '@/lib/pose/my-poses';
import type { PoseReference } from '@/lib/pose/references';
import type { PoseRig3d, Rig3dBodyKind } from '@/lib/pose/rig3d';
import {
  DEFAULT_CAMERA,
  aimAtFigures,
  cloneRig,
  flipLimbDepth,
  liftBodies,
  liftBody,
  mirrorRig,
  projectRig,
  rigProjectionError,
  type Limb,
  type Side,
} from '@/lib/pose/rig3d-pose';
import {
  posturesForPose,
  posturesForReference,
  type Posture,
} from '@/lib/pose/rig3d-posture-points';
import {
  POSE_STARTERS,
  addPartner,
  poseStarterBody,
  type PoseStarterId,
} from '@/lib/pose/starters';

/** A restored rig must still draw the pose it was saved with (it may have been edited since). */
const RESTORE_TOLERANCE = 0.006;

type Snapshot = { rig: PoseRig3d; words: string | null; edited: boolean };

declare global {
  interface Window {
    /** Playwright only: drive the 3D editor without hunting for pixels. */
    __castcutPose3d?: {
      rig: () => PoseRig3d;
      bodies: () => NormalizedBody[];
      handlePoint: (handle: HandleId, figure?: number) => { x: number; y: number } | null;
      loading: () => boolean;
      renderPosePicture: (
        pose: PhotoPose,
        height?: number
      ) => Promise<{
        width: number;
        height: number;
        bytes: number;
        nonBackground: number;
      }>;
    };
  }
}

function exposeTestApi(api: Window['__castcutPose3d'] | null) {
  if (api) window.__castcutPose3d = api;
  else delete window.__castcutPose3d;
}

/** Stretch a figure drawn for another canvas onto this one, keeping its shape. */
function widenFor(body: NormalizedBody, from: number, to: number): NormalizedBody {
  const widen = from / to;
  return body.map(point =>
    point ? { x: Math.min(0.99, Math.max(0.01, 0.5 + (point.x - 0.5) * widen)), y: point.y } : null
  );
}

/**
 * The 3D pose editor: a smooth, neutral body to pose instead of a wireframe. Drag a hand, foot,
 * the gaze handle or the hips; click a body part to turn it on a ring; orbit and zoom the camera
 * (it is the picture's camera: the pose is saved as seen through it). Saving gives the same
 * PhotoPose as the wireframe editor — the 18 points, projected — plus the rig, so reopening is
 * exact.
 */
export default function PoseJointEditor3D({
  bodies: initialBodies,
  rig3d,
  aspect,
  testIdPrefix,
  onSave,
  onCancel,
  onUseWireframe,
  allowTwo = true,
  possessive = 'her',
  leadsPrompt = false,
  words: initialWords,
  backdropUrl,
  backdropLabel,
  duoSeed,
  soloStill = false,
  initialCamera,
  postures,
}: {
  bodies: NormalizedBody[];
  /** The rig this pose was saved with in the 3D editor, if it was. */
  rig3d?: PoseRig3d;
  aspect: number;
  testIdPrefix: string;
  onSave: (pose: PhotoPose) => void;
  onCancel: () => void;
  /** Switch to the wireframe editor, handing it the pose as it stands. */
  onUseWireframe?: (bodies: NormalizedBody[], words: string | null, rig: PoseRig3d) => void;
  allowTwo?: boolean;
  possessive?: 'her' | 'his';
  leadsPrompt?: boolean;
  words?: string;
  backdropUrl?: string | null;
  backdropLabel?: string;
  duoSeed?: NormalizedBody[];
  soloStill?: boolean;
  /**
   * The camera the slot or beat picked (its Camera row): a pose that has no camera of its own yet
   * opens seen through it, so what is posed is what that still frames.
   */
  initialCamera?: PoseCameraChoice;
  /**
   * The lead's posture when it is known from outside the points (the slot's or beat's picked
   * pose, the vision model's read of the photo): the lift targets it instead of guessing.
   */
  postures?: Posture[];
}) {
  const titleId = useId();
  const p = testIdPrefix;
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;
  const leadKind: Rig3dBodyKind = possessive === 'his' ? 'male' : 'female';
  const partnerKind: Rig3dBodyKind = leadKind === 'female' ? 'male' : 'female';
  const kinds = useCallback(
    (count: number, current?: PoseRig3d): Rig3dBodyKind[] =>
      Array.from(
        { length: count },
        (_, index) => current?.figures[index]?.body ?? (index === 0 ? leadKind : partnerKind)
      ),
    [leadKind, partnerKind]
  );

  // What the editor opened with: the saved rig when it still draws these points, else a lift.
  const [opened] = useState(() => {
    const restored =
      rig3d && rigProjectionError(rig3d, initialBodies, safeAspect) < RESTORE_TOLERANCE;
    if (restored) return { rig: cloneRig(rig3d), restored: true, reframed: false };
    const lifted = liftBodies(
      initialBodies,
      safeAspect,
      kinds(initialBodies.length),
      DEFAULT_CAMERA,
      { postures: [postures] }
    );
    if (!cameraChoiceIsSet(initialCamera)) return { rig: lifted, restored: false, reframed: false };
    const choice = { ...DEFAULT_CAMERA_CHOICE, ...initialCamera };
    return {
      rig: { ...lifted, camera: cameraForChoice(lifted, choice, safeAspect) },
      restored: false,
      reframed: true,
    };
  });
  const [rig, setRig] = useState<PoseRig3d>(opened.rig);
  const latest = useRef<PoseRig3d>(opened.rig);
  // The pose (not only the camera) changed since it opened: the output is the projection.
  const [edited, setEdited] = useState(false);
  const editedRef = useRef(false);
  // Opened through the slot's camera: the picture already differs from the points it came with.
  const [viewChanged, setViewChanged] = useState(opened.reframed);
  // A Day pose's name and cue, kept as the words until the body is posed by hand.
  const [words, setWords] = useState<string | null>(initialWords?.trim() || null);
  const wordsRef = useRef<string | null>(initialWords?.trim() || null);
  const [selection, setSelection] = useState<{ figure: number; bone: string | null }>({
    figure: 0,
    bone: null,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [flipNote, setFlipNote] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<PoseScene | null>(null);
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [undoable, setUndoable] = useState(0);
  const [redoable, setRedoable] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [posePickerOpen, setPosePickerOpen] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [showBackdrop, setShowBackdrop] = useState(() => readShown(SHOW_BACKDROP_KEY));
  const [backdropOpacity, setBackdropOpacity] = useState(readBackdropOpacity);
  const [failedBackdrop, setFailedBackdrop] = useState<string | null>(null);
  const backdrop =
    backdropUrl?.trim() && backdropUrl.trim() !== failedBackdrop ? backdropUrl.trim() : null;

  const snapshot = (): Snapshot => ({
    rig: cloneRig(latest.current),
    words: wordsRef.current,
    edited: editedRef.current,
  });
  const rememberHistory = () => {
    setUndoable(history.current.length);
    setRedoable(future.current.length);
  };
  const checkpoint = () => {
    history.current.push(snapshot());
    if (history.current.length > 100) history.current.shift();
    future.current = [];
    rememberHistory();
  };
  const setWordsBoth = (next: string | null) => {
    wordsRef.current = next;
    setWords(next);
  };
  const markEdited = (value: boolean) => {
    editedRef.current = value;
    setEdited(value);
  };

  // React state follows the scene at most once a frame (a drag fires per pointer move).
  const pendingFrame = useRef(0);
  const publish = useCallback(() => {
    if (pendingFrame.current) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0;
      setRig(latest.current);
    });
  }, []);

  /** Replace the whole rig from outside the scene (undo, start from, partner…). */
  const replaceRig = (next: PoseRig3d, options: { keepCamera?: boolean } = {}) => {
    latest.current = cloneRig(next);
    sceneRef.current?.setRig(latest.current, options);
    if (sceneRef.current) latest.current = sceneRef.current.getRig();
    setRig(latest.current);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let scene: PoseScene;
    try {
      scene = new PoseScene(host, latest.current, safeAspect, {
        onBegin: () => {
          history.current.push(snapshot());
          if (history.current.length > 100) history.current.shift();
          future.current = [];
          rememberHistory();
          setSavedNote(null);
        },
        onChange: (next, what) => {
          latest.current = next;
          if (what === 'pose') {
            markEdited(true);
            setWordsBoth(null);
          } else {
            setViewChanged(true);
          }
          publish();
        },
        onSelect: (figure, bone) => setSelection({ figure, bone }),
        onStatus: setStatus,
      });
    } catch (error) {
      // No WebGL after all (a lost or blocked context): say so; the wireframe is one click away.
      const message = error instanceof Error ? error.message : 'The 3D view could not start.';
      const timer = window.setTimeout(() => setFailed(message), 0);
      return () => window.clearTimeout(timer);
    }
    sceneRef.current = scene;
    const poll = window.setInterval(() => {
      if (!scene.isLoading) {
        setReady(true);
        window.clearInterval(poll);
      }
    }, 100);
    if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
      exposeTestApi({
        rig: () => scene.getRig(),
        bodies: () => projectRig(scene.getRig(), safeAspect),
        handlePoint: (handle, figure) => scene.handleClientPoint(handle, figure),
        loading: () => scene.isLoading,
        renderPosePicture: async (pose, height = 256) => {
          const { renderPosePicture } = await import('@/lib/pose/rig3d-render');
          const blob = await renderPosePicture(pose, { height });
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let nonBackground = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (
              Math.abs(data[i]! - 0xf3) +
                Math.abs(data[i + 1]! - 0xf2) +
                Math.abs(data[i + 2]! - 0xef) >
              24
            ) {
              nonBackground += 1;
            }
          }
          return { width: bitmap.width, height: bitmap.height, bytes: blob.size, nonBackground };
        },
      });
    }
    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(pendingFrame.current);
      scene.dispose();
      sceneRef.current = null;
      exposeTestApi(null);
    };
    // The scene is made once; later rigs go through replaceRig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = useCallback((shot: Snapshot) => {
    latest.current = cloneRig(shot.rig);
    sceneRef.current?.setRig(latest.current);
    setRig(latest.current);
    wordsRef.current = shot.words;
    setWords(shot.words);
    editedRef.current = shot.edited;
    setEdited(shot.edited);
    setUndoable(history.current.length);
    setRedoable(future.current.length);
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push({
      rig: cloneRig(latest.current),
      words: wordsRef.current,
      edited: editedRef.current,
    });
    restore(previous);
  }, [restore]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push({
      rig: cloneRig(latest.current),
      words: wordsRef.current,
      edited: editedRef.current,
    });
    restore(next);
  }, [restore]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  const projected = useMemo(() => projectRig(rig, safeAspect), [rig, safeAspect]);
  // Untouched, the pose is the one it opened with, point for point.
  const changed = edited || viewChanged;
  const outputBodies = changed ? projected : initialBodies;
  const figureCount = rig.figures.length;
  const focus = Math.min(selection.figure, figureCount - 1);

  const output = (): PhotoPose => {
    const keepRig = changed || opened.restored;
    return {
      aspect: safeAspect,
      people: outputBodies,
      source: 'edited',
      ...(words ? { words } : {}),
      ...(keepRig ? { rig3d: cloneRig(latest.current) } : {}),
    };
  };

  const requestClose = (source: 'escape' | 'backdrop' = 'backdrop') => {
    if (confirmClose) {
      setConfirmClose(false);
      return;
    }
    if (source === 'escape' && saveName != null) {
      setSaveName(null);
      return;
    }
    if (changed) {
      setConfirmClose(true);
      return;
    }
    onCancel();
  };

  // ── Edits from the panel ────────────────────────────────────────────────────────────────

  const startFromBodies = (
    bodies: NormalizedBody[],
    nextWords: string | null,
    both = false,
    facingFront = false,
    leadPostures?: Posture[]
  ) => {
    checkpoint();
    const current = latest.current;
    // A pose picked by name lifts toward the posture it is filed under.
    const lifted = liftBodies(bodies, safeAspect, kinds(bodies.length, current), DEFAULT_CAMERA, {
      postures: [leadPostures],
    });
    // A starter faces you; the lift alone read it as turned (see faceCamera).
    if (facingFront) {
      for (const figure of lifted.figures) faceCamera(figure, lifted.camera);
    }
    const figures = both ? lifted.figures : [lifted.figures[0]!, ...current.figures.slice(1)];
    const next = { ...lifted, figures };
    // A picked camera stays picked: the new pose is framed the same way.
    const choice = current.camera.choice;
    replaceRig(choice ? { ...next, camera: cameraForChoice(next, choice, safeAspect) } : next);
    markEdited(true);
    setWordsBoth(nextWords);
    setSavedNote(null);
    sceneRef.current?.select(0);
  };
  const startFrom = (id: PoseStarterId) =>
    startFromBodies([poseStarterBody(id)], null, false, true, posturesForPose(id));
  const startFromDayPose = (id: string) => {
    const picked = dayPoseAsPhotoPose(id);
    const figure = picked?.people[0];
    if (!picked || !figure) return;
    startFromBodies(
      [widenFor(figure, picked.aspect, safeAspect)],
      picked.words?.trim() || null,
      false,
      false,
      posturesForPose(id)
    );
  };
  const startFromReference = (reference: PoseReference) => {
    const fitted = reference.people.map(body => widenFor(body, reference.aspect, safeAspect));
    const both = fitted.length > 1 && allowTwo && !soloStill;
    startFromBodies(
      both ? fitted : [fitted[0]!],
      dayPoseWords(reference.pose),
      both,
      false,
      posturesForReference(reference)
    );
  };

  const changeFigures = (next: PoseRig3d, select: number) => {
    checkpoint();
    // Same view; the orbit turns about the figures as they now stand.
    replaceRig({ ...next, camera: aimAtFigures(latest.current.camera, next.figures) });
    markEdited(true);
    setWordsBoth(null);
    setSavedNote(null);
    sceneRef.current?.select(select);
  };
  const addPartnerFigure = (mode?: 'mirror') => {
    const current = latest.current;
    const flat = projectRig(current, safeAspect);
    const withPartner = addPartner(flat, mode);
    const partnerBody = withPartner[1];
    if (!partnerBody) return;
    const partner = liftBody(partnerBody, safeAspect, {
      camera: current.camera,
      body: partnerKind,
    });
    changeFigures({ ...cloneRig(current), figures: [current.figures[0]!, partner] }, 1);
  };
  const useDuoLayout = () => {
    if (!duoSeed || duoSeed.length !== 2) return;
    const current = latest.current;
    changeFigures({ ...liftBodies(duoSeed, safeAspect, kinds(2, current), current.camera) }, 1);
  };
  const swapSides = () => {
    const current = cloneRig(latest.current);
    const [a, b] = current.figures;
    if (!a || !b) return;
    const [ax, , az] = a.position;
    const [bx, , bz] = b.position;
    a.position = [bx, a.position[1], bz];
    b.position = [ax, b.position[1], az];
    changeFigures(current, focus);
  };
  const removePartner = () => {
    const current = cloneRig(latest.current);
    changeFigures({ ...current, figures: current.figures.slice(0, 1) }, 0);
  };
  const setBody = (kind: Rig3dBodyKind) => {
    const current = cloneRig(latest.current);
    const figure = current.figures[focus];
    if (!figure || figure.body === kind) return;
    figure.body = kind;
    changeFigures(current, focus);
  };
  const mirror = () => {
    checkpoint();
    replaceRig(mirrorRig(latest.current), { keepCamera: true });
    markEdited(true);
    setWordsBoth(null);
  };
  const reset = () => {
    checkpoint();
    replaceRig(opened.rig);
    markEdited(false);
    setViewChanged(false);
    setWordsBoth(initialWords?.trim() || null);
    setSavedNote(null);
    sceneRef.current?.select(0);
  };
  const flip = (side: Side, limb: Limb) => {
    const current = cloneRig(latest.current);
    const figure = current.figures[focus];
    if (!figure) return;
    if (!flipLimbDepth(figure, current.camera, safeAspect, side, limb)) {
      setFlipNote(`That ${limb} cannot turn the other way without bending backwards.`);
      return;
    }
    setFlipNote(null);
    checkpoint();
    replaceRig(current, { keepCamera: true });
    markEdited(true);
    setWordsBoth(null);
  };
  // The Camera panel: what the camera is now (picked, or read from where it was orbited to).
  const cameraChoice = useMemo(() => rigCameraChoice(rig, safeAspect), [rig, safeAspect]);
  const cameraPicked = Boolean(rig.camera.choice);
  const setCamera = (patch: Partial<FullCameraChoice>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    checkpoint();
    const current = latest.current;
    const choice = { ...rigCameraChoice(current, safeAspect), ...patch };
    scene.setCamera(cameraForChoice(current, choice, safeAspect));
    latest.current = scene.getRig();
    setRig(latest.current);
    setViewChanged(true);
    setSavedNote(null);
  };
  const cameraWords = cameraChoiceLine(cameraChoice, {
    who: figureCount > 1 ? 'them' : possessive === 'his' ? 'him' : 'her',
  });

  const describeLine = outputBodies[0]
    ? describePhotoPose(
        { aspect: safeAspect, people: outputBodies, ...(words ? { words } : {}) },
        { lead: possessive === 'his' ? 'he' : 'she' }
      )
    : null;
  const selectedPart = selection.bone ? (BONE_WORDS[selection.bone] ?? selection.bone) : null;

  return (
    <Dialog
      open
      onClose={() => requestClose('escape')}
      onBackdropClick={() => requestClose('backdrop')}
      labelledBy={titleId}
      layer="dialogRaised"
      size="full"
      testId={`${p}-editor`}
      focusPanelOnOpen
      overlayClassName="p-3"
      panelClassName="max-h-[calc(100dvh-1.5rem)] !max-w-6xl overflow-hidden rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] max-md:h-[calc(100dvh-1.5rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:items-stretch md:gap-6 md:p-5"
    >
      <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 max-md:shrink-0 md:min-h-0 md:flex-1">
        {/* The canvas is the picture: its shape is the still's, so what you frame is what the
            pose map gets. */}
        <div
          className="relative h-[min(48dvh,440px)] w-auto max-w-full self-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] md:h-auto md:max-h-[min(70vh,660px)] md:w-[min(100%,calc(min(70vh,660px)*var(--pose-aspect)))]"
          style={
            {
              aspectRatio: String(safeAspect),
              '--pose-aspect': String(safeAspect),
            } as CSSProperties
          }
          data-testid={`${p}-canvas`}
          data-editor="3d"
          data-ready={ready ? 'true' : 'false'}
          role="application"
          aria-label="3D pose: drag a hand, foot, the gaze handle or the hips; click a body part to turn it; drag elsewhere to orbit"
        >
          {backdrop && showBackdrop ? (
            // The Cast's own picture behind the figure; a guide only, never saved.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdrop}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: backdropOpacity }}
              data-testid={`${p}-backdrop`}
              onError={() => setFailedBackdrop(backdrop)}
            />
          ) : null}
          <div ref={hostRef} className="absolute inset-0" />
          {!ready && !failed ? (
            <p className="type-caption pointer-events-none absolute inset-x-0 top-2 text-center text-[var(--text-muted)]">
              Loading the 3D body…
            </p>
          ) : null}
          {failed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                The 3D view could not start here.
              </p>
              {onUseWireframe ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onUseWireframe(outputBodies, words, cloneRig(latest.current))}
                >
                  Use the wireframe editor
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 w-full flex-col max-md:flex-1 md:w-[26rem] md:shrink-0">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={titleId} className="type-heading">
              Edit pose
            </h2>
            {onUseWireframe ? (
              <Button
                size="sm"
                variant="ghost"
                title="Pose a flat stick figure instead (the editor before the 3D body)"
                data-testid={`${p}-mode-wireframe`}
                onClick={() => onUseWireframe(outputBodies, words, cloneRig(latest.current))}
              >
                Wireframe editor
              </Button>
            ) : null}
          </div>
          <p
            className="text-sm text-[var(--text-secondary)]"
            role="status"
            aria-live="polite"
            data-testid={`${p}-gesture`}
          >
            {status ??
              (selectedPart
                ? `Turning ${selectedPart}: drag a ring, or click empty space to finish.`
                : 'Drag a hand or foot — the elbow or knee follows. Click a body part to turn it.')}
          </p>
          <details className="type-caption text-[var(--text-muted)]" data-testid={`${p}-how-to`}>
            <summary className="flex min-h-8 cursor-pointer items-center text-[var(--text-secondary)]">
              How to pose
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                Drag a coloured ball on a hand or foot: the arm or leg follows, bending the natural
                way.
              </li>
              <li>
                Drag the yellow ball in front of the face to turn the head; the white ring at the
                hips moves the whole figure.
              </li>
              <li>
                Click a body part for rings: drag one to turn that part (the white ring turns it
                freely). Click empty space to finish.
              </li>
              <li>
                Drag empty space to orbit; scroll or pinch to zoom; right-drag or two fingers to
                pan.
              </li>
              <li>
                The picture is taken from where you look. Camera sets the height, the side, how much
                of the body is in frame and the lens; the still is told the same.
              </li>
              <li>Ctrl+Z undoes.</li>
            </ul>
          </details>
          <div className="space-y-1.5" data-testid={`${p}-editor-tools`}>
            <p className="type-caption text-[var(--text-muted)]">Start from</p>
            <div className="flex flex-wrap gap-1.5">
              {POSE_STARTERS.map(starter => (
                <Button
                  key={starter.id}
                  size="sm"
                  variant="secondary"
                  className="whitespace-nowrap"
                  data-testid={`${p}-starter-${starter.id}`}
                  onClick={() => startFrom(starter.id)}
                >
                  {starter.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant={posePickerOpen ? 'primary' : 'secondary'}
                className="whitespace-nowrap"
                aria-expanded={posePickerOpen}
                data-testid={`${p}-day-pose`}
                onClick={() => {
                  setPosePickerOpen(open => !open);
                  setReferencePickerOpen(false);
                }}
              >
                {posePickerOpen ? 'Hide poses' : 'More poses…'}
              </Button>
              <Button
                size="sm"
                variant={referencePickerOpen ? 'primary' : 'secondary'}
                className="whitespace-nowrap"
                aria-expanded={referencePickerOpen}
                data-testid={`${p}-real-poses`}
                onClick={() => {
                  setReferencePickerOpen(open => !open);
                  setPosePickerOpen(false);
                }}
              >
                {referencePickerOpen ? 'Hide real poses' : 'Real poses…'}
              </Button>
            </div>
            {posePickerOpen ? (
              <DayPosePicker
                testIdPrefix={p}
                onPick={id => {
                  startFromDayPose(id);
                  setPosePickerOpen(false);
                }}
              />
            ) : null}
            {referencePickerOpen ? (
              <ReferencePosePicker
                testIdPrefix={p}
                twoPeople={allowTwo}
                onPick={reference => {
                  startFromReference(reference);
                  setReferencePickerOpen(false);
                }}
              />
            ) : null}
          </div>
          <div
            className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
            role="group"
            aria-label="Camera"
            data-testid={`${p}-camera`}
            data-picked={cameraPicked ? 'true' : 'false'}
          >
            <p className="type-caption text-[var(--text-muted)]">
              Camera — the picture is taken from here
            </p>
            <label className="flex flex-wrap items-center gap-2">
              <span className="type-caption w-16 shrink-0 text-[var(--text-muted)]">Height</span>
              <input
                type="range"
                min={0}
                max={CAMERA_HEIGHTS.length - 1}
                step={1}
                value={CAMERA_HEIGHTS.indexOf(cameraChoice.height)}
                aria-label="Camera height"
                aria-valuetext={CAMERA_HEIGHT_LABELS[cameraChoice.height]}
                className="min-w-0 flex-1 accent-[var(--accent)]"
                data-testid={`${p}-camera-height`}
                data-value={cameraChoice.height}
                onChange={event => {
                  const height = CAMERA_HEIGHTS[Number(event.target.value)];
                  if (height) setCamera({ height });
                }}
              />
              <span
                className="w-20 text-sm text-[var(--text-secondary)]"
                data-testid={`${p}-camera-height-label`}
              >
                {CAMERA_HEIGHT_LABELS[cameraChoice.height]}
              </span>
            </label>
            {(
              [
                ['direction', 'Direction', CAMERA_DIRECTIONS, CAMERA_DIRECTION_LABELS],
                ['shot', 'Shot', CAMERA_SHOTS, CAMERA_SHOT_LABELS],
                ['lens', 'Lens', CAMERA_LENSES, CAMERA_LENS_LABELS],
              ] as const
            ).map(([field, label, values, labels]) => (
              <div key={field} className="flex flex-wrap items-center gap-2">
                <span className="type-caption w-16 shrink-0 text-[var(--text-muted)]">{label}</span>
                <div
                  className="ui-segmented flex-wrap"
                  role="radiogroup"
                  aria-label={`Camera ${field}`}
                  data-testid={`${p}-camera-${field}`}
                >
                  {values.map(value => {
                    const active = cameraChoice[field] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        className="ui-segmented-item"
                        aria-checked={active}
                        data-active={active ? 'true' : 'false'}
                        data-testid={`${p}-camera-${field}-${value}`}
                        disabled={
                          field === 'direction' && cameraChoice.height === 'overhead' && !active
                        }
                        onClick={() => setCamera({ [field]: value })}
                      >
                        {(labels as Record<string, string>)[value]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="type-caption text-[var(--text-muted)]" data-testid={`${p}-camera-words`}>
              {cameraWords}
              {cameraPicked ? '' : ' (read from where you turned the view)'}
            </p>
          </div>
          {selectedPart ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
              data-testid={`${p}-part`}
            >
              <span className="text-sm text-[var(--text-secondary)]">
                Turning <strong className="text-[var(--text-primary)]">{selectedPart}</strong>
              </span>
              <Button
                size="sm"
                variant="secondary"
                data-testid={`${p}-part-done`}
                onClick={() => sceneRef.current?.select(focus, null)}
              >
                Done
              </Button>
            </div>
          ) : null}
          {/* The one thing a flat picture cannot say: whether a limb comes toward the camera
              or goes away from it. */}
          <div
            className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
            data-testid={`${p}-flip`}
          >
            <p className="type-caption text-[var(--text-muted)]">
              Toward or away from the camera — flip a limb (the picture stays the same):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['R', 'arm', 'Right arm'],
                  ['L', 'arm', 'Left arm'],
                  ['R', 'leg', 'Right leg'],
                  ['L', 'leg', 'Left leg'],
                ] as const
              ).map(([side, limb, label]) => (
                <Button
                  key={`${limb}-${side}`}
                  size="sm"
                  variant="ghost"
                  className="whitespace-nowrap"
                  title={`Their ${label.toLowerCase()}: swing it to the other side of the picture plane`}
                  data-testid={`${p}-flip-${limb}-${side}`}
                  onClick={() => flip(side, limb)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {flipNote ? (
              <p className="type-caption text-[var(--text-muted)]" role="status">
                {flipNote}
              </p>
            ) : null}
          </div>
          {describeLine ? (
            <div
              className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
              data-testid={`${p}-words`}
            >
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="type-caption block text-[var(--text-muted)]">
                  {leadsPrompt ? 'The prompt will open with' : 'This pose reads as'}
                </span>
                {describeLine}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={undoable === 0}
              title="Undo (Ctrl+Z)"
              data-testid={`${p}-undo`}
              onClick={undo}
            >
              Undo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={redoable === 0}
              title="Redo (Ctrl+Shift+Z)"
              data-testid={`${p}-redo`}
              onClick={redo}
            >
              Redo
            </Button>
            <Button size="sm" variant="ghost" data-testid={`${p}-mirror`} onClick={mirror}>
              Mirror
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`${p}-reset`}
              title="Back to the pose and camera the editor opened with (undo-able)"
              onClick={reset}
            >
              Reset
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-label="Body"
            data-testid={`${p}-body`}
          >
            <span className="type-caption text-[var(--text-muted)]">
              {figureCount > 1 ? `${figureName(focus)}'s body` : 'Body'}
            </span>
            <div className="ui-segmented">
              {(
                [
                  ['female', 'Woman'],
                  ['male', 'Man'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  className="ui-segmented-item"
                  aria-checked={rig.figures[focus]?.body === kind}
                  data-active={rig.figures[focus]?.body === kind ? 'true' : 'false'}
                  data-testid={`${p}-body-${kind}`}
                  onClick={() => setBody(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className="flex flex-wrap items-center gap-x-4 text-sm text-[var(--text-secondary)]"
            data-testid={`${p}-guides`}
          >
            {backdrop ? (
              <label
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5"
                title={backdropLabel}
              >
                <input
                  type="checkbox"
                  checked={showBackdrop}
                  data-testid={`${p}-show-backdrop`}
                  onChange={event => {
                    setShowBackdrop(event.target.checked);
                    rememberShown(SHOW_BACKDROP_KEY, event.target.checked);
                  }}
                />
                Show {possessive} picture
              </label>
            ) : null}
            {backdrop && showBackdrop ? (
              <label className="inline-flex min-h-8 items-center gap-1.5">
                <span className="type-caption text-[var(--text-muted)]">Strength</span>
                <input
                  type="range"
                  min={Math.round(BACKDROP_OPACITY.min * 100)}
                  max={Math.round(BACKDROP_OPACITY.max * 100)}
                  step={Math.round(BACKDROP_OPACITY.step * 100)}
                  value={Math.round(backdropOpacity * 100)}
                  aria-label="How strongly the picture shows through"
                  aria-valuetext={`${Math.round(backdropOpacity * 100)}%`}
                  className="w-24 accent-[var(--accent)]"
                  data-testid={`${p}-backdrop-opacity`}
                  onChange={event => {
                    const next = Number(event.target.value) / 100;
                    setBackdropOpacity(next);
                    rememberBackdropOpacity(next);
                  }}
                />
              </label>
            ) : null}
          </div>
          {allowTwo ? (
            <div
              className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
              data-testid={`${p}-figures`}
            >
              {figureCount > 1 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="ui-segmented"
                    role="radiogroup"
                    aria-label="Person you are posing"
                  >
                    {rig.figures.map((_, person) => (
                      <button
                        key={person}
                        type="button"
                        role="radio"
                        className="ui-segmented-item"
                        aria-checked={focus === person}
                        data-active={focus === person ? 'true' : 'false'}
                        data-testid={`${p}-figure-tab-${person}`}
                        onClick={() => sceneRef.current?.select(person)}
                      >
                        <span
                          aria-hidden
                          className="mr-1 inline-block h-2 w-2 rounded-full"
                          style={{
                            background: POSE_FIGURE_COLORS[person % POSE_FIGURE_COLORS.length],
                          }}
                        />
                        {figureName(person)}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="whitespace-nowrap"
                    title="Swap where the lead and the partner stand — both keep their pose"
                    data-testid={`${p}-swap-sides`}
                    onClick={swapSides}
                  >
                    Swap sides
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="whitespace-nowrap"
                    data-testid={`${p}-remove-person`}
                    onClick={removePartner}
                  >
                    Remove partner
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="type-caption text-[var(--text-muted)]">Partner</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="whitespace-nowrap"
                    title="A standing partner beside the lead"
                    data-testid={`${p}-add-person`}
                    onClick={() => addPartnerFigure()}
                  >
                    Add partner
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="whitespace-nowrap"
                    title="A mirrored copy of the lead, facing them"
                    data-testid={`${p}-add-mirrored`}
                    onClick={() => addPartnerFigure('mirror')}
                  >
                    Mirrored partner
                  </Button>
                  {duoSeed && duoSeed.length === 2 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="whitespace-nowrap"
                      title="Both figures as this beat's two-person layout draws them"
                      data-testid={`${p}-add-duo-layout`}
                      onClick={useDuoLayout}
                    >
                      Use the duo layout
                    </Button>
                  ) : null}
                </div>
              )}
              <p className="type-caption text-[var(--text-muted)]">
                {figureCount > 1
                  ? soloStill
                    ? 'This still has no partner: only the lead is drawn. The partner stays with the pose for duo stills and My poses.'
                    : 'The prompt puts the lead where the lead figure stands. Click a figure to pose it.'
                  : 'Add a partner for a two-person still. A solo still uses the lead only.'}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-3 shrink-0 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {confirmClose ? (
            <div className="space-y-2" data-testid={`${p}-discard-confirm`}>
              <p className="text-sm text-[var(--text-primary)]">
                {savedNote?.startsWith('Saved to My poses')
                  ? 'This pose is in My poses. Close without using it here?'
                  : 'Close without using this pose?'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`${p}-keep-editing`}
                  onClick={() => setConfirmClose(false)}
                >
                  Keep editing
                </Button>
                <Button size="sm" variant="danger" data-testid={`${p}-discard`} onClick={onCancel}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <>
              {saveName != null ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={event => {
                    event.preventDefault();
                    try {
                      const saved = saveMyPose(output(), saveName.trim() || 'My pose');
                      setSavedNote(`Saved to My poses as “${saved.name}”.`);
                      setSaveName(null);
                    } catch (err) {
                      setSavedNote(
                        err instanceof Error ? err.message : 'Could not save that pose.'
                      );
                    }
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Pose name"
                    className="ui-input h-8 w-full py-0 text-sm sm:w-48"
                    placeholder="Name this pose"
                    value={saveName}
                    maxLength={60}
                    autoComplete="off"
                    data-testid={`${p}-save-name`}
                    onChange={event => setSaveName(event.target.value)}
                  />
                  <Button size="sm" variant="secondary" type="submit">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setSaveName(null)}>
                    Cancel
                  </Button>
                </form>
              ) : null}
              {savedNote ? (
                <p className="type-caption text-[var(--text-muted)]" role="status">
                  {savedNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="whitespace-nowrap"
                  data-testid={`${p}-editor-save`}
                  onClick={() => onSave(output())}
                >
                  Use this pose
                </Button>
                {saveName == null ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="whitespace-nowrap"
                    data-testid={`${p}-save-to-my-poses`}
                    onClick={() => {
                      setSaveName('');
                      setSavedNote(null);
                      setConfirmClose(false);
                    }}
                  >
                    Save to My poses
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => requestClose('backdrop')}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
