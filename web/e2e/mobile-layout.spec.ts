import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

/**
 * Mobile layout regression — bottom nav, collapsed search row, no left rail.
 * Complements desktop-layout.spec.ts at 1280px.
 */
test.describe("mobile layout at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("bottom nav visible; left rail hidden; search row visible; main has content", async ({
    page,
  }) => {
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page.locator(".left-rail")).toBeHidden();
    await expect(page.locator(".shell-mobile-bar")).toBeVisible();
    await expect(page.getByRole("link", { name: /SpacetimeDB status/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Search and navigate/i })).toBeVisible();
    await expect(page.locator("#shell-main")).toBeVisible();
    await expect(page.locator("#shell-main")).not.toBeEmpty();
    await expect(page.locator(".oa-three-globe, .maplibregl-map").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("domains sheet opens and closes", async ({ page }) => {
    await page.getByRole("button", { name: "Domains", exact: true }).click();
    const domainsDialog = page.getByRole("dialog", { name: "Domain desks" });
    await expect(domainsDialog).toBeVisible();
    await domainsDialog.getByRole("button", { name: "Close domains" }).click();
    await expect(domainsDialog).not.toBeVisible({ timeout: 5_000 });
  });

});
