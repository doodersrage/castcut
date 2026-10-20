import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NEGATIVE_PROFILES,
  appendTokensToNegativeProfileExtra,
  resolveNegativeProfile,
  fetchNegativeWithProfile,
  type NegativeProfile,
} from "./negative-profiles";

describe("appendTokensToNegativeProfileExtra", () => {
  const profiles: NegativeProfile[] = [
    { id: "p1", label: "P1" },
    { id: "p2", label: "P2", extra: "foo, bar" },
  ];

  it("returns the same profiles reference and added:0 when tokens is empty", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p1", []);
    assert.equal(result.profiles, profiles);
    assert.equal(result.added, 0);
  });

  it("returns the same profiles reference and added:0 when tokens are whitespace-only", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p1", ["  ", ""]);
    assert.equal(result.profiles, profiles);
    assert.equal(result.added, 0);
  });

  it("adds tokens to a profile with no existing extra", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p1", ["baz", "qux"]);
    assert.equal(result.added, 2);
    assert.deepEqual(result.profiles, [
      { id: "p1", label: "P1", extra: "baz, qux" },
      { id: "p2", label: "P2", extra: "foo, bar" },
    ]);
    // Original array/object are not mutated.
    assert.equal(profiles[0]!.extra, undefined);
  });

  it("merges into an existing extra, skipping duplicates", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p2", ["baz", "foo"]);
    assert.equal(result.added, 1);
    assert.deepEqual(result.profiles, [
      { id: "p1", label: "P1" },
      { id: "p2", label: "P2", extra: "foo, bar, baz" },
    ]);
  });

  it("adds nothing when every token is already present", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p2", ["foo", "bar"]);
    assert.equal(result.added, 0);
    assert.deepEqual(result.profiles, [
      { id: "p1", label: "P1" },
      { id: "p2", label: "P2", extra: "foo, bar" },
    ]);
  });

  it("dedupes a token repeated within the input tokens array", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "p2", ["dup", "dup", "dup"]);
    assert.equal(result.added, 1);
    assert.deepEqual(result.profiles, [
      { id: "p1", label: "P1" },
      { id: "p2", label: "P2", extra: "foo, bar, dup" },
    ]);
  });

  it("leaves profiles unchanged when profileId matches nothing", () => {
    const result = appendTokensToNegativeProfileExtra(profiles, "missing-id", ["x"]);
    assert.equal(result.added, 0);
    assert.deepEqual(result.profiles, profiles);
  });
});

describe("resolveNegativeProfile", () => {
  it("defaults to the first DEFAULT_NEGATIVE_PROFILES entry when profiles and profileId are undefined", () => {
    const result = resolveNegativeProfile(undefined, undefined);
    assert.equal(result, DEFAULT_NEGATIVE_PROFILES[0]);
    assert.equal(result?.id, "general-sd");
  });

  it("finds a matching entry in DEFAULT_NEGATIVE_PROFILES by id", () => {
    const result = resolveNegativeProfile(undefined, "portrait");
    assert.equal(result?.id, "portrait");
    assert.equal(result?.label, "Portrait");
  });

  it("falls back to the first default entry when profileId matches nothing", () => {
    const result = resolveNegativeProfile(undefined, "nope");
    assert.equal(result, DEFAULT_NEGATIVE_PROFILES[0]);
  });

  it("falls back to DEFAULT_NEGATIVE_PROFILES when profiles is an empty array", () => {
    const result = resolveNegativeProfile([], undefined);
    assert.equal(result, DEFAULT_NEGATIVE_PROFILES[0]);
  });

  const custom: NegativeProfile[] = [
    { id: "c1", label: "Custom1" },
    { id: "c2", label: "Custom2" },
  ];

  it("finds a matching entry in a custom profiles list", () => {
    const result = resolveNegativeProfile(custom, "c2");
    assert.equal(result, custom[1]);
  });

  it("falls back to the first custom entry when profileId matches nothing", () => {
    const result = resolveNegativeProfile(custom, "nope");
    assert.equal(result, custom[0]);
  });

  it("falls back to the first custom entry when profileId is whitespace-only", () => {
    const result = resolveNegativeProfile(custom, "   ");
    assert.equal(result, custom[0]);
  });

  it("falls back to the first custom entry when profileId is an empty string", () => {
    const result = resolveNegativeProfile(custom, "");
    assert.equal(result, custom[0]);
  });
});

describe("fetchNegativeWithProfile with stubbed fetch", () => {
  let originalFetch: typeof fetch;
  let calls: Array<{ url: string; body: unknown }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(status: number, body: unknown) {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("short-circuits on a static prompt without calling fetch", async () => {
    const result = await fetchNegativeWithProfile({
      profile: { id: "x", label: "X", staticPrompt: "  static value  " },
    });
    assert.equal(result, "static value");
    assert.equal(calls.length, 0);
  });

  it("calls fetch with input hints taking priority over profile hints, plus sport/preserveSubject/extra, and returns the trimmed prompt", async () => {
    stubFetch(200, { prompt: "  generated negative  " });
    const result = await fetchNegativeWithProfile({
      profile: {
        id: "x",
        label: "X",
        hints: "profile hints",
        sport: "cycling",
        preserveSubject: true,
        extra: "extra stuff",
      },
      hints: "  input hints  ",
      sport: "running",
    });
    assert.equal(result, "generated negative");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      url: "/api/negative",
      body: {
        hints: "input hints",
        sport: "running",
        preserveSubject: true,
        extra: "extra stuff",
      },
    });
  });

  it("falls back to profile hints/sport when input hints/sport are absent", async () => {
    stubFetch(200, { prompt: "ok" });
    await fetchNegativeWithProfile({
      profile: { id: "x", label: "X", hints: "profile hints", sport: "cycling" },
    });
    assert.equal(calls.length, 1);
    // preserveSubject/extra are undefined here, so JSON.stringify drops them
    // from the serialized (and thus parsed-back) request body entirely.
    assert.deepEqual(calls[0], {
      url: "/api/negative",
      body: { hints: "profile hints", sport: "cycling" },
    });
  });

  it("returns null when the response is not ok", async () => {
    stubFetch(500, { error: "boom" });
    const result = await fetchNegativeWithProfile({ hints: "h" });
    assert.equal(result, null);
  });

  it("returns null when the response has no prompt", async () => {
    stubFetch(200, {});
    const result = await fetchNegativeWithProfile({ hints: "h" });
    assert.equal(result, null);
  });

  it("still calls fetch with an empty body when there is no profile and no hints/sport", async () => {
    stubFetch(200, { prompt: "no-profile-prompt" });
    const result = await fetchNegativeWithProfile({});
    assert.equal(result, "no-profile-prompt");
    assert.deepEqual(calls[0], { url: "/api/negative", body: {} });
  });
});
