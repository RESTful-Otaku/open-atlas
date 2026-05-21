import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("left rail navigation", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Hub opens hub without full reload", async ({ page }) => {
    await expect(page.getByTitle("Active view")).toHaveText("3D Globe");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 5_000 });
    await expect(
      page.getByRole("region", { name: /Cross-domain overview charts/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/hub");
  });

  test("clicking Entities opens table without full reload", async ({ page }) => {
    await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Entities" }).click();
    await expect(page.getByRole("searchbox")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/entities");
  });

  test("globe → map → hub → energy keeps navigating", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("button", { name: "2D map" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("2D map", { timeout: 8_000 });
    await nav.getByRole("button", { name: "Hub" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
    await expect(
      page.getByRole("region", { name: /Cross-domain overview charts/i }),
    ).toBeVisible({ timeout: 10_000 });
    const expandRail = nav.getByRole("button", { name: /Expand sidebar/i });
    if (await expandRail.isVisible()) {
      await expandRail.click();
    }
    const domainsToggle = nav.getByRole("button", { name: "Domains" });
    await expect(domainsToggle).toBeVisible({ timeout: 5_000 });
    if ((await domainsToggle.getAttribute("aria-expanded")) !== "true") {
      await domainsToggle.click();
    }
    await nav.getByRole("button", { name: "Energy", exact: true }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Energy", { timeout: 8_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Energy" })).toBeVisible({
      timeout: 10_000,
    });
    await nav.getByRole("button", { name: "3D Globe" }).click();
    await expect(page.getByTitle("Active view")).toHaveText("3D Globe", { timeout: 8_000 });
  });
});
