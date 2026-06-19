import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("App navigation", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("left rail navigation links navigate to correct routes", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });

    await nav.getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
    expect(page.url()).toContain("#/hub");

    await nav.getByRole("button", { name: "Entities" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Entities", { timeout: 8_000 });
    expect(page.url()).toContain("#/entities");

    await nav.getByRole("button", { name: "Matrices" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Matrices", { timeout: 8_000 });
    expect(page.url()).toContain("#/matrix/");

    await nav.getByRole("button", { name: "2D map" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("2D map", { timeout: 8_000 });
    expect(page.url()).toContain("#/map");

    await nav.getByRole("button", { name: "System Health" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("System Health", { timeout: 8_000 });
    expect(page.url()).toContain("#/health");

    await nav.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Settings", { timeout: 8_000 });
    expect(page.url()).toContain("#/settings");
  });

  test("domain routes work via direct navigation", async ({ page }) => {
    await gotoDemo(page, "/domain/finance");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: /Finance/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/domain/finance");
  });

  test("home route shows globe", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    const globe = page.locator(".oa-three-globe, .maplibregl-map").first();
    await expect(globe).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain("#/");
  });

  test("route transitions show active view indicator", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Entities" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Entities", { timeout: 8_000 });
    await nav.getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
  });

  test("unknown route falls back to home", async ({ page }) => {
    await page.goto("/?demo=1#/nonexistent-route");
    await page.waitForTimeout(2_000);
    const globe = page.locator(".oa-three-globe, .maplibregl-map").first();
    await expect(globe).toBeVisible({ timeout: 15_000 });
  });

  test("Viz showcase loads", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    const expandBtn = nav.getByRole("button", { name: /Expand sidebar/i });
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
    }
    await nav.getByRole("button", { name: "Visualizations" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Visualizations", { timeout: 8_000 });
    expect(page.url()).toContain("#/viz");
  });

  test("entities view shows table and search", async ({ page }) => {
    await gotoDemo(page, "/entities");
    await expect(
      page.getByRole("region", { name: /Event table/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("hub to domain tile navigation works", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
    const tile = page.locator(".hub-tile").first();
    await expect(tile).toBeVisible({ timeout: 10_000 });
    await tile.click();
    await expect(page.getByTitle("Active view")).not.toHaveText("Hub", { timeout: 8_000 });
  });
});
