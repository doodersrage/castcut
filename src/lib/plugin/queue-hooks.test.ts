import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPluginQueueHooks,
  savePluginQueueHooks,
  loadManifestPluginQueueHooks,
  resolveActivePluginQueueHooks,
  runPluginQueuePreflight,
  dispatchPluginLifecycleHooks,
} from "./queue-hooks";

describe("plugin-queue-hooks (Node-safe sync helpers)", () => {
  it("loadPluginQueueHooks returns [] when there is no window", () => {
    assert.deepEqual(loadPluginQueueHooks(), []);
  });

  it("savePluginQueueHooks is a no-op that does not throw when there is no window", () => {
    assert.doesNotThrow(() => savePluginQueueHooks([{ id: "a", label: "A", url: "/x" }]));
  });

  it("loadManifestPluginQueueHooks returns [] when there is no window", () => {
    assert.deepEqual(loadManifestPluginQueueHooks(), []);
  });
});

describe("resolveActivePluginQueueHooks", () => {
  it("merges manual and manifest hooks, with manual winning on id collision", () => {
    const manual = [{ id: "shared", label: "Manual", url: "/manual" }];
    const manifest = [{ id: "shared", label: "Manifest", url: "/manifest", enabled: true }];
    const result = resolveActivePluginQueueHooks(manual, manifest);
    assert.deepEqual(result, [{ id: "shared", label: "Manual", url: "/manual" }]);
  });
});

describe("runPluginQueuePreflight", () => {
  it("returns the payload unchanged, not blocked, no messages, for an empty hook list", async () => {
    const result = await runPluginQueuePreflight({ event: "queue-preflight", prompt: "x" }, []);
    assert.deepEqual(result, {
      payload: { event: "queue-preflight", prompt: "x" },
      blocked: false,
      messages: [],
    });
  });

  it("skips a hook with a disallowed (non-http/https, non-same-origin) url without calling fetch", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "x" },
        [{ id: "bad", label: "Bad", url: "ftp://evil.example" }]
      );
      assert.deepEqual(result, {
        payload: { event: "queue-preflight", prompt: "x" },
        blocked: false,
        messages: [],
      });
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("skips a disabled hook without calling fetch", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "x" },
        [{ id: "off", label: "Off", url: "/hook", enabled: false }]
      );
      assert.deepEqual(result, {
        payload: { event: "queue-preflight", prompt: "x" },
        blocked: false,
        messages: [],
      });
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("mutates the payload from a successful hook response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ prompt: "rewritten prompt", denoise: 0.5 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "orig" },
        [{ id: "h1", label: "Hook1", url: "/hook1" }]
      );
      assert.deepEqual(result, {
        payload: { event: "queue-preflight", prompt: "rewritten prompt", denoise: 0.5 },
        blocked: false,
        messages: [],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stops the chain as soon as a hook reports blocked, without calling later hooks", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ blocked: true, reason: "nope" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "orig" },
        [
          { id: "h1", label: "Hook1", url: "/hook1" },
          { id: "h2", label: "Hook2", url: "/hook2" },
        ]
      );
      assert.equal(result.blocked, true);
      assert.equal((result as { reason?: string }).reason, "nope");
      assert.deepEqual(result.messages, ["Hook1: nope"]);
      assert.equal(callCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("pushes an HTTP-status message and leaves the payload untouched when a hook responds not-ok", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "orig" },
        [{ id: "h1", label: "Hook1", url: "/hook1" }]
      );
      assert.deepEqual(result, {
        payload: { event: "queue-preflight", prompt: "orig" },
        blocked: false,
        messages: ["Hook1: HTTP 500"],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("catches a thrown fetch error and pushes it as a message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const result = await runPluginQueuePreflight(
        { event: "queue-preflight", prompt: "orig" },
        [{ id: "h1", label: "Hook1", url: "/hook1" }]
      );
      assert.deepEqual(result, {
        payload: { event: "queue-preflight", prompt: "orig" },
        blocked: false,
        messages: ["Hook1: network down"],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("dispatchPluginLifecycleHooks", () => {
  it("silently swallows fetch errors and resolves without throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const result = await dispatchPluginLifecycleHooks(
        { event: "prompt-generated", prompt: "x" },
        [{ id: "h1", label: "Hook1", url: "/hook1" }]
      );
      assert.equal(result, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
