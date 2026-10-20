import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetBrowserStorageCache,
  withSuppressedDurableSyncPush,
} from "../storage/browser-storage";
import {
  loadPromptRecipes,
  upsertPromptRecipe,
  runPromptRecipeSteps,
} from "./recipes";

// The recipes storage key is one of the DURABLE_BROWSER_SYNC_KEYS, so an
// unguarded save schedules a real 5s setTimeout + dynamic import. Wrap every
// upsert in withSuppressedDurableSyncPush to keep this file fast and avoid
// leaving a live timer running past test completion.
function upsertSuppressed(
  ...args: Parameters<typeof upsertPromptRecipe>
): ReturnType<typeof upsertPromptRecipe> {
  return withSuppressedDurableSyncPush(() => upsertPromptRecipe(...args));
}

describe("prompt-recipes (Node-safe, no window)", () => {
  it("loadPromptRecipes returns [] when there is no window", () => {
    assert.deepEqual(loadPromptRecipes(), []);
  });
});

describe("upsertPromptRecipe / loadPromptRecipes with window stub", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
        },
        dispatchEvent: () => undefined,
      },
    });
    // browser-storage.ts keeps an in-memory cache Map at module scope; reset it
    // so writes/reads from a previous test in this file don't leak into this one.
    resetBrowserStorageCache();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("inserts new recipes at the front of the list, newest first", () => {
    assert.deepEqual(loadPromptRecipes(), []);

    upsertSuppressed({ id: "a", name: "Recipe A", steps: ["lint"] });
    upsertSuppressed({ id: "b", name: "Recipe B", steps: ["fix"] });

    const stored = loadPromptRecipes();
    assert.equal(stored.length, 2);
    assert.equal(stored[0]!.id, "b");
    assert.equal(stored[1]!.id, "a");
  });

  it("replaces an existing recipe by id and moves it to the front", () => {
    upsertSuppressed({ id: "a", name: "Recipe A", steps: ["lint"] });
    upsertSuppressed({ id: "b", name: "Recipe B", steps: ["fix"] });

    const updated = upsertSuppressed({
      id: "a",
      name: "Recipe A2",
      steps: ["compact"],
      createdAt: 999,
    });
    assert.deepEqual(updated, {
      id: "a",
      name: "Recipe A2",
      steps: ["compact"],
      createdAt: 999,
    });

    const stored = loadPromptRecipes();
    assert.equal(stored.length, 2);
    assert.deepEqual(stored[0], {
      id: "a",
      name: "Recipe A2",
      steps: ["compact"],
      createdAt: 999,
    });
    assert.equal(stored[1]!.id, "b");
  });

  it("defaults createdAt to the current time when not provided", () => {
    const before = Date.now();
    const created = upsertSuppressed({ id: "c", name: "Recipe C", steps: [] });
    const after = Date.now();
    assert.ok(created.createdAt >= before && created.createdAt <= after);
  });
});

describe("runPromptRecipeSteps with stubbed fetch", () => {
  let originalFetch: typeof fetch;
  let calls: Array<{ url: string; body: unknown }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(responses: Record<string, unknown>) {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      const body = responses[String(url)] ?? {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("lint step logs 'Lint passed' when ok, 'Lint reported issues' otherwise, and never edits the prompt", async () => {
    stubFetch({ "/api/lint": { ok: true } });
    const resultOk = await runPromptRecipeSteps("hello", ["lint"], "qwen-image-2512");
    assert.deepEqual(resultOk, { prompt: "hello", log: ["Lint passed"] });
    assert.deepEqual(calls, [
      { url: "/api/lint", body: { prompt: "hello", model: "qwen-image-2512" } },
    ]);

    calls = [];
    stubFetch({ "/api/lint": { ok: false } });
    const resultBad = await runPromptRecipeSteps("hello", ["lint"], "qwen-image-2512");
    assert.deepEqual(resultBad, { prompt: "hello", log: ["Lint reported issues"] });
  });

  it("fix step updates the prompt and logs only when a fixed prompt is returned", async () => {
    stubFetch({ "/api/fix": { prompt: "fixed prompt" } });
    const resultFixed = await runPromptRecipeSteps("hello", ["fix"], "qwen-image-2512");
    assert.deepEqual(resultFixed, { prompt: "fixed prompt", log: ["Applied rule fixes"] });

    calls = [];
    stubFetch({ "/api/fix": {} });
    const resultNoop = await runPromptRecipeSteps("hello", ["fix"], "qwen-image-2512");
    assert.deepEqual(resultNoop, { prompt: "hello", log: [] });
  });

  it("compact step updates the prompt and logs 'Compacted prompt' when a compacted prompt is returned", async () => {
    stubFetch({ "/api/compact": { prompt: "compacted" } });
    const result = await runPromptRecipeSteps("hello world", ["compact"], "qwen-image-2512");
    assert.deepEqual(result, { prompt: "compacted", log: ["Compacted prompt"] });
  });

  it("threads the evolving prompt through each step's fetch body in sequence", async () => {
    stubFetch({
      "/api/lint": { ok: true },
      "/api/fix": { prompt: "step2-fixed" },
      "/api/compact": { prompt: "step3-compacted" },
    });
    const result = await runPromptRecipeSteps(
      "start",
      ["lint", "fix", "compact"],
      "qwen-image-2512"
    );
    assert.deepEqual(result, {
      prompt: "step3-compacted",
      log: ["Lint passed", "Applied rule fixes", "Compacted prompt"],
    });
    assert.deepEqual(calls, [
      { url: "/api/lint", body: { prompt: "start", model: "qwen-image-2512" } },
      { url: "/api/fix", body: { prompt: "start", model: "qwen-image-2512" } },
      { url: "/api/compact", body: { prompt: "step2-fixed", model: "qwen-image-2512" } },
    ]);
  });

  it("returns the original prompt with an empty log for an empty steps list", async () => {
    const result = await runPromptRecipeSteps("unchanged", [], "qwen-image-2512");
    assert.deepEqual(result, { prompt: "unchanged", log: [] });
  });
});
