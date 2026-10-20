import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractComfyExecutionErrorMessage, buildComfyHistoryDeletePayload } from "./status";

describe("comfyui status execution errors", () => {
  it("extracts exception_message from execution_error history payload", () => {
    const message = extractComfyExecutionErrorMessage({
      status: {
        status_str: "error",
        completed: false,
        messages: [
          [
            "execution_error",
            {
              prompt_id: "ba5165c6-7d20-4bb0-a891-4666621c6276",
              node_id: "81",
              node_type: "KSamplerAdvanced",
              exception_message:
                "Given normalized_shape=[3584], expected input with shape [*3584], but got input of size[1, 512, 12288]",
              exception_type: "RuntimeError",
            },
          ],
        ],
      },
    });

    assert.match(message ?? "", /KSamplerAdvanced #81:/);
    assert.match(message ?? "", /normalized_shape=\[3584\]/);
  });
});

describe("buildComfyHistoryDeletePayload", () => {
  it("trims, drops empties, and de-duplicates prompt ids", () => {
    assert.deepEqual(
      buildComfyHistoryDeletePayload([" abc ", "", "abc", "def"]),
      { delete: ["abc", "def"] },
    );
  });

  it("returns an empty delete list when nothing is usable", () => {
    assert.deepEqual(buildComfyHistoryDeletePayload(["  ", ""]), { delete: [] });
  });
});
