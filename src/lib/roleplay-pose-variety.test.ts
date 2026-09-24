import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatRoleplayPoseVarietyCue,
  recentRoleplayPoseKeys,
  roleplayScenePoseKey,
  roleplayScenePoseRepeats,
} from './roleplay';

const scene = (blurb: string, pose?: Record<string, unknown>) => ({
  title: 'Beat',
  blurb,
  ...(pose ? { pose: pose as never } : {}),
});

describe('Story pose variety', () => {
  it('keys a scene by its act, then the drawn layout, then its body', () => {
    assert.equal(roleplayScenePoseKey(scene('anything', { act: 'oral' })), 'oral');
    assert.equal(roleplayScenePoseKey(scene('bent over the desk with a partner behind')), 'bent');
    assert.equal(roleplayScenePoseKey(scene('she reads on the porch', { body: 'sit' })), 'sit');
    assert.equal(roleplayScenePoseKey(scene('she reads on the porch')), null);
    // "none" defers to the text / body.
    assert.equal(roleplayScenePoseKey(scene('she reads', { act: 'none', body: 'lie' })), 'lie');
  });

  it('flags options that repeat each other or the last beat', () => {
    const options = [
      scene('a', { act: 'bent' }),
      scene('b', { act: 'bent' }),
      scene('c', { act: 'oral' }),
      scene('d', { body: 'stand' }),
    ];
    assert.deepEqual(roleplayScenePoseRepeats(options), ['bent']);
    assert.deepEqual(roleplayScenePoseRepeats(options, ['missionary', 'oral']), ['bent', 'oral']);
    const varied = [scene('a', { act: 'lap' }), scene('b', { act: 'prone' }), scene('c', { body: 'walk' })];
    assert.deepEqual(roleplayScenePoseRepeats(varied, ['oral']), []);
  });

  it('reads recent poses from the story and names them for the scene writer', () => {
    const story = [
      scene('missionary on the bed'),
      scene('x', { act: 'wall' }),
      scene('y'),
      scene('z', { body: 'sit' }),
    ];
    assert.deepEqual(recentRoleplayPoseKeys(story), ['wall', 'sit']);
    assert.match(formatRoleplayPoseVarietyCue(['wall', 'sixty_nine']), /already used: wall, sixty nine/);
    assert.match(formatRoleplayPoseVarietyCue([]), /different pose/);
  });
});
