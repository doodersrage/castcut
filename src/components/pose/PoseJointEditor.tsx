'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
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

/** What a drag on the canvas is doing. */
type Drag =
  | { kind: 'joint'; person: number; joint: number }
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
 * Pose a guide skeleton by hand in a large window: drag joints, drag the background to turn /
 * tilt a figure in 3D, drag the handle above its head to spin it (arrow keys nudge a focused
 * joint). Saving gives the slot / beat its own skeleton, drawn exactly — the same path as a
 * photo pose.
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
}) {
  const titleId = useId();
  const [bodies, setBodies] = useState<NormalizedBody[]>(() =>
    initial.map(body => body.map(p => (p ? { ...p } : null)))
  );
  // Pointer moves arrive faster than renders — edits read the latest figure from here.
  const latest = useRef(bodies);
  const update = (change: (previous: NormalizedBody[]) => NormalizedBody[]) => {
    const next = change(latest.current);
    latest.current = next;
    setBodies(next);
  };
  // Undo: a snapshot before every drag and button press.
  const history = useRef<Array<{ bodies: NormalizedBody[]; depths: Array<BodyDepth | null> }>>([]);
  const [undoable, setUndoable] = useState(0);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);
  const drag = useRef<Drag | null>(null);
  const [activeJoint, setActiveJoint] = useState<{ person: number; joint: number } | null>(null);
  // On: a dragged joint swings on its bone and carries the limb, so the figure never stretches.
  // Off: joints move freely (to shorten a limb that points at the camera).
  const [keepProportions, setKeepProportions] = useState(true);
  const [rotatePerson, setRotatePerson] = useState(0);
  // Depth per figure, guessed on the first rotation and kept so repeated turns stay consistent.
  const depths = useRef<Array<BodyDepth | null>>([]);
  // The same depths as state, for drawing (nearer limbs bigger, the facing readout, the top view).
  const [shownDepths, setShownDepths] = useState<Array<BodyDepth | null>>([]);
  const setDepths = (next: Array<BodyDepth | null>) => {
    depths.current = next;
    setShownDepths(next);
  };
  const [saveName, setSaveName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const checkpoint = () => {
    history.current.push({ bodies: latest.current, depths: [...depths.current] });
    if (history.current.length > 100) history.current.shift();
    setUndoable(history.current.length);
  };
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    depths.current = previous.depths;
    setShownDepths(previous.depths);
    latest.current = previous.bodies;
    setBodies(previous.bodies);
    setUndoable(history.current.length);
  }, []);
  // Start from a base figure — keeps the second person when there is one.
  const startFrom = (id: PoseStarterId) => {
    const lead = poseStarterBody(id);
    checkpoint();
    setDepths([]);
    update(previous => (previous.length > 1 ? addPerson([lead]) : [lead]));
    setSavedNote(null);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') return;
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, undo]);

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
    drag.current = next;
    setDragging(next.kind);
    setRotatePerson(next.person);
    setActiveJoint(next.kind === 'joint' ? { person: next.person, joint: next.joint } : null);
  };

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    const to = current ? toNormalized(event) : null;
    if (!current || !to) return;
    if (current.kind === 'joint') {
      update(previous => move(previous, current.person, current.joint, to));
    } else if (current.kind === 'body') {
      update(previous =>
        moveWholeBody(previous, current.person, to.x - current.x, to.y - current.y)
      );
      drag.current = { ...current, x: to.x, y: to.y };
    } else if (current.kind === 'orbit') {
      // Dragging across the whole canvas is half a turn.
      rotate(
        { turn: (to.x - current.x) * Math.PI, tilt: (to.y - current.y) * Math.PI },
        current.person
      );
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

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--bg-base)]/70 p-3 backdrop-blur-sm"
        role="presentation"
        onClick={onCancel}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={`${testIdPrefix}-editor`}
          className="flex max-h-full w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:flex-row md:gap-5 md:p-5"
          onClick={event => event.stopPropagation()}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${safeAspect} 1`}
            style={{
              aspectRatio: String(safeAspect),
              width: `min(100%, calc(min(72vh, 680px) * ${safeAspect}))`,
            }}
            className={`shrink-0 touch-none self-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] ${
              dragging === 'orbit' ? 'cursor-grabbing' : 'cursor-move'
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
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
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
                      fill="transparent"
                      className={dragging === 'body' ? 'cursor-grabbing' : 'cursor-grab'}
                      data-testid={`${testIdPrefix}-torso-${person}`}
                      onPointerDown={event => {
                        const from = toNormalized(event);
                        if (from) startDrag(event, { kind: 'body', person, x: from.x, y: from.y });
                      }}
                    >
                      <title>Drag the body to move the whole figure</title>
                    </polygon>
                  ) : null}
                  {EDITABLE.map(joint => {
                    const p = at(joint);
                    if (!p) return null;
                    const active = activeJoint?.person === person && activeJoint.joint === joint;
                    const part = posePartOfJoint(joint);
                    // Targets overlap (a hand resting on a thigh): take the joint nearest the
                    // pointer, not whichever circle happens to be drawn on top.
                    const grab = (event: PointerEvent<Element>) => {
                      const from = toNormalized(event);
                      let nearest = joint;
                      if (from) {
                        let best = Infinity;
                        for (const candidate of EDITABLE) {
                          const q = body[candidate];
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
                          stroke="var(--bg-base)"
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
                          <title>{JOINT_NAMES[joint]}</title>
                        </circle>
                      </g>
                    );
                  })}
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
                <circle
                  cx={handle.x}
                  cy={handle.y}
                  r={0.02}
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
          <div className="min-w-0 flex-1 space-y-3">
            <h2 id={titleId} className="type-heading">
              Edit pose
            </h2>
            <ul className="type-caption list-disc space-y-0.5 pl-4 text-[var(--text-muted)]">
              <li>
                Drag a hand or foot — the elbow or knee bends to follow. Pull further and the body
                leans toward it, feet planted.
              </li>
              <li>Drag an elbow, knee, shoulder, hip or the head to swing just that part.</li>
              <li>
                Drag the neck to bend at the waist (the legs stay); Bend forward / back folds the
                body toward or away from where it faces.
              </li>
              <li>Drag the body to move the whole figure.</li>
              <li>Drag the empty background to turn (sideways) or tilt (up / down) it.</li>
              <li>Drag the ↻ handle above the head to spin it.</li>
              <li>Made a mistake? Undo, or Ctrl+Z.</li>
            </ul>
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
              <span>(their right and left, not yours)</span>
            </p>
            {bodies[0] ? (
              <p
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2 text-sm text-[var(--text-secondary)]"
                data-testid={`${testIdPrefix}-words`}
              >
                <span className="type-caption block text-[var(--text-muted)]">
                  {leadsPrompt ? 'The prompt will open with' : 'This pose reads as'}
                </span>
                {describePoseBody(bodies[0], { possessive, aspect: safeAspect })}
              </p>
            ) : null}
            {focusBody ? (
              <div
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                data-testid={`${testIdPrefix}-facing`}
              >
                <PoseTopView
                  body={focusBody}
                  depth={focusDepth}
                  aspect={safeAspect}
                  color={focusColor}
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="type-caption text-[var(--text-muted)]">Seen from above</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]" role="status">
                    {facing?.label ?? 'Facing you'}
                  </p>
                  <p className="type-caption text-[var(--text-muted)]">
                    Nearer limbs are drawn thicker; limbs behind the body are thin and pale.
                  </p>
                </div>
              </div>
            ) : null}
            <label className="type-caption flex items-center gap-1.5 text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={keepProportions}
                data-testid={`${testIdPrefix}-keep-proportions`}
                onChange={event => setKeepProportions(event.target.checked)}
              />
              Keep proportions (limbs never stretch)
            </label>
            <div
              className="flex flex-wrap items-center gap-1.5"
              data-testid={`${testIdPrefix}-editor-tools`}
            >
              <span className="type-caption text-[var(--text-muted)]">Start from</span>
              {POSE_STARTERS.map(starter => (
                <Button
                  key={starter.id}
                  size="sm"
                  variant="ghost"
                  data-testid={`${testIdPrefix}-starter-${starter.id}`}
                  onClick={() => startFrom(starter.id)}
                >
                  {starter.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={undoable === 0}
                data-testid={`${testIdPrefix}-undo`}
                onClick={undo}
              >
                Undo
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
              {allowTwo ? (
                bodies.length < 2 ? (
                  <Button
                    size="sm"
                    variant="ghost"
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
                    variant="ghost"
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
                )
              ) : null}
            </div>
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
              <summary className="cursor-pointer">Rotate in exact 15° steps</summary>
              <div
                className="mt-1.5 flex flex-wrap items-center gap-1.5"
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
            </details>
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
                    setSavedNote(err instanceof Error ? err.message : 'Could not save that pose.');
                  }
                }}
              >
                <input
                  autoFocus
                  aria-label="Pose name"
                  className="ui-input h-8 w-48 text-sm"
                  placeholder="Name this pose"
                  value={saveName}
                  maxLength={60}
                  data-testid={`${testIdPrefix}-save-name`}
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
                data-testid={`${testIdPrefix}-editor-save`}
                onClick={() => onSave({ aspect: safeAspect, people: bodies, source: 'edited' })}
              >
                Use this pose
              </Button>
              {saveName == null ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`${testIdPrefix}-save-to-my-poses`}
                  onClick={() => {
                    setSaveName('');
                    setSavedNote(null);
                  }}
                >
                  Save to My poses
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
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
