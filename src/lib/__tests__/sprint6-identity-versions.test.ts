import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeComposeIdentityKind } from "../prompt/compose-identity-lock";
import {
  computePromptContentHash,
  formatPromptVersionLabel,
  nextPromptVersionFields,
} from "../prompt/versioning";
import { getIdentityPackHealth } from "../character/identity-pack-health";

describe("sprint6 identity kinds", () => {
  it("normalizes identity kind", () => {
    assert.equal(normalizeComposeIdentityKind("pulid"), "pulid");
    assert.equal(normalizeComposeIdentityKind("auto"), "auto");
    assert.equal(normalizeComposeIdentityKind("nope"), "ipadapter");
  });

  it("reports InstantID ready when nodes present", () => {
    const health = getIdentityPackHealth(
      "instantid",
      new Set(["ApplyInstantID", "KSampler"]),
    );
    assert.equal(health.status, "ready");
  });
});

describe("sprint6 prompt versions", () => {
  it("increments version under a parent root", () => {
    const hash = computePromptContentHash({
      prompt: "a",
      model: "flux-dev",
      loraIds: ["b", "a"],
    });
    const fields = nextPromptVersionFields({
      contentHash: hash,
      parent: { id: "h1", promptVersion: 2, versionRootId: "root" },
      newEntryId: "h2",
    });
    assert.equal(fields.promptVersion, 3);
    assert.equal(fields.versionRootId, "root");
    assert.equal(formatPromptVersionLabel(3), "v3");
  });

  it("starts v1 without parent", () => {
    const fields = nextPromptVersionFields({
      contentHash: "abc",
      newEntryId: "new",
    });
    assert.equal(fields.promptVersion, 1);
    assert.equal(fields.versionRootId, "new");
  });
});
