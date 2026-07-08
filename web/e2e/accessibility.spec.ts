import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("main landmark has descriptive aria-label", async ({ page }) => {
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    const label = await main.getAttribute("aria-label");
    expect(label).toBeTruthy();
  });

  test("primary navigation has aria-label", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
  });

  test("nav buttons have aria-current for active route", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary" });
    const homeBtn = nav.getByRole("button", { name: "3D Globe" });
    await expect(homeBtn).toHaveAttribute("aria-current", "page");
    await nav.getByRole("button", { name: "Hub" }).click();
    await expect(homeBtn).not.toHaveAttribute("aria-current", "page");
    const hubBtn = nav.getByRole("button", { name: "Hub" });
    await expect(hubBtn).toHaveAttribute("aria-current", "page");
  });

  test("settings theme selector uses radiogroup role", async ({ page }) => {
    await gotoDemo(page, "/settings");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    const appearanceSection = page.getByRole("button", { name: /Appearance/i });
    await expect(appearanceSection).toBeVisible({ timeout: 10_000 });
    await appearanceSection.click();
    const themeGroup = page.getByRole("radiogroup", { name: /Theme/i });
    await expect(themeGroup).toBeVisible({ timeout: 10_000 });
    await expect(themeGroup.getByRole("radio")).toHaveCount(3);
  });

  test("focus management: tab navigation works through nav buttons", async ({ page }) => {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    const focusedTag = await focused.evaluate((el) => el.tagName);
    expect(["BUTTON", "A"]).toContain(focusedTag);
  });

  test("hub tile buttons have accessible names", async ({ page }) => {
    await gotoDemo(page, "/hub");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    const tiles = page.locator(".hub-tile");
    const first = tiles.first();
    await expect(first).toBeVisible({ timeout: 10_000 });
    const ariaLabel = await first.getAttribute("aria-label");
    expect(ariaLabel).toMatch(/Open .+ matrix/i);
  });

  test("health dashboard headers use proper heading levels", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoDemo(page, "/health");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("System Health", { timeout: 60_000 });
    const h2s = page.getByRole("heading", { level: 2 });
    const count = await h2s.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("status indicator has role=status", async ({ page }) => {
    const demoStatus = page
      .getByRole("status")
      .filter({ hasText: /Demo \/ test data/i });
    await expect(demoStatus).toBeVisible();
  });
});
