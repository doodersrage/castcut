'use client';

import { useMemo, useSyncExternalStore } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import type { PhotoPose } from '@/lib/day-pose-guide';
import { loadMyPoses, removeMyPose, subscribeMyPoses, type MyPose } from '@/lib/my-poses';

function useMyPoses(): MyPose[] {
  const json = useSyncExternalStore(
    subscribeMyPoses,
    () => JSON.stringify(loadMyPoses()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as MyPose[], [json]);
}

/**
 * "My poses": the skeletons saved from the joint editor, as a strip of small figures. Picking one
 * uses it as this slot's / try-on's pose. Renders nothing until a pose has been saved.
 */
export default function MyPosesStrip({
  onPick,
  disabled = false,
  maxPeople,
  testIdPrefix = 'my-poses',
}: {
  onPick: (pose: PhotoPose, name: string) => void;
  disabled?: boolean;
  /** Hide poses with more figures than the tool draws (Outfit: 1). */
  maxPeople?: number;
  testIdPrefix?: string;
}) {
  const poses = useMyPoses().filter(entry => !maxPeople || entry.pose.people.length <= maxPeople);
  if (poses.length === 0) return null;
  return (
    <div className="space-y-1" data-testid={testIdPrefix}>
      <p className="type-caption text-[var(--text-muted)]">My poses</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {poses.map(entry => (
          <div
            key={entry.id}
            className="relative shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40"
          >
            <button
              type="button"
              disabled={disabled}
              className="block space-y-0.5 p-1.5 text-left"
              title={`Use “${entry.name}”`}
              data-testid={`${testIdPrefix}-pick`}
              onClick={() => onPick(entry.pose, entry.name)}
            >
              <PoseBodiesSvg
                layers={[{ bodies: entry.pose.people }]}
                aspect={entry.pose.aspect}
                height={72}
                label={entry.name}
                testId={`${testIdPrefix}-figure`}
              />
              <span className="block max-w-[4.5rem] truncate type-caption text-[var(--text-secondary)]">
                {entry.name}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${entry.name} from My poses`}
              disabled={disabled}
              className="absolute right-0.5 top-0.5 rounded-full bg-[var(--bg-elevated)]/90 px-1.5 type-caption text-[var(--text-muted)]"
              onClick={() => removeMyPose(entry.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
