import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCatalogAwareWardrobeMutationClause,
  resolveCatalogWardrobeMutation,
} from "./clothing-mutations";
import {
  buildClothingNegativePack,
  compactClothingScript,
  enrichWardrobeHighSignal,
  prioritizeWardrobeSummaryItems,
} from "./clothing-quality";
import {
  buildMutatedPrompt,
  formatMutatedJobsStatus,
} from "./gallery-mutations";
import {
  pickRandomCharacterOutfit,
  trimWardrobeSummaryToMaxChars,
  wardrobeBudgetForPrompt,
} from "./clothing-catalog";
import {
  buildClothingPickFilters,
  scoreClothingLabelAgainstHints,
} from "./clothing-tags";
import { resolveContextNegativeProfile } from "./context-negative-profile";

describe("clothing quality", () => {
  it("strips fabric-crease filler from scripts", () => {
    const compact = compactClothingScript(
      "a crimson silk blouse, displaying a distinct fabric weave and natural fabric creases",
    );
    assert.match(compact, /crimson silk blouse/i);
    assert.doesNotMatch(compact, /natural fabric creases/i);
  });

  it("enriches wardrobe with silhouette/coverage language", () => {
    assert.match(enrichWardrobeHighSignal("red jacket"), /silhouette|coverage|red jacket/i);
    assert.doesNotMatch(enrichWardrobeHighSignal("red jacket"), /natural fabric creases/i);
  });

  it("prioritizes high-signal wardrobe items when trimming", () => {
    const ordered = prioritizeWardrobeSummaryItems([
      "navy cycling jersey",
      "black bib shorts",
      "cat hair scarf",
      "helmet",
    ]);
    assert.equal(ordered[0], "navy cycling jersey");
    assert.equal(ordered[1], "black bib shorts");
    assert.ok(ordered.includes("helmet"));
  });

  it("raises wardrobe budget for denser kits", () => {
    assert.ok(wardrobeBudgetForPrompt(800, 1) >= 120);
    assert.ok(wardrobeBudgetForPrompt(800, 2) >= 100);
  });

  it("trims wardrobe summaries after compacting filler", () => {
    const trimmed = trimWardrobeSummaryToMaxChars(
      "navy jersey, black bib shorts, white socks with natural fabric creases, helmet",
      60,
    );
    assert.doesNotMatch(trimmed, /natural fabric creases/i);
    assert.ok(trimmed.length <= 60);
  });

  it("resolves catalog wardrobe mutations from scene context", () => {
    const picked = resolveCatalogWardrobeMutation({
      prompt: "A woman cyclist cresting a mountain pass at dawn",
      hints: "cyclist racing kit",
    });
    assert.ok(picked?.summary);
    assert.ok(picked!.summary.length > 4);
  });

  it("builds catalog-aware wardrobe mutation clauses", () => {
    const { clause, summary } = buildCatalogAwareWardrobeMutationClause(
      "A runner on the track in morning light",
    );
    assert.match(clause, /Change outfit to|Refresh wardrobe/i);
    if (summary) {
      assert.match(clause, new RegExp(summary.split(",")[0]!.trim().slice(0, 12), "i"));
    }
  });

  it("mutates wardrobe prompts with catalog outfits by default", async () => {
    // The catalog pick runs on the server (/api/catalog/wardrobe-mutation) — same function.
    const { buildCatalogAwareWardrobeMutationClause } = await import("./clothing-mutations");
    const prompt = "A woman standing in a neon alley";
    const mutated = `${prompt}. ${buildCatalogAwareWardrobeMutationClause(prompt).clause}`;
    assert.match(mutated, /Change outfit to|Refresh wardrobe/i);
    assert.doesNotMatch(
      mutated,
      /Refresh wardrobe with a contrasting but scene-appropriate outfit\.$/,
    );
  });

  it("keeps explicit wardrobe mutation values", async () => {
    const mutated = await buildMutatedPrompt("portrait", "wardrobe", "red dress");
    assert.match(mutated, /Change outfit to red dress/i);
  });

  it("formats mutation status with wardrobe pick", () => {
    const status = formatMutatedJobsStatus(
      [
        { kind: "variation" },
        { kind: "wardrobe", summary: "navy cycling kit, bib shorts, helmet" },
      ],
      2,
      0,
    );
    assert.match(status, /Queued 2 mutations/i);
    assert.match(status, /Wardrobe → navy cycling kit/i);
  });

  it("builds athletic clothing negatives", () => {
    const pack = buildClothingNegativePack({
      hints: "cyclist racing",
      tool: "character",
      sport: "cycling",
    });
    assert.match(pack, /street clothes on athlete|no helmet|wrong sport/i);
  });

  it("builds profession-specific clothing negatives", () => {
    const pack = buildClothingNegativePack({
      hints: "chef in a busy kitchen",
      tool: "character",
    });
    assert.match(pack, /wrong uniform|cocktail dress in kitchen/i);
  });

  it("routes athletic/character contexts to wardrobe negative profiles", () => {
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        tool: "character",
        hints: "woman in a tailored coat",
      })?.id,
      "wardrobe-people",
    );
    assert.equal(
      resolveContextNegativeProfile(undefined, undefined, {
        tool: "generate",
        hints: "athlete on the track",
        sport: "running",
      })?.id,
      "sport-running",
    );
  });

  it("scores material and fit matches in brief lock", () => {
    const denim = scoreClothingLabelAgainstHints(
      "indigo slim denim jeans",
      "woman in slim denim jeans",
    );
    const silk = scoreClothingLabelAgainstHints(
      "crimson silk blouse",
      "woman in slim denim jeans",
    );
    assert.ok(denim > 0);
    assert.ok(denim > silk);
  });

  it("rolls profession kits with job-specific garments", () => {
    const chef = pickRandomCharacterOutfit(
      buildClothingPickFilters({
        hints: "a chef plating dessert in a busy kitchen",
        gender: "any",
      }),
    );
    assert.equal(chef.filters.workProfession, "chef");
    assert.match(chef.summary, /chef|toque|whites|kitchen/i);

    const waiter = pickRandomCharacterOutfit(
      buildClothingPickFilters({
        hints: "a waiter serving tables in a fine dining room",
        gender: "any",
      }),
    );
    assert.equal(waiter.filters.workProfession, "waiter");
    assert.match(waiter.summary, /waiter|service|black tie|dress shoe/i);

    const mail = pickRandomCharacterOutfit(
      buildClothingPickFilters({
        hints: "a mail carrier walking a suburban route",
        gender: "any",
      }),
    );
    assert.equal(mail.filters.workProfession, "mail carrier");
    assert.match(mail.summary, /mail|postal|satchel|walking shoe/i);
  });
});
