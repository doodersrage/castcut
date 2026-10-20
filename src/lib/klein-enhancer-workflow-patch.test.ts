import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowScaffoldForModel } from "./workflow/scaffold";
import { ensureKleinReferenceLatentWiringInWorkflow } from "./workflow/img2img-patch";
import {
  ensureKleinEnhancerPackWiringInWorkflow,
  FEW_STEP_KLEIN_COLOR_ANCHOR_RAMP,
  KLEIN_COLOR_ANCHOR_NODE,
  KLEIN_IDENTITY_FINAL_NODE,
  KLEIN_IDENTITY_HARD_SINGLE,
  KLEIN_MULTI_REF_NODE,
  KLEIN_TEXT_ENHANCER_NODE,
  resolveKleinColorAnchorRampCurve,
  resolveKleinEnhancerIdentityPreset,
  resolveKleinIdentityLockEnabled,
  resolveKleinTextEnhancerDefaults,
} from "./klein-enhancer-workflow-patch";

const COMPOSE_ENHANCER_NODES = new Set([
  KLEIN_MULTI_REF_NODE,
  KLEIN_IDENTITY_FINAL_NODE,
  KLEIN_COLOR_ANCHOR_NODE,
  KLEIN_TEXT_ENHANCER_NODE,
]);

describe("klein enhancer workflow patch", () => {
  it("maps identity lock strength to presets and soft-caps 4B HARD", () => {
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.8 }), "MID_LOCK");
    assert.equal(
      resolveKleinEnhancerIdentityPreset({
        identityLockStrength: 0.8,
        model: "flux-2-klein-9b",
      }),
      "HARD_LOCK",
    );
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.5 }), "MID_LOCK");
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.2 }), "SOFT_LOCK");
  });

  it("treats identity lock flag / strength for Final wiring intent", () => {
    assert.equal(resolveKleinIdentityLockEnabled({ identityLockEnabled: false }), false);
    assert.equal(resolveKleinIdentityLockEnabled({ identityLockEnabled: true }), true);
    assert.equal(resolveKleinIdentityLockEnabled({ identityLockStrength: 0.5 }), true);
    assert.equal(resolveKleinIdentityLockEnabled({}), false);
  });

  it("uses a faster Color Anchor ramp for distilled / few-step Klein", () => {
    assert.equal(
      resolveKleinColorAnchorRampCurve({ model: "flux-2-klein-9b-distilled" }),
      FEW_STEP_KLEIN_COLOR_ANCHOR_RAMP,
    );
    assert.equal(
      resolveKleinColorAnchorRampCurve({ model: "flux-2-klein-9b", steps: 4 }),
      FEW_STEP_KLEIN_COLOR_ANCHOR_RAMP,
    );
    assert.equal(resolveKleinColorAnchorRampCurve({ model: "flux-2-klein-9b", steps: 24 }), 1.5);
  });

  it("softens Text Enhancer when identity transfer is hard-locked", () => {
    assert.deepEqual(resolveKleinTextEnhancerDefaults({ identityTransfer: true, preset: "HARD_LOCK" }), {
      magnitude: 1,
      contrast: 0,
    });
    assert.equal(
      resolveKleinTextEnhancerDefaults({ identityTransfer: false }).magnitude,
      1.08,
    );
  });

  it("upgrades ReferenceLatent chain with Multi Ref + Identity Final + Color Anchor when lock on", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilenames: ["a.png", "b.png"],
      },
    );
    assert.equal(wired.wired, true);

    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilenames: ["a.png", "b.png"],
      availableNodeTypes: COMPOSE_ENHANCER_NODES,
      identityLockEnabled: true,
      identityLockStrength: 0.8,
    });
    assert.equal(result.usedEnhancer, true);
    assert.equal(result.usedIdentityTransfer, true);
    assert.equal(result.usedTextEnhancer, true);
    assert.equal(result.usedColorAnchor, true);

    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_MULTI_REF_NODE));
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_IDENTITY_FINAL_NODE));
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_TEXT_ENHANCER_NODE));
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_COLOR_ANCHOR_NODE));
    assert.ok(!Object.values(nodes).some(node => node.class_type === "ReferenceLatent"));

    const identity = Object.values(nodes).find(node => node.class_type === KLEIN_IDENTITY_FINAL_NODE);
    assert.equal(identity?.inputs?.preset, "HARD_LOCK");
    assert.equal(identity?.inputs?.single_blocks, KLEIN_IDENTITY_HARD_SINGLE);

    const color = Object.values(nodes).find(node => node.class_type === KLEIN_COLOR_ANCHOR_NODE);
    assert.equal(color?.inputs?.channel_weights, "by_variance");
    assert.equal(color?.inputs?.ramp_curve, 1.5);

    const text = Object.values(nodes).find(node => node.class_type === KLEIN_TEXT_ENHANCER_NODE);
    assert.equal(text?.inputs?.magnitude, 1);
    assert.equal(text?.inputs?.contrast, 0);

    const sampler = Object.values(nodes).find(node => node.class_type === "KSampler");
    const positiveRef = sampler?.inputs?.positive;
    assert.ok(Array.isArray(positiveRef));
    assert.equal(nodes[String(positiveRef[0])]?.class_type, KLEIN_MULTI_REF_NODE);
  });

  it("keeps Multi Ref without Identity Final when identity lock is off", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilenames: ["a.png"],
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilenames: ["a.png"],
      availableNodeTypes: COMPOSE_ENHANCER_NODES,
      identityLockEnabled: false,
    });
    assert.equal(result.usedEnhancer, true);
    assert.equal(result.usedIdentityTransfer, false);
    assert.equal(result.usedColorAnchor, true);
    assert.ok(
      !Object.values(result.workflow as Record<string, { class_type?: string }>).some(
        node => node.class_type === KLEIN_IDENTITY_FINAL_NODE,
      ),
    );
    assert.ok(
      Object.values(result.workflow as Record<string, { class_type?: string }>).some(
        node => node.class_type === KLEIN_MULTI_REF_NODE,
      ),
    );
  });

  it("tunes Color Anchor ramp for distilled Klein compose", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b-distilled",
        inputImageFilename: "a.png",
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b-distilled",
      inputImageFilename: "a.png",
      availableNodeTypes: COMPOSE_ENHANCER_NODES,
      identityLockEnabled: true,
      steps: 4,
    });
    const color = Object.values(
      result.workflow as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>,
    ).find(node => node.class_type === KLEIN_COLOR_ANCHOR_NODE);
    assert.equal(color?.inputs?.ramp_curve, FEW_STEP_KLEIN_COLOR_ANCHOR_RAMP);
  });

  it("keeps center-crop ImageScale on Distilled Compose after enhancer rewire", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b-distilled");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b-distilled",
        inputImageFilename: "portrait-682x1024.png",
        width: 896,
        height: 1152,
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b-distilled",
      inputImageFilename: "portrait-682x1024.png",
      availableNodeTypes: COMPOSE_ENHANCER_NODES,
      identityLockEnabled: false,
      steps: 4,
    });
    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    const multi = Object.values(nodes).find(node => node.class_type === KLEIN_MULTI_REF_NODE);
    const latent1 = multi?.inputs?.latent_1 as [string, number];
    const encode = nodes[String(latent1[0])];
    assert.equal(encode?.class_type, "VAEEncode");
    const pixels = encode?.inputs?.pixels as [string, number];
    const scale = nodes[String(pixels[0])];
    assert.equal(scale?.class_type, "ImageScale");
    assert.equal(scale?.inputs?.crop, "center");
    assert.equal(scale?.inputs?.width, 896);
    assert.equal(scale?.inputs?.height, 1152);
  });

  it("wires Text Enhancer on plain Klein T2I", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const result = ensureKleinEnhancerPackWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        availableNodeTypes: new Set([KLEIN_TEXT_ENHANCER_NODE]),
      },
    );
    assert.equal(result.usedTextEnhancer, true);
    assert.equal(result.usedEnhancer, false);

    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    const sampler = Object.values(nodes).find(node => node.class_type === "KSampler");
    const positiveRef = sampler?.inputs?.positive;
    assert.ok(Array.isArray(positiveRef));
    assert.equal(nodes[String(positiveRef[0])]?.class_type, KLEIN_TEXT_ENHANCER_NODE);
  });

  it("no-ops when enhancer nodes are missing", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilename: "a.png",
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilename: "a.png",
      availableNodeTypes: new Set(["KSampler"]),
      identityLockEnabled: true,
    });
    assert.equal(result.usedEnhancer, false);
    assert.ok(
      Object.values(result.workflow as Record<string, { class_type?: string }>).some(
        node => node.class_type === "ReferenceLatent",
      ),
    );
  });

  it("still upgrades to Multi Ref when only Multi ReferenceLatent is installed", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilename: "a.png",
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilename: "a.png",
      availableNodeTypes: new Set([KLEIN_MULTI_REF_NODE]),
      identityLockEnabled: true,
      identityLockStrength: 0.8,
    });
    assert.equal(result.usedEnhancer, true);
    assert.equal(result.usedIdentityTransfer, false);
    assert.ok(
      Object.values(result.workflow as Record<string, { class_type?: string }>).some(
        node => node.class_type === KLEIN_MULTI_REF_NODE,
      ),
    );
  });
});
