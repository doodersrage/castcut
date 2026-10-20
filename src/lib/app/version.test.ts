import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareSemver, isNewerVersion, parseSemver } from './version';

describe('app-version semver helpers', () => {
  it('parses vX.Y.Z and X.Y.Z, ignoring pre-release/build suffixes', () => {
    assert.deepEqual(parseSemver('v1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
    assert.deepEqual(parseSemver('v1.2.3-beta.1'), [1, 2, 3]);
    assert.deepEqual(parseSemver('v1.2.3+build.5'), [1, 2, 3]);
    assert.equal(parseSemver('Initial-Release'), null);
    assert.equal(parseSemver('latest'), null);
  });

  it('compares versions numerically, not lexically', () => {
    assert.equal(compareSemver('1.9.0', '1.10.0'), -1);
    assert.equal(compareSemver('2.0.0', '1.99.99'), 1);
    assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
    assert.equal(compareSemver('v0.3.4', '0.3.4'), 0);
    assert.equal(compareSemver('bogus', '1.0.0'), null);
  });

  it('flags a newer candidate version', () => {
    assert.equal(isNewerVersion('0.3.4', '0.4.0'), true);
    assert.equal(isNewerVersion('0.3.4', '0.3.4'), false);
    assert.equal(isNewerVersion('0.3.4', '0.3.0'), false);
    assert.equal(isNewerVersion('0.3.4', 'Initial-Release'), false);
  });
});
