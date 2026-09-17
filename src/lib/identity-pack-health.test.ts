import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getIpAdapterHealth,
  isIdentityPackReady,
  shouldWarnIdentityPackMissing,
} from './identity-pack-health';

describe('identity-pack-health', () => {
  it('marks IP-Adapter ready when inventory has loader nodes', () => {
    const health = getIpAdapterHealth(['IPAdapterModelLoader', 'KSampler']);
    assert.equal(health.kind, 'ipadapter');
    assert.equal(health.status, 'ready');
    assert.equal(isIdentityPackReady(['IPAdapterModelLoader']), true);
  });

  it('warns when face is locked but no identity pack is ready', () => {
    assert.equal(
      shouldWarnIdentityPackMissing({
        hasFaceLock: true,
        availableNodeTypes: ['KSampler'],
      }),
      true
    );
    assert.equal(
      shouldWarnIdentityPackMissing({
        hasFaceLock: true,
        availableNodeTypes: ['IPAdapterApply'],
      }),
      false
    );
    assert.equal(
      shouldWarnIdentityPackMissing({
        hasFaceLock: false,
        availableNodeTypes: ['KSampler'],
      }),
      false
    );
  });
});
