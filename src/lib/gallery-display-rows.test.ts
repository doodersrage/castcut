import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import {
  buildGalleryDisplayRows,
  countGalleryDisplayEntries,
  normalizeExperimentGroupAnchors,
  pageForGalleryEntryWithGroups,
  paginateGalleryEntriesWithGroups,
} from "./gallery-display-rows";

function entry(id: string): ComfyGalleryEntry {
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
  };
}

describe("gallery-display-rows", () => {
  it("chunks flat entries into card rows by column count", () => {
    const rows = buildGalleryDisplayRows(null, [entry("a"), entry("b"), entry("c"), entry("d"), entry("e")], new Set(), 2);

    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.kind, "cards");
    assert.equal(rows[1]?.kind, "cards");
    assert.equal(rows[2]?.kind, "cards");
    if (rows[0]?.kind === "cards" && rows[2]?.kind === "cards") {
      assert.deepEqual(rows[0].entries.map(item => item.id), ["a", "b"]);
      assert.deepEqual(rows[2].entries.map(item => item.id), ["e"]);
    }
  });

  it("inserts lineage rows and flushes pending cards", () => {
    const rows = buildGalleryDisplayRows(
      [
        { root: entry("solo"), derivatives: [] },
        {
          root: entry("root"),
          derivatives: [entry("child-a"), entry("child-b")],
        },
      ],
      [entry("solo"), entry("root"), entry("child-a"), entry("child-b")],
      new Set(),
      3,
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind, "cards");
    assert.equal(rows[1]?.kind, "lineage");
    if (rows[1]?.kind === "lineage") {
      assert.equal(rows[1].groupId, "root");
      assert.equal(rows[1].derivatives.length, 2);
    }
  });

  it("counts collapsed lineage derivatives only once", () => {
    const rows = buildGalleryDisplayRows(
      [{ root: entry("root"), derivatives: [entry("child-a"), entry("child-b")] }],
      [entry("root"), entry("child-a"), entry("child-b")],
      new Set(["root"]),
      2,
    );

    assert.equal(countGalleryDisplayEntries(rows), 1);
  });

  it("surfaces experiment clusters ahead of flat cards", () => {
    const a = { ...entry("a"), prompt: "same prompt here" };
    const b = { ...entry("b"), prompt: "same prompt here" };
    const c = entry("solo");
    const rows = buildGalleryDisplayRows(null, [a, b, c], new Set(), 2, {
      experimentGroups: [
        {
          id: "same-prompt",
          label: "same prompt here",
          parentPrompt: "same prompt here",
          entries: [a, b],
          variants: { seeds: ["1", "2"], cfgValues: [], stepValues: [] },
        },
      ],
      winners: { "same-prompt": { entryId: "a" } },
    });

    assert.equal(rows[0]?.kind, "experiment");
    if (rows[0]?.kind === "experiment") {
      assert.equal(rows[0].winnerEntryId, "a");
      assert.equal(rows[0].entries.length, 2);
    }
    assert.ok(rows.some(row => row.kind === "cards"));
  });

  it("keeps experiment blocks at their anchor position instead of yanking them to the top", () => {
    const solo = entry("solo");
    const a = { ...entry("a"), prompt: "same prompt here" };
    const b = { ...entry("b"), prompt: "same prompt here" };
    const rows = buildGalleryDisplayRows(null, [solo, a, b], new Set(), 2, {
      experimentGroups: [
        {
          id: "same-prompt",
          label: "same prompt here",
          parentPrompt: "same prompt here",
          entries: [a, b],
          variants: { seeds: ["1", "2"], cfgValues: [], stepValues: [] },
        },
      ],
    });

    assert.equal(rows[0]?.kind, "cards");
    if (rows[0]?.kind === "cards") {
      assert.deepEqual(rows[0].entries.map(item => item.id), ["solo"]);
    }
    assert.equal(rows[1]?.kind, "experiment");
  });

  it("anchors a group split across a pagination boundary to a single page", () => {
    const a = { ...entry("a"), prompt: "same prompt here" };
    const b = { ...entry("b"), prompt: "same prompt here" };
    const c = entry("solo");
    const group = {
      id: "same-prompt",
      label: "same prompt here",
      parentPrompt: "same prompt here",
      // Newest-first, matching how groupGalleryExperiments preserves its input's sort order.
      entries: [a, b],
      variants: { seeds: ["1", "2"], cfgValues: [], stepValues: [] },
    };

    // Page 1 contains the group's newest member (a) plus an unrelated card; page 2 contains
    // only the group's other member (b) — as if pagination split the burst across a boundary.
    const page1 = buildGalleryDisplayRows(null, [a, c], new Set(), 2, {
      experimentGroups: [group],
    });
    const page2 = buildGalleryDisplayRows(null, [b], new Set(), 2, {
      experimentGroups: [group],
    });

    assert.equal(page1[0]?.kind, "experiment");
    if (page1[0]?.kind === "experiment") {
      // Renders the FULL group (both a and b), not just the subset present on this page.
      assert.deepEqual(page1[0].entries.map(item => item.id), ["a", "b"]);
    }
    assert.ok(page1.some(row => row.kind === "cards"));

    // The block must not reappear on page 2, and b must not leak through as a stray card.
    assert.ok(!page2.some(row => row.kind === "experiment"));
    assert.equal(countGalleryDisplayEntries(page2), 0);
  });
});

describe("normalizeExperimentGroupAnchors", () => {
  it("reorders a group's entries to match sortedSource's order, not the group's own sort", () => {
    const a = entry("a");
    const b = entry("b");
    const c = entry("c");
    // sortedSource order: a, b, c (newest-first). The group's own `entries` list is in the
    // OPPOSITE order, as groupGalleryQueueRuns produces (oldest-first): c, b — its "anchor"
    // (entries[0]) is c, which sortedSource actually walks past LAST among the group's members.
    const sortedSource = [a, b, c];
    const group = {
      id: "run-group",
      label: "run",
      parentPrompt: "run",
      entries: [c, b],
      variants: { seeds: [], cfgValues: [], stepValues: [] },
    };

    const [normalized] = normalizeExperimentGroupAnchors([group], sortedSource);

    // After normalization, entries[0] (the anchor) is b — the group's member that appears
    // earliest when walking sortedSource in its real order.
    assert.deepEqual(normalized?.entries.map(item => item.id), ["b", "c"]);
  });

  it("is a no-op for a group whose entries already match sortedSource's order", () => {
    const a = entry("a");
    const b = entry("b");
    const sortedSource = [a, b, entry("c")];
    const group = {
      id: "same-order",
      label: "same order",
      parentPrompt: "same order",
      entries: [a, b],
      variants: { seeds: [], cfgValues: [], stepValues: [] },
    };

    const [normalized] = normalizeExperimentGroupAnchors([group], sortedSource);

    assert.deepEqual(normalized?.entries.map(item => item.id), ["a", "b"]);
  });
});

describe("paginateGalleryEntriesWithGroups", () => {
  it("matches flat slicing when there are no experiment groups", () => {
    const entries = Array.from({ length: 50 }, (_, index) => entry(`e${index}`));
    const page1 = paginateGalleryEntriesWithGroups(entries, null, 1, 24);
    const page2 = paginateGalleryEntriesWithGroups(entries, null, 2, 24);

    assert.equal(page1.totalPages, 3);
    assert.equal(page1.items.length, 24);
    assert.equal(page1.items[0]?.id, "e0");
    assert.equal(page2.items.length, 24);
    assert.equal(page2.items[0]?.id, "e24");
  });

  it("never leaves a later page empty when big groups anchored on an earlier page consume its index range", () => {
    // Reproduces the reported bug: two sizeable experiment groups sitting back-to-back near the
    // top of the sorted list. Flat index-based pagination has no idea group B's tail spills past
    // a 24-item page boundary, so its non-anchor members get silently claimed away from whatever
    // page they land on — if that claimed range happens to fill an entire page, that page renders
    // completely empty even though normal (non-grouped) entries exist further down the list.
    const groupA = Array.from({ length: 15 }, (_, index) => entry(`a${index}`));
    const groupB = Array.from({ length: 33 }, (_, index) => entry(`b${index}`));
    const normals = Array.from({ length: 10 }, (_, index) => entry(`c${index}`));
    const sortedSource = [...groupA, ...groupB, ...normals];
    const experimentGroups = [
      {
        id: "group-a",
        label: "group a",
        parentPrompt: "group a",
        entries: groupA,
        variants: { seeds: [], cfgValues: [], stepValues: [] },
      },
      {
        id: "group-b",
        label: "group b",
        parentPrompt: "group b",
        entries: groupB,
        variants: { seeds: [], cfgValues: [], stepValues: [] },
      },
    ];

    const page1 = paginateGalleryEntriesWithGroups(sortedSource, experimentGroups, 1, 24);
    const page2 = paginateGalleryEntriesWithGroups(sortedSource, experimentGroups, 2, 24);
    const page3 = paginateGalleryEntriesWithGroups(sortedSource, experimentGroups, 3, 24);

    assert.equal(page1.totalPages, 3);
    // Group A (15) gets its own page rather than bleeding into group B's territory.
    assert.deepEqual(page1.items.map(e => e.id).sort(), groupA.map(e => e.id).sort());
    assert.equal(page1.rangeStart, 1);
    assert.equal(page1.rangeEnd, 15);
    // Group B (33) is larger than one page but still renders whole, on its own page — not empty.
    assert.equal(page2.items.length, 33);
    assert.deepEqual(page2.items.map(e => e.id).sort(), groupB.map(e => e.id).sort());
    assert.equal(page2.rangeStart, 16);
    assert.equal(page2.rangeEnd, 48);
    // The unrelated normal entries still show up on the following page.
    assert.deepEqual(page3.items.map(e => e.id).sort(), normals.map(e => e.id).sort());
    assert.equal(page3.rangeStart, 49);
    assert.equal(page3.rangeEnd, 58);

    const allReturned = [...page1.items, ...page2.items, ...page3.items].map(e => e.id).sort();
    assert.deepEqual(allReturned, sortedSource.map(e => e.id).sort());
  });

  it("never plans the same group onto more than one page when its anchor id appears twice in sortedSource", () => {
    // Reproduces the reported bug: an upstream merge/sync/poll gap hands this function the same
    // entry id twice. When that duplicated id is a group's anchor, the old planning walk (which
    // didn't dedupe) would push a full-weight slot for it once per occurrence, qualifying the
    // SAME group for placement on multiple independent pages — the exact same experiment block
    // would then render again on every later page it happened to land on.
    const anchorEntry = entry("anchor-1");
    const groupMember2 = entry("member-2");
    const normals = Array.from({ length: 48 }, (_, index) => entry(`c${index}`));
    const sortedSource = [
      anchorEntry,
      groupMember2,
      ...normals.slice(0, 22),
      anchorEntry, // duplicate re-appears ~24 later, as if merged in from a second batch
      ...normals.slice(22, 48),
    ];
    const group = {
      id: "dup-group",
      label: "dup group",
      parentPrompt: "dup group",
      entries: [anchorEntry, groupMember2],
      variants: { seeds: [], cfgValues: [], stepValues: [] },
    };
    const experimentGroups = [group];

    const { totalPages } = paginateGalleryEntriesWithGroups(sortedSource, experimentGroups, 1, 24);
    assert.ok(totalPages >= 2);

    let pagesWithAnchor = 0;
    for (let page = 1; page <= totalPages; page += 1) {
      const result = paginateGalleryEntriesWithGroups(sortedSource, experimentGroups, page, 24);
      if (result.items.some(item => item.id === "anchor-1")) {
        pagesWithAnchor += 1;
      }
    }

    assert.equal(pagesWithAnchor, 1);
  });

  it("pageForGalleryEntryWithGroups returns the weighted page for experiment members", () => {
    const groupA = Array.from({ length: 15 }, (_, index) => entry(`a${index}`));
    const groupB = Array.from({ length: 33 }, (_, index) => entry(`b${index}`));
    const normals = Array.from({ length: 10 }, (_, index) => entry(`c${index}`));
    const sortedSource = [...groupA, ...groupB, ...normals];
    const experimentGroups = [
      {
        id: "group-a",
        label: "group a",
        parentPrompt: "group a",
        entries: groupA,
        variants: { seeds: [], cfgValues: [], stepValues: [] },
      },
      {
        id: "group-b",
        label: "group b",
        parentPrompt: "group b",
        entries: groupB,
        variants: { seeds: [], cfgValues: [], stepValues: [] },
      },
    ];

    assert.equal(pageForGalleryEntryWithGroups(sortedSource, experimentGroups, "a0", 24), 1);
    assert.equal(pageForGalleryEntryWithGroups(sortedSource, experimentGroups, "b10", 24), 2);
    assert.equal(pageForGalleryEntryWithGroups(sortedSource, experimentGroups, "c0", 24), 3);
  });
});
