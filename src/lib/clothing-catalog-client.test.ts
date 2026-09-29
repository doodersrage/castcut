import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchClothingLabels,
  getCachedClothingLabel,
  fetchClothingSelectOptions,
  humanizeClothingId,
} from "./clothing-catalog-client";

function installFetchStub(
  handler: (url: string) => { ok: boolean; json?: () => Promise<unknown> } | "throw"
) {
  const original = globalThis.fetch;
  let calls = 0;
  // @ts-expect-error test stub
  globalThis.fetch = async (url: string) => {
    calls += 1;
    const result = handler(url);
    if (result === "throw") {
      throw new Error("network down");
    }
    return { ok: result.ok, json: result.json ?? (async () => ({})) };
  };
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    callCount: () => calls,
  };
}

describe("fetchClothingLabels", () => {
  it("maps returned entries to their labels and unreturned ids to null", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({
        clothing: [{ id: "red-dress", label: "Red Dress", category: "outfit", contexts: [] }],
      }),
    }));
    const result = await fetchClothingLabels(["red-dress", "missing-id"]);
    stub.restore();
    assert.equal(result.get("red-dress"), "Red Dress");
    assert.equal(result.get("missing-id"), null);
  });

  it("sets every requested id to null when the response is not ok", async () => {
    const stub = installFetchStub(() => ({ ok: false }));
    const result = await fetchClothingLabels(["black-boots"]);
    stub.restore();
    assert.equal(result.get("black-boots"), null);
  });

  it("sets every requested id to null when fetch throws", async () => {
    const stub = installFetchStub(() => "throw");
    const result = await fetchClothingLabels(["silver-necklace"]);
    stub.restore();
    assert.equal(result.get("silver-necklace"), null);
  });

  it("does not re-fetch an id that is already cached", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({
        clothing: [{ id: "cached-item", label: "Cached Item", category: "top", contexts: [] }],
      }),
    }));
    await fetchClothingLabels(["cached-item"]);
    const callsAfterFirst = stub.callCount();
    await fetchClothingLabels(["cached-item"]);
    stub.restore();
    assert.equal(stub.callCount(), callsAfterFirst);
  });

  it("ignores blank/whitespace-only ids", async () => {
    const stub = installFetchStub(() => ({ ok: true, json: async () => ({ clothing: [] }) }));
    const result = await fetchClothingLabels(["  ", ""]);
    stub.restore();
    assert.equal(result.size, 0);
  });
});

describe("getCachedClothingLabel", () => {
  it("returns null for an undefined or blank id", () => {
    assert.equal(getCachedClothingLabel(undefined), null);
    assert.equal(getCachedClothingLabel("   "), null);
  });

  it("returns null for an id that was never fetched", () => {
    assert.equal(getCachedClothingLabel("never-fetched-id-xyz"), null);
  });

  it("returns the label cached by a prior fetchClothingLabels call", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({
        clothing: [{ id: "gold-earrings", label: "Gold Earrings", category: "accessory", contexts: [] }],
      }),
    }));
    await fetchClothingLabels(["gold-earrings"]);
    stub.restore();
    assert.equal(getCachedClothingLabel("gold-earrings"), "Gold Earrings");
  });
});

describe("fetchClothingSelectOptions", () => {
  it("returns the options from a successful response", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ options: [{ value: "casual", label: "Casual" }] }),
    }));
    const result = await fetchClothingSelectOptions("wardrobeCatalog", "women");
    stub.restore();
    assert.deepEqual(result, [{ value: "casual", label: "Casual" }]);
  });

  it("falls back to the default option when the response is not ok", async () => {
    const stub = installFetchStub(() => ({ ok: false }));
    const result = await fetchClothingSelectOptions("footwearCatalog", "men");
    stub.restore();
    assert.deepEqual(result, [{ value: "", label: "Default (random / LLM)" }]);
  });

  it("falls back to the default option when fetch throws", async () => {
    const stub = installFetchStub(() => "throw");
    const result = await fetchClothingSelectOptions("accessoriesCatalog", "any");
    stub.restore();
    assert.deepEqual(result, [{ value: "", label: "Default (random / LLM)" }]);
  });

  it("shares one in-flight request across concurrent calls for the same field/gender", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ options: [{ value: "sporty", label: "Sporty" }] }),
    }));
    const [a, b] = await Promise.all([
      fetchClothingSelectOptions("wardrobeCatalog", "any"),
      fetchClothingSelectOptions("wardrobeCatalog", "any"),
    ]);
    stub.restore();
    assert.deepEqual(a, [{ value: "sporty", label: "Sporty" }]);
    assert.deepEqual(b, [{ value: "sporty", label: "Sporty" }]);
    assert.equal(stub.callCount(), 1);
  });

  it("caches results so a later call for the same field/gender does not re-fetch", async () => {
    const stub = installFetchStub(() => ({
      ok: true,
      json: async () => ({ options: [{ value: "formal", label: "Formal" }] }),
    }));
    const first = await fetchClothingSelectOptions("accessoriesCatalog", "women");
    const callsAfterFirst = stub.callCount();
    const second = await fetchClothingSelectOptions("accessoriesCatalog", "women");
    stub.restore();
    assert.equal(callsAfterFirst, 1);
    assert.equal(stub.callCount(), callsAfterFirst);
    assert.deepEqual(first, [{ value: "formal", label: "Formal" }]);
    assert.deepEqual(second, [{ value: "formal", label: "Formal" }]);
  });
});

describe("humanizeClothingId", () => {
  it("turns a catalog id into readable clothes", () => {
    assert.equal(humanizeClothingId("outfit-relaxed-fit-lavender-slip-dress"), "relaxed-fit lavender slip dress");
    assert.equal(humanizeClothingId("outfit-wide-leg-burgundy-shirt-dress"), "wide-leg burgundy shirt dress");
    assert.equal(humanizeClothingId("outfit-single-breasted-mustard-shirt-dress"), "single-breasted mustard shirt dress");
    // Already a label: unchanged.
    assert.equal(humanizeClothingId("tailored cobalt slip dress"), "tailored cobalt slip dress");
  });
});
