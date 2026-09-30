import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";
import { gotoStable } from "./helpers/navigation";
import { dismissBlockingOverlays } from "./helpers/overlays";
import { seedGalleryFixture } from "./helpers/gallery";

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test("generate accepts keywords without server error", async ({ page }) => {
  await gotoStable(page, "/?hintSource=manual");
  const manualHints = page.getByRole("button", { name: "Manual hints", exact: true });
  if (await manualHints.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await manualHints.click();
  }
  const keywords = page.getByLabel(/Scene idea or keywords/i);
  await expect(keywords).toBeVisible({ timeout: 60_000 });
  await keywords.click();
  await keywords.fill("neon alley, rain, black cat");
  await expect(keywords).toHaveValue(/neon alley/);
  await expect(page.getByRole("button", { name: /Generate scene prompt/i })).toBeEnabled({
    timeout: 15_000,
  });
});

test("gallery review mode toggles", async ({ page }) => {
  // Filters only show once the gallery has something to filter.
  await seedGalleryFixture(page);
  await gotoStable(page, "/gallery");
  // Deferred welcome can mount after navigation; clear again before Filters.
  await dismissBlockingOverlays(page);
  // Review toggles live inside the collapsed Filters section.
  const filtersSummary = page.locator("details.ui-collapsible summary").filter({
    hasText: "Filters",
  });
  await expect(filtersSummary).toBeVisible({ timeout: 15_000 });
  await filtersSummary.click();
  await page.getByRole("button", { name: "Review mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Auto-advance", exact: true })).toBeVisible();
});

test("settings automation tab shows avoided tokens", async ({ page }) => {
  await gotoStable(page, "/settings?tab=automation");
  await expect(page.getByRole("heading", { name: "Avoided tokens", exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
