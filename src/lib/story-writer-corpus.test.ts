/**
 * Scenes the local writer actually produced (nsfwvision-qwen3-vl-8b, PG-13, four leads — two
 * women, two men, two with unusual names — openings, middles and endings; recorded 2026-10-02).
 * The checks before this file only ran on text we wrote ourselves; the worst bug of the round
 * ("the stranger's joined hands" → "…penetrating in sex hands") only showed on real writer text.
 * Each scene must come through the card check, the rewriter and the pose resolver clean.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolveStoryScenePose } from '../hooks/roleplay/story-scene-pose';
import { clarifyIntimateImageLanguage } from './intimate-prompt-clarify';
import { repairStoryScene } from './story-scene-check';

type RecordedScene = {
  lead: string;
  man: boolean;
  phase: string;
  title: string;
  blurb: string;
  pose?: Record<string, unknown>;
};

const SCENES: RecordedScene[] = JSON.parse(
  readFileSync(new URL('./__fixtures__/story-writer-scenes-pg13.json', import.meta.url), 'utf8')
);
const SEXUAL_RE = /\b(?:sex|penetrat\w*|cock|pussy|nude|naked|orgasm\w*|nipples?)\b/i;

describe('recorded writer scenes (PG-13)', () => {
  it('is a corpus worth the name', () => {
    assert.ok(SCENES.length >= 60, `${SCENES.length} scenes`);
  });

  it('the rewriter adds no sexual wording', () => {
    const broken = SCENES.filter(
      scene => !SEXUAL_RE.test(scene.blurb) && SEXUAL_RE.test(clarifyIntimateImageLanguage(scene.blurb))
    ).map(scene => scene.blurb);
    assert.deepEqual(broken, []);
  });

  it('every card passes the check after repair, and no lead is "they"', () => {
    const left = SCENES.flatMap(scene => {
      const checked = repairStoryScene(scene, { adult: false, manLead: scene.man });
      return checked.remaining.map(issue => `${issue.code}: ${scene.blurb}`);
    });
    assert.deepEqual(left, []);
  });

  it('every scene resolves to a pose with one or two people', () => {
    const odd = SCENES.flatMap(scene => {
      const pose = resolveStoryScenePose({
        scene: { title: scene.title, blurb: scene.blurb },
        storyTitles: [],
        storyIndex: 1,
        model: 'qwen-rapid-aio-edit',
        adult: false,
      });
      return !pose || pose.bodies.length < 1 || pose.bodies.length > 2
        ? [`${pose?.bodies.length ?? 'none'}: ${scene.blurb}`]
        : [];
    });
    assert.deepEqual(odd, []);
  });
});
