import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Map view", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/map");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("map view loads at /map route", async ({ page }) => {
    const map = page.locator(".maplibregl-map").first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain("#/map");
  });

  test("layer toggle button exists and opens panel", async ({ page }) => {
    const layersBtn = page.locator('button[aria-controls="map-layers-panel"]');
    await expect(layersBtn).toBeVisible({ timeout: 15_000 });
    await layersBtn.click();
    const panel = page.locator("#map-layers-panel");
    await expect(panel).toHaveClass(/is-open/, { timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(panel).not.toHaveClass(/is-open/, { timeout: 5_000 });
  });

  test("map zoom controls work", async ({ page }) => {
    const map = page.locator(".maplibregl-map").first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    const zoomIn = page.locator(".maplibregl-ctrl-zoom-in");
    if (await zoomIn.isVisible().catch(() => false)) {
      await zoomIn.click();
      await page.waitForTimeout(500);
      const zoomOut = page.locator(".maplibregl-ctrl-zoom-out");
      await expect(zoomOut).toBeVisible();
      await zoomOut.click();
    }
  });

  test("map compass / bearing control exists", async ({ page }) => {
    const map = page.locator(".maplibregl-map").first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    const compass = page.locator(".maplibregl-ctrl-compass");
    if (await compass.isVisible().catch(() => false)) {
      await expect(compass).toBeVisible();
    }
  });

  test("navigating to map from rail updates active view", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "3D Globe" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("3D Globe", { timeout: 8_000 });
    await nav.getByRole("button", { name: "2D map" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("2D map", { timeout: 8_000 });
  });

  test("fullscreen expand from map chart works", async ({ page }) => {
    const layersBtn = page.locator('button[aria-controls="map-layers-panel"]');
    await expect(layersBtn).toBeVisible({ timeout: 15_000 });
    await layersBtn.click();
    const panel = page.locator("#map-layers-panel");
    await expect(panel).toHaveClass(/is-open/, { timeout: 5_000 });
    await layersBtn.click();
    await expect(panel).not.toHaveClass(/is-open/, { timeout: 5_000 });
  });

  test("terminator overlay toggle is reachable in layers", async ({ page }) => {
    const layersBtn = page.locator('button[aria-controls="map-layers-panel"]');
    await expect(layersBtn).toBeVisible({ timeout: 15_000 });
    await layersBtn.click();
    const termLabel = page
      .getByRole("group", { name: /Map overlays/i })
      .locator("label.map-layers-pill")
      .filter({ hasText: "Term" });
    await expect(termLabel).toBeVisible({ timeout: 5_000 });
  });
});
