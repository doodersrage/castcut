'use client';

import { blockingPlan } from '@/lib/pose/blocking';
import type { PoseCameraChoice } from '@/lib/pose/camera-shot';

/**
 * A shot's blocking from above (pose/blocking.ts): the people (the lead filled), and the camera
 * where its direction and shot size put it, pointing at them — a glance at the 180° line and the
 * coverage before a still is made.
 */
export default function BlockingDiagram({
  camera,
  leadSide,
  people,
  testId,
}: {
  camera?: PoseCameraChoice | null;
  leadSide?: 'left' | 'right';
  people?: number;
  testId?: string;
}) {
  const plan = blockingPlan({ camera, leadSide, people });
  return (
    <svg
      viewBox="0 0 100 100"
      className="h-20 w-20 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
      role="img"
      aria-label={`From above: ${plan.people.length} ${plan.people.length === 1 ? 'person' : 'people'}, the camera ${camera?.direction ?? 'front'} on`}
      data-testid={testId}
    >
      {/* The 180° line runs through the people, left to right. */}
      <line
        x1="8"
        y1="50"
        x2="92"
        y2="50"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeDasharray="3 3"
      />
      {plan.people.map((person, index) => (
        <circle
          key={index}
          cx={person.x}
          cy={person.y}
          r="5"
          fill={person.lead ? 'var(--accent)' : 'none'}
          stroke="var(--accent)"
          strokeWidth="2"
        />
      ))}
      <g transform={`translate(${plan.camera.x} ${plan.camera.y}) rotate(${plan.camera.angleDeg})`}>
        <rect x="-6" y="-4" width="9" height="8" rx="1.5" fill="var(--text-secondary)" />
        <polygon points="3,-3 8,-6 8,6 3,3" fill="var(--text-secondary)" />
      </g>
    </svg>
  );
}
