'use client';

import { useMemo } from 'react';
import PosePreview from '@/components/PosePreview';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { sceneTextFromStoryPoseInput } from '@/lib/day-pose-guide';
import { mergePickedPose } from '@/lib/day-slot-pose';
import type { RoleplayStoryBeat } from '@/lib/roleplay';

/**
 * Pose preview on a Story beat card — the stance the next queue / retry draws for Image 3.
 * Collapsed so the reel stays scannable.
 */
export default function StoryBeatPosePreview({
  beat,
  index,
  busy,
  onPoseChange,
}: {
  beat: RoleplayStoryBeat;
  index: number;
  busy: boolean;
  onPoseChange: (
    beat: RoleplayStoryBeat,
    patch: Pick<RoleplayStoryBeat, 'poseLayout' | 'poseVariant'>
  ) => void;
}) {
  const weakLayouts = useWeakPoseLayouts();
  const sceneText = useMemo(
    () =>
      sceneTextFromStoryPoseInput({ title: beat.title, blurb: beat.blurb, prompt: beat.prompt }),
    [beat.blurb, beat.prompt, beat.title]
  );
  const options = useMemo(() => {
    const pose = mergePickedPose(beat.poseLayout, beat.pose);
    return { ...(pose ? { pose } : {}), variant: beat.poseVariant ?? 0 };
  }, [beat.pose, beat.poseLayout, beat.poseVariant]);
  return (
    <details
      className="type-caption text-[var(--text-muted)]"
      data-testid="story-beat-pose"
      open={Boolean(beat.poseLayout) || undefined}
    >
      <summary className="cursor-pointer">Pose{beat.poseLayout ? ' · picked' : ''}</summary>
      <div className="mt-1.5">
        <PosePreview
          sceneText={sceneText || undefined}
          options={options}
          fallbackIndex={index}
          value={beat.poseLayout}
          weakLayouts={weakLayouts}
          disabled={busy}
          compact
          testIdPrefix="story-beat-pose-preview"
          onChange={poseLayout => onPoseChange(beat, { poseLayout, poseVariant: undefined })}
          onTryAnother={() =>
            onPoseChange(beat, {
              poseLayout: beat.poseLayout,
              poseVariant: ((beat.poseVariant ?? 0) % 99) + 1,
            })
          }
        />
      </div>
    </details>
  );
}
