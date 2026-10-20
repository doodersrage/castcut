import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareWorkflowJsonImport } from "./import";

describe("prepareWorkflowJsonImport", () => {
  const apiWorkflow = {
    "3": {
      class_type: "KSampler",
      inputs: { seed: 0, steps: 20, cfg: 7 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: "a scenic mountain trail", clip: ["4", 0] },
      _meta: { title: "positive prompt" },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, watermark", clip: ["4", 0] },
      _meta: { title: "negative prompt" },
    },
  };

  it("accepts raw ComfyUI API JSON and auto-applies placeholders", () => {
    const result = prepareWorkflowJsonImport(JSON.stringify(apiWorkflow));
    assert.equal(result.ok, true);
    assert.ok(result.workflowJson?.includes("{{POSITIVE}}"));
    assert.ok(result.workflowJson?.includes("{{NEGATIVE}}"));
    assert.ok((result.autoAppliedBindings ?? 0) >= 1);
    assert.equal(result.placeholders?.positive, 1);
  });

  it("unwraps prompt wrapper objects", () => {
    const result = prepareWorkflowJsonImport(
      JSON.stringify({ prompt: apiWorkflow }),
    );
    assert.equal(result.ok, true);
    assert.ok(result.workflowJson?.includes('"6"'));
  });

  it("rejects ComfyUI UI exports with actionable detail", () => {
    const result = prepareWorkflowJsonImport(
      JSON.stringify({ nodes: [{ id: 1 }], links: [] }),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /UI workflow/i);
    assert.match(result.errorDetail ?? "", /API Format/i);
  });

  it("includes parser message for invalid JSON", () => {
    const result = prepareWorkflowJsonImport("{ not json");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Invalid JSON:/i);
    assert.ok(result.errorDetail);
  });

  it("strips UTF-8 BOM before parsing", () => {
    const result = prepareWorkflowJsonImport(
      `\ufeff${JSON.stringify(apiWorkflow)}`,
    );
    assert.equal(result.ok, true);
  });

  it("explains unrecognized top-level keys", () => {
    const result = prepareWorkflowJsonImport(
      JSON.stringify({ metadata: { version: 1 }, config: { foo: "bar" } }),
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /No ComfyUI API workflow/i);
    assert.match(result.errorDetail ?? "", /Top-level keys/i);
    assert.match(result.errorDetail ?? "", /metadata/);
  });

  it("parses double-encoded JSON strings", () => {
    const result = prepareWorkflowJsonImport(JSON.stringify(JSON.stringify(apiWorkflow)));
    assert.equal(result.ok, true);
    assert.ok(result.workflowJson?.includes('"6"'));
  });
});
