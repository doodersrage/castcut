import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyUploadedImage } from './comfyui/image-upload';

let uploadImpl: (input: unknown) => Promise<ComfyUploadedImage> = async () => ({
  name: 'uploaded.png',
  width: 512,
  height: 512,
  subfolder: 'input',
  type: 'input',
  comfyUrl: 'http://127.0.0.1:8188',
});
const uploadComfyInputImage = mock.fn((input: unknown) => uploadImpl(input));
mock.module('./comfyui/image-upload', { namedExports: { uploadComfyInputImage } });

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) =>
    Promise.resolve(impl(url, init))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

afterEach(() => {
  uploadComfyInputImage.mock.resetCalls();
  uploadImpl = async () => ({
    name: 'uploaded.png',
    width: 512,
    height: 512,
    subfolder: 'input',
    type: 'input',
    comfyUrl: 'http://127.0.0.1:8188',
  });
});

describe('queue-input-image', async () => {
  const { resolveQueueInputImage, resolveQueueInputImageFilename } = await import(
    './queue-input-image'
  );

  describe('with a file', () => {
    it('uploads the file and returns its dimensions/metadata', async () => {
      const file = new File(['data'], 'photo.png', { type: 'image/png' });
      const result = await resolveQueueInputImage({ file, model: 'sdxl', kind: 'image' });
      assert.deepEqual(result, {
        filename: 'uploaded.png',
        width: 512,
        height: 512,
        subfolder: 'input',
        type: 'input',
        comfyUrl: 'http://127.0.0.1:8188',
      });
      assert.equal(uploadComfyInputImage.mock.calls.length, 1);
      const arg = uploadComfyInputImage.mock.calls[0]!.arguments[0] as { file: File; kind?: string };
      assert.equal(arg.file, file);
      assert.equal(arg.kind, 'image');
    });

    it('takes priority over imageUrl and filename when both are present', async () => {
      const file = new File(['data'], 'photo.png');
      await resolveQueueInputImage({ file, imageUrl: 'https://example.com/x.png', filename: 'x.png' });
      assert.equal(uploadComfyInputImage.mock.calls.length, 1);
    });
  });

  describe('with an imageUrl', () => {
    it('fetches the URL, wraps it as a File, and uploads it', async () => {
      const restore = installFetchStub(
        () =>
          new Response('binary data', {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          })
      );
      try {
        const result = await resolveQueueInputImage({
          imageUrl: 'https://example.com/pic.jpg',
          filename: 'my-pic.jpg',
        });
        assert.equal(result!.filename, 'uploaded.png');
        const arg = uploadComfyInputImage.mock.calls[0]!.arguments[0] as { file: File };
        assert.equal(arg.file.name, 'my-pic.jpg');
        assert.equal(arg.file.type, 'image/jpeg');
      } finally {
        restore();
      }
    });

    it('generates a timestamped filename when none is given', async () => {
      const restore = installFetchStub(() => new Response('data', { status: 200 }));
      try {
        await resolveQueueInputImage({ imageUrl: 'https://example.com/pic.jpg' });
        const arg = uploadComfyInputImage.mock.calls[0]!.arguments[0] as { file: File };
        assert.match(arg.file.name, /^prompt-studio-\d+\.png$/);
      } finally {
        restore();
      }
    });

    it('throws when the fetch response is not ok', async () => {
      const restore = installFetchStub(() => new Response('', { status: 404 }));
      try {
        await assert.rejects(
          () => resolveQueueInputImage({ imageUrl: 'https://example.com/missing.jpg' }),
          /HTTP 404/
        );
      } finally {
        restore();
      }
    });

    it('ignores a blank imageUrl and falls through to the filename branch', async () => {
      const result = await resolveQueueInputImage({ imageUrl: '   ', filename: 'existing.png' });
      assert.deepEqual(result, { filename: 'existing.png' });
      assert.equal(uploadComfyInputImage.mock.calls.length, 0);
    });
  });

  describe('with only a filename', () => {
    it('returns the trimmed existing filename without uploading', async () => {
      const result = await resolveQueueInputImage({ filename: '  existing.png  ' });
      assert.deepEqual(result, { filename: 'existing.png' });
      assert.equal(uploadComfyInputImage.mock.calls.length, 0);
    });

    it('returns undefined when there is nothing to resolve', async () => {
      const result = await resolveQueueInputImage({});
      assert.equal(result, undefined);
    });
  });

  describe('resolveQueueInputImageFilename', () => {
    it('returns just the filename from resolveQueueInputImage', async () => {
      const filename = await resolveQueueInputImageFilename({ filename: 'existing.png' });
      assert.equal(filename, 'existing.png');
    });

    it('returns undefined when resolveQueueInputImage resolves to undefined', async () => {
      const filename = await resolveQueueInputImageFilename({});
      assert.equal(filename, undefined);
    });
  });
});
