import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComposeIdentityLockQueuePatch,
  buildComposeKleinQueuePatch,
  formatComposeIdentityLockHint,
  modelSupportsSessionIdentityLock,
  normalizeComposeIdentityLockStrength,
} from "./compose-identity-lock";
import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  sharedPatchFromGalleryHandoff,
} from "./gallery/handoff";
import type { ComfyGalleryEntry } from "./gallery/comfyui-gallery-entry";

describe("compose identity lock", () => {
  it("builds IP-Adapter queue patch from Figure 1 filename", () => {
    const patch = buildComposeIdentityLockQueuePatch({
      enabled: true,
      strength: 0.55,
      inputImageFilename: "fig1.png",
    });
    assert.deepEqual(patch, {
      ipAdapterImageFilename: "fig1.png",
      ipAdapterImageFilenames: ["fig1.png"],
      ipAdapterStrength: 0.55,
      identityKind: "ipadapter",
    });
  });

  it("returns null when lock is off or filename missing", () => {
    assert.equal(
      buildComposeIdentityLockQueuePatch({
        enabled: false,
        inputImageFilename: "fig1.png",
      }),
      null,
    );
    assert.equal(
      buildComposeIdentityLockQueuePatch({
        enabled: true,
        inputImageFilename: "  ",
      }),
      null,
    );
  });

  it("clamps strength", () => {
    assert.equal(normalizeComposeIdentityLockStrength(2), 1);
    assert.equal(normalizeComposeIdentityLockStrength(0), 0.05);
  });

  it("hides Generate identity lock on Z-Image", () => {
    assert.equal(modelSupportsSessionIdentityLock("sdxl"), true);
    assert.equal(modelSupportsSessionIdentityLock("z-image-turbo"), false);
    assert.equal(modelSupportsSessionIdentityLock(""), false);
  });

  it("maps Klein Compose figures for ReferenceLatent (+ optional identity lock)", () => {
    assert.equal(
      buildComposeKleinQueuePatch({
        model: "qwen-image-edit-2511",
        inputImageFilenames: ["a.png", "b.png"],
      }),
      null,
    );

    const canvasOnly = buildComposeKleinQueuePatch({
      model: "flux-2-klein-9b",
      inputImageFilenames: ["fig1.png"],
    });
    assert.deepEqual(canvasOnly, {
      inputImageFilename: "fig1.png",
      inputImageFilenames: ["fig1.png"],
    });

    const multi = buildComposeKleinQueuePatch({
      model: "flux-2-klein-4b-distilled",
      inputImageFilenames: ["fig1.png", "fig2.png", "fig3.png"],
    });
    assert.deepEqual(multi, {
      inputImageFilename: "fig1.png",
      inputImageFilenames: ["fig1.png", "fig2.png", "fig3.png"],
    });

    const locked = buildComposeKleinQueuePatch({
      model: "flux-2-klein",
      inputImageFilenames: ["fig1.png", "fig2.png"],
      identityLock: true,
      identityLockStrength: 0.4,
      identityKind: "ipadapter",
    });
    assert.deepEqual(locked, {
      inputImageFilename: "fig1.png",
      inputImageFilenames: ["fig1.png", "fig2.png"],
      ipAdapterImageFilename: "fig1.png",
      ipAdapterImageFilenames: ["fig1.png"],
      ipAdapterStrength: 0.4,
      identityKind: "ipadapter",
    });
  });

  it("formats hint", () => {
    assert.match(formatComposeIdentityLockHint({ enabled: false }), /Off/);
    assert.match(
      formatComposeIdentityLockHint({ enabled: true, strength: 0.5 }),
      /IP-Adapter @ 0\.50/,
    );
    assert.match(
      formatComposeIdentityLockHint({
        enabled: true,
        strength: 0.5,
        identityKind: "instantid",
      }),
      /InstantID @ 0\.50/,
    );
  });
});

function fakeEntry(
  patch: Partial<ComfyGalleryEntry> = {},
): ComfyGalleryEntry {
  return {
    id: "g1",
    promptId: "p1",
    prompt: "a portrait",
    model: "qwen-image-edit-2511-lightning-8",
    tool: "compose",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: Date.now(),
    images: [{ filename: "out.png", subfolder: "", type: "output" }],
    queueQualityProfile: "final",
    sessionActiveLoraIds: ["skin", "anypose"],
    ...patch,
  };
}

describe("gallery re-edit handoff", () => {
  it("includes entry LoRA stack and quality on reedit", () => {
    const payload = buildReeditGalleryHandoff(fakeEntry(), "compose");
    assert.equal(payload.handoffMode, "reedit");
    assert.equal(payload.target, "compose");
    assert.deepEqual(payload.sessionActiveLoraIds, ["skin", "anypose"]);
    assert.equal(payload.queueQualityProfile, "final");
  });

  it("sharedPatchFromGalleryHandoff restores LoRAs and profile", () => {
    const payload = buildGalleryHandoff(fakeEntry(), "refine", {
      handoffMode: "reedit",
      includeSessionLoras: true,
    });
    const patch = sharedPatchFromGalleryHandoff(payload);
    assert.deepEqual(patch.sessionActiveLoraIds, ["skin", "anypose"]);
    assert.equal(patch.queueQualityProfile, "final");
  });

  it("controlnet handoff carries multi-ref controlImageUrls", () => {
    const payload = buildGalleryHandoff(
      fakeEntry({
        controlImageUrls: [
          "http://127.0.0.1:8188/view?filename=pose.png",
          "http://127.0.0.1:8188/view?filename=depth.png",
        ],
      }),
      "controlnet",
    );
    assert.equal(payload.target, "controlnet");
    assert.equal(payload.controlImageUrls?.length, 2);
    assert.match(payload.controlImageUrls?.[0] ?? "", /pose\.png/);
  });

  it("uses durable Studio originals for uploaded stills instead of Comfy /view", () => {
    const payload = buildGalleryHandoff(
      fakeEntry({
        tool: "upload",
        durableOriginalPath: "gallery/g1/original.jpg",
        sourceImageUrl: "/api/gallery/media/g1?variant=original",
        images: [{ filename: "772904885_n.jpg", subfolder: "", type: "output" }],
      }),
      "refine",
    );
    assert.equal(payload.imageUrl, "/api/gallery/media/g1?variant=original");
  });

  it("controlnet handoff restores mode and strengths from queueParams", () => {
    const payload = buildGalleryHandoff(
      fakeEntry({
        queueParams: {
          controlNetMode: "canny",
          controlNetModes: ["canny", "depth"],
          controlNetStrengths: [0.85, 0.5],
          controlImageFilenames: ["pose.png", "depth.png"],
        },
        controlImageUrls: [
          "http://127.0.0.1:8188/view?filename=pose.png",
          "http://127.0.0.1:8188/view?filename=depth.png",
        ],
      }),
      "controlnet",
    );
    assert.equal(payload.queueParams?.controlNetMode, "canny");
    assert.deepEqual(payload.queueParams?.controlNetModes, ["canny", "depth"]);
    assert.deepEqual(payload.queueParams?.controlNetStrengths, [0.85, 0.5]);
  });
});

