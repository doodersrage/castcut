import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeComfyApiWorkflow,
  parseWorkflowJson,
  findUnresolvedLoaderPlaceholders,
  listWorkflowNodeIds,
  countPlaceholders,
  detectWorkflowPlaceholders,
  normalizeCustomWorkflowTokens,
  resolveCustomWorkflowTokens,
  detectCustomWorkflowPlaceholders,
} from "./json-parse";
import type { ComfyUiRuntimeConfig } from "../comfyui/config";

describe("normalizeComfyApiWorkflow", () => {
  it("returns the same object when it already has numeric node keys", () => {
    const wf = { "1": { class_type: "A" }, "2": { class_type: "B" } };
    assert.equal(normalizeComfyApiWorkflow(wf), wf);
  });

  it("unwraps a nested 'prompt' object when the top level has no node keys", () => {
    const nested = { "1": { class_type: "A" } };
    const wf = { prompt: nested, meta: "x" };
    assert.equal(normalizeComfyApiWorkflow(wf), nested);
  });

  it("prefers 'prompt' over 'workflow' over 'graph' when multiple are present", () => {
    const promptNested = { "1": { a: 1 } };
    const workflowNested = { "2": { b: 2 } };
    const wf = { prompt: promptNested, workflow: workflowNested };
    assert.equal(normalizeComfyApiWorkflow(wf), promptNested);
  });

  it("returns the original value unchanged when no numeric keys are found anywhere", () => {
    const wf = { foo: "bar" };
    assert.equal(normalizeComfyApiWorkflow(wf), wf);
  });
});

describe("parseWorkflowJson", () => {
  it("parses and normalizes a valid workflow object", () => {
    assert.deepEqual(parseWorkflowJson('{"1":{"class_type":"A"}}'), {
      "1": { class_type: "A" },
    });
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseWorkflowJson("{not json"), null);
  });

  it("returns null for a JSON array (not an object)", () => {
    assert.equal(parseWorkflowJson("[1,2,3]"), null);
  });

  it("returns null for blank, undefined, or whitespace-only input", () => {
    assert.equal(parseWorkflowJson(""), null);
    assert.equal(parseWorkflowJson(undefined), null);
    assert.equal(parseWorkflowJson("   "), null);
  });

  it("unwraps a nested 'prompt' key while parsing", () => {
    assert.deepEqual(
      parseWorkflowJson('{"prompt":{"1":{"class_type":"A"}},"extra":1}'),
      { "1": { class_type: "A" } },
    );
  });
});

describe("findUnresolvedLoaderPlaceholders", () => {
  it("finds unet/vae/checkpoint tokens and full LORA_* placeholder matches, skipping non-object nodes and missing inputs", () => {
    const wf = {
      "1": { inputs: { ckpt_name: "{{CHECKPOINT}}", other: "no token here" } },
      "2": { inputs: { lora_name: "{{LORA_FOO}}", vae_name: "{{VAE}}" } },
      "3": { inputs: { partial: "prefix {{LORA_BAD" } },
      "4": "not an object",
      "5": { inputs: undefined },
    };
    assert.deepEqual(findUnresolvedLoaderPlaceholders(wf).sort(), [
      "{{CHECKPOINT}}",
      "{{LORA_FOO}}",
      "{{VAE}}",
    ]);
  });
});

describe("listWorkflowNodeIds", () => {
  it("filters to purely-numeric keys and sorts them numerically (not lexicographically)", () => {
    const wf = { "10": {}, "2": {}, "1": {}, prompt: {}, abc: {} };
    assert.deepEqual(listWorkflowNodeIds(wf), ["1", "2", "10"]);
  });
});

describe("countPlaceholders", () => {
  it("counts non-overlapping occurrences", () => {
    assert.equal(countPlaceholders("{{SEED}} and {{SEED}} again", "{{SEED}}"), 2);
    assert.equal(countPlaceholders("aaaa", "aa"), 2);
  });

  it("returns 0 for no match, empty raw, or an empty token", () => {
    assert.equal(countPlaceholders("", "{{SEED}}"), 0);
    assert.equal(countPlaceholders("hello", "{{SEED}}"), 0);
    assert.equal(countPlaceholders("hello", ""), 0);
  });
});

describe("detectWorkflowPlaceholders", () => {
  it("counts every known token, defaulting positive/negative to the standard tokens", () => {
    const raw = "{{POSITIVE}} {{NEGATIVE}} {{NEGATIVE}} {{SEED}} {{WIDTH}} {{HEIGHT}}";
    assert.deepEqual(detectWorkflowPlaceholders(raw), {
      positive: 1,
      negative: 2,
      seed: 1,
      width: 1,
      height: 1,
      cfg: 0,
      steps: 0,
      sampler: 0,
      scheduler: 0,
      shift: 0,
      fluxMaxShift: 0,
      fluxBaseShift: 0,
      denoise: 0,
      inputImage: 0,
      maskImage: 0,
      initImage: 0,
      videoFrames: 0,
      videoFps: 0,
    });
  });

  it("uses custom positive/negative tokens when given", () => {
    const result = detectWorkflowPlaceholders("{{P}} {{P}} {{N}}", {
      positive: "{{P}}",
      negative: "{{N}}",
    });
    assert.equal(result.positive, 2);
    assert.equal(result.negative, 1);
  });
});

describe("normalizeCustomWorkflowTokens", () => {
  it("trims token/value pairs and drops entries with a blank token or value", () => {
    assert.deepEqual(
      normalizeCustomWorkflowTokens([
        { token: "  {{FOO}}  ", value: "  bar  " },
        { token: "", value: "x" },
        { token: "{{BLANKVAL}}", value: "   " },
        { token: "{{OK}}", value: "yes" },
      ]),
      [
        { token: "{{FOO}}", value: "bar" },
        { token: "{{OK}}", value: "yes" },
      ],
    );
  });

  it("returns [] for undefined or an empty array", () => {
    assert.deepEqual(normalizeCustomWorkflowTokens(undefined), []);
    assert.deepEqual(normalizeCustomWorkflowTokens([]), []);
  });
});

describe("resolveCustomWorkflowTokens", () => {
  it("normalizes runtime.customTokens", () => {
    const runtime = {
      customTokens: [{ token: " {{X}} ", value: " y " }],
    } as unknown as ComfyUiRuntimeConfig;
    assert.deepEqual(resolveCustomWorkflowTokens(runtime), [{ token: "{{X}}", value: "y" }]);
  });

  it("returns [] when runtime is undefined", () => {
    assert.deepEqual(resolveCustomWorkflowTokens(undefined), []);
  });
});

describe("detectCustomWorkflowPlaceholders", () => {
  it("includes only tokens with a nonzero count", () => {
    const raw = "{{FOO}} {{FOO}} some text";
    assert.deepEqual(
      detectCustomWorkflowPlaceholders(raw, [
        { token: "{{FOO}}", value: "a" },
        { token: "{{BAR}}", value: "b" },
      ]),
      { "{{FOO}}": 2 },
    );
  });
});
