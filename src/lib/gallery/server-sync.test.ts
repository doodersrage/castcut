import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterOutDeletedGalleryEntries,
  mergeGalleryDeletedIds,
} from "./deleted-ids";
import { mergeGalleryWithServer } from "./server-sync";

function entry(id: string, queuedAt: number, completedAt?: number) {
  return { id, queuedAt, completedAt };
}

describe("gallery deleted ids", () => {
  it("merges tombstone lists without duplicates", () => {
    assert.deepEqual(mergeGalleryDeletedIds(["a", "b"], ["b", "c"]), [
      "a",
      "b",
      "c",
    ]);
  });

  it("filters tombstoned entries from a list", () => {
    const kept = filterOutDeletedGalleryEntries(
      [entry("a", 1), entry("b", 2), entry("c", 3)],
      ["b"],
    );
    assert.deepEqual(
      kept.map((e) => e.id),
      ["a", "c"],
    );
  });
});

describe("mergeGalleryWithServer", () => {
  it("adds server-only entries to the merged list", () => {
    const local = [entry("a", 1)];
    const server = [entry("a", 1), entry("b", 2)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.addedFromServer, 1);
    assert.equal(result.updatedFromServer, 0);
    assert.equal(result.merged.length, 2);
    assert.equal(result.merged.some((e) => e.id === "b"), true);
  });

  it("does not resurrect tombstoned server entries", () => {
    const local = [entry("a", 1)];
    const server = [entry("a", 1), entry("deleted", 9)];
    const result = mergeGalleryWithServer(local, server, ["deleted"]);
    assert.equal(result.addedFromServer, 0);
    assert.equal(result.skippedDeleted, 1);
    assert.equal(result.merged.some((e) => e.id === "deleted"), false);
  });

  it("keeps local-only entries untouched", () => {
    const local = [entry("local-only", 5)];
    const server: ReturnType<typeof entry>[] = [];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.merged.length, 1);
    assert.equal(result.addedFromServer, 0);
    assert.equal(result.updatedFromServer, 0);
  });

  it("prefers the newer completedAt when both sides share an id", () => {
    const local = [entry("shared", 1, 10)];
    const server = [entry("shared", 1, 20)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 1);
    assert.equal(result.merged[0]?.completedAt, 20);
  });

  it("keeps the local copy when it is newer than the server copy", () => {
    const local = [entry("shared", 1, 30)];
    const server = [entry("shared", 1, 20)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 0);
    assert.equal(result.merged[0]?.completedAt, 30);
  });

  it("falls back to queuedAt when completedAt is missing on both sides", () => {
    const local = [entry("shared", 5)];
    const server = [entry("shared", 9)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 1);
    assert.equal(result.merged[0]?.queuedAt, 9);
  });

  it("keeps a local in-flight job instead of an older server pending copy", () => {
    const local = [{ id: "job", queuedAt: 5, status: "running" as const, progressValue: 12 }];
    const server = [{ id: "job", queuedAt: 5, status: "pending" as const }];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 0);
    assert.equal(result.merged[0]?.status, "running");
  });

  it("takes a server completed copy over a local pending job", () => {
    const local = [{ id: "job", queuedAt: 5, status: "pending" as const }];
    const server = [{ id: "job", queuedAt: 5, completedAt: 20, status: "completed" as const }];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 1);
    assert.equal(result.merged[0]?.status, "completed");
  });

  it("sorts the merged list newest-first", () => {
    const local = [entry("older", 1), entry("newer", 3)];
    const server = [entry("middle", 2)];
    const result = mergeGalleryWithServer(local, server);
    assert.deepEqual(
      result.merged.map((e) => e.id),
      ["newer", "middle", "older"],
    );
  });
});
