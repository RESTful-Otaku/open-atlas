import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("OpenAtlas demo smoke", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
  });

  test("loads shell and demo banner", async ({ page }) => {
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("globe home renders without fatal errors", async ({ page }) => {
    await expect(page.getByRole("main")).toBeVisible();
    const globe = page.locator(".oa-three-globe, .maplibregl-map").first();
    await expect(globe).toBeVisible({ timeout: 20_000 });
  });

  test("entities view is reachable and shows table", async ({ page }) => {
    await gotoDemo(page, "/entities");
    await expect(
      page.getByRole("region", { name: /Event table/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("hub view shows overview charts", async ({ page }) => {
    await gotoDemo(page, "/hub");
    await expect(
      page.getByRole("region", { name: /Cross-domain overview charts/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
