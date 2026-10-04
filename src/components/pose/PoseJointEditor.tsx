'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  POSE_FIGURE_COLORS,
  POSE_PART_COLORS,
  PoseFigureShape,
  posePartOfJoint,
} from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
import { dayPoseAsPhotoPose, dayPoseWords, soloDayPoseGroups } from '@/lib/day-pose-presets';
import { usePoseReferences } from '@/hooks/usePoseReferences';
import { poseReferenceCreditLine, type PoseReference } from '@/lib/pose-references';
import { poseLayoutLabel } from '@/lib/pose-layout-labels';
import ModalPortal from '@/components/ui/ModalPortal';
import type { PhotoPose } from '@/lib/day-pose-guide';
import type { NormalizedBody } from '@/lib/pose-library';
import {
  bendBody,
  bodyFacing,
  liftBodyDepth,
  moveWholeBody,
  moveJoint,
  moveJointRigid,
  rotateBody,
  type BodyDepth,
  type BodyRotation,
} from '@/lib/pose-joint-edit';
import { saveMyPose } from '@/lib/my-poses';
import {
  ASSUMED_SUBJECT,
  fitBodyToBox,
  imageBoxOnCanvas,
  subjectBoxFromPixels,
  type FitBox,
} from '@/lib/pose-fit';
import {
  ARM_PRESETS,
  HEAD_DIRECTIONS,
  LEG_PRESETS,
  applyArmPreset,
  applyHeadDirection,
  applyLegPreset,
  legsAreStanding,
  matchLimb,
  readHeadDirection,
  type HeadDirection,
  type LimbSide,
} from '@/lib/pose-limb-presets';
import { describePhotoPose } from '@/lib/pose-describe';
import {
  addPartner,
  mirrorBodies,
  poseStarterBody,
  POSE_STARTERS,
  removePerson,
  replaceLead,
  swapSides,
  type PoseStarterId,
} from '@/lib/pose-starters';

/** The figures' names: the Cast is the lead (Image 1), the second figure their partner. */
function figureName(person: number): string {
  return person === 0 ? 'Lead' : 'Partner';
}

/** Draggable joints: nose, neck, arms, legs (eyes / ears ride along with the nose). */
const EDITABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const JOINT_NAMES: Record<number, string> = {
  0: 'head',
  1: 'neck — drag to bend at the waist',
  2: 'right shoulder',
  3: 'right elbow',
  4: 'right wrist',
  5: 'left shoulder',
  6: 'left elbow',
  7: 'left wrist',
  8: 'right hip',
  9: 'right knee',
  10: 'right ankle',
  11: 'left hip',
  12: 'left knee',
  13: 'left ankle',
};

const JOINT_LABELS: Record<number, string> = {
  0: 'Head',
  1: 'Neck',
  2: 'Right shoulder',
  3: 'Right elbow',
  4: 'Right wrist',
  5: 'Left shoulder',
  6: 'Left elbow',
  7: 'Left wrist',
  8: 'Right hip',
  9: 'Right knee',
  10: 'Right ankle',
  11: 'Left hip',
  12: 'Left knee',
  13: 'Left ankle',
};

const LIMB_ENDS = new Set([4, 7, 10, 13]);

/** The bone a joint swings on, used only to separate overlapping handles in side view. */
const JOINT_PARENT: Record<number, number> = {
  0: 1,
  2: 1,
  3: 2,
  4: 3,
  5: 1,
  6: 5,
  7: 6,
  8: 1,
  9: 8,
  10: 9,
  11: 1,
  12: 11,
  13: 12,
};

/**
 * Where a joint's handle is drawn. Side view stacks both arms, and a wrist on a hip, onto one
 * dot, so a click could only move one of them. Once the shoulders have come together, handles
 * in that pile step apart across the bone. Facing the camera, the handles stay on the joints.
 * The skeleton underneath is unchanged.
 */
function handlePosition(
  body: NormalizedBody,
  joint: number,
  aspect: number
): { x: number; y: number } | null {
  const point = body[joint];
  if (!point) return null;
  const right = body[2];
  const left = body[5];
  const shoulders = right && left ? Math.hypot((right.x - left.x) * aspect, right.y - left.y) : 1;
  if (shoulders > 0.025) return { x: point.x, y: point.y };
  const cluster = EDITABLE.filter(other => {
    const there = body[other];
    return there != null && Math.hypot((there.x - point.x) * aspect, there.y - point.y) <= 0.028;
  });
  if (cluster.length < 2) return { x: point.x, y: point.y };
  const index = cluster.indexOf(joint as (typeof EDITABLE)[number]);
  const parent = body[JOINT_PARENT[joint] ?? 1] ?? point;
  const dx = (point.x - parent.x) * aspect;
  const dy = point.y - parent.y;
  const length = Math.hypot(dx, dy) || 1;
  const across = ((index - (cluster.length - 1) / 2) * 0.036) / length;
  return {
    x: point.x + (-dy * across) / aspect,
    y: point.y + dx * across,
  };
}

function jointHint(joint: number): string {
  const name = JOINT_LABELS[joint] ?? 'Joint';
  if (LIMB_ENDS.has(joint)) return `${name} — the limb bends to follow`;
  if (joint === 1) return 'Neck — bends at the waist, legs stay planted';
  if (joint === 0) return 'Head';
  return `${name} — swings on its own`;
}

type PoseHover =
  | { kind: 'idle' }
  | { kind: 'joint'; person: number; joint: number }
  | { kind: 'torso'; person: number }
  | { kind: 'spin' }
  | { kind: 'space' };

function hoverKey(hover: PoseHover): string {
  if (hover.kind === 'joint') return `joint-${hover.person}-${hover.joint}`;
  if (hover.kind === 'torso') return `torso-${hover.person}`;
  return hover.kind;
}

function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses = a.y > y !== b.y > y;
    const xAt = ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x;
    if (crosses && x < xAt) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

type PoseSnapshot = { bodies: NormalizedBody[]; depths: Array<BodyDepth | null> };

/** What a drag on the canvas is doing. */
type Drag =
  | { kind: 'joint'; person: number; joint: number; ox?: number; oy?: number }
  /** Grabbing the torso: moves the whole figure. */
  | { kind: 'body'; person: number; x: number; y: number }
  /** Background drag: sideways turns the figure, up / down tilts it. */
  | { kind: 'orbit'; person: number; x: number; y: number }
  /** The round handle above the head: spins the figure in the picture. */
  | { kind: 'spin'; person: number; angle: number };

/**
 * What is drawn behind the figure is a taste, not part of a pose: remembered across slots and
 * sessions, so the picture does not have to be switched off again for every pose.
 */
const SHOW_BACKDROP_KEY = 'comfy-pose-editor-backdrop-v1';
const SHOW_START_KEY = 'comfy-pose-editor-start-ghost-v1';

/** On unless switched off; private windows and blocked storage read as on. */
function readShown(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function rememberShown(key: string, shown: boolean) {
  try {
    window.localStorage.setItem(key, shown ? '1' : '0');
  } catch {
    // Not remembered: the toggle still works for this session.
  }
}

/**
 * Where the person stands in their picture (fractions of the picture) and its shape. Measured on
 * a small copy: plates on a flat ground give their pixel box; a picture that cannot be read back
 * (another origin taints the canvas), a busy photo, or one that will not load falls back to "the
 * whole height, centred".
 */
function measureBackdrop(url: string): Promise<{ box: FitBox; aspect: number | null }> {
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const aspect =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : null;
      try {
        const longest = Math.max(image.naturalWidth, image.naturalHeight, 1);
        const shrink = Math.min(1, 160 / longest);
        const width = Math.max(1, Math.round(image.naturalWidth * shrink));
        const height = Math.max(1, Math.round(image.naturalHeight * shrink));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('no 2d context');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        resolve({
          box: subjectBoxFromPixels(pixels.data, width, height) ?? ASSUMED_SUBJECT,
          aspect,
        });
      } catch {
        resolve({ box: ASSUMED_SUBJECT, aspect });
      }
    };
    image.onerror = () => resolve({ box: ASSUMED_SUBJECT, aspect: null });
    image.src = url;
  });
}

/** The unforeshortened figure depth is guessed against. */
const STAND = poseStarterBody('stand');

const hipCentre = (body: NormalizedBody) => {
  const hips = [body[8], body[11]].filter(Boolean) as Array<{ x: number; y: number }>;
  if (hips.length === 0) return body[1] ?? null;
  return {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
  };
};

/**
 * Pose a guide skeleton by hand. Start from a standing, sitting, kneeling, lying, or walking
 * figure, then drag joints — the status line names whatever is under the pointer. Empty space
 * turns and tilts; the handle above the head spins. Saving gives the slot / beat its own
 * skeleton, drawn exactly — the same path as a photo pose.
 */
export default function PoseJointEditor({
  bodies: initial,
  aspect,
  testIdPrefix,
  onSave,
  onCancel,
  allowTwo = true,
  possessive = 'her',
  leadsPrompt = false,
  words: initialWords,
  backdropUrl,
  backdropLabel,
  duoSeed,
  soloStill = false,
}: {
  bodies: NormalizedBody[];
  aspect: number;
  testIdPrefix: string;
  onSave: (pose: PhotoPose) => void;
  onCancel: () => void;
  /** Allow a second figure (Day / Story duos); Outfit try-ons are one person. */
  allowTwo?: boolean;
  /** "her" / "his" for the pose-in-words line. */
  possessive?: 'her' | 'his';
  /** The words line opens the prompt (Outfit try-ons); elsewhere it is only how the pose reads. */
  leadsPrompt?: boolean;
  /** The pose's name and cue when it came from Day's pose list and has not been edited since. */
  words?: string;
  /**
   * A picture of the person being posed (their plate), drawn faintly behind the figure so the
   * pose can be set against their real proportions. A guide only: never saved with the pose.
   */
  backdropUrl?: string | null;
  /** What that picture is ("Try-on plate"), for the toggle's tooltip and screen readers. */
  backdropLabel?: string;
  /** The beat's two-person layout (lead first, this canvas), offered to start a duo from. */
  duoSeed?: NormalizedBody[];
  /** The still draws one person: a partner is kept with the pose but not drawn. */
  soloStill?: boolean;
}) {
  const titleId = useId();
  const [bodies, setBodies] = useState<NormalizedBody[]>(() =>
    initial.map(body => body.map(p => (p ? { ...p } : null)))
  );
  // Pointer moves arrive faster than renders — edits read the latest figure from here.
  const latest = useRef(bodies);
  const baselineKey = useRef<string | null>(null);
  if (baselineKey.current == null) baselineKey.current = JSON.stringify(bodies);
  // Depth per figure, guessed on the first rotation and kept so repeated turns stay consistent.
  const depths = useRef<Array<BodyDepth | null>>([]);
  const [dirty, setDirty] = useState(false);
  // The figure as the editor opened, kept to draw behind the one being posed. "Start from" and
  // Reset replace the figure, never this.
  const [opened] = useState(bodies);
  // Joints differ from that figure — the ghost would otherwise sit exactly under the figure.
  const [moved, setMoved] = useState(false);
  const noteDirty = (nextBodies: NormalizedBody[], nextDepths: Array<BodyDepth | null>) => {
    const differs = JSON.stringify(nextBodies) !== baselineKey.current;
    setMoved(differs);
    setDirty(differs || nextDepths.some(depth => depth != null));
  };
  const [showStart, setShowStart] = useState(() => readShown(SHOW_START_KEY));
  const [showBackdrop, setShowBackdrop] = useState(() => readShown(SHOW_BACKDROP_KEY));
  // A picture that will not load (a plate deleted from ComfyUI) takes its toggle with it.
  const [failedBackdrop, setFailedBackdrop] = useState<string | null>(null);
  const backdrop =
    backdropUrl?.trim() && backdropUrl.trim() !== failedBackdrop ? backdropUrl.trim() : null;
  const update = (change: (previous: NormalizedBody[]) => NormalizedBody[]) => {
    const next = change(latest.current);
    latest.current = next;
    setBodies(next);
    noteDirty(next, depths.current);
  };
  // Undo / redo: a snapshot before every drag and button press.
  const history = useRef<PoseSnapshot[]>([]);
  const future = useRef<PoseSnapshot[]>([]);
  const [undoable, setUndoable] = useState(0);
  const [redoable, setRedoable] = useState(0);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);
  const [gesturePerson, setGesturePerson] = useState(0);
  const [orbitAxis, setOrbitAxis] = useState<'turn' | 'tilt'>('turn');
  const [hover, setHover] = useState<PoseHover>({ kind: 'idle' });
  const [confirmClose, setConfirmClose] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [activeJoint, setActiveJoint] = useState<{ person: number; joint: number } | null>(null);
  // On: a dragged joint swings on its bone and carries the limb, so the figure never stretches.
  // Off: joints move freely (to shorten a limb that points at the camera).
  const [keepProportions, setKeepProportions] = useState(true);
  const [rotatePerson, setRotatePerson] = useState(0);
  // The same depths as state, for drawing (nearer limbs bigger, the facing readout, the top view).
  const [shownDepths, setShownDepths] = useState<Array<BodyDepth | null>>([]);
  const setDepths = (next: Array<BodyDepth | null>) => {
    depths.current = next;
    setShownDepths(next);
    noteDirty(latest.current, next);
  };
  const [coarsePointer, setCoarsePointer] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)');
    if (!query) return;
    const read = () => setCoarsePointer(query.matches);
    read();
    query.addEventListener?.('change', read);
    return () => query.removeEventListener?.('change', read);
  }, []);
  const [limbSide, setLimbSide] = useState<LimbSide>('both');
  const [posePickerOpen, setPosePickerOpen] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  // A quick arm / leg position on the figure being posed. Flat (picture-plane) positions, so a
  // turned figure goes back to its drawn depth, as Mirror does.
  const applyLimbs = (change: (body: NormalizedBody) => NormalizedBody) => {
    const person = Math.min(rotatePerson, latest.current.length - 1);
    checkpoint();
    setDepths([]);
    update(previous => previous.map((body, index) => (index === person ? change(body) : body)));
    setSavedNote(null);
  };
  // Turn or tip the head of the figure being posed. Only the face points move, so a figure that
  // has been turned keeps its depth; the face takes the head's.
  const turnHead = (direction: HeadDirection) => {
    const person = Math.min(rotatePerson, latest.current.length - 1);
    const body = latest.current[person];
    // Already there (the lit chip): no step to undo, no "close without using this pose?".
    if (!body || readHeadDirection(body, safeAspect).direction === direction) return;
    checkpoint();
    const turned = applyHeadDirection(body, direction, safeAspect);
    const depth = depths.current[person];
    if (depth) {
      const headDepth = depth[0] ?? depth[1] ?? 0;
      setDepths(
        Object.assign([...depths.current], {
          [person]: turned.map((point, joint) =>
            joint >= 14 ? (point ? headDepth : null) : (depth[joint] ?? null)
          ),
        })
      );
    }
    update(previous => previous.map((b, index) => (index === person ? turned : b)));
    setSavedNote(null);
  };
  // Fit the lead figure (the picture is the lead's) onto the person in the picture: scaled and
  // moved as a whole, so the pose itself is unchanged and stays inside the canvas. One step to
  // undo. The picture is measured once per URL.
  const measured = useRef(new Map<string, Promise<{ box: FitBox; aspect: number | null }>>());
  const [fitting, setFitting] = useState(false);
  const fitToBackdrop = async () => {
    if (!backdrop || fitting) return;
    let measuring = measured.current.get(backdrop);
    if (!measuring) {
      measuring = measureBackdrop(backdrop);
      measured.current.set(backdrop, measuring);
    }
    setFitting(true);
    const { box, aspect: imageAspect } = await measuring;
    setFitting(false);
    const lead = latest.current[0];
    if (!lead) return;
    const fit = fitBodyToBox(
      lead,
      imageBoxOnCanvas(box, imageAspect ?? safeAspect, safeAspect),
      safeAspect
    );
    if (!fit || JSON.stringify(fit.body) === JSON.stringify(lead)) return;
    checkpoint();
    // Depth is in canvas heights: it grows and shrinks with the figure.
    const depth = depths.current[0];
    if (depth) {
      setDepths(
        Object.assign([...depths.current], {
          0: depth.map(z => (z == null ? null : z * fit.scale)),
        })
      );
    }
    update(previous => previous.map((body, index) => (index === 0 ? fit.body : body)));
    // A Day pose fitted is still that pose: keep its words (and after Undo, too).
    const leadKey = JSON.stringify(lead);
    setPreset(previous =>
      previous?.keys.includes(leadKey)
        ? { ...previous, keys: [...previous.keys, JSON.stringify(fit.body)] }
        : previous
    );
    setSavedNote(null);
  };
  const [saveName, setSaveName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const rememberHistory = () => {
    setUndoable(history.current.length);
    setRedoable(future.current.length);
  };
  const checkpoint = () => {
    history.current.push({ bodies: latest.current, depths: [...depths.current] });
    if (history.current.length > 100) history.current.shift();
    future.current = [];
    rememberHistory();
  };
  const restore = useCallback((shot: PoseSnapshot) => {
    depths.current = shot.depths;
    setShownDepths(shot.depths);
    latest.current = shot.bodies;
    setBodies(shot.bodies);
    const differs = JSON.stringify(shot.bodies) !== baselineKey.current;
    setMoved(differs);
    setDirty(differs || shot.depths.some(depth => depth != null));
    setUndoable(history.current.length);
    setRedoable(future.current.length);
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push({ bodies: latest.current, depths: [...depths.current] });
    restore(previous);
  }, [restore]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push({ bodies: latest.current, depths: [...depths.current] });
    restore(next);
  }, [restore]);
  // A Day pose keeps its own name and cue as the prompt words for as long as the lead figure is
  // exactly as picked (or as picked and then fitted to the picture, which only scales and moves
  // it); any drag, bend or turn goes back to reading the joints.
  const [preset, setPreset] = useState<{ words: string; keys: string[] } | null>(() =>
    initialWords?.trim() && initial[0]
      ? { words: initialWords.trim(), keys: [JSON.stringify(initial[0])] }
      : null
  );
  const presetWords =
    preset && bodies[0] && preset.keys.includes(JSON.stringify(bodies[0])) ? preset.words : null;
  const startFromDayPose = (id: string) => {
    const picked = dayPoseAsPhotoPose(id);
    const figure = picked?.people[0];
    if (!picked || !figure) return;
    // Day draws on its own canvas: keep the figure's shape on this one.
    const widen = picked.aspect / safeAspect;
    const lead = figure.map(point =>
      point
        ? { x: Math.min(0.99, Math.max(0.01, 0.5 + (point.x - 0.5) * widen)), y: point.y }
        : null
    );
    checkpoint();
    setDepths([]);
    update(previous => replaceLead(previous, lead));
    setPreset(
      picked.words ? { words: picked.words, keys: [JSON.stringify(latest.current[0])] } : null
    );
    setSavedNote(null);
  };
  // A real-world reference pose (read from a photo). A two-person one brings its partner when
  // the still can draw two; otherwise only the lead is taken.
  const startFromReference = (reference: PoseReference) => {
    const widen = reference.aspect / safeAspect;
    const fitted = reference.people.map(body =>
      body.map(point =>
        point
          ? { x: Math.min(0.99, Math.max(0.01, 0.5 + (point.x - 0.5) * widen)), y: point.y }
          : null
      )
    );
    checkpoint();
    setDepths([]);
    if (fitted.length > 1 && allowTwo && !soloStill) {
      update(() => fitted);
    } else {
      update(previous => replaceLead(previous, fitted[0]!));
    }
    setPreset({ words: dayPoseWords(reference.pose), keys: [JSON.stringify(latest.current[0])] });
    setSavedNote(null);
  };
  // Start from a base figure — keeps the partner when there is one.
  const startFrom = (id: PoseStarterId) => {
    const lead = poseStarterBody(id);
    checkpoint();
    setDepths([]);
    update(previous => replaceLead(previous, lead));
    setSavedNote(null);
  };
  // The partner: added beside the lead, as a mirrored copy of it, or both from the beat's duo
  // layout. The figure being posed switches to the partner.
  const changeFigures = (change: (previous: NormalizedBody[]) => NormalizedBody[], pose = 0) => {
    checkpoint();
    setDepths([]);
    setRotatePerson(pose);
    update(change);
    setSavedNote(null);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;
  const posedBody = bodies[Math.min(rotatePerson, bodies.length - 1)];
  const standing = posedBody ? legsAreStanding(posedBody, safeAspect) : false;
  const head = posedBody
    ? readHeadDirection(posedBody, safeAspect)
    : { direction: null, sideOn: false };

  const requestClose = (source: 'escape' | 'backdrop' = 'backdrop') => {
    if (confirmClose) {
      setConfirmClose(false);
      return;
    }
    if (source === 'escape' && saveName != null) {
      setSaveName(null);
      return;
    }
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onCancel();
  };
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox';
      if (event.key === 'Escape') {
        event.preventDefault();
        requestCloseRef.current('escape');
        return;
      }
      if (typing) return;
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

  const toNormalized = (event: PointerEvent<Element>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const move = (
    previous: NormalizedBody[],
    person: number,
    joint: number,
    to: { x: number; y: number }
  ) =>
    keepProportions
      ? moveJointRigid(previous, person, joint, to, safeAspect)
      : moveJoint(previous, person, joint, to);

  const STEP = Math.PI / 12;
  const rotate = (rotation: BodyRotation, who = rotatePerson) => {
    const person = Math.min(who, latest.current.length - 1);
    const body = latest.current[person];
    if (!body) return;
    const depth = depths.current[person] ?? liftBodyDepth(body, STAND, safeAspect);
    const turned = rotateBody(body, depth, rotation, safeAspect);
    setDepths(Object.assign([...depths.current], { [person]: turned.depth }));
    update(previous => previous.map((b, i) => (i === person ? turned.body : b)));
  };

  const bend = (angle: number) => {
    const person = Math.min(rotatePerson, latest.current.length - 1);
    const body = latest.current[person];
    if (!body) return;
    const depth = depths.current[person] ?? liftBodyDepth(body, STAND, safeAspect);
    const bent = bendBody(body, depth, angle, safeAspect);
    setDepths(Object.assign([...depths.current], { [person]: bent.depth }));
    update(previous => previous.map((b, i) => (i === person ? bent.body : b)));
  };

  const spinAngle = (person: number, at: { x: number; y: number }) => {
    const centre = hipCentre(latest.current[person] ?? []);
    return centre ? Math.atan2(at.y - centre.y, (at.x - centre.x) * safeAspect) : 0;
  };

  const startDrag = (event: PointerEvent<Element>, next: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    checkpoint();
    if (next.kind === 'joint') {
      const from = toNormalized(event);
      const point = latest.current[next.person]?.[next.joint];
      drag.current = {
        ...next,
        ox: from && point ? from.x - point.x : 0,
        oy: from && point ? from.y - point.y : 0,
      };
    } else {
      drag.current = next;
    }
    setDragging(next.kind);
    setGesturePerson(next.person);
    setRotatePerson(next.person);
    setActiveJoint(next.kind === 'joint' ? { person: next.person, joint: next.joint } : null);
  };

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    const to = current ? toNormalized(event) : null;
    if (!current || !to) return;
    if (current.kind === 'joint') {
      update(previous =>
        move(previous, current.person, current.joint, {
          x: to.x - (current.ox ?? 0),
          y: to.y - (current.oy ?? 0),
        })
      );
    } else if (current.kind === 'body') {
      update(previous =>
        moveWholeBody(previous, current.person, to.x - current.x, to.y - current.y)
      );
      drag.current = { ...current, x: to.x, y: to.y };
    } else if (current.kind === 'orbit') {
      const dx = to.x - current.x;
      const dy = to.y - current.y;
      const axis = Math.abs(dx) >= Math.abs(dy) ? 'turn' : 'tilt';
      setOrbitAxis(previous => (previous === axis ? previous : axis));
      // Dragging across the whole canvas is half a turn.
      rotate({ turn: dx * Math.PI, tilt: dy * Math.PI }, current.person);
      drag.current = { ...current, x: to.x, y: to.y };
    } else {
      const angle = spinAngle(current.person, to);
      let delta = angle - current.angle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      rotate({ spin: delta }, current.person);
      drag.current = { ...current, angle: spinAngle(current.person, to) };
    }
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(null);
    setActiveJoint(null);
  };

  const onKey = (person: number, joint: number) => (event: KeyboardEvent<SVGCircleElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : event.key === 'ArrowDown'
              ? { x: 0, y: step }
              : null;
    const at = bodies[person]?.[joint];
    if (!delta || !at) return;
    event.preventDefault();
    checkpoint();
    update(previous => move(previous, person, joint, { x: at.x + delta.x, y: at.y + delta.y }));
  };

  // The spin handle sits past the head, on the line from the hips through the neck.
  const handlePerson = Math.min(rotatePerson, bodies.length - 1);
  const handle = (() => {
    const body = bodies[handlePerson];
    const centre = body ? hipCentre(body) : null;
    const neck = body?.[1];
    if (!body || !centre || !neck) return null;
    const dx = (neck.x - centre.x) * safeAspect;
    const dy = neck.y - centre.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) return null;
    const head = body[0] ?? neck;
    const reach = Math.hypot((head.x - centre.x) * safeAspect, head.y - centre.y) + 0.07;
    return {
      from: { x: head.x * safeAspect, y: head.y },
      x: centre.x * safeAspect + (dx / length) * reach,
      y: centre.y + (dy / length) * reach,
    };
  })();

  const focusBody = bodies[handlePerson] ?? null;
  const focusDepth = focusBody
    ? (shownDepths[handlePerson] ?? liftBodyDepth(focusBody, STAND, safeAspect))
    : [];
  const facing = focusBody ? bodyFacing(focusBody, focusDepth, safeAspect) : null;
  const focusColor = POSE_FIGURE_COLORS[handlePerson % POSE_FIGURE_COLORS.length]!;
  const showTopView = shownDepths[handlePerson] != null;

  const readHover = (at: { x: number; y: number }): PoseHover => {
    let nearest: { person: number; joint: number; distance: number } | null = null;
    bodies.forEach((body, person) => {
      for (const joint of EDITABLE) {
        const point = handlePosition(body, joint, safeAspect);
        if (!point) continue;
        const distance = Math.hypot((point.x - at.x) * safeAspect, point.y - at.y);
        if (distance <= 0.032 && (!nearest || distance < nearest.distance)) {
          nearest = { person, joint, distance };
        }
      }
    });
    // Assigned inside the forEach callback, so TypeScript narrows it to `never` here.
    const found = nearest as { person: number; joint: number } | null;
    if (found) return { kind: 'joint', person: found.person, joint: found.joint };
    if (handle) {
      const px = at.x * safeAspect;
      const py = at.y;
      const along = distanceToSegment(px, py, handle.from.x, handle.from.y, handle.x, handle.y);
      const knob = Math.hypot(px - handle.x, py - handle.y);
      if (along <= 0.028 || knob <= 0.04) return { kind: 'spin' };
    }
    for (let person = 0; person < bodies.length; person += 1) {
      const body = bodies[person];
      if (!body) continue;
      const polygon = [body[2], body[5], body[11], body[8]].filter(
        (point): point is { x: number; y: number } => point != null
      );
      if (polygon.length === 4 && pointInPolygon(at.x, at.y, polygon)) {
        return { kind: 'torso', person };
      }
    }
    return { kind: 'space' };
  };

  const applyHover = (at: { x: number; y: number } | null) => {
    if (!at || drag.current) return;
    const next = readHover(at);
    setHover(previous => (hoverKey(previous) === hoverKey(next) ? previous : next));
  };

  const liveText = (() => {
    const person =
      dragging != null
        ? gesturePerson
        : hover.kind === 'joint' || hover.kind === 'torso'
          ? hover.person
          : null;
    const who = bodies.length > 1 && person != null ? `${figureName(person)} · ` : '';
    if (dragging === 'joint' && activeJoint) return `${who}${jointHint(activeJoint.joint)}`;
    if (dragging === 'body') return `${who}Moving the whole figure`;
    if (dragging === 'orbit') return `${who}${orbitAxis === 'tilt' ? 'Tilting' : 'Turning'}`;
    if (dragging === 'spin') return `${who}Spinning`;
    if (hover.kind === 'joint') return `${who}${jointHint(hover.joint)}`;
    if (hover.kind === 'torso') return `${who}Drag the body to move the whole figure`;
    if (hover.kind === 'spin') return 'Drag to spin the figure';
    if (hover.kind === 'space') return 'Drag empty space to turn or tilt';
    return 'Drag a hand or foot — the elbow or knee bends to follow.';
  })();

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--bg-base)]/70 p-3 backdrop-blur-sm"
        role="presentation"
        onClick={() => requestClose('backdrop')}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid={`${testIdPrefix}-editor`}
          className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] outline-none max-md:h-[calc(100dvh-1.5rem)] md:flex-row md:items-stretch md:gap-6 md:p-5"
          onClick={event => event.stopPropagation()}
        >
          {/* Phone: the figure keeps its height and the controls below scroll — the controls
              used to take their full height and squeeze the figure to 82×122 px. */}
          <div className="flex min-w-0 flex-col items-center justify-center gap-1.5 max-md:shrink-0 md:min-h-0 md:flex-1">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${safeAspect} 1`}
              style={
                {
                  aspectRatio: String(safeAspect),
                  '--pose-aspect': String(safeAspect),
                } as CSSProperties
              }
              className={`h-[min(46dvh,420px)] w-auto max-w-full touch-none self-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] md:h-auto md:max-h-[min(68vh,640px)] md:w-[min(100%,calc(min(68vh,640px)*var(--pose-aspect)))] ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              role="group"
              aria-label="Pose joints"
              data-testid={`${testIdPrefix}-canvas`}
              onPointerDown={event => {
                const at = toNormalized(event);
                if (!at) return;
                // The figure nearest the pointer turns.
                const person = bodies.reduce((best, body, index) => {
                  const centre = hipCentre(body);
                  const bestCentre = hipCentre(bodies[best]!);
                  return centre &&
                    bestCentre &&
                    Math.abs(centre.x - at.x) < Math.abs(bestCentre.x - at.x)
                    ? index
                    : best;
                }, 0);
                startDrag(event, { kind: 'orbit', person, x: at.x, y: at.y });
              }}
              onPointerMove={event => {
                onMove(event);
                applyHover(toNormalized(event));
              }}
              onPointerUp={event => {
                endDrag();
                applyHover(toNormalized(event));
              }}
              onPointerCancel={() => {
                endDrag();
                setHover({ kind: 'idle' });
              }}
              onPointerLeave={() => {
                if (!drag.current) setHover({ kind: 'idle' });
              }}
            >
              {/* Their picture, fitted whole into the canvas. Under everything and deaf to the
                  pointer: a drag over it still turns the figure. */}
              {backdrop && showBackdrop ? (
                <image
                  href={backdrop}
                  x={0}
                  y={0}
                  width={safeAspect}
                  height={1}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={0.3}
                  style={{ pointerEvents: 'none' }}
                  aria-hidden
                  data-testid={`${testIdPrefix}-backdrop`}
                  onError={() => setFailedBackdrop(backdrop)}
                />
              ) : null}
              {/* Where the pose started. Butt caps: the round caps the figure is drawn with
                  close the gaps and the dashes read as a solid line. */}
              {showStart && moved ? (
                <g
                  opacity={0.55}
                  style={{ pointerEvents: 'none' }}
                  className="[&_g]:[stroke-linecap:butt]"
                  aria-hidden
                  data-testid={`${testIdPrefix}-start-ghost`}
                >
                  {opened.map((body, person) => (
                    <PoseFigureShape
                      key={person}
                      body={body}
                      aspect={safeAspect}
                      color="var(--text-muted)"
                      weight={0.006}
                      dashed
                    />
                  ))}
                </g>
              ) : null}
              {bodies.map((body, person) => {
                const color = POSE_FIGURE_COLORS[person % POSE_FIGURE_COLORS.length]!;
                const at = (i: number) => {
                  const p = body[i];
                  return p ? { x: p.x * safeAspect, y: p.y } : null;
                };
                const rs = at(2);
                const ls = at(5);
                const rh = at(8);
                const lh = at(11);
                // The figure being worked on is solid; the other one steps back.
                const focused = bodies.length < 2 || person === handlePerson;
                const depth = shownDepths[person] ?? liftBodyDepth(body, STAND, safeAspect);
                const rightShoulder = body[2];
                const leftShoulder = body[5];
                const shoulderGap =
                  rightShoulder && leftShoulder
                    ? Math.hypot(
                        (rightShoulder.x - leftShoulder.x) * safeAspect,
                        rightShoulder.y - leftShoulder.y
                      )
                    : 1;
                const neckPoint = body[1];
                const hips = hipCentre(body);
                const lyingDown =
                  neckPoint &&
                  hips &&
                  Math.abs((neckPoint.x - hips.x) * safeAspect) > Math.abs(neckPoint.y - hips.y);
                const showSideLetters = shoulderGap > 0.08 && !lyingDown;
                const nameAt = (() => {
                  if (bodies.length < 2) return null;
                  const top = body.reduce<{ x: number; y: number } | null>(
                    (best, p) => (p && (!best || p.y < best.y) ? p : best),
                    null
                  );
                  return top ? { x: top.x * safeAspect, y: Math.max(0.03, top.y - 0.05) } : null;
                })();
                return (
                  <g
                    key={person}
                    opacity={focused ? 1 : 0.5}
                    data-testid={`${testIdPrefix}-figure-${person}`}
                  >
                    {nameAt ? (
                      <text
                        x={nameAt.x}
                        y={nameAt.y}
                        fontSize={0.03}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={color}
                        style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 700 }}
                        aria-hidden
                      >
                        {figureName(person)}
                      </text>
                    ) : null}
                    <g opacity={0.9} style={{ pointerEvents: 'none' }}>
                      <PoseFigureShape
                        body={body}
                        aspect={safeAspect}
                        color={color}
                        weight={0.009}
                        parts
                        depth={depth}
                      />
                    </g>
                    {rs && ls && rh && lh ? (
                      <polygon
                        points={[rs, ls, lh, rh].map(p => `${p.x},${p.y}`).join(' ')}
                        fill={
                          (dragging === 'body' && gesturePerson === person) ||
                          (dragging == null && hover.kind === 'torso' && hover.person === person)
                            ? color
                            : 'transparent'
                        }
                        fillOpacity={0.16}
                        className={dragging === 'body' ? 'cursor-grabbing' : 'cursor-grab'}
                        data-testid={`${testIdPrefix}-torso-${person}`}
                        onPointerDown={event => {
                          const from = toNormalized(event);
                          if (from)
                            startDrag(event, { kind: 'body', person, x: from.x, y: from.y });
                        }}
                      >
                        <title>Drag the body to move the whole figure</title>
                      </polygon>
                    ) : null}
                    {EDITABLE.map(joint => {
                      const placed = handlePosition(body, joint, safeAspect);
                      const p = placed ? { x: placed.x * safeAspect, y: placed.y } : null;
                      if (!p) return null;
                      const active = activeJoint?.person === person && activeJoint.joint === joint;
                      const hovered =
                        dragging == null &&
                        hover.kind === 'joint' &&
                        hover.person === person &&
                        hover.joint === joint;
                      const part = posePartOfJoint(joint);
                      // Targets overlap (a hand resting on a thigh): take the joint nearest the
                      // pointer, not whichever circle happens to be drawn on top.
                      const grab = (event: PointerEvent<Element>) => {
                        const from = toNormalized(event);
                        // A click on this dot takes this joint. Side view stacks an arm on an
                        // arm; nearest-only always gave the same one.
                        if (from && placed) {
                          const onThisDot = Math.hypot(
                            (placed.x - from.x) * safeAspect,
                            placed.y - from.y
                          );
                          if (onThisDot <= 0.02) {
                            startDrag(event, { kind: 'joint', person, joint });
                            return;
                          }
                        }
                        let nearest = joint;
                        if (from) {
                          let best = Infinity;
                          for (const candidate of EDITABLE) {
                            const q = handlePosition(body, candidate, safeAspect);
                            if (!q) continue;
                            const distance = Math.hypot((q.x - from.x) * safeAspect, q.y - from.y);
                            if (distance < best) {
                              best = distance;
                              nearest = candidate;
                            }
                          }
                        }
                        startDrag(event, { kind: 'joint', person, joint: nearest });
                      };
                      return (
                        <g key={joint}>
                          {/* A generous invisible target: a near miss used to turn the figure. */}
                          <circle
                            cx={p.x}
                            cy={p.y}
                            // A finger needs a bigger target than a mouse pointer.
                            r={coarsePointer ? 0.05 : 0.032}
                            fill="transparent"
                            className="cursor-grab"
                            onPointerDown={grab}
                          />
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={
                              (active ? 0.02 : 0.014) *
                              Math.min(1.5, Math.max(0.65, 1 + (depth[joint] ?? 0) * 2.2))
                            }
                            fill={part ? POSE_PART_COLORS[part] : color}
                            stroke={hovered ? 'var(--text-primary)' : 'var(--bg-base)'}
                            strokeWidth={0.004}
                            tabIndex={0}
                            role="slider"
                            aria-label={`${figureName(person)} ${JOINT_NAMES[joint]}`}
                            aria-valuetext={`${Math.round((body[joint]?.x ?? 0) * 100)}% across, ${Math.round((body[joint]?.y ?? 0) * 100)}% down`}
                            className="cursor-grab focus:outline-none focus-visible:stroke-[var(--accent)]"
                            data-testid={`${testIdPrefix}-joint-${person}-${joint}`}
                            onPointerDown={grab}
                            onKeyDown={onKey(person, joint)}
                          >
                            <title>{JOINT_LABELS[joint]}</title>
                          </circle>
                        </g>
                      );
                    })}
                    {focused && showSideLetters
                      ? (
                          [
                            [2, 'R'],
                            [5, 'L'],
                          ] as const
                        ).map(([joint, letter]) => {
                          const p = at(joint);
                          const neck = at(1);
                          if (!p || !neck) return null;
                          const dx = p.x - neck.x;
                          const dy = p.y - neck.y;
                          const length = Math.hypot(dx, dy) || 1;
                          return (
                            <text
                              key={letter}
                              x={p.x + (dx / length) * 0.055}
                              y={p.y + (dy / length) * 0.055}
                              fontSize={0.032}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="var(--text-secondary)"
                              style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 700 }}
                              aria-hidden
                            >
                              {letter}
                            </text>
                          );
                        })
                      : null}
                  </g>
                );
              })}
              {handle ? (
                <g
                  className="cursor-alias"
                  data-testid={`${testIdPrefix}-spin-handle`}
                  onPointerDown={event => {
                    const at = toNormalized(event);
                    if (at) {
                      startDrag(event, {
                        kind: 'spin',
                        person: handlePerson,
                        angle: spinAngle(handlePerson, at),
                      });
                    }
                  }}
                >
                  <title>Drag to spin the figure</title>
                  <line
                    x1={handle.from.x}
                    y1={handle.from.y}
                    x2={handle.x}
                    y2={handle.y}
                    stroke="var(--text-muted)"
                    strokeWidth={0.003}
                    strokeDasharray="0.008 0.008"
                  />
                  <circle cx={handle.x} cy={handle.y} r={0.045} fill="transparent" />
                  <circle
                    cx={handle.x}
                    cy={handle.y}
                    r={0.026}
                    fill="var(--bg-base)"
                    stroke="var(--text-secondary)"
                    strokeWidth={0.004}
                  />
                  <text
                    x={handle.x}
                    y={handle.y}
                    fontSize={0.028}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--text-secondary)"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    ↻
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
          <div className="flex min-h-0 w-full flex-col max-md:flex-1 md:w-[26rem] md:shrink-0">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <h2 id={titleId} className="type-heading">
                Edit pose
              </h2>
              <div className="space-y-1.5" data-testid={`${testIdPrefix}-editor-tools`}>
                <p className="type-caption text-[var(--text-muted)]">Start from</p>
                <div className="flex flex-wrap gap-1.5">
                  {POSE_STARTERS.map(starter => (
                    <Button
                      key={starter.id}
                      size="sm"
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`${testIdPrefix}-starter-${starter.id}`}
                      onClick={() => startFrom(starter.id)}
                    >
                      {starter.label}
                    </Button>
                  ))}
                  {/* Any of Day's named poses, drawn the way Day draws them — picked by picture
                      (a list of names said nothing about what "Lean on a rail" looks like). */}
                  <Button
                    size="sm"
                    variant={posePickerOpen ? 'primary' : 'secondary'}
                    className="whitespace-nowrap"
                    aria-expanded={posePickerOpen}
                    data-testid={`${testIdPrefix}-day-pose`}
                    onClick={() => setPosePickerOpen(open => !open)}
                  >
                    {posePickerOpen ? 'Hide poses' : 'More poses…'}
                  </Button>
                  {/* Day's poses as read from real photos (openly licensed, credited). */}
                  <Button
                    size="sm"
                    variant={referencePickerOpen ? 'primary' : 'secondary'}
                    className="whitespace-nowrap"
                    aria-expanded={referencePickerOpen}
                    data-testid={`${testIdPrefix}-real-poses`}
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
                    testIdPrefix={testIdPrefix}
                    onPick={id => {
                      startFromDayPose(id);
                      setPosePickerOpen(false);
                    }}
                  />
                ) : null}
                {referencePickerOpen ? (
                  <ReferencePosePicker
                    testIdPrefix={testIdPrefix}
                    twoPeople={allowTwo}
                    onPick={reference => {
                      startFromReference(reference);
                      setReferencePickerOpen(false);
                    }}
                  />
                ) : null}
              </div>
              {/* One tap instead of dragging elbow and wrist on each side. */}
              <div
                className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                data-testid={`${testIdPrefix}-limb-presets`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-caption text-[var(--text-muted)]">Quick positions for</span>
                  <div className="ui-segmented" role="radiogroup" aria-label="Which side">
                    {(
                      [
                        ['both', 'Both'],
                        ['right', 'Their right'],
                        ['left', 'Their left'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        className="ui-segmented-item"
                        aria-checked={limbSide === id}
                        data-active={limbSide === id ? 'true' : 'false'}
                        data-testid={`${testIdPrefix}-limb-side-${id}`}
                        onClick={() => setLimbSide(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="type-caption w-9 shrink-0 text-[var(--text-muted)]">Arms</span>
                  {ARM_PRESETS.map(option => (
                    <Button
                      key={option.id}
                      size="sm"
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`${testIdPrefix}-arms-${option.id}`}
                      onClick={() =>
                        applyLimbs(body => applyArmPreset(body, option.id, limbSide, safeAspect))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="type-caption w-9 shrink-0 text-[var(--text-muted)]">Legs</span>
                  {LEG_PRESETS.map(option => (
                    <Button
                      key={option.id}
                      size="sm"
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`${testIdPrefix}-legs-${option.id}`}
                      disabled={!standing}
                      title={
                        standing ? undefined : 'For a figure on its feet — start from Stand or Walk'
                      }
                      onClick={() =>
                        applyLimbs(body => applyLegPreset(body, option.id, limbSide, safeAspect))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                {/* Not a side: the head turns whichever "Quick positions for" is picked. */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Head direction"
                >
                  <span className="type-caption w-9 shrink-0 text-[var(--text-muted)]">Head</span>
                  {HEAD_DIRECTIONS.map(option => {
                    const sideways = option.id === 'left' || option.id === 'right';
                    const unavailable = sideways && head.sideOn;
                    const active = head.direction === option.id;
                    return (
                      <Button
                        key={option.id}
                        size="sm"
                        variant={active ? 'accent-outline' : 'secondary'}
                        className="whitespace-nowrap"
                        aria-pressed={active}
                        aria-label={sideways ? `Their ${option.id}` : undefined}
                        data-testid={`${testIdPrefix}-head-${option.id}`}
                        disabled={unavailable}
                        title={
                          unavailable
                            ? 'For a figure facing you or away — seen from the side, turn the whole figure'
                            : sideways
                              ? `Turn the head to their ${option.id}`
                              : undefined
                        }
                        onClick={() => turnHead(option.id)}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="type-caption text-[var(--text-muted)]">
                    Copy a side you posed by hand:
                  </span>
                  {(
                    [
                      ['arm', 'right', 'R arm → L'],
                      ['arm', 'left', 'L arm → R'],
                      ['leg', 'right', 'R leg → L'],
                      ['leg', 'left', 'L leg → R'],
                    ] as const
                  ).map(([limb, from, label]) => (
                    <Button
                      key={`${limb}-${from}`}
                      size="sm"
                      variant="ghost"
                      className="whitespace-nowrap px-2!"
                      title={`Make their ${from === 'right' ? 'left' : 'right'} ${limb} mirror their ${from} ${limb}`}
                      data-testid={`${testIdPrefix}-match-${limb}-${from}`}
                      onClick={() => applyLimbs(body => matchLimb(body, limb, from))}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <p
                className="text-sm text-[var(--text-secondary)]"
                role="status"
                aria-live="polite"
                data-testid={`${testIdPrefix}-gesture`}
              >
                {liveText}
              </p>
              {/* Everything the figure responds to, in one place — the line above only names
                  what is under the pointer, which a touch screen never shows. */}
              <details
                className="type-caption text-[var(--text-muted)]"
                data-testid={`${testIdPrefix}-how-to`}
              >
                <summary className="flex min-h-8 cursor-pointer items-center text-[var(--text-secondary)]">
                  How to pose
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Drag a hand or foot: the elbow or knee bends to follow.</li>
                  <li>Drag an elbow, knee or shoulder to swing just that part.</li>
                  <li>Drag the neck to bend at the waist; the head to tilt it.</li>
                  <li>Drag the body to move the whole figure.</li>
                  <li>Drag empty space sideways to turn the figure, up or down to tilt it.</li>
                  <li>Drag the ↻ handle above the head to spin it in the picture.</li>
                  <li>
                    Arrow keys nudge the selected joint (Tab moves between joints); Ctrl+Z undoes.
                  </li>
                </ul>
              </details>
              <p className="type-caption flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--text-muted)]">
                {(
                  [
                    ['Right arm', POSE_PART_COLORS.rightArm],
                    ['Left arm', POSE_PART_COLORS.leftArm],
                    ['Right leg', POSE_PART_COLORS.rightLeg],
                    ['Left leg', POSE_PART_COLORS.leftLeg],
                  ] as const
                ).map(([label, swatch]) => (
                  <span key={label} className="flex items-center gap-1">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: swatch }}
                    />
                    {label}
                  </span>
                ))}
                <span>Their left and right.</span>
              </p>
              {bodies[0] ? (
                <div
                  className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                  data-testid={`${testIdPrefix}-words`}
                >
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span className="type-caption block text-[var(--text-muted)]">
                      {leadsPrompt ? 'The prompt will open with' : 'This pose reads as'}
                    </span>
                    {describePhotoPose(
                      {
                        aspect: safeAspect,
                        people: bodies,
                        ...(presetWords ? { words: presetWords } : {}),
                      },
                      { lead: possessive === 'his' ? 'he' : 'she' }
                    )}
                  </p>
                  {focusBody ? (
                    <div
                      className="flex items-center gap-3 border-t border-[var(--border-subtle)] pt-2"
                      data-testid={`${testIdPrefix}-facing`}
                    >
                      {showTopView ? (
                        <PoseTopView
                          body={focusBody}
                          depth={focusDepth}
                          aspect={safeAspect}
                          color={focusColor}
                        />
                      ) : null}
                      <div className="min-w-0">
                        {showTopView ? (
                          <p className="type-caption text-[var(--text-muted)]">Seen from above</p>
                        ) : null}
                        <p className="text-sm font-medium text-[var(--text-primary)]" role="status">
                          {facing?.label ?? 'Facing you'}
                        </p>
                        {showTopView ? (
                          <p className="type-caption text-[var(--text-muted)]">
                            The arrow is the way the chest faces. Nearer limbs are thicker.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={undoable === 0}
                  title="Undo (Ctrl+Z)"
                  data-testid={`${testIdPrefix}-undo`}
                  onClick={undo}
                >
                  Undo
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={redoable === 0}
                  title="Redo (Ctrl+Shift+Z)"
                  data-testid={`${testIdPrefix}-redo`}
                  onClick={redo}
                >
                  Redo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`${testIdPrefix}-mirror`}
                  onClick={() => {
                    checkpoint();
                    setDepths([]);
                    update(previous => mirrorBodies(previous));
                  }}
                >
                  Mirror
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid={`${testIdPrefix}-reset`}
                  onClick={() => {
                    checkpoint();
                    setDepths([]);
                    setRotatePerson(0);
                    update(() => initial.map(body => body.map(p => (p ? { ...p } : null))));
                  }}
                >
                  Reset
                </Button>
              </div>
              {/* What is drawn behind the figure. Guides only: neither is part of the pose. */}
              <div
                className="flex flex-wrap items-center gap-x-4 text-sm text-[var(--text-secondary)]"
                data-testid={`${testIdPrefix}-guides`}
              >
                {backdrop ? (
                  <label
                    className="inline-flex min-h-8 cursor-pointer items-center gap-1.5"
                    title={backdropLabel}
                  >
                    <input
                      type="checkbox"
                      checked={showBackdrop}
                      data-testid={`${testIdPrefix}-show-backdrop`}
                      onChange={event => {
                        setShowBackdrop(event.target.checked);
                        rememberShown(SHOW_BACKDROP_KEY, event.target.checked);
                      }}
                    />
                    Show {possessive} picture
                  </label>
                ) : null}
                {backdrop && showBackdrop ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={fitting}
                    title={`Size and place the ${bodies.length > 1 ? 'first figure' : 'figure'} over the person in the picture — the pose itself stays as it is`}
                    data-testid={`${testIdPrefix}-fit-backdrop`}
                    onClick={() => void fitToBackdrop()}
                  >
                    Fit to {possessive} picture
                  </Button>
                ) : null}
                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={showStart}
                    data-testid={`${testIdPrefix}-show-start`}
                    onChange={event => {
                      setShowStart(event.target.checked);
                      rememberShown(SHOW_START_KEY, event.target.checked);
                    }}
                  />
                  Show where it started
                </label>
              </div>
              {allowTwo ? (
                <div
                  className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                  data-testid={`${testIdPrefix}-figures`}
                >
                  {bodies.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="ui-segmented"
                        role="radiogroup"
                        aria-label="Person you are posing"
                      >
                        {bodies.map((_, person) => (
                          <button
                            key={person}
                            type="button"
                            role="radio"
                            className="ui-segmented-item"
                            aria-checked={handlePerson === person}
                            data-active={handlePerson === person ? 'true' : 'false'}
                            data-testid={`${testIdPrefix}-figure-tab-${person}`}
                            onClick={() => setRotatePerson(person)}
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
                        data-testid={`${testIdPrefix}-swap-sides`}
                        onClick={() => {
                          // Only where they stand changes: each keeps its turn.
                          checkpoint();
                          update(previous => swapSides(previous));
                          setSavedNote(null);
                        }}
                      >
                        Swap sides
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="whitespace-nowrap"
                        data-testid={`${testIdPrefix}-remove-person`}
                        onClick={() => changeFigures(previous => removePerson(previous))}
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
                        data-testid={`${testIdPrefix}-add-person`}
                        onClick={() => changeFigures(previous => addPartner(previous), 1)}
                      >
                        Add partner
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="whitespace-nowrap"
                        title="A mirrored copy of the lead, facing them"
                        data-testid={`${testIdPrefix}-add-mirrored`}
                        onClick={() => changeFigures(previous => addPartner(previous, 'mirror'), 1)}
                      >
                        Mirrored partner
                      </Button>
                      {duoSeed && duoSeed.length === 2 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="whitespace-nowrap"
                          title="Both figures as this beat's two-person layout draws them"
                          data-testid={`${testIdPrefix}-add-duo-layout`}
                          onClick={() =>
                            changeFigures(
                              () => duoSeed.map(body => body.map(p => (p ? { ...p } : null))),
                              1
                            )
                          }
                        >
                          Use the duo layout
                        </Button>
                      ) : null}
                    </div>
                  )}
                  <p className="type-caption text-[var(--text-muted)]">
                    {bodies.length > 1
                      ? soloStill
                        ? 'This still has no partner: only the lead is drawn. The partner stays with the pose for duo stills and My poses.'
                        : 'The prompt puts the lead where the lead figure stands.'
                      : 'Add a partner for a two-person still. A solo still uses the lead only.'}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="type-caption text-[var(--text-muted)]">Waist</span>
                {(
                  [
                    ['Bend forward', STEP, 'bend-forward'],
                    ['Bend back', -STEP, 'bend-back'],
                  ] as const
                ).map(([label, angle, id]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="secondary"
                    data-testid={`${testIdPrefix}-${id}`}
                    onClick={() => {
                      checkpoint();
                      bend(angle);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <details className="type-caption text-[var(--text-muted)]">
                <summary className="cursor-pointer text-[var(--text-secondary)]">
                  Exact turns and limb length
                </summary>
                <div className="mt-2 space-y-2">
                  <label className="flex items-start gap-1.5 text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={keepProportions}
                      data-testid={`${testIdPrefix}-keep-proportions`}
                      onChange={event => setKeepProportions(event.target.checked)}
                    />
                    <span>
                      Keep proportions
                      <span className="mt-0.5 block text-[var(--text-muted)]">
                        Limbs stay a natural length. Turn this off to shorten a limb that points at
                        the camera.
                      </span>
                    </span>
                  </label>
                  <p>Each click turns, tilts, or spins 15°.</p>
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    data-testid={`${testIdPrefix}-editor-rotate`}
                  >
                    {bodies.length > 1 ? <span>{figureName(handlePerson)}:</span> : null}
                    {(
                      [
                        ['Turn left', { turn: -STEP }, 'turn-left'],
                        ['Turn right', { turn: STEP }, 'turn-right'],
                        ['Tilt forward', { tilt: STEP }, 'tilt-forward'],
                        ['Tilt back', { tilt: -STEP }, 'tilt-back'],
                        ['Spin left', { spin: -STEP }, 'spin-left'],
                        ['Spin right', { spin: STEP }, 'spin-right'],
                      ] as const
                    ).map(([label, rotation, id]) => (
                      <Button
                        key={id}
                        size="sm"
                        variant="ghost"
                        data-testid={`${testIdPrefix}-rotate-${id}`}
                        onClick={() => {
                          checkpoint();
                          rotate(rotation);
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </details>
            </div>
            <div className="mt-3 shrink-0 space-y-2 border-t border-[var(--border-subtle)] pt-3">
              {confirmClose ? (
                <div className="space-y-2" data-testid={`${testIdPrefix}-discard-confirm`}>
                  <p className="text-sm text-[var(--text-primary)]">
                    {savedNote?.startsWith('Saved to My poses')
                      ? 'This pose is in My poses. Close without using it here?'
                      : 'Close without using this pose?'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`${testIdPrefix}-keep-editing`}
                      onClick={() => setConfirmClose(false)}
                    >
                      Keep editing
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid={`${testIdPrefix}-discard`}
                      onClick={onCancel}
                    >
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
                          const saved = saveMyPose(
                            { aspect: safeAspect, people: bodies, source: 'edited' },
                            saveName.trim() || 'My pose'
                          );
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
                        data-testid={`${testIdPrefix}-save-name`}
                        onChange={event => setSaveName(event.target.value)}
                      />
                      <Button size="sm" variant="secondary" type="submit">
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => setSaveName(null)}
                      >
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
                      data-testid={`${testIdPrefix}-editor-save`}
                      onClick={() =>
                        onSave({
                          aspect: safeAspect,
                          people: bodies,
                          source: 'edited',
                          ...(presetWords ? { words: presetWords } : {}),
                        })
                      }
                    >
                      Use this pose
                    </Button>
                    {saveName == null ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="whitespace-nowrap"
                        data-testid={`${testIdPrefix}-save-to-my-poses`}
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
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * The figure from straight above, the camera at the bottom: shoulders, hips, head, hands and
 * feet, with an arrow out of the chest. Shows at a glance which way it faces and what is nearer.
 */
function PoseTopView({
  body,
  depth,
  aspect,
  color,
}: {
  body: NormalizedBody;
  depth: BodyDepth;
  aspect: number;
  color: string;
}) {
  const centre = hipCentre(body);
  const facing = bodyFacing(body, depth, aspect);
  if (!centre) return null;
  const centreZ = ((depth[8] ?? 0) + (depth[11] ?? 0)) / 2;
  // x: left–right as on the canvas; y: depth, nearer the camera = lower. Scaled to fill the box.
  const raw = (i: number) => {
    const p = body[i];
    return p ? { x: (p.x - centre.x) * aspect, y: (depth[i] ?? 0) - centreZ } : null;
  };
  const extent = Math.max(
    0.14,
    ...body.map((_, i) => {
      const p = raw(i);
      return p ? Math.max(Math.abs(p.x), Math.abs(p.y)) : 0;
    })
  );
  const scale = 0.27 / extent;
  const at = (i: number) => {
    const p = raw(i);
    return p ? { x: p.x * scale, y: p.y * scale } : null;
  };
  const line = (a: number, b: number, stroke: string, width: number) => {
    const p = at(a);
    const q = at(b);
    return p && q ? (
      <line
        key={`${a}-${b}`}
        x1={p.x}
        y1={p.y}
        x2={q.x}
        y2={q.y}
        stroke={stroke}
        strokeWidth={width}
      />
    ) : null;
  };
  const head = at(0);
  const chest = at(1);
  return (
    <svg
      viewBox="-0.4 -0.4 0.8 0.8"
      width={96}
      height={96}
      role="img"
      aria-label={`Seen from above: ${facing?.label ?? 'facing you'}`}
      className="shrink-0 rounded-[var(--radius-md)] bg-[var(--bg-muted)]"
      strokeLinecap="round"
    >
      {/* The camera: a small wedge at the bottom edge. */}
      <path d="M-0.05 0.39 L0 0.31 L0.05 0.39 Z" fill="var(--text-muted)" />
      {[
        [8, 9, POSE_PART_COLORS.rightLeg],
        [9, 10, POSE_PART_COLORS.rightLeg],
        [11, 12, POSE_PART_COLORS.leftLeg],
        [12, 13, POSE_PART_COLORS.leftLeg],
        [2, 3, POSE_PART_COLORS.rightArm],
        [3, 4, POSE_PART_COLORS.rightArm],
        [5, 6, POSE_PART_COLORS.leftArm],
        [6, 7, POSE_PART_COLORS.leftArm],
      ].map(([a, b, stroke]) => line(a as number, b as number, stroke as string, 0.022))}
      {line(8, 11, color, 0.035)}
      {line(2, 5, color, 0.05)}
      {head ? <circle cx={head.x} cy={head.y} r={0.055} fill={color} /> : null}
      {chest && facing ? (
        <line
          x1={chest.x}
          y1={chest.y}
          x2={chest.x + facing.normal.x * 0.2}
          y2={chest.y + facing.normal.z * 0.2}
          stroke="var(--text-primary)"
          strokeWidth={0.02}
          markerEnd="url(#pose-top-arrow)"
        />
      ) : null}
      <defs>
        <marker
          id="pose-top-arrow"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10 Z" fill="var(--text-primary)" />
        </marker>
      </defs>
    </svg>
  );
}

/**
 * Real-world reference poses (pose-references.ts) as small figures, grouped by Day pose in Day's
 * order. Each tile's tooltip credits the photo it was read from.
 */
function ReferencePosePicker({
  testIdPrefix,
  twoPeople,
  onPick,
}: {
  testIdPrefix: string;
  twoPeople: boolean;
  onPick: (reference: PoseReference) => void;
}) {
  const references = usePoseReferences();
  const groups = useMemo(() => {
    const order = new Map(
      [...soloDayPoseGroups().flatMap(group => group.ids), 'hug', 'dance', 'fight'].map(
        (id, index) => [id, index]
      )
    );
    const byPose = new Map<string, PoseReference[]>();
    for (const reference of references) {
      if (reference.people.length > 1 && !twoPeople) continue;
      byPose.set(reference.pose, [...(byPose.get(reference.pose) ?? []), reference]);
    }
    return [...byPose.entries()].sort(
      ([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b)
    );
  }, [references, twoPeople]);
  return (
    <div
      className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid={`${testIdPrefix}-real-pose-grid`}
    >
      {groups.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Loading real poses…</p>
      ) : null}
      {groups.map(([pose, list]) => (
        <div key={pose} className="space-y-1">
          <p className="type-caption text-[var(--text-muted)]">{poseLayoutLabel(pose)}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {list.map(reference => (
              <button
                key={reference.id}
                type="button"
                title={`${poseLayoutLabel(pose)} — ${poseReferenceCreditLine(reference)}`}
                aria-label={`${poseLayoutLabel(pose)}, real pose ${reference.variant}`}
                data-testid={`${testIdPrefix}-real-pose-${reference.id}`}
                onClick={() => onPick(reference)}
                className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-1 text-center transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                <svg
                  viewBox={`0 0 ${reference.aspect} 1`}
                  aria-hidden
                  className="h-16 w-full rounded bg-white"
                >
                  {reference.people.map((body, index) => (
                    <PoseFigureShape
                      key={index}
                      body={body}
                      aspect={reference.aspect}
                      color={POSE_FIGURE_COLORS[index % POSE_FIGURE_COLORS.length]!}
                      weight={0.02}
                      parts
                    />
                  ))}
                </svg>
                <span className="text-[10px] leading-tight text-[var(--text-secondary)]">
                  {reference.variant}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const dayPoseFigures = new Map<string, { body: NormalizedBody; aspect: number } | null>();
function dayPoseFigure(id: string) {
  if (!dayPoseFigures.has(id)) {
    const pose = dayPoseAsPhotoPose(id);
    const body = pose?.people[0];
    dayPoseFigures.set(id, pose && body ? { body, aspect: pose.aspect } : null);
  }
  return dayPoseFigures.get(id) ?? null;
}

/** Day's named poses as small drawn figures, grouped as in Day's own pose list. */
function DayPosePicker({
  testIdPrefix,
  onPick,
}: {
  testIdPrefix: string;
  onPick: (id: string) => void;
}) {
  return (
    <div
      className="max-h-72 space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid={`${testIdPrefix}-day-pose-grid`}
    >
      {soloDayPoseGroups().map(group => (
        <div key={group.label} className="space-y-1">
          <p className="type-caption text-[var(--text-muted)]">{group.label}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {group.ids.map(id => {
              const figure = dayPoseFigure(id);
              const label = poseLayoutLabel(id);
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  data-testid={`${testIdPrefix}-day-pose-${id}`}
                  onClick={() => onPick(id)}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-1 text-center transition hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {figure ? (
                    <svg
                      viewBox={`0 0 ${figure.aspect} 1`}
                      aria-hidden
                      className="h-16 w-full rounded bg-white"
                    >
                      <PoseFigureShape
                        body={figure.body}
                        aspect={figure.aspect}
                        color={POSE_FIGURE_COLORS[0]!}
                        weight={0.02}
                        parts
                      />
                    </svg>
                  ) : (
                    <span className="h-16 w-full rounded bg-white" />
                  )}
                  <span className="line-clamp-2 min-h-[2lh] text-[10px] leading-tight text-[var(--text-secondary)]">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
