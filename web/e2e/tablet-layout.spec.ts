import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

/**
 * Tablet layout (769–1024px): compact shell, no left rail, bottom nav.
 * Desktop at 1280px must remain unchanged (see desktop-layout.spec.ts).
 */
test.describe("tablet layout at 820px", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("compact shell: bottom nav, no left rail, mobile search row", async ({
    page,
  }) => {
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page.locator(".left-rail")).toBeHidden();
    await expect(page.locator(".shell-mobile-bar")).toBeVisible();
    await expect(page.getByRole("button", { name: /Search and navigate/i })).toBeVisible();
    await expect(page.locator("#shell-main")).toBeVisible();
    await expect(page.locator("#shell-main")).not.toBeEmpty();
  });

  test("html datasets: compact + tablet, not desktop rail layout", async ({
    page,
  }) => {
    const datasets = await page.evaluate(() => ({
      compact: document.documentElement.dataset.compactLayout,
      tablet: document.documentElement.dataset.tabletLayout,
      mobile: document.documentElement.dataset.mobileLayout,
    }));
    expect(datasets.compact).toBe("true");
    expect(datasets.tablet).toBe("true");
    expect(datasets.mobile).toBeUndefined();
  });
});
