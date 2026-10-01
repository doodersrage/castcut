'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { POSE_FIGURE_COLORS, PoseFigureShape } from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import type { PhotoPose } from '@/lib/day-pose-guide';
import type { NormalizedBody } from '@/lib/pose-library';
import {
  liftBodyDepth,
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
  poseStarterBody,
  POSE_STARTERS,
  removePerson,
  type PoseStarterId,
} from '@/lib/pose-starters';

/** Draggable joints: nose, neck, arms, legs (eyes / ears ride along with the nose). */
const EDITABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const JOINT_NAMES: Record<number, string> = {
  0: 'head',
  1: 'neck',
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
  /** Background drag: sideways turns the figure, up / down tilts it. */
  | { kind: 'orbit'; person: number; x: number; y: number }
  /** The round handle above the head: spins the figure in the picture. */
  | { kind: 'spin'; person: number; angle: number };

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
}: {
  bodies: NormalizedBody[];
  aspect: number;
  testIdPrefix: string;
  onSave: (pose: PhotoPose) => void;
  onCancel: () => void;
  /** Allow a second figure (Day / Story duos); Outfit try-ons are one person. */
  allowTwo?: boolean;
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
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);
  const drag = useRef<Drag | null>(null);
  const [activeJoint, setActiveJoint] = useState<{ person: number; joint: number } | null>(null);
  // On: a dragged joint swings on its bone and carries the limb, so the figure never stretches.
  // Off: joints move freely (to shorten a limb that points at the camera).
  const [keepProportions, setKeepProportions] = useState(true);
  const [rotatePerson, setRotatePerson] = useState(0);
  // Depth per figure, guessed on the first rotation and kept so repeated turns stay consistent.
  const depths = useRef<Array<BodyDepth | null>>([]);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // Start from a base figure — keeps the second person when there is one.
  const startFrom = (id: PoseStarterId) => {
    const lead = poseStarterBody(id);
    depths.current = [];
    update(previous => (previous.length > 1 ? addPerson([lead]) : [lead]));
    setSavedNote(null);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

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
    const depth =
      depths.current[person] ?? liftBodyDepth(body, poseStarterBody('stand'), safeAspect);
    const turned = rotateBody(body, depth, rotation, safeAspect);
    depths.current[person] = turned.depth;
    update(previous => previous.map((b, i) => (i === person ? turned.body : b)));
  };

  const spinAngle = (person: number, at: { x: number; y: number }) => {
    const centre = hipCentre(latest.current[person] ?? []);
    return centre ? Math.atan2(at.y - centre.y, (at.x - centre.x) * safeAspect) : 0;
  };

  const startDrag = (event: PointerEvent<Element>, next: Drag) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture?.(event.pointerId);
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
              return (
                <g key={person}>
                  <g opacity={0.85} style={{ pointerEvents: 'none' }}>
                    <PoseFigureShape body={body} aspect={safeAspect} color={color} weight={0.009} />
                  </g>
                  {EDITABLE.map(joint => {
                    const p = at(joint);
                    if (!p) return null;
                    const active = activeJoint?.person === person && activeJoint.joint === joint;
                    return (
                      <circle
                        key={joint}
                        cx={p.x}
                        cy={p.y}
                        r={active ? 0.022 : 0.016}
                        fill={color}
                        stroke="var(--bg-base)"
                        strokeWidth={0.004}
                        tabIndex={0}
                        role="slider"
                        aria-label={`${person === 0 ? 'Cast' : `Person ${person + 1}`} ${JOINT_NAMES[joint]}`}
                        aria-valuetext={`${Math.round((body[joint]?.x ?? 0) * 100)}% across, ${Math.round((body[joint]?.y ?? 0) * 100)}% down`}
                        className="cursor-grab focus:outline-none focus-visible:stroke-[var(--accent)]"
                        data-testid={`${testIdPrefix}-joint-${person}-${joint}`}
                        onPointerDown={event => startDrag(event, { kind: 'joint', person, joint })}
                        onKeyDown={onKey(person, joint)}
                      />
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
              <li>Drag a joint to bend it; drag the neck to move the whole figure.</li>
              <li>Drag the empty background to turn (sideways) or tilt (up / down) the figure.</li>
              <li>Drag the ↻ handle above the head to spin it.</li>
              <li>Arrow keys nudge a focused joint (Shift for bigger steps).</li>
              {bodies.length > 1 ? <li>The pink figure is your Cast.</li> : null}
            </ul>
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
                variant="ghost"
                data-testid={`${testIdPrefix}-mirror`}
                onClick={() => {
                  depths.current = [];
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
                  depths.current = [];
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
                      depths.current = [];
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
                      depths.current = [];
                      setRotatePerson(0);
                      update(previous => removePerson(previous));
                    }}
                  >
                    Remove second person
                  </Button>
                )
              ) : null}
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
                    onClick={() => rotate(rotation)}
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
