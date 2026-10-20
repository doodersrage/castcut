import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertIdentityChainIfMissing } from "./identity-workflow-patch";

function baseWorkflow(): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "model.safetensors" },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        seed: 42,
        steps: 20,
        cfg: 7,
      },
    },
  };
}

describe("insertIdentityChainIfMissing", () => {
  it("is a no-op returning the same workflow reference when imageFilename is missing or whitespace-only", () => {
    const wf = baseWorkflow();
    const r1 = insertIdentityChainIfMissing(wf, {});
    assert.equal(r1.workflow, wf);
    assert.equal(r1.inserted, false);
    assert.deepEqual(r1.insertedNodeIds, []);

    const r2 = insertIdentityChainIfMissing(wf, { imageFilename: "   " });
    assert.equal(r2.workflow, wf);
    assert.equal(r2.inserted, false);
  });

  it("is a no-op when the workflow already contains an identity node", () => {
    const wf = baseWorkflow();
    (wf as Record<string, unknown>)["9"] = { class_type: "ApplyInstantID", inputs: {} };
    const r = insertIdentityChainIfMissing(wf, { imageFilename: "face.png" });
    assert.equal(r.workflow, wf);
    assert.equal(r.inserted, false);
    assert.deepEqual(r.insertedNodeIds, []);
  });

  it("defaults to instantid when no availableNodeTypes list is given (auto checks instantid first)", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, { imageFilename: "face.png" });
    assert.equal(r.inserted, true);
    assert.equal(r.kind, "instantid");
  });

  it("returns a no-op when kind='instantid' is explicitly requested but unavailable", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      kind: "instantid",
      availableNodeTypes: ["SomeOtherNode"],
    });
    assert.equal(r.inserted, false);
    assert.equal(r.workflow, wf);
  });

  it("matches instantid via a fuzzy node-type name (not just the exact ApplyInstantID constant)", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      kind: "instantid",
      availableNodeTypes: ["CustomApplyInstantIDNode"],
    });
    assert.equal(r.inserted, true);
    assert.equal(r.kind, "instantid");
  });

  it("returns a no-op when kind='auto' and availableNodeTypes has neither instantid nor pulid nodes", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      availableNodeTypes: ["SomeUnrelatedNode", "AnotherNode"],
    });
    assert.equal(r.inserted, false);
    assert.equal(r.kind, undefined);
    assert.equal(r.workflow, wf);
  });

  it("uses ApplyPulidFlux when only the flux apply node is available", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      kind: "pulid",
      availableNodeTypes: ["ApplyPulidFlux", "PulidModelLoader", "PulidEvaClipLoader"],
    });
    assert.equal(r.inserted, true);
    const applyNodeId = r.insertedNodeIds[r.insertedNodeIds.length - 1]!;
    const applyNode = (r.workflow as Record<string, { class_type?: string }>)[applyNodeId];
    assert.equal(applyNode?.class_type, "ApplyPulidFlux");
  });

  it("prefers the standard ApplyPulid class when both apply node types are available", () => {
    const wf = baseWorkflow();
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      kind: "pulid",
      availableNodeTypes: ["ApplyPulid", "ApplyPulidFlux", "PulidModelLoader"],
    });
    const applyNodeId = r.insertedNodeIds[r.insertedNodeIds.length - 1]!;
    const applyNode = (r.workflow as Record<string, { class_type?: string }>)[applyNodeId];
    assert.equal(applyNode?.class_type, "ApplyPulid");
  });

  it("is a no-op when the workflow has no sampler-like node", () => {
    const wf = { "1": { class_type: "CheckpointLoaderSimple", inputs: {} } };
    const r = insertIdentityChainIfMissing(wf, { imageFilename: "face.png" });
    assert.equal(r.inserted, false);
    assert.equal(r.workflow, wf);
  });

  it("inserts a full InstantID chain, rewires the sampler's model input, and leaves the original workflow untouched", () => {
    const wf = baseWorkflow();
    const before = JSON.stringify(wf);
    const r = insertIdentityChainIfMissing(wf, {
      imageFilename: "face.png",
      kind: "instantid",
      availableNodeTypes: ["ApplyInstantID", "InstantIDModelLoader", "InstantIDFaceAnalysis"],
    });

    assert.equal(r.inserted, true);
    assert.equal(r.kind, "instantid");
    assert.equal(r.insertedNodeIds.length, 4);
    // The original object passed in must be completely untouched.
    assert.equal(JSON.stringify(wf), before);
    assert.notEqual(r.workflow, wf);

    const next = r.workflow as Record<
      string,
      { class_type?: string; inputs: Record<string, unknown> }
    >;
    const [loadImageId, faceId, loaderId, applyId] = r.insertedNodeIds;
    assert.deepEqual(next[loadImageId!].inputs, { image: "{{IPADAPTER_IMAGE}}" });
    assert.equal(next[faceId!].class_type, "InstantIDFaceAnalysis");
    assert.equal(next[loaderId!].class_type, "InstantIDModelLoader");
    assert.equal(next[applyId!].class_type, "ApplyInstantID");
    assert.deepEqual(next[applyId!].inputs, {
      model: ["1", 0],
      instantid: [loaderId, 0],
      insightface: [faceId, 0],
      image: [loadImageId, 0],
      weight: "{{IPADAPTER_STRENGTH}}",
      start_at: 0,
      end_at: 1,
    });
    // The sampler's model input is rewired to point at the new apply node.
    assert.deepEqual(next["3"].inputs.model, [applyId, 0]);
  });

  it("nextNodeId ignores non-integer keys and continues from the highest numeric one", () => {
    const wf: Record<string, unknown> = {
      "3": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 1, steps: 1, cfg: 1 } },
      "10": { class_type: "Foo", inputs: {} },
      abc: { class_type: "Bar", inputs: {} },
      "2.5": { class_type: "Baz", inputs: {} },
    };
    const r = insertIdentityChainIfMissing(wf, { imageFilename: "face.png" });
    assert.deepEqual(r.insertedNodeIds, ["11", "12", "13", "14"]);
  });

  it("isSamplerLike falls back to a seed+steps/cfg heuristic for non-KSampler-named nodes", () => {
    const wf: Record<string, unknown> = {
      "1": {
        class_type: "SomeCustomSamplerNode",
        inputs: { model: ["0", 0], seed: 1, steps: 10 },
      },
    };
    const r = insertIdentityChainIfMissing(wf, { imageFilename: "face.png" });
    assert.equal(r.inserted, true);
  });

  it("isSamplerLike heuristic requires steps or cfg alongside seed, but a recognized class name alone is enough", () => {
    const seedOnly: Record<string, unknown> = {
      "1": { class_type: "NotASampler", inputs: { model: ["0", 0], seed: 1 } },
    };
    assert.equal(insertIdentityChainIfMissing(seedOnly, { imageFilename: "face.png" }).inserted, false);

    const namedNoSeed: Record<string, unknown> = {
      "1": { class_type: "SamplerCustomAdvanced", inputs: { model: ["0", 0] } },
    };
    assert.equal(
      insertIdentityChainIfMissing(namedNoSeed, { imageFilename: "face.png" }).inserted,
      true,
    );
  });
});
