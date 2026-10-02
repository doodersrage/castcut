'use client';

import {
  useCallback,
  useEffect,
  useId,
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
import { SelectInput } from '@/components/ui/Field';
import { dayPoseAsPhotoPose, soloDayPoseGroups } from '@/lib/day-pose-presets';
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
  addPerson,
  mirrorBodies,
  describePoseBody,
  poseStarterBody,
  POSE_STARTERS,
  removePerson,
  type PoseStarterId,
} from '@/lib/pose-starters';

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
  const noteDirty = (nextBodies: NormalizedBody[], nextDepths: Array<BodyDepth | null>) => {
    const changed =
      JSON.stringify(nextBodies) !== baselineKey.current || nextDepths.some(depth => depth != null);
    setDirty(changed);
  };
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
    const changed =
      JSON.stringify(shot.bodies) !== baselineKey.current ||
      shot.depths.some(depth => depth != null);
    setDirty(changed);
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
  // exactly as picked; any drag, bend or turn goes back to reading the joints.
  const [preset, setPreset] = useState<{ words: string; key: string } | null>(() =>
    initialWords?.trim() && initial[0]
      ? { words: initialWords.trim(), key: JSON.stringify(initial[0]) }
      : null
  );
  const presetWords =
    preset && bodies[0] && JSON.stringify(bodies[0]) === preset.key ? preset.words : null;
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
    update(previous => (previous.length > 1 ? addPerson([lead]) : [lead]));
    setPreset(
      picked.words ? { words: picked.words, key: JSON.stringify(latest.current[0]) } : null
    );
    setSavedNote(null);
  };
  // Start from a base figure — keeps the second person when there is one.
  const startFrom = (id: PoseStarterId) => {
    const lead = poseStarterBody(id);
    checkpoint();
    setDepths([]);
    update(previous => (previous.length > 1 ? addPerson([lead]) : [lead]));
    setSavedNote(null);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;

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
    const who =
      bodies.length > 1 && person != null ? `${person === 0 ? 'Cast' : 'Person 2'} · ` : '';
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
                return (
                  <g key={person} opacity={focused ? 1 : 0.5}>
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
                            r={0.032}
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
                            aria-label={`${person === 0 ? 'Cast' : `Person ${person + 1}`} ${JOINT_NAMES[joint]}`}
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
                  {/* Any of Day's named poses, drawn the way Day draws them. */}
                  <SelectInput
                    value=""
                    aria-label="Start from a Day pose"
                    data-testid={`${testIdPrefix}-day-pose`}
                    className="w-auto! min-w-[10rem] py-1 text-sm"
                    onChange={event => startFromDayPose(event.target.value)}
                  >
                    <option value="">A Day pose…</option>
                    {soloDayPoseGroups().map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {group.ids.map(id => (
                          <option key={id} value={id}>
                            {poseLayoutLabel(id)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </SelectInput>
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
                    {presetWords ?? describePoseBody(bodies[0], { possessive, aspect: safeAspect })}
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
              {allowTwo ? (
                <div className="flex flex-wrap items-center gap-2">
                  {bodies.length > 1 ? (
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
                          onClick={() => setRotatePerson(person)}
                        >
                          {person === 0 ? 'Cast' : 'Person 2'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {bodies.length < 2 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`${testIdPrefix}-add-person`}
                      onClick={() => {
                        checkpoint();
                        setDepths([]);
                        update(previous => addPerson(previous));
                      }}
                    >
                      Add a person
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="whitespace-nowrap"
                      data-testid={`${testIdPrefix}-remove-person`}
                      onClick={() => {
                        checkpoint();
                        setDepths([]);
                        setRotatePerson(0);
                        update(previous => removePerson(previous));
                      }}
                    >
                      Remove second person
                    </Button>
                  )}
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
                    {bodies.length > 1 ? (
                      <span>{handlePerson === 0 ? 'Cast' : 'Person 2'}:</span>
                    ) : null}
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
                        className="ui-input h-8 w-full text-sm sm:w-48"
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
