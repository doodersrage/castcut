import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isIdentityMissingFileError,
  resolveIdentityLockApiUrl,
  shouldRelocateIdentityLock,
} from './identity-lock-host';

describe('resolveIdentityLockApiUrl', () => {
  it('pins to the upload host when a face filename is set', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: 'face.png',
        ipAdapterComfyUrl: 'http://127.0.0.1:8188',
      }),
      'http://127.0.0.1:8188'
    );
  });

  it('does not pin when the face is cleared', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: '',
        ipAdapterComfyUrl: 'http://127.0.0.1:8188',
      }),
      undefined
    );
  });

  it('does not pin when the host is missing', () => {
    assert.equal(
      resolveIdentityLockApiUrl({
        ipAdapterImageFilename: 'face.png',
        ipAdapterComfyUrl: '  ',
      }),
      undefined
    );
  });
});

describe('isIdentityMissingFileError', () => {
  it('detects LoadImage missing-file failures', () => {
    assert.equal(isIdentityMissingFileError('LoadImage failed: image does not exist'), true);
    assert.equal(isIdentityMissingFileError('Invalid image file: face.png'), true);
    assert.equal(isIdentityMissingFileError('CUDA out of memory'), false);
  });
});

describe('shouldRelocateIdentityLock', () => {
  it('is true for dead hosts and missing identity files', () => {
    assert.equal(shouldRelocateIdentityLock('ECONNREFUSED 127.0.0.1:8188'), true);
    assert.equal(shouldRelocateIdentityLock('LoadImage: face.png not found'), true);
    assert.equal(shouldRelocateIdentityLock('Invalid workflow JSON'), false);
  });
});
