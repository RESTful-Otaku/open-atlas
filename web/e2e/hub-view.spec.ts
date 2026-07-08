import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Hub / landing page", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/hub");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("hub view loads at /hub route", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: /Executive Summary Hub/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/hub");
  });

  test("hub tiles render with correct counts", async ({ page }) => {
    const tiles = page.locator(".hub-tile");
    await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("overview charts section renders", async ({ page }) => {
    await expect(
      page.getByRole("region", { name: /Cross-domain overview charts/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Risk by domain")).toBeVisible();
    await expect(page.getByText("Activity by domain")).toBeVisible();
  });

  test("Global Threat Index badge renders", async ({ page }) => {
    await expect(
      page.getByText("Global Threat Index"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a tile navigates to correct domain matrix", async ({ page }) => {
    const tile = page.locator(".hub-tile").first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const tileTitle = await tile.locator(".hub-tile-title").textContent();
    await tile.click();
    await page.waitForTimeout(2_000);
    const currentTitle = page.getByTitle("Active view");
    await expect(currentTitle).not.toHaveText("Hub", { timeout: 5_000 });
    if (tileTitle) {
      expect(page.url()).toContain("#/matrix/");
    }
  });

  test("briefing section opens with heading", async ({ page }) => {
    const toggleBtn = page.locator(".hub-btn.is-primary");
    await expect(toggleBtn).toBeVisible({ timeout: 10_000 });
    await toggleBtn.click();
    await expect(
      page.getByRole("heading", { name: /Daily Briefing/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("DataPipelineBanner does not show in demo mode", async ({ page }) => {
    const banner = page.locator(".pipeline-banner");
    await expect(banner).toHaveCount(0);
  });
});
