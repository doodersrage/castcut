'use client';

import SideSheet from '@/components/ui/SideSheet';
import StoryBeatPosePreview from '@/components/roleplay/sections/StoryBeatPosePreview';
import StoryBeatTextEditor from '@/components/roleplay/StoryBeatTextEditor';
import type { StoryBeatEditActions } from '@/hooks/roleplay/useStoryBeatEdit';
import type { PosePicks } from '@/components/pose/PosePreview';
import type { RoleplayStoryBeat } from '@/lib/roleplay';

export type StoryBeatSheetProps = {
  open: boolean;
  onClose: () => void;
  beat: RoleplayStoryBeat;
  index: number;
  busy: boolean;
  /** Edit scene (title and what happens), when the page provides it. */
  edit: StoryBeatEditActions | null;
  /** The scene is being written or queued — its text cannot change under the job. */
  textLocked: boolean;
  onPoseChange?: (beat: RoleplayStoryBeat, patch: PosePicks) => void;
};

/**
 * Everything about one scene in the reel, in a side sheet (desk: right drawer; phone: bottom
 * sheet): its title and text, the pose its next still is drawn in, and the pose guide. Opens
 * from the card's ⋯ menu (Edit scene, Pose…). Saving the text closes it; the still is offered
 * again on the card.
 */
export default function StoryBeatSheet({
  open,
  onClose,
  beat,
  index,
  busy,
  edit,
  textLocked,
  onPoseChange,
}: StoryBeatSheetProps) {
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={`${index + 1}. ${beat.title}`}
      description="Scene text and the pose its still is drawn in."
      testId="story-beat-sheet"
      dataAttributes={{ 'data-beat-index': String(index) }}
    >
      <div className="space-y-4">
        {edit && !textLocked ? (
          <StoryBeatTextEditor
            beat={beat}
            disabled={busy}
            onSave={text => edit.saveBeatText(beat, text)}
            onCancel={onClose}
          />
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{beat.title}</p>
            <p className="type-caption text-[var(--text-muted)]">{beat.blurb}</p>
            {edit ? (
              <p className="type-caption text-[var(--text-muted)]" data-testid="story-beat-locked">
                This scene is being written or queued — edit it once that is done.
              </p>
            ) : null}
          </div>
        )}
        {onPoseChange ? (
          <StoryBeatPosePreview beat={beat} index={index} busy={busy} onPoseChange={onPoseChange} />
        ) : null}
        {beat.poseGuideUrl ? (
          <details className="type-caption text-[var(--text-muted)]" data-testid="story-pose-guide">
            <summary className="cursor-pointer">Pose guide</summary>
            {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy URL */}
            <img
              src={beat.poseGuideUrl}
              alt={`${beat.title} pose guide`}
              className="mt-1 max-h-40 w-auto rounded border border-[var(--border-subtle)]"
              loading="lazy"
            />
          </details>
        ) : null}
      </div>
    </SideSheet>
  );
}
