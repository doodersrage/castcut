import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  contentAddressedInputName,
  inputNamePrefix,
  isContentAddressedInputName,
} from './comfy-input-name';
import { isMultiPersonPoseGuide, isPlayerPoseGuide } from './qwen-image-21-renderer';

const HASH = '0123456789abcdef'.repeat(4);

describe('comfy-input-name', () => {
  it('drops per-upload stamps and keeps the meaningful prefix', () => {
    assert.equal(inputNamePrefix('day-nude-face-1791063803863.png'), 'day-nude-face');
    assert.equal(inputNamePrefix('nora-cutout-umuro9zni.png'), 'nora-cutout');
    assert.equal(
      inputNamePrefix('castcut-isolate-1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.png'),
      'castcut-isolate'
    );
    assert.equal(
      inputNamePrefix('day-pose-guide-arms_up-396ed2-x1-1790897484406.png'),
      'day-pose-guide-arms_up-396ed2-x1'
    );
    assert.equal(inputNamePrefix('day-vacation-keep-day-1k2j3h4.png'), 'day-vacation-keep-day-1k2j3h4');
    assert.equal(inputNamePrefix('image (2).jpg'), 'image');
    assert.equal(inputNamePrefix('sub/folder/IMG 0001.JPG'), 'IMG-0001');
    assert.equal(inputNamePrefix('.png'), 'upload');
  });

  it('names a file by its bytes, once — re-hashing a hashed name does not stack hashes', () => {
    const name = contentAddressedInputName('day-nude-face-1791063803863.png', HASH);
    assert.equal(name, 'day-nude-face-0123456789abcdef.png');
    assert.equal(isContentAddressedInputName(name), true);
    assert.equal(
      contentAddressedInputName(name, 'fedcba9876543210'.repeat(4)),
      'day-nude-face-fedcba9876543210.png'
    );
    // A cut-out of a hashed upload loses the source's hash, keeps "-cutout".
    assert.equal(
      contentAddressedInputName('Nora-0123456789abcdef-cutout-umuro9zni.png', 'ab'.repeat(32)),
      'Nora-cutout-abababababababab.png'
    );
    assert.equal(contentAddressedInputName('photo.JPEG', HASH), 'photo-0123456789abcdef.jpeg');
    assert.equal(contentAddressedInputName('no-extension', HASH), 'no-extension-0123456789abcdef.png');
    assert.throws(() => contentAddressedInputName('a.png', 'not-hex'));
  });

  it('keeps the name parts queue code reads', () => {
    const photo = contentAddressedInputName(
      'day-pose-guide-walk-down-down-e05f5d-photo-1790897484406.png',
      HASH
    );
    assert.equal(isPlayerPoseGuide(photo), true);
    const duo = contentAddressedInputName('day-pose-guide-lap-59c64f-x2-1790.png', HASH);
    assert.equal(isMultiPersonPoseGuide(duo), true);
    assert.match(contentAddressedInputName('day-partner-vl-1791063803863.png', HASH), /^day-partner-vl-/);
    assert.match(
      contentAddressedInputName('day-vacation-face-day-1k2j3h4.png', HASH),
      /^day-vacation-face[-_]/
    );
  });

  it('does not mistake other names for content-addressed ones', () => {
    assert.equal(isContentAddressedInputName('PromptStudio_00163_.png'), false);
    assert.equal(isContentAddressedInputName('4f2479af932248834f9545a7d6df247e.png'), false);
    assert.equal(isContentAddressedInputName('x-0123456789abcdef.png'), true);
  });
});
