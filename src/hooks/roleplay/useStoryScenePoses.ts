'use client';

import { useMemo } from 'react';
import { resolveStoryScenePose, type StoryScenePose } from '@/hooks/roleplay/story-scene-pose';
import { usePoseLibrary } from '@/hooks/usePoseLibrary';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { poseGuideStyleForModel } from '@/lib/pose-guide-prompt';
import { MAX_ROLEPLAY_STORY_BEATS, type RoleplayScene } from '@/lib/roleplay';

const NO_POSES: ReadonlyMap<string, StoryScenePose> = new Map();

/**
 * The pose of each offered scene card, by scene id. Resolved once per roll for all four cards
 * (one pose-library read, one memo) rather than once per card per render.
 */
export function useStoryScenePoses(input: {
  scenes: RoleplayScene[];
  story: ReadonlyArray<{ title: string }>;
  model: string | null | undefined;
  /** The shared pose-guide style setting (the model may override it). */
  poseGuideStyle: unknown;
  adult: boolean;
  /** Adult story with People → Solo: one figure, whatever the scene's act. */
  solo?: boolean;
  /** False when stills are queued without a pose guide (Story from bio, no photo). */
  enabled: boolean;
}): ReadonlyMap<string, StoryScenePose> {
  const { scenes, story, model, poseGuideStyle, adult, solo, enabled } = input;
  const library = usePoseLibrary();
  const weakLayouts = useWeakPoseLayouts();
  // A string, so a reel that re-renders with the same titles keeps the memo.
  const titlesKey = story.map(beat => beat.title).join('\n');
  // The picked scene is appended (the reel is capped, see appendRoleplayStoryBeat).
  const storyIndex = Math.min(story.length, MAX_ROLEPLAY_STORY_BEATS - 1);
  return useMemo(() => {
    if (!enabled || scenes.length === 0) {
      return NO_POSES;
    }
    const storyTitles = titlesKey ? titlesKey.split('\n') : [];
    const stylePreference = poseGuideStyleForModel(poseGuideStyle, model);
    const poses = new Map<string, StoryScenePose>();
    for (const scene of scenes) {
      const pose = resolveStoryScenePose({
        scene,
        storyTitles,
        storyIndex,
        model,
        adult,
        solo,
        stylePreference,
        weakLayouts,
        library,
      });
      if (pose) {
        poses.set(scene.id, pose);
      }
    }
    return poses;
  }, [
    adult,
    enabled,
    library,
    model,
    poseGuideStyle,
    scenes,
    solo,
    storyIndex,
    titlesKey,
    weakLayouts,
  ]);
}
