import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser, AuthGroup } from "../auth/types";
import { resolveUserQuotaMax, checkUserRateLimit } from "./quotas";

function fakeUser(patch: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    username: "alice",
    passwordHash: "x",
    role: "user",
    groupIds: [],
    blockedFeatures: [],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

function fakeGroup(patch: Partial<AuthGroup> = {}): AuthGroup {
  return {
    id: "g1",
    name: "Group",
    blockedFeatures: [],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("resolveUserQuotaMax", () => {
  it("falls back to 120 (no API_RATE_LIMIT_MAX env override) for an anonymous user", () => {
    assert.equal(resolveUserQuotaMax(null, []), 120);
  });

  it("prefers the user's own quotaMaxPerMinute over any group quota", () => {
    const user = fakeUser({ quotaMaxPerMinute: 42, groupIds: ["g1"] });
    const groups = [fakeGroup({ id: "g1", quotaMaxPerMinute: 5 })];
    assert.equal(resolveUserQuotaMax(user, groups), 42);
  });

  it("falls through to a matching group's quota when the user has none set", () => {
    const user = fakeUser({ quotaMaxPerMinute: 0, groupIds: ["g1"] });
    const groups = [fakeGroup({ id: "g1", quotaMaxPerMinute: 30 })];
    assert.equal(resolveUserQuotaMax(user, groups), 30);
  });

  it("falls back to the default when no group matches the user's groupIds", () => {
    const user = fakeUser({ groupIds: ["missing"] });
    const groups = [fakeGroup({ id: "g1", quotaMaxPerMinute: 30 })];
    assert.equal(resolveUserQuotaMax(user, groups), 120);
  });

  it("honors an API_RATE_LIMIT_MAX env override for the fallback", () => {
    const original = process.env.API_RATE_LIMIT_MAX;
    process.env.API_RATE_LIMIT_MAX = "55";
    try {
      assert.equal(resolveUserQuotaMax(null, []), 55);
    } finally {
      if (original === undefined) {
        delete process.env.API_RATE_LIMIT_MAX;
      } else {
        process.env.API_RATE_LIMIT_MAX = original;
      }
    }
  });
});

describe("checkUserRateLimit", () => {
  it("enforces the resolved max and denies once the bucket is exhausted", () => {
    const user = fakeUser({ id: "quota-test-user-1", quotaMaxPerMinute: 2 });
    const call = () =>
      checkUserRateLimit({ user, groups: [], clientKey: "ck", path: "quota-test-path-1" });

    const r1 = call();
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 1);

    const r2 = call();
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 0);

    const r3 = call();
    assert.equal(r3.allowed, false);
    assert.equal(r3.remaining, 0);
    assert.equal((r3 as { retryAfterSec: number }).retryAfterSec, 60);
  });

  it("keys an anonymous user's bucket by clientKey and uses the env-default max", () => {
    const result = checkUserRateLimit({
      user: null,
      groups: [],
      clientKey: "anon-quota-test-key",
      path: "quota-test-path-2",
    });
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 119);
  });
});
