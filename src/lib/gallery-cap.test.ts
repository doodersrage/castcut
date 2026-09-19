import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capGalleryEntriesForLocalStorage } from "./gallery-cap";

function entry(
  id: string,
  overrides: Partial<{
    favorite: boolean;
    reviewRating: 1 | 2 | 3 | 4 | 5;
    queuedAt: number;
    completedAt: number;
  }> = {},
) {
  return { id, queuedAt: 0, ...overrides };
}

describe("capGalleryEntriesForLocalStorage", () => {
  it("keeps Cast look plate ids when protectedIds are provided", () => {
    const entries = [
      entry("old-plate", { queuedAt: 1 }),
      entry("new-1", { queuedAt: 3 }),
      entry("new-2", { queuedAt: 4 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2, new Set(["old-plate"]));
    assert.ok(result.kept.some(e => e.id === "old-plate"));
    assert.equal(result.evicted.some(e => e.id === "old-plate"), false);
  });

  it("returns entries unchanged when under the cap", () => {
    const entries = [entry("a"), entry("b")];
    const result = capGalleryEntriesForLocalStorage(entries, 5);
    assert.deepEqual(result.kept, entries);
    assert.deepEqual(result.evicted, []);
  });

  it("evicts the oldest non-favorite, unrated entries first", () => {
    const entries = [
      entry("old-1", { queuedAt: 1 }),
      entry("old-2", { queuedAt: 2 }),
      entry("new-1", { queuedAt: 3 }),
      entry("new-2", { queuedAt: 4 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2);
    assert.deepEqual(result.kept.map((e) => e.id), ["new-2", "new-1"]);
    assert.deepEqual(
      result.evicted.map((e) => e.id).sort(),
      ["old-1", "old-2"],
    );
  });

  it("keeps favorites even when older than unrated entries", () => {
    const entries = [
      entry("fav-old", { queuedAt: 1, favorite: true }),
      entry("plain-new-1", { queuedAt: 5 }),
      entry("plain-new-2", { queuedAt: 4 }),
      entry("plain-new-3", { queuedAt: 3 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2);
    const keptIds = result.kept.map((e) => e.id);
    assert.equal(keptIds.includes("fav-old"), true);
    assert.equal(keptIds.includes("plain-new-3"), false);
    assert.equal(result.kept.length, 2);
  });

  it("keeps 4-5 star rated entries over plain unrated entries", () => {
    const entries = [
      entry("rated-old", { queuedAt: 1, reviewRating: 5 }),
      entry("plain-new-1", { queuedAt: 10 }),
      entry("plain-new-2", { queuedAt: 9 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2);
    const keptIds = result.kept.map((e) => e.id);
    assert.equal(keptIds.includes("rated-old"), true);
    assert.equal(result.kept.length, 2);
  });

  it("does not treat 1-3 star ratings as keepers", () => {
    const entries = [
      entry("low-rated-old", { queuedAt: 1, reviewRating: 3 }),
      entry("plain-new-1", { queuedAt: 10 }),
      entry("plain-new-2", { queuedAt: 9 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2);
    const keptIds = result.kept.map((e) => e.id);
    assert.equal(keptIds.includes("low-rated-old"), false);
  });

  it("truncates keepers by recency when keepers alone exceed the cap", () => {
    const entries = [
      entry("fav-1", { queuedAt: 1, favorite: true }),
      entry("fav-2", { queuedAt: 2, favorite: true }),
      entry("fav-3", { queuedAt: 3, favorite: true }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 2);
    assert.deepEqual(result.kept.map((e) => e.id), ["fav-3", "fav-2"]);
    assert.deepEqual(result.evicted.map((e) => e.id), ["fav-1"]);
  });

  it("uses completedAt over queuedAt for recency when both are set", () => {
    const entries = [
      entry("queued-later", { queuedAt: 10, completedAt: 1 }),
      entry("completed-later", { queuedAt: 1, completedAt: 10 }),
    ];
    const result = capGalleryEntriesForLocalStorage(entries, 1);
    assert.deepEqual(result.kept.map((e) => e.id), ["completed-later"]);
  });
});
