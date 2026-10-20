import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import type { ComfyGalleryEntry } from '../comfyui-gallery';
import type { RoleplayStoryBeat } from './roleplay';

const buildZipBlob = mock.fn((files: Array<{ filename: string; data: Uint8Array }>) => {
  const total = files.reduce((sum, f) => sum + f.data.length, 0);
  return new Blob([`zip:${files.length}:${total}`], { type: 'application/zip' });
});
mock.module('../gallery-zip-export', { namedExports: { buildZipBlob } });

let galleryEntries: ComfyGalleryEntry[] = [];
const loadComfyGallery = mock.fn(() => galleryEntries);
const galleryEntryLightboxUrls = mock.fn((_entry: ComfyGalleryEntry) => [] as string[]);
const galleryEntryPrimaryViewUrl = mock.fn((_entry: ComfyGalleryEntry) => null as string | null);
mock.module('../comfyui-gallery', {
  namedExports: { loadComfyGallery, galleryEntryLightboxUrls, galleryEntryPrimaryViewUrl },
});

const formatRoleplayStoryMarkdown = mock.fn((_input: unknown) => '# Story markdown');
const lastCompletedRoleplayStillUrl = mock.fn((_beat: RoleplayStoryBeat) => null as string | null);
const roleplayBeatPromptIds = mock.fn((_beat: RoleplayStoryBeat) => [] as string[]);
const roleplayStillBasename = mock.fn((title: string, index: number) => `${index}-${title}`);
const slugRoleplayExportPart = mock.fn((value: string, _fallback: string) => value.toLowerCase());
mock.module('./roleplay', {
  namedExports: {
    formatRoleplayStoryMarkdown,
    lastCompletedRoleplayStillUrl,
    roleplayBeatPromptIds,
    roleplayStillBasename,
    slugRoleplayExportPart,
  },
});

type FetchImpl = (url: string) => Response | Promise<Response>;
function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(url);
    return Promise.resolve(impl(url));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function binaryResponse(bytes: string, contentType: string | null, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => new TextEncoder().encode(bytes).buffer,
    blob: async () => new Blob([bytes], { type: contentType ?? 'application/octet-stream' }),
  } as unknown as Response;
}

function installDom(): { hrefs: string[]; downloads: string[]; clicks: number } {
  const hrefs: string[] = [];
  const downloads: string[] = [];
  let clicks = 0;
  const RealURL = URL;
  Object.defineProperty(globalThis, 'URL', {
    configurable: true,
    value: Object.assign(RealURL, {
      createObjectURL: mock.fn(() => 'blob:mock-url'),
      revokeObjectURL: mock.fn((_url: string) => {}),
    }),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, 'a');
        return {
          set href(value: string) {
            hrefs.push(value);
          },
          set download(value: string) {
            downloads.push(value);
          },
          click: () => {
            clicks += 1;
          },
        };
      },
    },
  });
  return { hrefs, downloads, get clicks() {
    return clicks;
  } };
}

function beat(overrides: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat {
  return {
    id: 'beat-1',
    title: 'Opening Scene',
    blurb: 'x',
    at: 0,
    ...overrides,
  };
}

function resetMocks() {
  galleryEntries = [];
  for (const m of [
    buildZipBlob,
    loadComfyGallery,
    galleryEntryLightboxUrls,
    galleryEntryPrimaryViewUrl,
    formatRoleplayStoryMarkdown,
    lastCompletedRoleplayStillUrl,
    roleplayBeatPromptIds,
    roleplayStillBasename,
    slugRoleplayExportPart,
  ]) {
    m.mock.resetCalls();
  }
  galleryEntryLightboxUrls.mock.mockImplementation(() => []);
  galleryEntryPrimaryViewUrl.mock.mockImplementation(() => null);
  lastCompletedRoleplayStillUrl.mock.mockImplementation(() => null);
  roleplayBeatPromptIds.mock.mockImplementation(() => []);
  delete (globalThis as { document?: unknown }).document;
}

afterEach(resetMocks);

describe('roleplay-export', async () => {
  const { downloadRoleplayUrl, downloadRoleplayStoryBundle } = await import('./roleplay-export');

  describe('downloadRoleplayUrl', () => {
    it('fetches the url and triggers a download of the resulting blob', async () => {
      const { hrefs, downloads } = installDom();
      const stub = installFetchStub(() => binaryResponse('data', 'image/png'));
      try {
        await downloadRoleplayUrl('https://example.com/x.png', 'output.png');
        assert.equal(stub.calls.length, 1);
        assert.deepEqual(hrefs, ['blob:mock-url']);
        assert.deepEqual(downloads, ['output.png']);
      } finally {
        stub.restore();
      }
    });

    it('throws when the fetch response is not ok', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('', null, false));
      try {
        await assert.rejects(
          () => downloadRoleplayUrl('https://example.com/missing.png', 'x.png'),
          /Download failed \(HTTP 404\)/
        );
      } finally {
        stub.restore();
      }
    });
  });

  describe('downloadRoleplayStoryBundle', () => {
    it('builds a zip with story.md plus a still per beat (from gallery lookup), triggers download, and reports counts', async () => {
      installDom();
      galleryEntries = [{ id: 'g1', promptId: 'prompt-1' } as ComfyGalleryEntry];
      galleryEntryLightboxUrls.mock.mockImplementation(() => ['https://example.com/still.jpg']);
      const stub = installFetchStub(() => binaryResponse('image-bytes', 'image/jpeg'));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ promptId: 'prompt-1' })],
        });
        assert.equal(result.files, 2); // story.md + 1 still
        assert.equal(result.stills, 1);
        assert.equal(result.clips, 0);
        assert.equal(buildZipBlob.mock.calls.length, 1);
        const files = buildZipBlob.mock.calls[0]!.arguments[0] as Array<{ filename: string }>;
        assert.equal(files[0]!.filename, 'story.md');
        assert.ok(files[1]!.filename.startsWith('stills/'));
        assert.ok(files[1]!.filename.endsWith('.jpg'));
      } finally {
        stub.restore();
      }
    });

    it('counts a beat with no resolvable still/clip url as null without fetching', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('x', 'image/png'));
      try {
        const result = await downloadRoleplayStoryBundle({ story: [beat()] });
        assert.equal(result.stills, 0);
        assert.equal(result.clips, 0);
        assert.equal(stub.calls.length, 0);
      } finally {
        stub.restore();
      }
    });

    it('falls back to a completed still imageUrl when no gallery entry matches', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('x', 'image/png'));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ stillStatus: 'completed', imageUrl: 'https://example.com/still2.png' })],
        });
        assert.equal(result.stills, 1);
      } finally {
        stub.restore();
      }
    });

    it('counts a still fetch failure (non-ok or thrown) as null without throwing', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('', null, false));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ stillStatus: 'completed', imageUrl: 'https://example.com/x.png' })],
        });
        assert.equal(result.stills, 0);
      } finally {
        stub.restore();
      }
    });

    it('falls back to a matching gallery entry for a non-completed clip with a clipPromptId', async () => {
      installDom();
      galleryEntries = [{ id: 'g1', promptId: 'clip-prompt-1' } as ComfyGalleryEntry];
      galleryEntryLightboxUrls.mock.mockImplementation(() => []);
      galleryEntryPrimaryViewUrl.mock.mockImplementation(() => 'https://example.com/from-gallery.mp4');
      const stub = installFetchStub(() => binaryResponse('clip-bytes', 'video/mp4'));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ clipPromptId: 'clip-prompt-1' })],
        });
        assert.equal(result.clips, 1);
      } finally {
        stub.restore();
      }
    });

    it('counts a clip fetch failure (non-ok) as null without throwing', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('', null, false));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ clipStatus: 'completed', clipUrl: 'https://example.com/clip.mp4' })],
        });
        assert.equal(result.clips, 0);
      } finally {
        stub.restore();
      }
    });

    it('includes a completed clip and counts it', async () => {
      installDom();
      const stub = installFetchStub(() => binaryResponse('clip-bytes', 'video/mp4'));
      try {
        const result = await downloadRoleplayStoryBundle({
          story: [beat({ clipStatus: 'completed', clipUrl: 'https://example.com/clip.mp4' })],
        });
        assert.equal(result.clips, 1);
        const files = buildZipBlob.mock.calls[0]!.arguments[0] as Array<{ filename: string }>;
        assert.ok(files.some(f => f.filename.startsWith('clips/') && f.filename.endsWith('.mp4')));
      } finally {
        stub.restore();
      }
    });

    it('includes the film file when film data is non-empty, and passes filmFilename to the markdown formatter', async () => {
      installDom();
      const result = await downloadRoleplayStoryBundle({
        story: [],
        film: { filename: 'movie.mp4', data: new Uint8Array([1, 2, 3]) },
      });
      assert.equal(result.files, 2); // story.md + film
      const markdownArg = formatRoleplayStoryMarkdown.mock.calls[0]!.arguments[0] as {
        filmFilename: string | null;
      };
      assert.equal(markdownArg.filmFilename, 'movie.mp4');
    });

    it('omits the film file when film.data is empty', async () => {
      installDom();
      const result = await downloadRoleplayStoryBundle({
        story: [],
        film: { filename: 'movie.mp4', data: new Uint8Array([]) },
      });
      assert.equal(result.files, 1); // story.md only
    });

    it("builds the zip filename from the bio name (slugified) and today's date", async () => {
      slugRoleplayExportPart.mock.mockImplementation((value: string) =>
        value.toLowerCase().replace(/\s+/g, '-')
      );
      const { downloads } = installDom();
      await downloadRoleplayStoryBundle({
        story: [],
        bio: { name: 'Captain Nib', look: 'x', personality: 'y' },
      });
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(downloads[0], `roleplay-captain-nib-${today}.zip`);
    });
  });
});
