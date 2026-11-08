import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleFilmBlob,
  SERVER_ENCODE_MAX_MS,
  SERVER_ENCODE_STALL_MS,
  serverEncodeGivenUp,
  stampAssembledFilm,
  stitchSelectedGalleryVideos,
} from "./assemble";

describe("character-film-assemble", () => {
  describe("assembleFilmBlob", () => {
    it("rejects an empty cut before doing any work", async () => {
      await assert.rejects(assembleFilmBlob([]), /Include at least one shot in the cut\./);
    });

    it("rejects outside a browser environment when server encoding is skipped", async () => {
      // In the Node test runner there is no window/document/MediaRecorder, so
      // once the server-encode path is explicitly disabled the browser-canvas
      // recording path must reject with a clear, actionable error instead of
      // throwing a raw ReferenceError from a missing DOM global.
      await assert.rejects(
        assembleFilmBlob(
          [{ title: "Shot 1", url: "http://local/a.mp4", kind: "clip" }],
          { preferServer: false }
        ),
        /Assemble needs a browser that can record canvas video \(or server ffmpeg\)\./
      );
    });
  });

  describe("stampAssembledFilm", () => {
    it("skips persisting an empty (zero-byte) blob without touching the gallery/storage APIs", async () => {
      const blob = new Blob([], { type: "video/webm" });
      const result = await stampAssembledFilm({ blob, filename: "cut.webm" });
      assert.deepEqual(result, { persisted: false, reason: "too-large" });
    });
  });

  describe("stitchSelectedGalleryVideos", () => {
    it("rejects when there are no gallery entries to stitch", async () => {
      await assert.rejects(
        stitchSelectedGalleryVideos({ entries: [] }),
        /Select at least two completed clips to stitch\./
      );
    });
  });
});

describe('waiting for a server encode', () => {
  it('waits while it reports progress, gives up on a stall or past the longest wait', () => {
    const start = 1_000_000;
    // A 30-minute episode encoding for 6.5 minutes, still reporting: keep waiting.
    assert.equal(serverEncodeGivenUp(start, start + 6 * 60_000, start + 6.5 * 60_000), false);
    // Nothing new for over ten minutes: stalled.
    assert.equal(
      serverEncodeGivenUp(start, start + 60_000, start + 60_000 + SERVER_ENCODE_STALL_MS + 1),
      true
    );
    // Still reporting, but past the longest wait.
    const late = start + SERVER_ENCODE_MAX_MS + 1;
    assert.equal(serverEncodeGivenUp(start, late - 1000, late), true);
  });
});

describe("the server cut rides out a failed status ask", () => {
  it("asks again after a failed poll and a failed download, and returns the film", async () => {
    const realFetch = globalThis.fetch;
    const g = globalThis as { window?: unknown };
    const hadWindow = "window" in g;
    g.window = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
    let polls = 0;
    let downloads = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/film/assemble" && (!init || init.method === "GET")) {
        return Response.json({ available: true });
      }
      if (url === "/api/film/assemble" && init?.method === "POST") {
        return Response.json({ job: { id: "job-1" } });
      }
      if (url.includes("download=1")) {
        downloads += 1;
        if (downloads === 1) throw new TypeError("Failed to fetch");
        return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }));
      }
      polls += 1;
      if (polls === 1) throw new TypeError("Failed to fetch");
      return Response.json({ job: { status: "completed", ratio: 1, label: "Encode complete" } });
    }) as typeof fetch;
    try {
      const film = await assembleFilmBlob([
        { id: "a", kind: "still", url: "/a.png", seconds: 2 } as never,
      ]);
      assert.equal(film.encodePath, "server");
      assert.equal(film.blob.size, 3);
      assert.equal(polls, 2);
      assert.equal(downloads, 2);
    } finally {
      globalThis.fetch = realFetch;
      if (!hadWindow) delete g.window;
    }
  });
});
