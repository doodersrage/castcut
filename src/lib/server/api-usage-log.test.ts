import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listApiUsage, logApiUsage, summarizeApiUsage } from "./api-usage-log";

describe("api-usage-log", () => {
  it("logs entries, most recent first, each with a generated id", () => {
    const now = Date.now();
    logApiUsage({ at: now, method: "GET", path: "/a", status: 200, durationMs: 10, clientKey: "k1" });
    logApiUsage({ at: now, method: "GET", path: "/b", status: 429, durationMs: 20, clientKey: "k1", rateLimited: true });

    const list = listApiUsage(2);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.path, "/b");
    assert.equal(list[1]!.path, "/a");
    assert.match(list[0]!.id, /^\d+-[a-z0-9]{6}$/);
  });

  it("listApiUsage caps the returned count at the requested limit", () => {
    assert.equal(listApiUsage(1).length, 1);
  });

  it("summarizeApiUsage aggregates total, last-hour count, rate-limited count, and avg duration", () => {
    const summary = summarizeApiUsage();
    assert.equal(summary.total, 2);
    assert.equal(summary.lastHour, 2);
    assert.equal(summary.rateLimited, 1);
    assert.equal(summary.avgDurationMs, 15);
  });

  it("summarizeApiUsage excludes entries older than an hour from lastHour/rateLimited/avg", () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    logApiUsage({ at: twoHoursAgo, method: "GET", path: "/old", status: 500, durationMs: 999, clientKey: "k2", rateLimited: true });
    const summary = summarizeApiUsage();
    assert.equal(summary.total, 3);
    assert.equal(summary.lastHour, 2);
    assert.equal(summary.rateLimited, 1);
    assert.equal(summary.avgDurationMs, 15);
  });
});
