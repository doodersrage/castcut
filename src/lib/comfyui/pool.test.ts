import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  endpointQueueLoad,
  getComfyUiPoolStatsCache,
  isComfyUiEndpointTooBusy,
  markComfyUiPoolEndpointUnhealthy,
  parseComfyUiPool,
  pickComfyUiFromPoolVramAware,
  pickHighestScoringComfyUiEndpoint,
  pickLoadBalancedComfyUiEndpoint,
  resetComfyUiPoolStatsCacheForTests,
  scoreComfyUiPoolEndpointStat,
  setComfyUiPoolStatsCache,
  type ComfyUiPoolEndpointStat,
} from "./pool";

describe("scoreComfyUiPoolEndpointStat", () => {
  it("returns null when the endpoint is marked unhealthy", () => {
    assert.equal(
      scoreComfyUiPoolEndpointStat({ url: "http://a", ok: false, vram: { free: 8e9 } }),
      null,
    );
  });

  it("returns null when free VRAM is missing or non-finite", () => {
    assert.equal(scoreComfyUiPoolEndpointStat({ url: "http://a" }), null);
    assert.equal(
      scoreComfyUiPoolEndpointStat({ url: "http://a", vram: { free: Number.NaN } }),
      null,
    );
  });

  it("scores higher free VRAM higher", () => {
    const low = scoreComfyUiPoolEndpointStat({ url: "http://a", vram: { free: 2e9 } });
    const high = scoreComfyUiPoolEndpointStat({ url: "http://b", vram: { free: 20e9 } });
    assert.ok(low != null && high != null);
    assert.ok(high! > low!);
  });

  it("penalizes queue load (pending and running)", () => {
    const idle = scoreComfyUiPoolEndpointStat({ url: "http://a", vram: { free: 10e9 } });
    const busy = scoreComfyUiPoolEndpointStat({
      url: "http://a",
      vram: { free: 10e9 },
      queuePending: 2,
      queueRunning: 1,
    });
    assert.ok(idle != null && busy != null);
    assert.ok(busy! < idle!);
  });
});

describe("endpointQueueLoad and busy detection", () => {
  it("sums pending and running jobs", () => {
    assert.equal(
      endpointQueueLoad({ url: "http://a", queuePending: 2, queueRunning: 3 }),
      5,
    );
  });

  it("marks endpoints at or above the busy threshold", () => {
    assert.equal(
      isComfyUiEndpointTooBusy({ url: "http://a", ok: true, queuePending: 3, queueRunning: 1 }, 4),
      true,
    );
    assert.equal(
      isComfyUiEndpointTooBusy({ url: "http://a", ok: true, queuePending: 2, queueRunning: 1 }, 4),
      false,
    );
  });
});

describe("pickLoadBalancedComfyUiEndpoint", () => {
  const poolUrls = ["http://10.0.0.5:8188", "http://10.0.0.6:8188"];

  it("skips busy endpoints and picks the best idle host", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 24e9 }, queuePending: 6 },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 8e9 }, queuePending: 0 },
    ];
    assert.equal(
      pickLoadBalancedComfyUiEndpoint(poolUrls, stats, { busyThreshold: 4 }),
      "http://10.0.0.6:8188",
    );
  });

  it("falls back to the least-loaded host when every endpoint is busy", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 24e9 }, queuePending: 8 },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 8e9 }, queuePending: 5 },
    ];
    assert.equal(
      pickLoadBalancedComfyUiEndpoint(poolUrls, stats, { busyThreshold: 4 }),
      "http://10.0.0.6:8188",
    );
  });
});

describe("pickHighestScoringComfyUiEndpoint", () => {
  const poolUrls = ["http://10.0.0.5:8188", "http://10.0.0.6:8188", "http://10.0.0.7:8188"];

  it("picks the pool URL with the most free VRAM among healthy endpoints", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 4e9 } },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 20e9 } },
      { url: "http://10.0.0.7:8188", ok: false, vram: { free: 24e9 } },
    ];
    assert.equal(pickHighestScoringComfyUiEndpoint(poolUrls, stats), "http://10.0.0.6:8188");
  });

  it("prefers lower queue load when free VRAM is otherwise similar", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 12e9 }, queuePending: 3 },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 12e9 }, queuePending: 0 },
    ];
    assert.equal(pickHighestScoringComfyUiEndpoint(poolUrls, stats), "http://10.0.0.6:8188");
  });

  it("matches URLs regardless of trailing slash / case", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "HTTP://10.0.0.5:8188/", ok: true, vram: { free: 16e9 } },
    ];
    assert.equal(
      pickHighestScoringComfyUiEndpoint(["http://10.0.0.5:8188"], stats),
      "http://10.0.0.5:8188",
    );
  });

  it("returns null when no stat is usable", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: false },
      { url: "http://unrelated:8188", ok: true, vram: { free: 20e9 } },
    ];
    assert.equal(pickHighestScoringComfyUiEndpoint(poolUrls, stats), null);
  });

  it("returns null for an empty stats list", () => {
    assert.equal(pickHighestScoringComfyUiEndpoint(poolUrls, []), null);
  });
});

describe("pickComfyUiFromPoolVramAware", () => {
  const originalPool = process.env.COMFYUI_POOL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetComfyUiPoolStatsCacheForTests();
    process.env.COMFYUI_POOL = "http://10.0.0.5:8188,http://10.0.0.6:8188";
  });

  afterEach(() => {
    resetComfyUiPoolStatsCacheForTests();
    globalThis.fetch = originalFetch;
    if (originalPool == null) {
      delete process.env.COMFYUI_POOL;
    } else {
      process.env.COMFYUI_POOL = originalPool;
    }
  });

  it("returns null when no pool is configured", () => {
    delete process.env.COMFYUI_POOL;
    assert.equal(pickComfyUiFromPoolVramAware({ stats: [] }), null);
  });

  it("prefers the highest-scoring endpoint from explicit stats", () => {
    const stats: ComfyUiPoolEndpointStat[] = [
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 2e9 } },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 22e9 } },
    ];
    assert.equal(pickComfyUiFromPoolVramAware({ stats }), "http://10.0.0.6:8188");
  });

  it("falls back to the cached pool snapshot when no stats are passed", () => {
    setComfyUiPoolStatsCache([
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 22e9 } },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 2e9 } },
    ]);
    assert.equal(pickComfyUiFromPoolVramAware(), "http://10.0.0.5:8188");
  });

  it("falls back to round-robin/hash pick when no usable stats exist", () => {
    // Stub fetch so the best-effort background refresh cannot make a real
    // network call (and resolves fast instead of timing out).
    globalThis.fetch = (async () => {
      throw new Error("no network in test");
    }) as typeof fetch;

    const picked = pickComfyUiFromPoolVramAware({ seed: "some-routing-seed" });
    assert.ok(
      picked === "http://10.0.0.5:8188" || picked === "http://10.0.0.6:8188",
    );
  });
});

describe("comfyui pool stats cache", () => {
  afterEach(() => {
    resetComfyUiPoolStatsCacheForTests();
  });

  it("returns null before anything is cached", () => {
    resetComfyUiPoolStatsCacheForTests();
    assert.equal(getComfyUiPoolStatsCache(), null);
  });

  it("returns the cached stats when fresh", () => {
    const stats: ComfyUiPoolEndpointStat[] = [{ url: "http://a", ok: true, vram: { free: 1e9 } }];
    setComfyUiPoolStatsCache(stats);
    assert.deepEqual(getComfyUiPoolStatsCache(), stats);
  });

  it("expires the cache after maxAgeMs", () => {
    setComfyUiPoolStatsCache([{ url: "http://a", ok: true, vram: { free: 1e9 } }]);
    assert.equal(getComfyUiPoolStatsCache(-1), null);
  });

  it("marks a host unhealthy so later picks skip it", () => {
    setComfyUiPoolStatsCache([
      { url: "http://10.0.0.5:8188", ok: true, vram: { free: 8e9 } },
      { url: "http://10.0.0.6:8188", ok: true, vram: { free: 8e9 } },
    ]);
    markComfyUiPoolEndpointUnhealthy("http://10.0.0.5:8188/");
    const cached = getComfyUiPoolStatsCache();
    assert.equal(cached?.find((entry) => entry.url.includes("0.5"))?.ok, false);
    assert.equal(cached?.find((entry) => entry.url.includes("0.6"))?.ok, true);
  });
});

describe("parseComfyUiPool extra URL merge", () => {
  const previousPool = process.env.COMFYUI_POOL;
  const previousHosts = process.env.COMFYUI_ALLOWED_HOSTS;

  afterEach(() => {
    if (previousPool === undefined) {
      delete process.env.COMFYUI_POOL;
    } else {
      process.env.COMFYUI_POOL = previousPool;
    }
    if (previousHosts === undefined) {
      delete process.env.COMFYUI_ALLOWED_HOSTS;
    } else {
      process.env.COMFYUI_ALLOWED_HOSTS = previousHosts;
    }
  });

  it("unique-merges env pool URLs with extra settings URLs", () => {
    process.env.COMFYUI_POOL = "http://10.0.0.5:8188,http://10.0.0.6:8188";
    delete process.env.COMFYUI_ALLOWED_HOSTS;
    const merged = parseComfyUiPool(["http://10.0.0.6:8188/", "http://10.0.0.7:8188"]);
    assert.deepEqual(merged, [
      "http://10.0.0.5:8188",
      "http://10.0.0.6:8188",
      "http://10.0.0.7:8188",
    ]);
  });

  it("skips invalid extra URLs instead of aborting the pool", () => {
    delete process.env.COMFYUI_POOL;
    delete process.env.COMFYUI_ALLOWED_HOSTS;
    const merged = parseComfyUiPool(["not a url", "http://10.0.0.8:8188"]);
    assert.deepEqual(merged, ["http://10.0.0.8:8188"]);
  });
});
