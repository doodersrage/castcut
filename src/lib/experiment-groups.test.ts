import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experimentGroupIdForPrompt, groupGalleryExperiments } from "./experiment-groups";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

function entry(id: string, prompt: string): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt,
    tool: "qwen-image",
    model: "qwen-image-2512",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 1,
    images: [],
  };
}

describe("experiment-groups", () => {
  it("builds a stable group id from prompt text", () => {
    const id = experimentGroupIdForPrompt("  Hello World Prompt  ");
    assert.equal(id, "hello world prompt");
    assert.equal(experimentGroupIdForPrompt("   "), null);
  });

  it("does not collide two different prompts that share the same 32-char prefix", () => {
    // Regression test: the id used to be truncated to 32 chars, so templated prompts that only
    // differ after that point (extremely common — e.g. "keep the subject's pose and framing,
    // but change X" repeated with different X's) collided onto the SAME group id even though
    // they're genuinely different experiments. That id doubles as the React row key and the
    // lookup key for collapse/winner state, so colliding groups on different gallery pages ended
    // up sharing state and keys — which looks exactly like one experiment block "sticking" across
    // pages that have nothing to do with each other.
    const prefix = "keep the subject's pose and framing, but change ";
    assert.ok(prefix.length > 32);
    const idA = experimentGroupIdForPrompt(`${prefix}the shirt to red`);
    const idB = experimentGroupIdForPrompt(`${prefix}the background to a beach`);
    assert.notEqual(idA, idB);
  });

  it("matches groupGalleryExperiments ids for the same prompt", async () => {
    const { groupGalleryExperiments } = await import("./experiment-groups");
    const groups = groupGalleryExperiments([
      entry("a", "shared prompt text"),
      entry("b", "shared prompt text"),
    ]);
    assert.equal(groups[0]?.id, experimentGroupIdForPrompt("shared prompt text"));
  });

  it("keeps groupGalleryExperiments ids distinct for prompts sharing a 32-char prefix", async () => {
    const { groupGalleryExperiments } = await import("./experiment-groups");
    const prefix = "keep the subject's pose and framing, but change ";
    const groups = groupGalleryExperiments([
      entry("a1", `${prefix}the shirt to red`),
      entry("a2", `${prefix}the shirt to red`),
      entry("b1", `${prefix}the background to a beach`),
      entry("b2", `${prefix}the background to a beach`),
    ]);
    assert.equal(groups.length, 2);
    assert.notEqual(groups[0]?.id, groups[1]?.id);
  });
});

describe('experiment grouping keys on the whole prompt', () => {
  it('does not lump different Day beats that share the edit boilerplate', () => {
    const boiler = 'Carry out this change on Image 1 even if lighting, wardrobe, or background must change. Keep facial likeness only: '.repeat(2);
    const make = (id: string, beat: string) =>
      ({ id, promptId: id, prompt: boiler + beat, comfyUrl: '', status: 'completed', queuedAt: 1, images: [] }) as never;
    const groups = groupGalleryExperiments([make('a', 'missionary'), make('b', 'spoon'), make('c', 'missionary')]);
    // Only the true re-run (same whole prompt) groups; the spoon beat stays on its own.
    assert.deepEqual(
      groups.map(group => group.entries.map(e => (e as { id: string }).id)),
      [['a', 'c']]
    );
  });
});
