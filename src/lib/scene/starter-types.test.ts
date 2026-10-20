import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCENE_STARTER_CATEGORIES } from './starter-types';

describe('SCENE_STARTER_CATEGORIES', () => {
  it('starts with an "all" entry', () => {
    assert.equal(SCENE_STARTER_CATEGORIES[0]!.value, 'all');
    assert.equal(SCENE_STARTER_CATEGORIES[0]!.label, 'All');
  });

  it('has unique values and non-empty labels', () => {
    const values = SCENE_STARTER_CATEGORIES.map(entry => entry.value);
    assert.equal(new Set(values).size, values.length);
    for (const entry of SCENE_STARTER_CATEGORIES) {
      assert.ok(entry.label.trim().length > 0);
    }
  });

  it('includes every SceneStarterCategory value', () => {
    const expected = ['sport', 'portrait', 'urban', 'nature', 'lifestyle', 'fashion', 'scifi', 'cozy'];
    const values = SCENE_STARTER_CATEGORIES.map(entry => entry.value);
    for (const category of expected) {
      assert.ok(values.includes(category as never), `missing category: ${category}`);
    }
  });
});
