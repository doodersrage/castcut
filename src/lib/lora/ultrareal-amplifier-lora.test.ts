import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureUltraRealAmplifierInLibrary,
  enrichLoraLibraryForUltraRealModel,
  ensureUltraRealAmplifierTriggerInPrompt,
  loraFilenameLooksLikeUltraRealAmplifier,
  pickUltraRealAmplifierFromInventory,
  ULTRAREAL_AMPLIFIER_LORA_ID,
  ULTRAREAL_AMPLIFIER_STRENGTH,
  ULTRAREAL_AMPLIFIER_TRIGGER,
} from "./ultrareal-amplifier-lora";

describe("ultrareal amplifier lora", () => {
  it("matches Realistic Amplifier and rejects UltraRealPhoto / UltraRealism packs", () => {
    assert.equal(
      loraFilenameLooksLikeUltraRealAmplifier(
        "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
      ),
      true,
    );
    assert.equal(
      loraFilenameLooksLikeUltraRealAmplifier("Canopus-LoRA-Flux-UltraRealism.safetensors"),
      false,
    );
    assert.equal(
      loraFilenameLooksLikeUltraRealAmplifier("UltraRealPhoto.safetensors"),
      false,
    );
  });

  it("picks the Danrisi amplifier from inventory", () => {
    assert.equal(
      pickUltraRealAmplifierFromInventory([
        "Canopus-LoRA-Flux-UltraRealism.safetensors",
        "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
      ]),
      "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
    );
  });

  it("seeds the library entry at recommended strength for UltraReal", () => {
    const library = enrichLoraLibraryForUltraRealModel(
      "flux-ultrareal-v4",
      [],
      ["Realistic Amplifier for UltraReal Fine-Tune.safetensors"],
    );
    assert.equal(library.length, 1);
    assert.equal(library[0]?.id, ULTRAREAL_AMPLIFIER_LORA_ID);
    assert.equal(library[0]?.strengthModel, ULTRAREAL_AMPLIFIER_STRENGTH);
    assert.equal(library[0]?.triggerPhrase, ULTRAREAL_AMPLIFIER_TRIGGER);
    assert.equal(
      library[0]?.tokenValue,
      "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
    );
  });

  it("prefixes the digicam trigger when missing", () => {
    assert.equal(
      ensureUltraRealAmplifierTriggerInPrompt("a woman on a beach"),
      `${ULTRAREAL_AMPLIFIER_TRIGGER}, a woman on a beach`,
    );
    assert.equal(
      ensureUltraRealAmplifierTriggerInPrompt(`${ULTRAREAL_AMPLIFIER_TRIGGER}, already`),
      `${ULTRAREAL_AMPLIFIER_TRIGGER}, already`,
    );
  });

  it("does not seed the amplifier for unrelated models", () => {
    const library = enrichLoraLibraryForUltraRealModel(
      "flux-dev",
      [],
      ["Realistic Amplifier for UltraReal Fine-Tune.safetensors"],
    );
    assert.equal(library.length, 0);
  });

  it("updates an existing amplifier entry without duplicating", () => {
    const library = ensureUltraRealAmplifierInLibrary(
      [
        {
          id: "other",
          label: "Other",
          tokenValue: "other.safetensors",
          strengthModel: 1,
          strengthClip: 1,
          enabled: true,
          triggerPhrase: "",
        },
      ],
      "Realistic Amplifier for UltraReal Fine-Tune.safetensors",
    );
    assert.equal(library.length, 2);
    assert.ok(library.some((entry) => entry.id === ULTRAREAL_AMPLIFIER_LORA_ID));
  });
});
