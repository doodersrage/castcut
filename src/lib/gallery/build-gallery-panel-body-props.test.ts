import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleGalleryPanelBodyProps } from "./build-gallery-panel-body-props";

describe("assembleGalleryPanelBodyProps", () => {
  it("passes each field through unchanged, wrapping requeueStatus into a status object", () => {
    const input = {
      chrome: "chrome" as never,
      upload: "upload" as never,
      lightbox: "lightbox" as never,
      header: "header" as never,
      requeueStatus: "in progress",
      cap: "cap" as never,
      auxiliary: "auxiliary" as never,
      browse: "browse" as never,
      selection: "selection" as never,
      bulk: "bulk" as never,
      modals: "modals" as never,
      grid: "grid" as never,
      review: "review" as never,
      removeEntries: "removeEntries" as never,
      setFavorites: "setFavorites" as never,
      setRequeueStatus: "setRequeueStatus" as never,
    };
    const result = assembleGalleryPanelBodyProps(input);
    assert.equal(result.chrome, "chrome");
    assert.equal(result.upload, "upload");
    assert.equal(result.lightbox, "lightbox");
    assert.equal(result.header, "header");
    assert.deepEqual(result.status, { requeueStatus: "in progress" });
    assert.equal(result.cap, "cap");
    assert.equal(result.auxiliary, "auxiliary");
    assert.equal(result.browse, "browse");
    assert.equal(result.selection, "selection");
    assert.equal(result.bulk, "bulk");
    assert.equal(result.modals, "modals");
    assert.equal(result.grid, "grid");
    assert.equal(result.review, "review");
    assert.equal(result.removeEntries, "removeEntries");
    assert.equal(result.setFavorites, "setFavorites");
    assert.equal(result.setRequeueStatus, "setRequeueStatus");
    assert.ok(!("requeueStatus" in result));
  });

  it("wraps a null requeueStatus the same way", () => {
    const result = assembleGalleryPanelBodyProps({
      chrome: {} as never,
      upload: {} as never,
      lightbox: {} as never,
      header: {} as never,
      requeueStatus: null,
      cap: {} as never,
      auxiliary: {} as never,
      browse: {} as never,
      selection: {} as never,
      bulk: {} as never,
      modals: {} as never,
      grid: {} as never,
      review: {} as never,
      removeEntries: {} as never,
      setFavorites: {} as never,
      setRequeueStatus: {} as never,
    });
    assert.deepEqual(result.status, { requeueStatus: null });
  });
});
