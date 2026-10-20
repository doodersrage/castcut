import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ToolGenerateResult } from "../specialized/types";

let call = 0;
const generateCharacterPrompt = mock.fn(async (_options?: unknown): Promise<ToolGenerateResult> => {
  call += 1;
  return {
    prompt: `prompt-${call}`,
    provider: "template",
    model: "flux" as never,
    comfyNode: "node",
    limits: {} as never,
    metadata: {
      sceneLocation: `loc-${call}`,
      randomOutfit: { wardrobeId: `w${call}`, bottomId: `b${call}` },
    },
  };
});
mock.module("../specialized/character-generator", { namedExports: { generateCharacterPrompt } });

describe("batchGenerateCharacter", async () => {
  const { batchGenerateCharacter } = await import("./generate");

  it("generates `count` prompts and enriches each with diagnostics", async () => {
    call = 0;
    const result = await batchGenerateCharacter({ hints: "h", count: 2 } as never);
    assert.equal(result.count, 2);
    assert.equal(result.results.length, 2);
    assert.equal(call, 2);
    assert.ok("diagnostics" in result.results[0]!);
  });

  it("accumulates recent locations and clothing ids across iterations, newest first", async () => {
    call = 0;
    generateCharacterPrompt.mock.resetCalls();
    // Snapshot (copy) the arrays at call time -- batch-generate.ts passes the same array
    // reference on every call and mutates it in place afterward, so capturing the reference
    // itself would only ever show the final accumulated state.
    const capturedLocations: Array<string[] | undefined> = [];
    const capturedClothing: Array<string[] | undefined> = [];
    generateCharacterPrompt.mock.mockImplementation(async (options: unknown) => {
      call += 1;
      const opts = options as { recentLocations?: string[]; recentClothing?: string[] };
      capturedLocations.push(opts.recentLocations ? [...opts.recentLocations] : undefined);
      capturedClothing.push(opts.recentClothing ? [...opts.recentClothing] : undefined);
      return {
        prompt: `prompt-${call}`,
        provider: "template",
        model: "flux" as never,
        comfyNode: "node",
        limits: {} as never,
        metadata: {
          sceneLocation: `loc-${call}`,
          randomOutfit: { wardrobeId: `w${call}`, bottomId: `b${call}` },
        },
      } as ToolGenerateResult;
    });
    await batchGenerateCharacter({ hints: "h", count: 3 } as never);
    assert.equal(capturedLocations[0], undefined);
    assert.deepEqual(capturedLocations[1], ["loc-1"]);
    assert.deepEqual(capturedLocations[2], ["loc-2", "loc-1"]);
    assert.equal(capturedClothing[0], undefined);
    assert.deepEqual(capturedClothing[1], ["b1", "w1"]);
  });

  it("clamps count below 1 up to 1", async () => {
    call = 0;
    generateCharacterPrompt.mock.resetCalls();
    generateCharacterPrompt.mock.mockImplementation(async () => {
      call += 1;
      return {
        prompt: "p",
        provider: "template",
        model: "flux" as never,
        comfyNode: "n",
        limits: {} as never,
        metadata: {},
      } as ToolGenerateResult;
    });
    const result = await batchGenerateCharacter({ hints: "h", count: 0 } as never);
    assert.equal(result.count, 1);
    assert.equal(call, 1);
  });

  it("clamps count above 12 down to 12", async () => {
    call = 0;
    generateCharacterPrompt.mock.resetCalls();
    const result = await batchGenerateCharacter({ hints: "h", count: 20 } as never);
    assert.equal(result.count, 12);
    assert.equal(call, 12);
  });

  it("defaults count to 3 when not provided", async () => {
    call = 0;
    generateCharacterPrompt.mock.resetCalls();
    const result = await batchGenerateCharacter({ hints: "h" } as never);
    assert.equal(result.count, 3);
    assert.equal(call, 3);
  });
});
