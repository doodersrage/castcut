import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  galleryUploadPromptFallback,
  galleryUploadPromptLooksGeneric,
  isGalleryImportImageFile,
  MAX_GALLERY_UPLOAD_BYTES,
  sanitizeGalleryUploadFilename,
} from './local-import';

describe('gallery local import', () => {
  it('accepts common still formats and rejects empty or oversized files', () => {
    assert.equal(
      isGalleryImportImageFile({ type: 'image/jpeg', name: 'a.jpg', size: 1200 }),
      true
    );
    assert.equal(
      isGalleryImportImageFile({ type: 'image/png', name: 'a.png', size: 1200 }),
      true
    );
    assert.equal(isGalleryImportImageFile({ type: '', name: 'still.webp', size: 800 }), true);
    assert.equal(isGalleryImportImageFile({ type: 'image/svg+xml', name: 'a.svg', size: 800 }), false);
    assert.equal(isGalleryImportImageFile({ type: 'image/png', name: 'a.png', size: 0 }), false);
    assert.equal(
      isGalleryImportImageFile({
        type: 'image/png',
        name: 'a.png',
        size: MAX_GALLERY_UPLOAD_BYTES + 1,
      }),
      false
    );
  });

  it('sanitizes filenames and builds a prompt fallback from the stem', () => {
    assert.equal(sanitizeGalleryUploadFilename('C:\\\\pics\\\\my still (1).png'), 'my still (1).png');
    assert.equal(sanitizeGalleryUploadFilename('weird<>name.jpeg'), 'weird_name.jpeg');
    assert.equal(galleryUploadPromptFallback('harbor-dawn.png'), 'harbor-dawn');
  });

  it('treats filename-only upload prompts as generic for vision captioning', () => {
    assert.equal(
      galleryUploadPromptLooksGeneric({
        tool: 'upload',
        prompt: 'harbor-dawn',
        images: [{ filename: 'harbor-dawn.png' }],
      }),
      true
    );
    assert.equal(
      galleryUploadPromptLooksGeneric({
        tool: 'upload',
        prompt: 'Uploaded still',
        images: [{ filename: 'ComfyUI_00001_.png' }],
      }),
      true
    );
    assert.equal(
      galleryUploadPromptLooksGeneric({
        tool: 'upload',
        prompt: 'a woman in a red coat standing on a wet pier, cinematic lighting',
        images: [{ filename: 'harbor-dawn.png' }],
      }),
      false
    );
    assert.equal(
      galleryUploadPromptLooksGeneric({
        tool: 'generate',
        prompt: 'harbor-dawn',
        images: [{ filename: 'harbor-dawn.png' }],
      }),
      false
    );
  });
});
