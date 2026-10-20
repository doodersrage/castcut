import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortByRankIds } from "../search/embedding-rank";
import { planReadinessAutoFix } from "../checks/readiness-auto-fix";
import {
  DEFAULT_READINESS_MIN_SCORE,
  isReadinessQueueAllowed,
  readinessGateMessage,
} from "../checks/readiness-gate";
import { scorePromptReadiness } from "../prompt/readiness";

describe("readiness gate", () => {
  it("blocks queue below threshold by default", () => {
    assert.equal(isReadinessQueueAllowed(59, DEFAULT_READINESS_MIN_SCORE), false);
    assert.equal(isReadinessQueueAllowed(60, DEFAULT_READINESS_MIN_SCORE), true);
    assert.match(readinessGateMessage(45), /45\/100/);
  });
});

describe("readiness auto-fix plan", () => {
  it("plans compact and fix-rules for common failures", () => {
    const result = scorePromptReadiness({
      prompt: "bike",
      model: "flux-dev",
      detail: "rich",
    });
    const actions = planReadinessAutoFix(result);
    assert.ok(actions.includes("compact") || actions.includes("fix-rules") || actions.includes("reformat"));
  });
});

describe("embedding rank sort", () => {
  it("sorts and filters by rank ids", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const sorted = sortByRankIds(items, ["c", "a"]);
    assert.deepEqual(sorted.map((item) => item.id), ["c", "a"]);
  });
});
