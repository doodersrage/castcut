'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { POSE_FIGURE_COLORS } from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
import type { PhotoPose } from '@/lib/day-pose-guide';
import type { NormalizedBody } from '@/lib/pose-library';
import { moveJoint } from '@/lib/pose-joint-edit';

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
}: {
  bodies: NormalizedBody[];
  aspect: number;
  testIdPrefix: string;
  onSave: (pose: PhotoPose) => void;
  onCancel: () => void;
}) {
  const [bodies, setBodies] = useState<NormalizedBody[]>(() =>
    initial.map(body => body.map(p => (p ? { ...p } : null)))
  );
  const [drag, setDrag] = useState<{ person: number; joint: number } | null>(null);
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

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const to = toNormalized(event);
    if (to) setBodies(previous => moveJoint(previous, drag.person, drag.joint, to));
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
    setBodies(previous =>
      moveJoint(previous, person, joint, { x: at.x + delta.x, y: at.y + delta.y })
    );
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-editor`}>
      <p className="type-caption text-[var(--text-muted)]">
        Drag a joint (or focus it and use the arrow keys, Shift for bigger steps). The pink figure
        is your Cast.
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
                    }}
                    onKeyDown={onKey(person, joint)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          data-testid={`${testIdPrefix}-editor-save`}
          onClick={() => onSave({ aspect: safeAspect, people: bodies, source: 'edited' })}
        >
          Use this pose
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
