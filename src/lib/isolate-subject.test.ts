import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectIsolateSourceUrls,
  compositeRgbaOnFill,
  cutoutLooksIsolated,
  ISOLATE_FILL_NEUTRAL,
  ISOLATE_FILL_WHITE,
  normalizeIsolateSubject,
  parseIsolateFill,
} from './isolate-subject';

describe('isolate-subject', () => {
  it('keeps opaque pixels and fills fully transparent pixels with white', () => {
    const src = new Uint8ClampedArray([
      10, 20, 30, 255, 40, 50, 60, 0,
    ]);
    const out = compositeRgbaOnFill(src);
    assert.equal(out[0], 10);
    assert.equal(out[1], 20);
    assert.equal(out[2], 30);
    assert.equal(out[3], 255);
    assert.equal(out[4], ISOLATE_FILL_WHITE.r);
    assert.equal(out[5], ISOLATE_FILL_WHITE.g);
    assert.equal(out[6], ISOLATE_FILL_WHITE.b);
    assert.equal(out[7], 255);
  });

  it('parseIsolateFill reads hex and rgb fills', () => {
    assert.deepEqual(parseIsolateFill('#c5d0dc'), ISOLATE_FILL_NEUTRAL);
    assert.deepEqual(parseIsolateFill('197,208,220'), ISOLATE_FILL_NEUTRAL);
    assert.equal(parseIsolateFill('nope'), null);
  });

  it('compositeRgbaOnFill accepts a custom mid-gray fill', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 0]);
    const out = compositeRgbaOnFill(src, ISOLATE_FILL_NEUTRAL);
    assert.equal(out[0], ISOLATE_FILL_NEUTRAL.r);
    assert.equal(out[1], ISOLATE_FILL_NEUTRAL.g);
    assert.equal(out[2], ISOLATE_FILL_NEUTRAL.b);
  });

  it('blends semi-transparent pixels onto white', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 128]);
    const out = compositeRgbaOnFill(src);
    assert.equal(out[0], Math.round(255 * (1 - 128 / 255)));
    assert.equal(out[1], out[0]);
    assert.equal(out[2], out[0]);
    assert.equal(out[3], 255);
  });

  it('treats mostly-opaque pixels as not isolated', () => {
    const src = new Uint8ClampedArray(16);
    src[3] = 255;
    src[7] = 255;
    src[11] = 255;
    src[15] = 255;
    assert.equal(cutoutLooksIsolated(src), false);
  });

  it('treats mixed subject and punched-out background as isolated', () => {
    const src = new Uint8ClampedArray(400);
    for (let i = 3; i < 200; i += 4) {
      src[i] = 0;
    }
    for (let i = 203; i < 400; i += 4) {
      src[i] = 255;
    }
    assert.equal(cutoutLooksIsolated(src), true);
  });

  it('defaults isolate on unless explicitly disabled', () => {
    assert.equal(normalizeIsolateSubject(undefined), true);
    assert.equal(normalizeIsolateSubject(true), true);
    assert.equal(normalizeIsolateSubject(false), false);
    assert.equal(normalizeIsolateSubject('false'), false);
    assert.equal(normalizeIsolateSubject(0), false);
  });

  it('collects identity and Comfy view URLs for an already-uploaded photo', () => {
    const urls = collectIsolateSourceUrls({
      imageUrl: 'blob:http://localhost/1',
      filename: 'sam.png',
      comfyUrl: 'http://127.0.0.1:8188',
    });
    assert.deepEqual(urls, [
      'blob:http://localhost/1',
      '/api/gallery/media/identity',
      '/api/comfyui/view?filename=sam.png&subfolder=&type=input&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188',
      '/api/comfyui/view?filename=sam.png&subfolder=&type=output&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188',
    ]);
  });
});
