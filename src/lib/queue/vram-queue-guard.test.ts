import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isVramTightForMax,
  maybeDowngradeMaxForVram,
  MAX_VRAM_FREE_BYTES_THRESHOLD,
} from "./vram-queue-guard";

describe("vram-queue-guard", () => {
  it("treats free VRAM under threshold as tight", () => {
    assert.equal(isVramTightForMax({ free: MAX_VRAM_FREE_BYTES_THRESHOLD - 1 }), true);
    assert.equal(isVramTightForMax({ free: MAX_VRAM_FREE_BYTES_THRESHOLD }), false);
    assert.equal(isVramTightForMax(null), false);
  });

  it("downgrades Max to Final when VRAM is tight", () => {
    const tight = maybeDowngradeMaxForVram("max", { free: 2e9 });
    assert.equal(tight.downgraded, true);
    assert.equal(tight.profile, "final");

    const ok = maybeDowngradeMaxForVram("max", { free: 12e9 });
    assert.equal(ok.downgraded, false);
    assert.equal(ok.profile, "max");

    const final = maybeDowngradeMaxForVram("final", { free: 1e9 });
    assert.equal(final.downgraded, false);
    assert.equal(final.profile, "final");
  });

  it("honors disabled guard and custom free-byte threshold", () => {
    assert.equal(
      isVramTightForMax({ free: 1e9 }, { enabled: false }),
      false,
    );
    assert.equal(
      maybeDowngradeMaxForVram("max", { free: 1e9 }, { enabled: false }).downgraded,
      false,
    );
    assert.equal(
      isVramTightForMax({ free: 8e9 }, { enabled: true, freeBytesThreshold: 10e9 }),
      true,
    );
    assert.equal(
      isVramTightForMax({ free: 8e9 }, { enabled: true, freeBytesThreshold: 6e9 }),
      false,
    );
  });

  it("applies guard to runtime queueQualityProfile", async () => {
    const { guardQueueQualityForVram } = await import("./vram-queue-guard");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ comfyui: { vram: { free: 1e9, total: 24e9 } } }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const guarded = await guardQueueQualityForVram({
        runtime: { queueQualityProfile: "max" },
      });
      assert.equal(guarded.downgraded, true);
      assert.equal(guarded.profile, "final");
      assert.equal(guarded.runtime?.queueQualityProfile, "final");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
