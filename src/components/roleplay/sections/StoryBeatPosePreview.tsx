'use client';

import { composedPoseForScene } from '@/lib/pose-compose';
import { useMemo } from 'react';
import PosePreview, { type PosePicks } from '@/components/pose/PosePreview';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { sceneTextFromStoryPoseInput, type PoseGuideBuildOptions } from '@/lib/day-pose-guide';
import { mergePickedPose } from '@/lib/day-slot-pose';
import { mergeAvoidedPoseLayouts, modelPlainPostureBase } from '@/lib/pose-guide-prompt';
import {
  isRoleplayAdultContent,
  resolveRoleplayToneAndContent,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { loadSettingsCache } from '@/lib/settings-cache';

/** Whether a beat has any pose choice set (keeps its Pose section open). */
export function storyBeatHasPosePicks(beat: RoleplayStoryBeat): boolean {
  return Boolean(
    beat.poseLayout || beat.posePhoto || beat.poseCamera || beat.poseLead || beat.poseLook
  );
}

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
  onPoseChange: (beat: RoleplayStoryBeat, patch: PosePicks) => void;
}) {
  const playWeakLayouts = useWeakPoseLayouts();
  // Same routing the queue applies (FLUX.2 Klein draws hug as a plain side-by-side pair).
  const model = loadSettingsCache().shared.model;
  const weakLayouts = useMemo(
    () => mergeAvoidedPoseLayouts(playWeakLayouts, model),
    [model, playWeakLayouts]
  );
  // The other beats' titles, as the queue passes them: a blurb that quotes one ("…the fallout
  // of milk pitcher duel") does not take its pose from the quote.
  const quotedTitles = ((loadSettingsCache().tools.roleplay?.story ?? []) as RoleplayStoryBeat[])
    .filter(entry => !(entry.id === beat.id && entry.at === beat.at))
    .map(entry => entry.title)
    .join('\n');
  // The rating decides whether a sex layout may be drawn, as in the queue. Without it a clean
  // story's "leans against a brick wall" previewed as the two-person wall layout while the
  // still (and the scene card's figure) drew a lean.
  const roleplayCache = loadSettingsCache().tools.roleplay;
  const adult = isRoleplayAdultContent(
    resolveRoleplayToneAndContent(roleplayCache?.tone, roleplayCache?.content).content
  );
  // Her picture behind the figure in the editor: the story's reference image.
  const backdropUrl = roleplayCache?.referenceImageUrl?.trim() || undefined;
  const sceneText = useMemo(
    () =>
      sceneTextFromStoryPoseInput({
        title: beat.title,
        blurb: beat.blurb,
        prompt: beat.prompt,
        quotedTitles: quotedTitles ? quotedTitles.split('\n') : [],
        allowIntimate: adult,
      }),
    [adult, beat.blurb, beat.prompt, beat.title, quotedTitles]
  );
  // Same options the queue passes to buildStoryPoseGuide.
  const options = useMemo((): PoseGuideBuildOptions => {
    const pose = mergePickedPose(beat.poseLayout, beat.pose, beat.blurb);
    const composed = composedPoseForScene({
      pose,
      sceneText: beat.blurb,
      playerPosed: Boolean(beat.poseLayout || beat.posePhoto),
    });
    return {
      ...(pose ? { pose } : {}),
      variant: beat.poseVariant ?? 0,
      ...(beat.posePhoto ? { photoPose: beat.posePhoto } : composed ? { photoPose: composed } : {}),
      ...(beat.poseCamera ? { camera: beat.poseCamera } : {}),
      ...(beat.poseLead ? { leadSide: beat.poseLead } : {}),
      ...(beat.poseLook ? { look: beat.poseLook } : {}),
      ...(modelPlainPostureBase(model) ? { plainPostureBase: modelPlainPostureBase(model) } : {}),
      allowIntimate: adult,
    };
  }, [
    adult,
    model,
    beat.blurb,
    beat.pose,
    beat.poseCamera,
    beat.poseLayout,
    beat.poseLead,
    beat.poseLook,
    beat.posePhoto,
    beat.poseVariant,
  ]);
  const picked = storyBeatHasPosePicks(beat);
  return (
    <details
      className="type-caption text-[var(--text-muted)]"
      data-testid="story-beat-pose"
      open={picked || undefined}
    >
      <summary className="cursor-pointer">Pose{picked ? ' · picked' : ''}</summary>
      <div className="mt-1.5">
        <PosePreview
          sceneText={sceneText || undefined}
          options={options}
          fallbackIndex={index}
          picks={beat}
          weakLayouts={weakLayouts}
          disabled={busy}
          compact
          testIdPrefix="story-beat-pose-preview"
          backdropUrl={backdropUrl}
          backdropLabel="the story's picture"
          onChange={patch => onPoseChange(beat, patch)}
        />
      </div>
    </details>
  );
}
