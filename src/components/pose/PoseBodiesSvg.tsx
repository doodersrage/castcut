'use client';

import type { NormalizedBody } from '@/lib/pose-library';

/** COCO-18 bones (neck, arms, legs, head). */
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

/** Lead (Cast) first, then partners. */
export const POSE_FIGURE_COLORS = [
  'var(--pose-lead, #d0006f)',
  'var(--pose-partner, #0091c7)',
  '#e08a00',
] as const;

export type PoseBodyLayer = {
  bodies: NormalizedBody[];
  /** One color for every body in the layer; per-body colors (lead first) by default. */
  color?: string;
  opacity?: number;
  dashed?: boolean;
};

/**
 * Skeletons (0–1 of a canvas with the given width / height aspect) as a small inline SVG.
 * Layers draw in order — e.g. the guide faint underneath and the still on top.
 */
export default function PoseBodiesSvg({
  layers,
  aspect,
  height = 120,
  label,
  testId = 'pose-preview-figure',
}: {
  layers: PoseBodyLayer[];
  aspect: number;
  height?: number;
  label: string;
  testId?: string;
}) {
  const safeAspect = aspect > 0.2 && aspect < 5 ? aspect : 2 / 3;
  const width = Math.round(height * safeAspect);
  return (
    <svg
      viewBox={`0 0 ${safeAspect} 1`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]"
      data-testid={testId}
    >
      {layers.map((layer, layerIndex) =>
        layer.bodies.map((body, index) => {
          const color = layer.color ?? POSE_FIGURE_COLORS[index % POSE_FIGURE_COLORS.length]!;
          const at = (i: number) => {
            const p = body[i];
            return p ? { x: p.x * safeAspect, y: p.y } : null;
          };
          const head = at(0);
          return (
            <g
              key={`${layerIndex}-${index}`}
              stroke={color}
              strokeWidth={0.022}
              strokeLinecap="round"
              fill="none"
              opacity={layer.opacity ?? 1}
              strokeDasharray={layer.dashed ? '0.03 0.025' : undefined}
            >
              {BONES.map(([a, b]) => {
                const p = at(a);
                const q = at(b);
                return p && q ? (
                  <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                ) : null;
              })}
              {head ? <circle cx={head.x} cy={head.y} r={0.035} /> : null}
            </g>
          );
        })
      )}
    </svg>
  );
}
