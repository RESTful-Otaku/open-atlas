import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

/**
 * Desktop regression guard — mobile layout must not leak at 1280px.
 * Complements unit tests on `isMobileLayout()` / `data-mobile-layout`.
 */
test.describe("desktop layout at 1280px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("left rail visible; compact/mobile chrome hidden; main has content", async ({
    page,
  }) => {
    const datasets = await page.evaluate(() => ({
      compact: document.documentElement.dataset.compactLayout,
      mobile: document.documentElement.dataset.mobileLayout,
      tablet: document.documentElement.dataset.tabletLayout,
    }));
    expect(datasets.compact).toBeUndefined();
    expect(datasets.mobile).toBeUndefined();
    expect(datasets.tablet).toBeUndefined();
    await expect(page.locator(".left-rail")).toBeVisible();
    await expect(page.locator(".shell-top-search-row")).toHaveCount(0);
    await expect(page.locator(".mobile-bottom-nav")).toHaveCount(0);
    await expect(page.locator("#shell-main")).toBeVisible();
    await expect(page.locator("#shell-main")).not.toBeEmpty();
    await expect(page.locator(".oa-three-globe, .maplibregl-map").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
