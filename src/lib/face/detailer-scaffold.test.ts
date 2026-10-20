import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFaceDetailerWorkflowScaffold } from "../workflow/scaffold";
import { FACE_DETAIL_IMAGE_TOKEN } from "../gallery/output-face-detail";

describe("buildFaceDetailerWorkflowScaffold", () => {
  it("includes LoadImage/SaveImage and face-detail tokens", () => {
    const result = buildFaceDetailerWorkflowScaffold();
    assert.ok(result.json.includes("LoadImage"));
    assert.ok(result.json.includes("SaveImage"));
    assert.ok(result.json.includes(FACE_DETAIL_IMAGE_TOKEN));
    assert.ok(result.notes.length > 0);
  });
});
