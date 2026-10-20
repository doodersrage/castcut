import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { extractVideoFirstFrame, extractVideoLastFrame } from './last-frame';

type VideoOpts = {
  duration?: number;
  videoWidth?: number;
  videoHeight?: number;
  simulateError?: boolean;
};

type CanvasOpts = {
  noContext?: boolean;
  emptyBlob?: boolean;
};

class FakeVideo {
  crossOrigin = '';
  muted = false;
  playsInline = false;
  preload = '';
  duration: number;
  videoWidth: number;
  videoHeight: number;
  onerror: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  private _currentTime = 0;
  private simulateError: boolean;
  loadCalls = 0;
  removedSrc = false;

  constructor(opts: VideoOpts) {
    this.duration = opts.duration ?? 10;
    this.videoWidth = opts.videoWidth ?? 640;
    this.videoHeight = opts.videoHeight ?? 480;
    this.simulateError = opts.simulateError ?? false;
  }

  set src(_value: string) {
    queueMicrotask(() => {
      if (this.simulateError) {
        this.onerror?.();
        return;
      }
      this.onloadedmetadata?.();
    });
  }

  get currentTime(): number {
    return this._currentTime;
  }

  set currentTime(value: number) {
    this._currentTime = value;
    queueMicrotask(() => this.onseeked?.());
  }

  removeAttribute(_name: string): void {
    this.removedSrc = true;
  }

  load(): void {
    this.loadCalls += 1;
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  private opts: CanvasOpts;

  constructor(opts: CanvasOpts) {
    this.opts = opts;
  }

  getContext(type: string): { drawImage: () => void } | null {
    if (type !== '2d' || this.opts.noContext) {
      return null;
    }
    return { drawImage: () => {} };
  }

  toBlob(cb: (blob: Blob | null) => void): void {
    if (this.opts.emptyBlob) {
      cb(null);
      return;
    }
    cb(new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' }));
  }
}

function installDocument(videoOpts: VideoOpts, canvasOpts: CanvasOpts = {}) {
  const fakeDocument = {
    createElement: (tag: string) => {
      if (tag === 'video') {
        return new FakeVideo(videoOpts);
      }
      if (tag === 'canvas') {
        return new FakeCanvas(canvasOpts);
      }
      throw new Error(`unexpected tag: ${tag}`);
    },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  return {
    restore: () => {
      delete (globalThis as { document?: unknown }).document;
    },
  };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe('video-last-frame', () => {
  describe('extractVideoFirstFrame / extractVideoLastFrame', () => {
    it('rejects immediately for a blank/empty url', async () => {
      await assert.rejects(extractVideoFirstFrame('   '), /Clip URL is empty/);
      await assert.rejects(extractVideoLastFrame(''), /Clip URL is empty/);
    });

    it('rejects when there is no document (non-browser environment)', async () => {
      await assert.rejects(
        extractVideoFirstFrame('https://example.com/clip.mp4'),
        /needs a browser/
      );
    });

    it('resolves a first-frame blob near the start of the clip', async () => {
      const doc = installDocument({ duration: 10 });
      try {
        const blob = await extractVideoFirstFrame('https://example.com/clip.mp4');
        assert.ok(blob instanceof Blob);
        assert.equal(blob.type, 'image/jpeg');
      } finally {
        doc.restore();
      }
    });

    it('resolves a last-frame blob near the end of the clip', async () => {
      const doc = installDocument({ duration: 10 });
      try {
        const blob = await extractVideoLastFrame('https://example.com/clip.mp4');
        assert.ok(blob instanceof Blob);
      } finally {
        doc.restore();
      }
    });

    it('handles a clip with an unknown/zero duration by seeking to 0', async () => {
      const doc = installDocument({ duration: Number.NaN });
      try {
        const blob = await extractVideoLastFrame('https://example.com/clip.mp4');
        assert.ok(blob instanceof Blob);
      } finally {
        doc.restore();
      }
    });

    it('rejects with "Could not load that clip." when the video fails to load', async () => {
      const doc = installDocument({ simulateError: true });
      try {
        await assert.rejects(
          extractVideoFirstFrame('https://example.com/clip.mp4'),
          /Could not load that clip/
        );
      } finally {
        doc.restore();
      }
    });

    it('rejects when the canvas has no 2d context', async () => {
      const doc = installDocument({}, { noContext: true });
      try {
        await assert.rejects(
          extractVideoFirstFrame('https://example.com/clip.mp4'),
          /Could not draw the first frame/
        );
      } finally {
        doc.restore();
      }
    });

    it('rejects when toBlob produces no blob', async () => {
      const doc = installDocument({}, { emptyBlob: true });
      try {
        await assert.rejects(
          extractVideoLastFrame('https://example.com/clip.mp4'),
          /last frame was empty/
        );
      } finally {
        doc.restore();
      }
    });
  });
});
