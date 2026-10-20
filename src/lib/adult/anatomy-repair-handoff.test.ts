import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANATOMY_REPAIR_CHANGE_DESCRIPTION,
  ANATOMY_REPAIR_MASK_DESCRIPTION,
  buildAnatomyRepairGalleryHandoff,
  DEFAULT_ANATOMY_REPAIR_DENOISE,
  galleryAnatomyRepairPath,
  isAnatomyRepairHandoff,
} from "./anatomy-repair-handoff";

describe("anatomy repair handoff", () => {
  it("builds inpaint handoff with anatomy defaults", () => {
    const payload = buildAnatomyRepairGalleryHandoff({
      id: "g1",
      promptId: "p1",
      prompt: "a runner in neon rain",
      status: "completed",
      queuedAt: Date.now(),
      images: [{ filename: "a.png", subfolder: "", type: "output" }],
      comfyUrl: "http://127.0.0.1:8188",
      queueParams: { width: 1024, height: 1024 },
    });
    assert.equal(payload.target, "inpaint");
    assert.equal(payload.model, "flux-inpaint");
    assert.equal(payload.anatomyRepair, true);
    assert.equal(payload.queueParams?.denoise, DEFAULT_ANATOMY_REPAIR_DENOISE);
    assert.equal(payload.queueParams?.width, 1024);
    assert.match(payload.hints ?? "", /Paint over/i);
  });

  it("detects anatomy repair payloads", () => {
    assert.equal(isAnatomyRepairHandoff({ anatomyRepair: true } as never), true);
    assert.equal(isAnatomyRepairHandoff({ anatomyRepair: false } as never), false);
  });

  it("exports stable copy for the inpaint tool", () => {
    assert.match(ANATOMY_REPAIR_MASK_DESCRIPTION, /limb/i);
    assert.match(ANATOMY_REPAIR_CHANGE_DESCRIPTION, /five distinct fingers/i);
    assert.equal(galleryAnatomyRepairPath(), "/inpaint?from=gallery&anatomy=1");
  });
});
