import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

mock.module("server-only", { defaultExport: {}, namedExports: {} });

// NOTE (confirmed via real execution): checkCollabHealth() resolves its
// dependency with a *dynamic* `await import('../storage/collab-store')` at call time.
// Under this repo's test runtime (node --experimental-test-module-mocks +
// the tsx loader), mock.module() only intercepts *static* imports resolved
// through the module graph — a dynamic import(), whether issued from the
// test file itself or from inside the tested module, still resolves to the
// real, unmocked module. A `mock.module("../storage/collab-store", ...)` +
// mockImplementationOnce() here silently has no effect on checkCollabHealth
// (verified with a minimal repro). So this suite exercises the real
// getCollabBackendStatus() through checkCollabHealth() instead, using env
// that keeps it deterministic and I/O-free: no COLLAB_REDIS_URL (skips the
// ioredis connection attempt entirely) and no PROMPT_DATA_DIR (keeps
// isServerStorageEnabled() false, so no sqlite touch).

type FetchImpl = (url: string, init?: RequestInit) => Response | Promise<Response>;

function installFetchStub(impl: FetchImpl) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  // @ts-expect-error test stub
  globalThis.fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(impl(url, init));
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** An ok-status response whose body is not valid JSON, to exercise the `.json().catch(() => null)` fallbacks. */
function malformedJsonResponse(status = 200): Response {
  return new Response("not actually json", {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

function systemStatsPayload(overrides: {
  vramFree?: number;
  vramTotal?: number;
  ramFree?: number;
  ramTotal?: number;
  version?: string;
  deviceName?: string;
} = {}): unknown {
  return {
    system: {
      comfyui_version: overrides.version ?? "0.3.10",
      ram_free: overrides.ramFree ?? 8_000_000_000,
      ram_total: overrides.ramTotal ?? 32_000_000_000,
    },
    devices: [
      {
        name: overrides.deviceName ?? "cuda:0 NVIDIA GeForce RTX 4090",
        vram_free: overrides.vramFree ?? 20_000_000_000,
        vram_total: overrides.vramTotal ?? 24_000_000_000,
      },
    ],
  };
}

describe("service-health", async () => {
  const {
    getExpandedComfyUiHealth,
    checkLlmHealth,
    checkComfyUiHealth,
    checkDiffusersHealth,
    checkComfyUiPoolHealth,
    checkCollabHealth,
  } = await import("./service-health");

  describe("checkComfyUiHealth", () => {
    it("returns ok:true with parsed stats on a healthy /system_stats response", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "http://comfy.test:8188/system_stats");
        return jsonResponse(systemStatsPayload());
      });
      const health = await checkComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.url, "http://comfy.test:8188");
      assert.deepEqual(health.vram, { free: 20_000_000_000, total: 24_000_000_000 });
      assert.deepEqual(health.ram, { free: 8_000_000_000, total: 32_000_000_000 });
      assert.equal(health.version, "0.3.10");
      assert.equal(health.deviceName, "cuda:0 NVIDIA GeForce RTX 4090");
      assert.equal(stub.calls.length, 1);
    });

    it("returns ok:false with an HTTP <status> error when the response is not ok", async () => {
      const stub = installFetchStub(() => jsonResponse({}, 503));
      const health = await checkComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "HTTP 503");
      assert.equal(health.url, "http://comfy.test:8188");
    });

    it("returns ok:false with the thrown error's message when fetch rejects", async () => {
      const stub = installFetchStub(() => {
        throw new Error("connect ECONNREFUSED");
      });
      const health = await checkComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "connect ECONNREFUSED");
    });

    it("returns ok:false without ever calling fetch when the URL itself is invalid", async () => {
      const stub = installFetchStub(() => jsonResponse(systemStatsPayload()));
      const health = await checkComfyUiHealth({ apiUrl: "not-a-valid-url" });
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.url, "not-a-valid-url");
      assert.ok(health.error, "expected an error message");
      assert.equal(stub.calls.length, 0);
    });

    it("stays ok:true with no stats fields when /system_stats returns 200 with an unparsable body", async () => {
      const stub = installFetchStub(() => malformedJsonResponse());
      const health = await checkComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.vram, undefined);
      assert.equal(health.ram, undefined);
      assert.equal(health.version, undefined);
      assert.equal(health.deviceName, undefined);
    });
  });

  describe("getExpandedComfyUiHealth", () => {
    it("returns just the base health, skipping the 4 extra fetches, when the base check fails", async () => {
      const stub = installFetchStub(() => jsonResponse({}, 500));
      const health = await getExpandedComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "HTTP 500");
      // Only the /system_stats call from checkComfyUiHealth — none of the 4 extras.
      assert.equal(stub.calls.length, 1);
      assert.equal(health.queuePending, undefined);
      assert.equal(health.features, undefined);
    });

    it("merges queue/features/extensions/embeddings onto the base health on the happy path", async () => {
      const stub = installFetchStub(url => {
        if (url.endsWith("/system_stats")) {
          return jsonResponse(systemStatsPayload());
        }
        if (url.endsWith("/queue")) {
          return jsonResponse({ queue_pending: [{ id: "a" }, { id: "b" }], queue_running: [{ id: "c" }] });
        }
        if (url.endsWith("/features")) {
          return jsonResponse({
            supports_preview_metadata: true,
            supports_manager: true,
            supports_manager_v3: false,
          });
        }
        if (url.endsWith("/extensions")) {
          return jsonResponse([
            "/extensions/PackA/main.js",
            "/extensions/PackA/style.css",
            "/extensions/PackB/main.js",
          ]);
        }
        if (url.endsWith("/embeddings")) {
          return jsonResponse(["EasyNegative", "EasyNegative", "bad-hands-5"]);
        }
        throw new Error(`unexpected url ${url}`);
      });

      const health = await getExpandedComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.queuePending, 2);
      assert.equal(health.queueRunning, 1);
      assert.deepEqual(health.features, ["preview metadata", "manager"]);
      assert.equal(health.previewMetadata, true);
      assert.equal(health.extensionPacks, 2);
      assert.equal(health.embeddingCount, 2);
      // 1 base /system_stats + 4 expanded fetches.
      assert.equal(stub.calls.length, 5);
    });

    it("falls back to the base health (extras undefined) when a sub-fetch throws", async () => {
      const stub = installFetchStub(url => {
        if (url.endsWith("/system_stats")) {
          return jsonResponse(systemStatsPayload());
        }
        if (url.endsWith("/queue")) {
          throw new Error("queue endpoint timed out");
        }
        return jsonResponse({});
      });

      const health = await getExpandedComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.queuePending, undefined);
      assert.equal(health.queueRunning, undefined);
      assert.equal(health.features, undefined);
      assert.equal(health.extensionPacks, undefined);
    });

    it("falls back to parser defaults when the extra endpoints return 200 with unparsable JSON bodies", async () => {
      const stub = installFetchStub(url => {
        if (url.endsWith("/system_stats")) {
          return jsonResponse(systemStatsPayload());
        }
        if (url.endsWith("/queue")) {
          return jsonResponse({ queue_pending: [], queue_running: [] });
        }
        // features / extensions / embeddings are all "ok" but not valid JSON.
        return malformedJsonResponse();
      });

      const health = await getExpandedComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.queuePending, 0);
      assert.equal(health.queueRunning, 0);
      assert.equal(health.features, undefined);
      assert.equal(health.previewMetadata, undefined);
      assert.equal(health.extensionPacks, 0);
      assert.equal(health.embeddingCount, 0);
    });

    it("omits features/previewMetadata/extensionPacks/embeddingCount when their sub-fetches are not-ok", async () => {
      const stub = installFetchStub(url => {
        if (url.endsWith("/system_stats")) {
          return jsonResponse(systemStatsPayload());
        }
        if (url.endsWith("/queue")) {
          return jsonResponse({ queue_pending: [], queue_running: [] });
        }
        // features / extensions / embeddings all fail
        return jsonResponse({}, 404);
      });

      const health = await getExpandedComfyUiHealth({ apiUrl: "http://comfy.test:8188" });
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.queuePending, 0);
      assert.equal(health.queueRunning, 0);
      assert.equal(health.features, undefined);
      assert.equal(health.previewMetadata, undefined);
      assert.equal(health.extensionPacks, undefined);
      assert.equal(health.embeddingCount, undefined);
    });
  });

  describe("checkLlmHealth", () => {
    it("returns ok:false with the LLM_ENABLED=false error, without ever calling fetch, when disabled", async () => {
      const stub = installFetchStub(() => jsonResponse({ data: [] }));
      const health = await withEnv({ LLM_ENABLED: "false" }, () => checkLlmHealth());
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.enabled, false);
      assert.equal(health.error, "LLM_ENABLED=false");
      assert.equal(stub.calls.length, 0);
    });

    it("returns ok:true on a healthy /models response, forwarding an Authorization header when apiKey is set", async () => {
      const stub = installFetchStub((url, init) => {
        assert.equal(url, "http://llm.test:11434/v1/models");
        assert.equal(
          (init?.headers as Record<string, string> | undefined)?.Authorization,
          "Bearer secret-key"
        );
        return jsonResponse({ data: [] });
      });
      const health = await withEnv(
        {
          LLM_ENABLED: undefined,
          LLM_API_BASE_URL: "http://llm.test:11434/v1",
          LLM_API_KEY: "secret-key",
          LLM_MODEL: "dolphin",
        },
        () => checkLlmHealth()
      );
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.enabled, true);
      assert.equal(health.model, "dolphin");
      assert.equal(health.baseUrl, "http://llm.test:11434/v1");
      assert.equal(typeof health.inFlight, "number");
      assert.equal(typeof health.maxInflight, "number");
      assert.equal(typeof health.busy, "boolean");
    });

    it("returns ok:false with an HTTP <status> error when /models is not ok", async () => {
      const stub = installFetchStub(() => jsonResponse({}, 401));
      const health = await withEnv(
        { LLM_ENABLED: undefined, LLM_API_BASE_URL: "http://llm.test:11434/v1" },
        () => checkLlmHealth()
      );
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.enabled, true);
      assert.equal(health.error, "HTTP 401");
    });

    it("returns ok:false with the thrown error's message when fetch rejects", async () => {
      const stub = installFetchStub(() => {
        throw new Error("network unreachable");
      });
      const health = await withEnv(
        { LLM_ENABLED: undefined, LLM_API_BASE_URL: "http://llm.test:11434/v1" },
        () => checkLlmHealth()
      );
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "network unreachable");
    });
  });

  describe("checkDiffusersHealth", () => {
    it("returns ok:true with device/model/mock on a healthy /v1/health response", async () => {
      const stub = installFetchStub(url => {
        assert.equal(url, "http://diffusers.test:8190/v1/health");
        return jsonResponse({ ok: true, device: "cuda:0", model: "sdxl-base", mock: false });
      });
      const health = await checkDiffusersHealth("http://diffusers.test:8190");
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.url, "http://diffusers.test:8190");
      assert.equal(health.device, "cuda:0");
      assert.equal(health.model, "sdxl-base");
      assert.equal(health.mock, false);
    });

    it("defaults ok:true, device/model:undefined, mock:false when the body omits every field", async () => {
      const stub = installFetchStub(() => jsonResponse({}));
      const health = await checkDiffusersHealth("http://diffusers.test:8190");
      stub.restore();

      assert.equal(health.ok, true);
      assert.equal(health.device, undefined);
      assert.equal(health.model, undefined);
      assert.equal(health.mock, false);
    });

    it("treats a body with ok:false as unhealthy even on an HTTP 200", async () => {
      const stub = installFetchStub(() => jsonResponse({ ok: false, device: "cpu" }));
      const health = await checkDiffusersHealth("http://diffusers.test:8190");
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.device, "cpu");
    });

    it("returns ok:false with an HTTP <status> error when not ok", async () => {
      const stub = installFetchStub(() => jsonResponse({}, 502));
      const health = await checkDiffusersHealth("http://diffusers.test:8190");
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "HTTP 502");
    });

    it("returns ok:false with the thrown error's message when fetch rejects", async () => {
      const stub = installFetchStub(() => {
        throw new Error("fetch failed: timeout");
      });
      const health = await checkDiffusersHealth("http://diffusers.test:8190");
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(health.error, "fetch failed: timeout");
    });

    it("returns ok:false without calling fetch when the URL hint is invalid", async () => {
      const stub = installFetchStub(() => jsonResponse({ ok: true }));
      const health = await checkDiffusersHealth("not-a-valid-url");
      stub.restore();

      assert.equal(health.ok, false);
      assert.equal(stub.calls.length, 0);
    });
  });

  describe("checkComfyUiPoolHealth", () => {
    it("returns enabled:false with no endpoints when the pool is empty", async () => {
      const result = await withEnv({ COMFYUI_POOL: undefined }, () => checkComfyUiPoolHealth());
      assert.equal(result.enabled, false);
      assert.deepEqual(result.endpoints, []);
    });

    it("checks every extra pool endpoint and tags each with its index", async () => {
      const stub = installFetchStub(url => {
        if (url.startsWith("http://pool-a.test:8188")) {
          return jsonResponse(systemStatsPayload({ vramFree: 10_000_000_000 }));
        }
        if (url.startsWith("http://pool-b.test:8188")) {
          if (url.endsWith("/system_stats")) {
            return jsonResponse({}, 500);
          }
        }
        return jsonResponse({});
      });

      const result = await checkComfyUiPoolHealth([
        "http://pool-a.test:8188",
        "http://pool-b.test:8188",
      ]);
      stub.restore();

      assert.equal(result.enabled, true);
      assert.equal(result.endpoints.length, 2);
      assert.deepEqual(
        result.endpoints.map(e => e.index),
        [0, 1]
      );
      const [a, b] = result.endpoints;
      assert.equal(a?.url, "http://pool-a.test:8188");
      assert.equal(a?.ok, true);
      assert.equal(b?.url, "http://pool-b.test:8188");
      assert.equal(b?.ok, false);
      assert.equal(b?.error, "HTTP 500");
    });
  });

  describe("checkCollabHealth", () => {
    it("delegates to the real getCollabBackendStatus(), reporting a memory backend with no redis/storage env set", async () => {
      // Deliberately does not exercise COLLAB_REDIS_URL being set: ensureRedis()
      // would then await ioredis actually subscribing, which retries an
      // unreachable/fake host indefinitely by default (ioredis's default
      // retryStrategy) instead of failing fast — a real hang risk in a unit
      // test, not just a slow one. The unset-env path below is the safe,
      // deterministic, I/O-free one.
      const health = await withEnv(
        { COLLAB_REDIS_URL: undefined, PROMPT_DATA_DIR: undefined },
        () => checkCollabHealth()
      );

      assert.equal(health.backend, "memory");
      assert.equal(health.redisConfigured, false);
      assert.equal(health.redisConnected, false);
      assert.equal(health.filePersistence, false);
    });
  });
});
