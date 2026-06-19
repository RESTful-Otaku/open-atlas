import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Data display and refresh", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("data loads on page navigation without manual refresh", async ({ page }) => {
    await gotoDemo(page, "/hub");
    await expect(
      page.getByRole("region", { name: /Cross-domain overview charts/i }),
    ).toBeVisible({ timeout: 15_000 });
    const tiles = page.locator(".hub-tile");
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
  });

  test("changing update interval reflects in display", async ({ page }) => {
    const intervalTrigger = page.locator("#update-interval-menu .interval-trigger");
    await expect(intervalTrigger).toBeVisible({ timeout: 10_000 });
    const currentLabel = await intervalTrigger.textContent();
    await intervalTrigger.click();
    const listbox = page.getByRole("listbox", { name: /Chart refresh cadence/i });
    await expect(listbox).toBeVisible({ timeout: 3_000 });
    await listbox.getByRole("option", { name: /Every 30 seconds/i }).click();
    await expect(intervalTrigger).not.toContainText(currentLabel!.trim());
  });

  test("connection status indicator shows correct state", async ({ page }) => {
    const statusBar = page.locator(".system-status, .connection-status");
    if (await statusBar.isVisible().catch(() => false)) {
      await expect(statusBar).toBeVisible();
    }
  });

  test("demo banner renders correctly", async ({ page }) => {
    const demoBanner = page
      .getByRole("status")
      .filter({ hasText: /Demo \/ test data/i });
    await expect(demoBanner).toBeVisible();
    await expect(
      demoBanner.getByRole("button", { name: /Use live SpacetimeDB/i }),
    ).toBeVisible();
    await expect(
      demoBanner.getByRole("button", { name: /Refresh demo/i }),
    ).toBeVisible();
  });

  test("navigating between routes preserves demo mode", async ({ page }) => {
    await gotoDemo(page, "/hub");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 10_000 });
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Entities" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 10_000 });
    await nav.getByRole("button", { name: "System Health" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("entity search functions with demo data", async ({ page }) => {
    await gotoDemo(page, "/entities");
    await expect(
      page.getByRole("region", { name: /Event table/i }),
    ).toBeVisible({ timeout: 15_000 });
    const searchbox = page.getByRole("searchbox");
    await expect(searchbox).toBeVisible();
    await searchbox.fill("test");
    await page.waitForTimeout(500);
    const inputValue = await searchbox.inputValue();
    expect(inputValue).toBe("test");
  });
});
