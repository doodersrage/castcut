import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveStoryScenePose } from '../hooks/roleplay/story-scene-pose';
import { resolveSceneGuidePlan, sceneTextFromStoryPoseInput } from './day-pose-guide';
import { mergeAvoidedPoseLayouts } from './pose-guide-prompt';

const RAPID = 'qwen-image-edit-rapid-aio';
const base = { storyTitles: [] as string[], storyIndex: 2, model: RAPID, adult: false };

describe('scene card pose (story-scene-pose)', () => {
  it('draws the pose the scene states', () => {
    const pose = resolveStoryScenePose({
      ...base,
      scene: { title: 'The dock', blurb: 'She sits on the edge of the dock.' },
    });
    assert.ok(pose);
    assert.equal(pose.bodies.length, 1);
    assert.equal(pose.poseId, 'perch_edge');
    assert.ok(pose.label.length > 0);
    assert.ok(pose.aspect > 0.2 && pose.aspect < 5);
  });

  it('is the plan the queue resolves for a fresh scene', () => {
    const scene = { title: 'Reunion', blurb: 'She hugs her brother at the station.' };
    const pose = resolveStoryScenePose({ ...base, scene });
    const plan = resolveSceneGuidePlan(
      sceneTextFromStoryPoseInput({ ...scene, quotedTitles: [], allowIntimate: false }),
      base.storyIndex,
      {
        variant: 0,
        avoidLayouts: mergeAvoidedPoseLayouts(undefined, RAPID),
        library: [],
        allowIntimate: false,
        hands: false,
        openPose: true,
      }
    );
    assert.ok(pose);
    assert.deepEqual(pose.bodies, plan.openPose.keypoints);
    assert.equal(pose.bodies.length, 2);
  });

  it('follows the rating: a wall is a lean on a clean story, a sex layout on an adult one', () => {
    const scene = { title: 'Alley', blurb: 'She leans against a brick wall, catching her breath.' };
    const clean = resolveStoryScenePose({ ...base, scene });
    const adult = resolveStoryScenePose({ ...base, adult: true, scene });
    assert.equal(clean?.poseId, 'lean_wall');
    assert.equal(clean?.bodies.length, 1);
    assert.notEqual(adult?.poseId, 'lean_wall');
  });

  it('does not pose a scene by a title it quotes from the reel', () => {
    const scene = { title: 'Walk away', blurb: 'Doppio leaves milk pitcher duel for good.' };
    const unquoted = resolveStoryScenePose({ ...base, scene });
    const quoted = resolveStoryScenePose({ ...base, storyTitles: ['Milk pitcher duel'], scene });
    assert.equal(unquoted?.bodies.length, 2);
    assert.equal(quoted?.bodies.length, 1);
    assert.equal(quoted?.poseId, 'walk');
  });

  it('follows the model profile (Klein draws a hug as a plain standing pair)', () => {
    const scene = { title: 'Reunion', blurb: 'She hugs her brother at the station.' };
    assert.equal(resolveStoryScenePose({ ...base, scene })?.poseId, 'hug');
    const klein = resolveStoryScenePose({ ...base, model: 'flux-2-klein-9b-distilled', scene });
    assert.equal(klein?.poseId, 'stand');
    assert.equal(klein?.bodies.length, 2);
  });

  it("uses the scene writer's pose where the words give none", () => {
    const pose = resolveStoryScenePose({
      ...base,
      scene: { title: 'Odd', blurb: 'She waits.', pose: { body: 'kneel' } },
    });
    assert.equal(pose?.poseId, 'kneel');
  });

  it('draws one figure on an adult story with People → Solo', () => {
    const scene = { title: 'On the edge', blurb: 'She rides him on the edge of the bed, head back.' };
    const anyMix = resolveStoryScenePose({ ...base, adult: true, scene });
    const solo = resolveStoryScenePose({ ...base, adult: true, solo: true, scene });
    assert.equal(anyMix?.bodies.length, 2, 'an act takes two unless the story is Solo');
    assert.equal(solo?.bodies.length, 1);
    // The setting belongs to adult stories; a clean one is untouched by it.
    const hug = { title: 'Reunion', blurb: 'She hugs her brother at the station.' };
    assert.equal(resolveStoryScenePose({ ...base, solo: true, scene: hug })?.bodies.length, 2);
  });

  it('afterglow and undressing are one person unless someone else is named', () => {
    const alone = resolveStoryScenePose({
      ...base,
      adult: true,
      scene: { title: 'Tangled sheets', blurb: 'Tangled sheets and her bare body — empty room.' },
    });
    assert.equal(alone?.bodies.length, 1);
    const leaving = resolveStoryScenePose({
      ...base,
      adult: true,
      scene: { title: 'Walk of shame glow', blurb: 'She is leaving after sex — mussed hair, clothes half on.' },
    });
    assert.equal(leaving?.bodies.length, 1);
  });

  it('is nothing when there is no scene to read', () => {
    assert.equal(resolveStoryScenePose({ ...base, scene: { title: '', blurb: '' } }), null);
  });
});
