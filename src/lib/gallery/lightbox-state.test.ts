import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GalleryLightboxPlaylist } from "./comfyui-gallery";

function playlist(overrides: Partial<GalleryLightboxPlaylist> = {}): GalleryLightboxPlaylist {
  return {
    images: ["img1", "img2", "img3"],
    thumbImages: ["thumb1", "thumb2", "thumb3"],
    originalImages: ["orig1", "orig2", "orig3"],
    downloadUrls: ["dl1", "dl2", "dl3"],
    downloadFilenames: ["a.png", "b.png", "c.png"],
    titles: ["Title A", "Title B", "Title C"],
    mediaKinds: ["image", "image", "image"],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("buildLightboxStateFromPlaylist", async () => {
  const { buildLightboxStateFromPlaylist } = await import("./lightbox-state");

  it("returns null for an empty playlist", () => {
    assert.equal(buildLightboxStateFromPlaylist(playlist({ images: [] }), 0), null);
  });

  it("builds state at the requested index, carrying every parallel array through", () => {
    const state = buildLightboxStateFromPlaylist(playlist(), 1);
    assert.equal(state?.index, 1);
    assert.equal(state?.title, "Title B");
    assert.deepEqual(state?.images, ["img1", "img2", "img3"]);
    assert.deepEqual(state?.thumbImages, ["thumb1", "thumb2", "thumb3"]);
    assert.deepEqual(state?.originalImages, ["orig1", "orig2", "orig3"]);
    assert.deepEqual(state?.downloadUrls, ["dl1", "dl2", "dl3"]);
    assert.deepEqual(state?.downloadFilenames, ["a.png", "b.png", "c.png"]);
    assert.deepEqual(state?.mediaKinds, ["image", "image", "image"]);
  });

  it("clamps a negative index up to 0", () => {
    const state = buildLightboxStateFromPlaylist(playlist(), -5);
    assert.equal(state?.index, 0);
    assert.equal(state?.title, "Title A");
  });

  it("clamps an out-of-range index down to the last slide", () => {
    const state = buildLightboxStateFromPlaylist(playlist(), 99);
    assert.equal(state?.index, 2);
    assert.equal(state?.title, "Title C");
  });
});
