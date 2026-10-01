'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { POSE_FIGURE_COLORS } from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
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

/** COCO-18 bones drawn while editing (face points follow the nose). */
const BONES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [2, 3],
  [3, 4],
  [1, 5],
  [5, 6],
  [6, 7],
  [1, 8],
  [8, 9],
  [9, 10],
  [1, 11],
  [11, 12],
  [12, 13],
  [1, 0],
];

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

/**
 * Drag the guide's joints to fix a pose by hand (arrow keys nudge a focused joint). Saving
 * gives the slot / beat its own skeleton, drawn exactly — the same path as a photo pose.
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
  const [bodies, setBodies] = useState<NormalizedBody[]>(() =>
    initial.map(body => body.map(p => (p ? { ...p } : null)))
  );
  const [drag, setDrag] = useState<{ person: number; joint: number } | null>(null);
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
    setBodies(previous => (previous.length > 1 ? addPerson([lead]) : [lead]));
    setSavedNote(null);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;
  const height = 260;
  const width = Math.round(height * safeAspect);

  const toNormalized = (event: PointerEvent<SVGSVGElement>) => {
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

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const to = toNormalized(event);
    if (to) setBodies(previous => move(previous, drag.person, drag.joint, to));
  };

  const STEP = Math.PI / 12;
  const rotate = (rotation: BodyRotation) => {
    const person = Math.min(rotatePerson, bodies.length - 1);
    const body = bodies[person];
    if (!body) return;
    const depth =
      depths.current[person] ?? liftBodyDepth(body, poseStarterBody('stand'), safeAspect);
    const turned = rotateBody(body, depth, rotation, safeAspect);
    depths.current[person] = turned.depth;
    setBodies(previous => previous.map((b, i) => (i === person ? turned.body : b)));
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
    setBodies(previous => move(previous, person, joint, { x: at.x + delta.x, y: at.y + delta.y }));
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-editor`}>
      <p className="type-caption text-[var(--text-muted)]">
        Drag a joint (or focus it and use the arrow keys, Shift for bigger steps); drag the neck to
        move the whole figure. The pink figure is your Cast.
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${safeAspect} 1`}
        width={width}
        height={height}
        className="touch-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]"
        role="group"
        aria-label="Pose joints"
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {bodies.map((body, person) => {
          const color = POSE_FIGURE_COLORS[person % POSE_FIGURE_COLORS.length]!;
          const at = (i: number) => {
            const p = body[i];
            return p ? { x: p.x * safeAspect, y: p.y } : null;
          };
          return (
            <g key={person}>
              <g stroke={color} strokeWidth={0.014} strokeLinecap="round" opacity={0.8}>
                {BONES.map(([a, b]) => {
                  const p = at(a);
                  const q = at(b);
                  return p && q ? (
                    <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                  ) : null;
                })}
              </g>
              {EDITABLE.map(joint => {
                const p = at(joint);
                if (!p) return null;
                const active = drag?.person === person && drag.joint === joint;
                return (
                  <circle
                    key={joint}
                    cx={p.x}
                    cy={p.y}
                    r={active ? 0.03 : 0.022}
                    fill={color}
                    stroke="var(--bg-base)"
                    strokeWidth={0.006}
                    tabIndex={0}
                    role="slider"
                    aria-label={`${person === 0 ? 'Cast' : `Person ${person + 1}`} ${JOINT_NAMES[joint]}`}
                    aria-valuetext={`${Math.round((body[joint]?.x ?? 0) * 100)}% across, ${Math.round((body[joint]?.y ?? 0) * 100)}% down`}
                    className="cursor-grab focus:outline-none focus-visible:stroke-[var(--accent)]"
                    data-testid={`${testIdPrefix}-joint-${person}-${joint}`}
                    onPointerDown={event => {
                      event.preventDefault();
                      svgRef.current?.setPointerCapture?.(event.pointerId);
                      setDrag({ person, joint });
                      setRotatePerson(person);
                    }}
                    onKeyDown={onKey(person, joint)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
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
        <Button
          size="sm"
          variant="ghost"
          data-testid={`${testIdPrefix}-mirror`}
          onClick={() => {
            depths.current = [];
            setBodies(previous => mirrorBodies(previous));
          }}
        >
          Mirror
        </Button>
        {allowTwo ? (
          bodies.length < 2 ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid={`${testIdPrefix}-add-person`}
              onClick={() => {
                depths.current = [];
                setBodies(previous => addPerson(previous));
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
                setBodies(previous => removePerson(previous));
              }}
            >
              Remove second person
            </Button>
          )
        ) : null}
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5"
        data-testid={`${testIdPrefix}-editor-rotate`}
      >
        <span className="type-caption text-[var(--text-muted)]">
          Rotate{bodies.length > 1 ? (rotatePerson === 0 ? ' Cast' : ' person 2') : ''}
        </span>
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
        <label className="type-caption ml-1 flex items-center gap-1.5 text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={keepProportions}
            data-testid={`${testIdPrefix}-keep-proportions`}
            onChange={event => setKeepProportions(event.target.checked)}
          />
          Keep proportions
        </label>
      </div>
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
  );
}
