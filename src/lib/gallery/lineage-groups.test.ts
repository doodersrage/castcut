import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import {
  buildGalleryLineageGroups,
  galleryLineageGroupingEnabled,
} from "./lineage-groups";

function entry(
  id: string,
  overrides: Partial<ComfyGalleryEntry> = {},
): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt: "test",
    tool: "qwen-image",
    model: "qwen-image-2512",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 1,
    images: [],
    ...overrides,
  };
}

describe("gallery-lineage-groups", () => {
  it("groups parent entries with their derivatives", () => {
    const groups = buildGalleryLineageGroups([
      entry("root", { queuedAt: 1 }),
      entry("upscale", {
        queuedAt: 2,
        parentGalleryEntryId: "root",
        derivedKind: "upscale",
      }),
      entry("refine", {
        queuedAt: 3,
        parentGalleryEntryId: "root",
        derivedKind: "refine",
      }),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.root.id, "root");
    assert.deepEqual(
      groups[0]?.derivatives.map((derivative) => derivative.id),
      ["upscale", "refine"],
    );
  });

  it("groups multi-generation chains under a single ultimate root, even when an intermediate generation is also present", () => {
    // Regression test: grandparent (still) -> parent (refine) -> 5 children
    // (i2v), where BOTH the grandparent and the parent are present in the
    // input array alongside the children. Previously, buildGalleryLineageGroups
    // only swept one hop of direct children, so the parent (which itself has
    // a parentGalleryEntryId pointing at the grandparent) was excluded from
    // the top-level sweep as a "derivative", but its own children were only
    // attached to it -- not to the grandparent -- producing a group whose
    // root was the grandparent with zero derivatives, a separate untouched
    // parent entry, and the children silently dropped from every group.
    const grandparent = entry("grandparent", { queuedAt: 1 });
    const parent = entry("parent", {
      queuedAt: 2,
      parentGalleryEntryId: "grandparent",
      derivedKind: "refine",
    });
    const child1 = entry("child1", {
      queuedAt: 3,
      parentGalleryEntryId: "parent",
      derivedKind: "i2v",
    });
    const child2 = entry("child2", {
      queuedAt: 4,
      parentGalleryEntryId: "parent",
      derivedKind: "i2v",
    });

    const groups = buildGalleryLineageGroups([grandparent, parent, child1, child2]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.root.id, "grandparent");
    assert.deepEqual(
      groups[0]?.derivatives.map((derivative) => derivative.id),
      ["parent", "child1", "child2"],
    );
  });

  it("does not drop entries when the parent is absent from the visible set (page window)", () => {
    // Only the children are present -- the parent/grandparent fell off the
    // current page window. Each child has no resolvable in-set parent, so
    // each becomes its own root with no derivatives (matching prior
    // behavior for entries whose parent isn't in the given array).
    const child1 = entry("child1", { queuedAt: 3, parentGalleryEntryId: "parent" });
    const child2 = entry("child2", { queuedAt: 4, parentGalleryEntryId: "parent" });

    const groups = buildGalleryLineageGroups([child1, child2]);

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((group) => group.root.id).sort(),
      ["child1", "child2"],
    );
  });

  it("does not infinite-loop on a cyclic parent reference", () => {
    const a = entry("a", { queuedAt: 1, parentGalleryEntryId: "b" });
    const b = entry("b", { queuedAt: 2, parentGalleryEntryId: "a" });

    const groups = buildGalleryLineageGroups([a, b]);

    // A cycle has no well-defined root; we just need this to terminate and
    // account for both entries without throwing or looping forever.
    const allIds = groups.flatMap((group) => [
      group.root.id,
      ...group.derivatives.map((derivative) => derivative.id),
    ]);
    assert.deepEqual(allIds.sort(), ["a", "b"]);
  });

  it("skips lineage grouping when derivative or kind filter is active", () => {
    assert.equal(
      galleryLineageGroupingEnabled({ derivativeOfEntryId: "root", focusEntryId: "" }),
      false,
    );
    assert.equal(
      galleryLineageGroupingEnabled({ derivativeOfEntryId: "", focusEntryId: "", derivedKind: "upscale" }),
      false,
    );
    assert.equal(
      galleryLineageGroupingEnabled({ derivativeOfEntryId: "", focusEntryId: "" }),
      true,
    );
  });
});
