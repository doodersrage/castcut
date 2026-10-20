import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

const ALL_CLOTHING_CATALOG_ENTRIES = [
  { id: "red-dress", label: "Red Dress", category: "outfit", contexts: ["formal"] },
  { id: "black-boots", label: "Black Boots", category: "footwear", contexts: [] },
  { id: "silver-necklace", label: "Silver Necklace", category: "accessory", contexts: ["formal"] },
];
mock.module("../wardrobe/clothing-catalog-batches", {
  namedExports: { ALL_CLOTHING_CATALOG_ENTRIES },
});

const ALL_EXTRA_SCENE_LOCATIONS = ["Rainy Alley at Night", "Sunlit Kitchen", "Mountain Overlook"];
mock.module("../scene/location-catalog-batches", {
  namedExports: { ALL_EXTRA_SCENE_LOCATIONS },
});

describe("catalog-index", async () => {
  const { listCatalogClothing, listCatalogLocations, searchCatalog } = await import(
    "./catalog-index"
  );

  describe("listCatalogClothing", () => {
    it("returns every entry (mapped to the public shape) when there is no query", () => {
      const result = listCatalogClothing();
      assert.equal(result.length, 3);
      assert.deepEqual(result[0], {
        id: "red-dress",
        label: "Red Dress",
        category: "outfit",
        contexts: ["formal"],
      });
    });

    it("filters by a case-insensitive query against label/id/category", () => {
      const result = listCatalogClothing({ query: "BOOTS" });
      assert.deepEqual(result.map(e => e.id), ["black-boots"]);
    });

    it("filters by an explicit id set", () => {
      const result = listCatalogClothing({ ids: ["red-dress", "unknown-id"] });
      assert.deepEqual(result.map(e => e.id), ["red-dress"]);
    });

    it("filters by an explicit category set", () => {
      const result = listCatalogClothing({ categories: ["accessory"] });
      assert.deepEqual(result.map(e => e.id), ["silver-necklace"]);
    });

    it("respects the limit option", () => {
      const result = listCatalogClothing({ limit: 1 });
      assert.equal(result.length, 1);
    });

    it("defaults an entry's missing contexts to an empty array", () => {
      const result = listCatalogClothing({ ids: ["black-boots"] });
      assert.deepEqual(result[0]?.contexts, []);
    });
  });

  describe("listCatalogLocations", () => {
    it("returns every location with a generated id and handcrafted source when there is no query", () => {
      const result = listCatalogLocations();
      assert.equal(result.length, 3);
      assert.deepEqual(result[0], { id: "loc-0", label: "Rainy Alley at Night", source: "handcrafted" });
    });

    it("filters by a case-insensitive query", () => {
      const result = listCatalogLocations({ query: "kitchen" });
      assert.deepEqual(result.map(e => e.label), ["Sunlit Kitchen"]);
    });

    it("respects the limit option", () => {
      const result = listCatalogLocations({ limit: 2 });
      assert.equal(result.length, 2);
    });
  });

  describe("searchCatalog", () => {
    it("returns both clothing and location matches for a query, each capped at 50", () => {
      const result = searchCatalog("a");
      assert.ok(Array.isArray(result.clothing));
      assert.ok(Array.isArray(result.locations));
    });
  });
});
