import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichLoraLibraryWithKleinUltraReal,
  loraFilenameLooksLikeKleinUltraReal,
  pickKleinUltraRealFromInventory,
  KLEIN_ULTRA_REAL_LORA_ID,
  KLEIN_ULTRA_REAL_STRENGTH,
} from "./klein-ultra-real-lora";
import { enrichLoraLibraryForKleinBaseModel } from "./klein-realistic-detail-lora";

describe("klein ultra real lora", () => {
  it("matches Klein-trained ultra_real_v4 filenames only", () => {
    assert.equal(loraFilenameLooksLikeKleinUltraReal("ultra_real_v4.safetensors"), true);
    assert.equal(
      loraFilenameLooksLikeKleinUltraReal(
        "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
      ),
      false,
    );
    assert.equal(
      loraFilenameLooksLikeKleinUltraReal("Canopus-LoRA-Flux-UltraRealism.safetensors"),
      false,
    );
  });

  it("picks ultra_real_v4 from inventory", () => {
    assert.equal(
      pickKleinUltraRealFromInventory([
        "Flux2 Klein 9B Realistic Detail LoRA.safetensors",
        "ultra_real_v4.safetensors",
      ]),
      "ultra_real_v4.safetensors",
    );
  });

  it("seeds the library entry for Klein Base and stacks with Realistic Detail", () => {
    const library = enrichLoraLibraryForKleinBaseModel(
      "flux-2-klein-9b",
      [],
      [
        "Flux2 Klein 9B Realistic Detail LoRA.safetensors",
        "ultra_real_v4.safetensors",
      ],
    );
    assert.equal(library.length, 2);
    const ultra = library.find((entry) => entry.id === KLEIN_ULTRA_REAL_LORA_ID);
    assert.equal(ultra?.strengthModel, KLEIN_ULTRA_REAL_STRENGTH);
    assert.equal(ultra?.tokenValue, "ultra_real_v4.safetensors");

    assert.equal(
      enrichLoraLibraryWithKleinUltraReal(
        "flux-ultrareal-v4",
        [],
        ["ultra_real_v4.safetensors"],
      ).length,
      0,
    );
  });
});
