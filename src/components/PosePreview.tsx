'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import {
  synthesizeSceneStickFigures,
  type SceneStickOptions,
  type StickSkeleton,
} from '@/lib/day-pose-guide';
import { POSE_PICKER_GROUPS, poseLayoutLabel } from '@/lib/pose-layout-labels';

const BONES: ReadonlyArray<readonly [keyof StickSkeleton, keyof StickSkeleton]> = [
  ['head', 'neck'],
  ['neck', 'lShoulder'],
  ['neck', 'rShoulder'],
  ['lShoulder', 'lElbow'],
  ['lElbow', 'lWrist'],
  ['rShoulder', 'rElbow'],
  ['rElbow', 'rWrist'],
  ['neck', 'pelvis'],
  ['pelvis', 'lHip'],
  ['pelvis', 'rHip'],
  ['lHip', 'lKnee'],
  ['lKnee', 'lAnkle'],
  ['rHip', 'rKnee'],
  ['rKnee', 'rAnkle'],
];

/** Lead (Cast) first, then partners — the same order the guide colors them. */
const FIGURE_COLORS = ['var(--pose-lead, #d0006f)', 'var(--pose-partner, #0091c7)', '#e08a00'];

type Pt = { x: number; y: number };

/** The stick figures a pose guide will draw, as a small inline SVG. */
export function PoseFigureSvg({
  figures,
  width = 96,
  height = 144,
  label,
}: {
  figures: StickSkeleton[];
  width?: number;
  height?: number;
  label: string;
}) {
  return (
    <svg
      viewBox="0 0 1 1.5"
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-base)]"
      data-testid="pose-preview-figure"
    >
      {figures.map((figure, index) => {
        const color = FIGURE_COLORS[index % FIGURE_COLORS.length];
        const at = (key: keyof StickSkeleton) => figure[key] as Pt;
        return (
          <g key={index} stroke={color} strokeWidth={0.022} strokeLinecap="round" fill="none">
            {BONES.map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={at(a).x}
                y1={at(a).y * 1.5}
                x2={at(b).x}
                y2={at(b).y * 1.5}
              />
            ))}
            <circle cx={at('head').x} cy={at('head').y * 1.5} r={0.045} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Pose preview for a Day slot or Story beat: the mannequin the guide will draw, its name, a
 * "Change pose" picker, and "Try another" (a reseeded / mirrored variant).
 */
export default function PosePreview({
  sceneText,
  options,
  fallbackIndex = 0,
  value,
  weakLayouts,
  disabled = false,
  compact = false,
  testIdPrefix = 'pose-preview',
  onChange,
  onTryAnother,
}: {
  sceneText?: string;
  options: SceneStickOptions;
  fallbackIndex?: number;
  /** Picked pose id, or undefined for "from the beat". */
  value?: string;
  /** Layouts the guide routes around when nothing is picked (poor pose-match record). */
  weakLayouts?: ReadonlySet<string>;
  disabled?: boolean;
  compact?: boolean;
  testIdPrefix?: string;
  onChange: (next: string | undefined) => void;
  onTryAnother: () => void;
}) {
  const drawn = useMemo(() => {
    const first = synthesizeSceneStickFigures(sceneText, fallbackIndex, options);
    const routedAround =
      !value && first.intent.social && weakLayouts?.has(first.intent.social)
        ? first.intent.social
        : null;
    return routedAround
      ? {
          ...synthesizeSceneStickFigures(sceneText, fallbackIndex, {
            ...options,
            plainPosture: true,
          }),
          routedAround,
        }
      : { ...first, routedAround: null };
  }, [fallbackIndex, options, sceneText, value, weakLayouts]);

  const { intent, figures, routedAround } = drawn;
  const drawnId = intent.intimate ?? intent.social ?? intent.base;
  const name = poseLayoutLabel(drawnId);
  const people = figures.length;

  return (
    <div
      className={`flex gap-3 ${compact ? 'items-start' : 'items-center'}`}
      data-testid={testIdPrefix}
      data-pose={drawnId}
    >
      <PoseFigureSvg
        figures={figures}
        width={compact ? 64 : 80}
        height={compact ? 96 : 120}
        label={`Pose guide: ${name}`}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="type-caption text-[var(--text-secondary)]">
          <span className="type-overline mr-1 text-[var(--text-muted)]">
            {value ? 'Picked' : 'From the beat'}
          </span>
          <span
            className="font-medium text-[var(--text-primary)]"
            data-testid={`${testIdPrefix}-name`}
          >
            {name}
          </span>
          {people > 1 ? ` · ${people} people` : ''}
        </p>
        {routedAround ? (
          <p
            className="type-caption text-[var(--text-muted)]"
            data-testid={`${testIdPrefix}-routed`}
          >
            Edit often misses &ldquo;{poseLayoutLabel(routedAround)}&rdquo;, so the guide draws the
            plain posture — pick it below to force it.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <SelectInput
            value={value ?? ''}
            disabled={disabled}
            aria-label="Change pose"
            data-testid={`${testIdPrefix}-select`}
            className="w-auto! min-w-[10rem] py-1 text-sm"
            onChange={event => onChange(event.target.value || undefined)}
          >
            <option value="">Auto — from the beat</option>
            {POSE_PICKER_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.ids.map(id => (
                  <option key={id} value={id}>
                    {poseLayoutLabel(id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectInput>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            data-testid={`${testIdPrefix}-another`}
            title="Redraw the guide as a different variant of this pose"
            onClick={onTryAnother}
          >
            Try another
          </Button>
        </div>
      </div>
    </div>
  );
}
