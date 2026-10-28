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

// The card's More menu is the shared ActionMenu in portal mode: fixed on the body, inside the
// screen, scrolling past its max height, closed by Escape (focus back on More) or a click outside.
test("gallery card menu: portalled panel, keyboard, Escape and outside click", async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, "/gallery");
  await dismissBlockingOverlays(page);
  const trigger = page.getByTestId("gallery-card-menu").first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const panel = page.getByRole("menu");
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const placed = await panel.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      fixed: style.position === "fixed",
      onBody: node.parentElement === document.body,
      inside: rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
      scrolls: style.overflowY === "auto" && Boolean(style.maxHeight) && style.maxHeight !== "none",
    };
  });
  expect(placed).toEqual({ fixed: true, onBody: true, inside: true, scrolls: true });

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // ArrowDown on More opens the menu and moves into it.
  await page.keyboard.press("ArrowDown");
  await expect(panel).toBeVisible();
  await expect
    .poll(() => panel.evaluate(node => node.contains(document.activeElement)))
    .toBe(true);
  await page.mouse.click(5, 5);
  await expect(panel).toHaveCount(0);
});

// M10 T2: a render removed from the Gallery waits in Recently deleted, and Restore brings it back.
test("a removed render is in Recently deleted and Restore brings it back", async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, "/gallery");
  await dismissBlockingOverlays(page);
  // The fixture's card (the Gallery may also list the server's assembled films).
  const card = page.getByRole("article").filter({ hasText: "e2e gallery fixture" });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  // The Gallery's store loads after the first paint; a delete before then is undone by it.
  await page.waitForLoadState("networkidle");
  await card.getByTestId("gallery-card-menu").click();
  await page.getByRole("menuitem", { name: "Remove from gallery" }).click();
  const confirm = page.getByTestId("confirm-dialog-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(card).toHaveCount(0);

  const trash = page.getByTestId("gallery-trash");
  await expect(trash).toContainText("Recently deleted renders");
  await trash.locator("summary").click();
  const item = trash.getByRole("listitem").filter({ hasText: "e2e gallery fixture" });
  await expect(item).toHaveCount(1);
  await item.getByTestId("gallery-trash-restore").click();
  // (The first restore compiles its route on the dev server.)
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(item).toHaveCount(0);
});
