import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WARDROBE_CATEGORIES,
  CLOTHING_CATALOG_FIELD_KEYS,
  getClothingCatalogFieldCategories,
  categoryLabel,
  type ClothingCategory,
} from "./clothing-catalog-fields";

const ALL_CATEGORIES: ClothingCategory[] = [
  "outfit",
  "top",
  "bottom",
  "outerwear",
  "footwear",
  "accessory",
  "swimwear",
  "intimate",
  "hosiery",
  "formalwear",
  "dressy-accessory",
  "sleepwear",
  "underwear",
  "socks",
  "headwear",
  "traditional",
];

describe("getClothingCatalogFieldCategories", () => {
  it("returns the wardrobe categories for wardrobeCatalog", () => {
    assert.deepEqual(getClothingCatalogFieldCategories("wardrobeCatalog"), WARDROBE_CATEGORIES);
  });

  it("returns just footwear for footwearCatalog", () => {
    assert.deepEqual(getClothingCatalogFieldCategories("footwearCatalog"), ["footwear"]);
  });

  it("returns the accessory-adjacent categories for accessoriesCatalog", () => {
    assert.deepEqual(getClothingCatalogFieldCategories("accessoriesCatalog"), [
      "accessory",
      "dressy-accessory",
      "hosiery",
      "socks",
      "headwear",
    ]);
  });
});

describe("categoryLabel", () => {
  it("returns a distinct, non-empty label for every known category", () => {
    const labels = new Set<string>();
    for (const category of ALL_CATEGORIES) {
      const label = categoryLabel(category);
      assert.ok(label.length > 0, `expected a label for ${category}`);
      labels.add(label);
    }
    assert.equal(labels.size, ALL_CATEGORIES.length);
  });

  it("falls back to the raw category string for an unknown category", () => {
    assert.equal(categoryLabel("not-a-real-category" as ClothingCategory), "not-a-real-category");
  });
});

describe("CLOTHING_CATALOG_FIELD_KEYS", () => {
  it("lists exactly the three catalog field keys", () => {
    assert.deepEqual(CLOTHING_CATALOG_FIELD_KEYS, [
      "wardrobeCatalog",
      "footwearCatalog",
      "accessoriesCatalog",
    ]);
  });
});
