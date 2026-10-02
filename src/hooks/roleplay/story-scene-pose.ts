/**
 * The pose a scene card will be drawn in if it is picked — resolved with the same pure functions
 * and options the queue uses for a fresh scene (useRoleplayBeatQueueCore, resolvePoseGuideForBeat):
 * nothing picked on a card yet, variant 0, no stored prompt. One function so the card's figure
 * and the pose guide of the still cannot disagree.
 *
 * Not carried over from the queue: the reference photo's aspect (probed from the image when the
 * still is queued). The stance is the same; only the canvas it sits on can differ.
 */
import {
  resolveSceneGuidePlan,
  sceneTextFromStoryPoseInput,
  type ScenePoseSpec,
} from '@/lib/day-pose-guide';
import { mergePickedPose } from '@/lib/day-slot-pose';
import { composedPoseForScene } from '@/lib/pose-compose';
import {
  isOpenPoseStyle,
  mergeAvoidedPoseLayouts,
  modelPlainPostureBase,
  poseGuideStyleDrawsHands,
  type PoseGuideStylePreference,
} from '@/lib/pose-guide-prompt';
import { poseLayoutLabel } from '@/lib/pose-layout-labels';
import type { NormalizedBody, PoseLibraryEntry } from '@/lib/pose-library';

export type StoryScenePose = {
  /** Lead first; 0–1 of the guide canvas. */
  bodies: NormalizedBody[];
  /** Canvas width / height. */
  aspect: number;
  /** The drawn pose's id (a layout, a sex layout or a plain posture). */
  poseId: string;
  /** Its name, for the figure's label. */
  label: string;
};

export function resolveStoryScenePose(input: {
  scene: { title: string; blurb: string; pose?: ScenePoseSpec };
  /** Titles of the scenes already in the reel: a blurb that quotes one is not posed by it. */
  storyTitles: readonly string[];
  /** Where the scene would sit in the reel (the stance cycle's fallback index). */
  storyIndex: number;
  model: string | null | undefined;
  /** Adult rating — only then may a sex layout be drawn. */
  adult: boolean;
  stylePreference?: PoseGuideStylePreference | null;
  /** Play-metrics layouts with a poor record (the model's own are added here). */
  weakLayouts?: ReadonlySet<string>;
  library?: PoseLibraryEntry[];
}): StoryScenePose | null {
  try {
    const { scene } = input;
    const writtenPose = mergePickedPose(undefined, scene.pose, scene.blurb);
    const composed = composedPoseForScene({
      pose: writtenPose,
      sceneText: scene.blurb,
      playerPosed: false,
    });
    const sceneText = sceneTextFromStoryPoseInput({
      title: scene.title,
      blurb: scene.blurb,
      quotedTitles: input.storyTitles,
      allowIntimate: input.adult,
    });
    if (!sceneText && !composed) {
      return null;
    }
    const openPose = isOpenPoseStyle(input.stylePreference);
    const plainPostureBase = modelPlainPostureBase(input.model);
    const plan = resolveSceneGuidePlan(sceneText, input.storyIndex, {
      ...(writtenPose ? { pose: writtenPose } : {}),
      variant: 0,
      avoidLayouts: mergeAvoidedPoseLayouts(input.weakLayouts, input.model),
      ...(plainPostureBase ? { plainPostureBase } : {}),
      ...(composed ? { photoPose: composed } : {}),
      library: openPose ? (input.library ?? []) : [],
      allowIntimate: input.adult,
      hands: poseGuideStyleDrawsHands(input.stylePreference),
      openPose,
    });
    const bodies = plan.openPose.keypoints.filter(body => body.some(Boolean));
    const { width, height } = plan.openPose.canvas;
    if (bodies.length === 0 || !(width > 0) || !(height > 0)) {
      return null;
    }
    const poseId = plan.intent.intimate ?? plan.intent.social ?? plan.intent.base;
    return { bodies, aspect: width / height, poseId, label: poseLayoutLabel(poseId) };
  } catch {
    // A card without a figure is fine; a card that breaks the picker is not.
    return null;
  }
}
