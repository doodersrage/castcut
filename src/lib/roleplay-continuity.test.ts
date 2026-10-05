import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatRoleplayContinuityCue,
  roleplayStillBrief,
  type RoleplayStoryBeat,
} from './roleplay';

describe('Story continuity', () => {
  it('keeps the scene description and drops appended locks', () => {
    const prompt = [
      'Robin in a red wool coat and black jeans on a rain-slick rooftop at dusk, neon behind her. HEADCOUNT LOCK: exactly one adult.',
      'Image 3 is an OpenPose keypoint skeleton map…',
      'POSE FIRST: sitting on the ledge',
    ].join('\n');
    assert.equal(
      roleplayStillBrief(prompt),
      'Robin in a red wool coat and black jeans on a rain-slick rooftop at dusk, neon behind her.'
    );
    assert.equal(roleplayStillBrief(''), '');
    assert.ok(roleplayStillBrief('word '.repeat(200)).length <= 361);
  });

  it('carries the latest earlier still into the next one', () => {
    const story: RoleplayStoryBeat[] = [
      { id: 'a', title: 'Rooftop', blurb: 'x', at: 1, stillBrief: 'red coat on the rooftop at dusk' },
      { id: 'b', title: 'Stairwell', blurb: 'y', at: 2, stillBrief: 'red coat in a dim stairwell' },
      { id: 'c', title: 'Street', blurb: 'z', at: 3 },
    ];
    const cue = formatRoleplayContinuityCue(story, { id: 'c', title: 'Street' });
    assert.match(cue, /Previous still \(continuity\): red coat in a dim stairwell/);
    assert.match(cue, /unless this beat clearly changes them/);
    // Rewriting beat b's own still must not use b as its own reference.
    assert.match(formatRoleplayContinuityCue(story, { id: 'b' }), /rooftop at dusk/);
    assert.equal(formatRoleplayContinuityCue([], null), '');
    // The previous still named the coat: no extra outfit line.
    assert.doesNotMatch(cue, /Outfit so far/);
  });

  it('names the last outfit an earlier still described when the previous one named none', () => {
    const story: RoleplayStoryBeat[] = [
      {
        id: 'a',
        title: 'Book swap',
        blurb: 'x',
        at: 1,
        stillBrief: 'Nora in a wool cardigan over a floral dress swaps an atlas in a sunlit nook',
      },
      {
        id: 'b',
        title: 'Opposite play',
        blurb: 'y',
        at: 2,
        stillBrief: 'Nora tries the opposite tactic and it immediately complicates',
      },
      { id: 'c', title: 'Night shift', blurb: 'z', at: 3 },
    ];
    const cue = formatRoleplayContinuityCue(story, { id: 'c', title: 'Night shift' });
    assert.match(cue, /Previous still \(continuity\): Nora tries the opposite tactic/);
    assert.match(cue, /Outfit so far \(from an earlier still — keep it\): Nora in a wool cardigan/);
    assert.match(cue, /never the previous one again/);
  });
});
