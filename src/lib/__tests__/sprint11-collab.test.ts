import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pruneStalePeers,
  shouldWarnRemoteDraft,
  upsertPresencePeer,
} from "../storage/collab-presence";

describe("collab presence", () => {
  it("upserts and prunes peers", () => {
    const now = Date.now();
    let peers = upsertPresencePeer([], {
      peerId: "a",
      displayName: "Ada",
      projectId: "p1",
      lastSeenAt: now,
    });
    peers = upsertPresencePeer(peers, {
      peerId: "b",
      displayName: "Bea",
      projectId: "p1",
      lastSeenAt: now - 60_000,
    });
    peers = pruneStalePeers(peers, now, 15_000);
    assert.equal(peers.length, 1);
    assert.equal(peers[0].peerId, "a");
  });

  it("warns on newer remote drafts from others", () => {
    assert.equal(
      shouldWarnRemoteDraft(1000, {
        projectId: "p",
        peerId: "other",
        draft: "x",
        updatedAt: 2000,
      }, "self"),
      true,
    );
    assert.equal(
      shouldWarnRemoteDraft(1000, {
        projectId: "p",
        peerId: "self",
        draft: "x",
        updatedAt: 2000,
      }, "self"),
      false,
    );
  });
});
