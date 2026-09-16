import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assembleFilmBlob,
  stampAssembledFilm,
  stitchSelectedGalleryVideos,
} from "./character-film-assemble";

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
