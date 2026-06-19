import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("mobile layout at 480px", () => {
  test.use({ viewport: { width: 480, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("left rail hidden; mobile bottom nav and top row visible", async ({ page }) => {
    const datasets = await page.evaluate(() => ({
      compact: document.documentElement.dataset.compactLayout,
    }));
    expect(datasets.compact).toBeDefined();
    await expect(page.locator(".left-rail")).toHaveCount(0);
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page.locator(".shell-top-search-row, .shell-top-stack")).toBeVisible();
  });

  test("mobile bottom nav has Globe Map Hub Domains and Settings tabs", async ({ page }) => {
    const bottomNav = page.locator(".mobile-bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Globe" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Map" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Hub" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Domains" })).toBeVisible();
    await expect(bottomNav.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  test("mobile bottom nav navigation works", async ({ page }) => {
    const bottomNav = page.locator(".mobile-bottom-nav");

    await bottomNav.getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
    expect(page.url()).toContain("#/hub");

    await bottomNav.getByRole("button", { name: "Map" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("2D map", { timeout: 8_000 });
    expect(page.url()).toContain("#/map");

    await bottomNav.getByRole("button", { name: "Globe" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("3D Globe", { timeout: 8_000 });
    expect(page.url()).toContain("#/");

    await bottomNav.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Settings", { timeout: 8_000 });
    expect(page.url()).toContain("#/settings");
  });

  test("domains sheet opens and closes", async ({ page }) => {
    const bottomNav = page.locator(".mobile-bottom-nav");
    const domainsBtn = bottomNav.getByRole("button", { name: "Domains" });
    await expect(domainsBtn).toBeVisible();
    await domainsBtn.click();
    const sheet = page.locator(".mobile-domains-sheet");
    await expect(sheet).toBeVisible({ timeout: 3_000 });
    await expect(
      sheet.getByRole("heading", { name: "Domains" }),
    ).toBeVisible();
    const closeBtn = sheet.getByRole("button", { name: "Close domains" });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      const backdrop = page.locator(".mobile-domains-backdrop");
      await expect(backdrop).toBeVisible();
      await backdrop.click();
    }
    await page.waitForTimeout(500);
    await expect(sheet).not.toBeVisible({ timeout: 3_000 });
  });

  test("domains sheet navigates to domain route", async ({ page }) => {
    const bottomNav = page.locator(".mobile-bottom-nav");
    await bottomNav.getByRole("button", { name: "Domains" }).click();
    const sheet = page.locator(".mobile-domains-sheet");
    await expect(sheet).toBeVisible({ timeout: 3_000 });
    const firstDomain = sheet.getByRole("menuitem").first();
    await expect(firstDomain).toBeVisible();
    await firstDomain.click();
    await expect(page.getByTitle("Active view")).not.toHaveText("3D Globe", { timeout: 8_000 });
    expect(page.url()).toContain("#/domain/");
  });

  test("mobile layout renders active tab with is-active class", async ({ page }) => {
    const bottomNav = page.locator(".mobile-bottom-nav");
    const globeTab = bottomNav.getByRole("button", { name: "Globe" });
    await expect(globeTab).toHaveClass(/is-active/);
    await bottomNav.getByRole("button", { name: "Hub" }).click();
    await expect(globeTab).not.toHaveClass(/is-active/);
    await expect(bottomNav.getByRole("button", { name: "Hub" })).toHaveClass(/is-active/);
  });
});
