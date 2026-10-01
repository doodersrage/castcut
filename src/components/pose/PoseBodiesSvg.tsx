'use client';

import type { NormalizedBody } from '@/lib/pose-library';

type PosePart = 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';

/** One colour per limb, so crossed arms and legs stay readable against the torso. */
export const POSE_PART_COLORS: Record<PosePart, string> = {
  rightArm: '#e8590c',
  leftArm: '#2b8a3e',
  rightLeg: '#1971c2',
  leftLeg: '#862e9c',
};

/** COCO-18 limbs: arms and legs (the torso and head are drawn as shapes). */
const LIMBS: ReadonlyArray<readonly [number, number, boolean, PosePart]> = [
  [2, 3, true, 'rightArm'],
  [3, 4, false, 'rightArm'],
  [5, 6, true, 'leftArm'],
  [6, 7, false, 'leftArm'],
  [8, 9, true, 'rightLeg'],
  [9, 10, false, 'rightLeg'],
  [11, 12, true, 'leftLeg'],
  [12, 13, false, 'leftLeg'],
];

const LIMB_ROOT: Record<PosePart, number> = { rightArm: 2, leftArm: 5, rightLeg: 8, leftLeg: 11 };

/** The limb a joint belongs to (shoulders and hips count as their limb); null for head / neck. */
export function posePartOfJoint(joint: number): PosePart | null {
  if (joint >= 2 && joint <= 4) return 'rightArm';
  if (joint >= 5 && joint <= 7) return 'leftArm';
  if (joint >= 8 && joint <= 10) return 'rightLeg';
  if (joint >= 11 && joint <= 13) return 'leftLeg';
  return null;
}

/**
 * One figure as a simple mannequin: a torso with a waist, a head and tapered limbs. A bare
 * COCO skeleton runs two lines from the neck to the hips, which read as a second pair of legs.
 * Coordinates are 0–1 of the canvas; `aspect` is its width / height. Display only — the guide
 * sent to the model stays an OpenPose map.
 */
export function PoseFigureShape({
  body,
  aspect,
  color,
  weight = 0.012,
  dashed = false,
  parts = false,
  depth,
}: {
  body: NormalizedBody;
  aspect: number;
  color: string;
  /** Lower-limb line width; thighs / upper arms are drawn half as thick again. */
  weight?: number;
  dashed?: boolean;
  /** Colour each limb (with a pale outline) instead of drawing the figure in one colour. */
  parts?: boolean;
  /**
   * Depth per joint (+ toward the camera). Nearer limbs are drawn thicker and on top, limbs
   * behind the torso thinner, paler and underneath.
   */
  depth?: ReadonlyArray<number | null>;
}) {
  const zOf = (i: number) => depth?.[i] ?? 0;
  // ±0.2 of the figure's height in depth is about ±45% in thickness.
  const near = (z: number) => Math.min(1.6, Math.max(0.55, 1 + z * 2.2));
  const at = (i: number) => {
    const p = body[i];
    return p ? { x: p.x * aspect, y: p.y } : null;
  };
  const [nose, neck, rs, ls, rh, lh] = [at(0), at(1), at(2), at(5), at(8), at(11)];
  const dash = dashed ? `${weight * 1.4} ${weight * 1.2}` : undefined;
  let torso: string | null = null;
  if (rs && ls && rh && lh) {
    // Waist: 60% of the way down each side, pulled a little toward the spine.
    const mid = { x: (rs.x + ls.x + rh.x + lh.x) / 4, y: (rs.y + ls.y + rh.y + lh.y) / 4 };
    const waist = (shoulder: { x: number; y: number }, hip: { x: number; y: number }) => {
      const x = shoulder.x + (hip.x - shoulder.x) * 0.6;
      const y = shoulder.y + (hip.y - shoulder.y) * 0.6;
      return { x: x + (mid.x - x) * 0.22, y: y + (mid.y - y) * 0.22 };
    };
    const rw = waist(rs, rh);
    const lw = waist(ls, lh);
    torso = `M${rs.x} ${rs.y} L${ls.x} ${ls.y} Q${lw.x} ${lw.y} ${lh.x} ${lh.y} L${rh.x} ${rh.y} Q${rw.x} ${rw.y} ${rs.x} ${rs.y} Z`;
  }
  const headRadius =
    nose && neck ? Math.max(0.018, Math.hypot(nose.x - neck.x, nose.y - neck.y) * 0.62) : 0.03;
  // Far limbs first, so nearer ones overlap them; `behind` picks the side of the torso.
  const limbs = (behind: boolean) =>
    [...LIMBS]
      .map(limb => ({
        limb,
        z: (zOf(limb[0]) + zOf(limb[1])) / 2,
        // Behind = further back than the shoulder / hip the limb hangs from.
        rootZ: zOf(LIMB_ROOT[limb[3]]),
      }))
      .filter(({ z, rootZ }) => (depth ? z < rootZ - 0.02 : false) === behind)
      .sort((p, q) => p.z - q.z)
      .map(({ limb: [a, b, upper, part], z }) => {
        const p = at(a);
        const q = at(b);
        if (!p || !q) return null;
        const width = (upper ? weight * 1.5 : weight) * near(z);
        return (
          <g key={`${a}-${b}`} opacity={behind ? 0.6 : 1}>
            {parts ? (
              <line
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke="var(--bg-base)"
                strokeWidth={width + weight * 0.9}
                strokeDasharray="none"
              />
            ) : null}
            <line
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={parts ? POSE_PART_COLORS[part] : undefined}
              strokeWidth={width}
            />
          </g>
        );
      });
  return (
    <g stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash}>
      {limbs(true)}
      {torso ? (
        <path d={torso} fill={color} fillOpacity={0.22} strokeWidth={weight} />
      ) : neck ? (
        // No full torso (a partly detected body): fall back to spine lines.
        [rh, lh].map((hip, index) =>
          hip ? (
            <line key={index} x1={neck.x} y1={neck.y} x2={hip.x} y2={hip.y} strokeWidth={weight} />
          ) : null
        )
      ) : null}
      {!torso && neck
        ? [rs, ls].map((shoulder, index) =>
            shoulder ? (
              <line
                key={index}
                x1={neck.x}
                y1={neck.y}
                x2={shoulder.x}
                y2={shoulder.y}
                strokeWidth={weight}
              />
            ) : null
          )
        : null}
      {nose && neck ? (
        <line x1={neck.x} y1={neck.y} x2={nose.x} y2={nose.y} strokeWidth={weight * 1.5} />
      ) : null}
      {limbs(false)}
      {nose ? (
        <circle
          cx={nose.x}
          cy={nose.y}
          r={headRadius}
          fill={color}
          fillOpacity={0.22}
          strokeWidth={weight}
        />
      ) : null}
    </g>
  );
}

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
          return (
            <g key={`${layerIndex}-${index}`} opacity={layer.opacity ?? 1}>
              <PoseFigureShape
                body={body}
                aspect={safeAspect}
                color={color}
                weight={0.016}
                dashed={layer.dashed}
                parts={!layer.color}
              />
            </g>
          );
        })
      )}
    </svg>
  );
}
