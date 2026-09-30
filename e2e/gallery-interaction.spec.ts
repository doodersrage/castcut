import { test, expect } from "@playwright/test";
import { ensureAuthenticated } from "./helpers/auth";
import { seedGalleryFixture } from "./helpers/gallery";
import { gotoStable } from "./helpers/navigation";
import { dismissBlockingOverlays } from "./helpers/overlays";

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test("gallery layout toggles and review mode shows banner", async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, "/gallery");
  await expect(page.getByRole("heading", { name: /^Gallery$/i, level: 1 })).toBeVisible();
  await dismissBlockingOverlays(page);

  const denseLayout = page.getByTestId("gallery-layout-dense");
  await expect(denseLayout).toBeVisible({ timeout: 15_000 });
  await denseLayout.click();
  await expect(denseLayout).toHaveAttribute("data-active", "true");

  const listLayout = page.getByTestId("gallery-layout-list");
  await listLayout.click();
  await expect(listLayout).toHaveAttribute("data-active", "true");

  // Unreviewed turns review mode on (the separate Review chip was folded into it).
  const reviewChip = page.getByTestId("gallery-stats-unreviewed");
  await expect(reviewChip).toBeVisible();
  await reviewChip.click();
  await expect(page.getByTestId("gallery-review-banner")).toBeVisible({ timeout: 15_000 });
});

test("gallery review mode via filter chip", async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, "/gallery");
  await dismissBlockingOverlays(page);

  // The quick-filter row (Review mode chip) lives in Manage.
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
  const filtersSummary = page.locator("details.ui-collapsible summary").filter({
    hasText: "Filters",
  });
  if (await filtersSummary.isVisible().catch(() => false)) {
    await filtersSummary.click();
  }
  await page.getByTestId("gallery-filter-review-mode").click();
  await expect(page.getByTestId("gallery-review-banner")).toBeVisible({ timeout: 15_000 });
});
