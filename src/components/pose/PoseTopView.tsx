'use client';

import { POSE_PART_COLORS } from '@/components/pose/PoseBodiesSvg';
import type { NormalizedBody } from '@/lib/pose/library';
import { bodyFacing, type BodyDepth } from '@/lib/pose/joint-edit';
import { memo } from 'react';
import { hipCentre } from '@/components/pose/pose-joint-editor-model';

/**
 * The figure from straight above, the camera at the bottom: shoulders, hips, head, hands and
 * feet, with an arrow out of the chest. Shows at a glance which way it faces and what is nearer.
 */
export const PoseTopView = memo(function PoseTopView({
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
});
