import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichLoraLibraryForKleinBaseModel,
  ensureKleinRealisticDetailTriggerInPrompt,
  loraFilenameLooksLikeKleinRealisticDetail,
  pickKleinRealisticDetailFromInventory,
  KLEIN_REALISTIC_DETAIL_LORA_ID,
  KLEIN_REALISTIC_DETAIL_STRENGTH,
  KLEIN_REALISTIC_DETAIL_TRIGGER,
} from "./klein-realistic-detail-lora";

describe("klein realistic detail lora", () => {
  it("matches Flux2 Klein Realistic Detail filenames", () => {
    assert.equal(
      loraFilenameLooksLikeKleinRealisticDetail(
        "Flux2 Klein 9B Realistic Detail LoRA.safetensors",
      ),
      true,
    );
    assert.equal(
      loraFilenameLooksLikeKleinRealisticDetail("Canopus-LoRA-Flux-UltraRealism.safetensors"),
      false,
    );
  });

  it("picks the detail LoRA from inventory", () => {
    assert.equal(
      pickKleinRealisticDetailFromInventory([
        "klein_snofs_v1_4.safetensors",
        "Flux2 Klein 9B Realistic Detail LoRA.safetensors",
      ]),
      "Flux2 Klein 9B Realistic Detail LoRA.safetensors",
    );
  });

  it("seeds the library entry for Klein Base only", () => {
    const library = enrichLoraLibraryForKleinBaseModel(
      "flux-2-klein-9b",
      [],
      ["Flux2 Klein 9B Realistic Detail LoRA.safetensors"],
    );
    assert.equal(library.length, 1);
    assert.equal(library[0]?.id, KLEIN_REALISTIC_DETAIL_LORA_ID);
    assert.equal(library[0]?.strengthModel, KLEIN_REALISTIC_DETAIL_STRENGTH);
    assert.equal(library[0]?.triggerPhrase, KLEIN_REALISTIC_DETAIL_TRIGGER);

    assert.equal(
      enrichLoraLibraryForKleinBaseModel(
        "flux-ultrareal-v4",
        [],
        ["Flux2 Klein 9B Realistic Detail LoRA.safetensors"],
      ).length,
      0,
    );
  });

  it("prefixes the srx_detail trigger when missing", () => {
    assert.equal(
      ensureKleinRealisticDetailTriggerInPrompt("a woman on a beach"),
      `${KLEIN_REALISTIC_DETAIL_TRIGGER}, a woman on a beach`,
    );
  });
});
