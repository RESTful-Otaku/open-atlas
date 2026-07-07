import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/settings");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("settings loads with Settings heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/settings");
  });

  test("LLM provider settings section renders", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /LLM providers/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Appearance section and theme selector renders", async ({ page }) => {
    const appearanceSection = page.getByRole("button", { name: /Appearance/i });
    await expect(appearanceSection).toBeVisible({ timeout: 10_000 });
    await appearanceSection.click();
    const themeGroup = page.getByRole("radiogroup", { name: /Theme/i });
    await expect(themeGroup).toBeVisible({ timeout: 5_000 });
  });

  test("theme toggle switches themes", async ({ page }) => {
    const appearanceSection = page.getByRole("button", { name: /Appearance/i });
    await expect(appearanceSection).toBeVisible({ timeout: 10_000 });
    await appearanceSection.click();
    const themeGroup = page.getByRole("radiogroup", { name: /Theme/i });
    await expect(themeGroup).toBeVisible({ timeout: 10_000 });
    const lightBtn = themeGroup.getByRole("radio", { name: /Light/i });
    await lightBtn.click();
    await expect(lightBtn).toHaveAttribute("aria-checked", "true");
    const dimBtn = themeGroup.getByRole("radio", { name: /Dim/i });
    await dimBtn.click();
    await expect(dimBtn).toHaveAttribute("aria-checked", "true");
  });

  test("theme persists in localStorage", async ({ page }) => {
    const appearanceSection = page.getByRole("button", { name: /Appearance/i });
    await expect(appearanceSection).toBeVisible({ timeout: 10_000 });
    await appearanceSection.click();
    const themeGroup = page.getByRole("radiogroup", { name: /Theme/i });
    await expect(themeGroup).toBeVisible({ timeout: 10_000 });
    const lightBtn = themeGroup.getByRole("radio", { name: /Light/i });
    await lightBtn.click();
    const theme = await page.evaluate(() =>
      localStorage.getItem("openatlas-theme"),
    );
    expect(theme).toBe("light");
    const dimBtn = themeGroup.getByRole("radio", { name: /Dim/i });
    await dimBtn.click();
    const theme2 = await page.evaluate(() =>
      localStorage.getItem("openatlas-theme"),
    );
    expect(theme2).toBe("dim");
  });

  test("update interval selector visible in top bar", async ({ page }) => {
    const intervalTrigger = page.locator("#update-interval-menu .interval-trigger");
    await expect(intervalTrigger).toBeVisible({ timeout: 10_000 });
    await intervalTrigger.click();
    const listbox = page.getByRole("listbox", { name: /Chart refresh cadence/i });
    await expect(listbox).toBeVisible({ timeout: 3_000 });
    const option = listbox.getByRole("option", { name: /Every 30 seconds/i });
    await expect(option).toBeVisible();
    await option.click();
    await expect(listbox).not.toBeVisible({ timeout: 3_000 });
  });

  test("update interval persists in localStorage", async ({ page }) => {
    const intervalTrigger = page.locator("#update-interval-menu .interval-trigger");
    await expect(intervalTrigger).toBeVisible({ timeout: 10_000 });
    await intervalTrigger.click();
    const listbox = page.getByRole("listbox", { name: /Chart refresh cadence/i });
    await expect(listbox).toBeVisible({ timeout: 3_000 });
    await listbox.getByRole("option", { name: /Every minute/i }).click();
    const stored = await page.evaluate(() =>
      localStorage.getItem("openatlas-update-interval"),
    );
    expect(stored).toBe("1m");
  });

  test("demo mode section renders and shows active status", async ({ page }) => {
    const demoHeader = page.getByRole("button", { name: /Demo \/ test data/i });
    await expect(demoHeader).toBeVisible({ timeout: 10_000 });
    await demoHeader.click();
    await expect(page.getByText(/demo mode active/i)).toBeVisible({ timeout: 5_000 });
  });

  test("STDB section shows data mode info", async ({ page }) => {
    const stdbHeader = page.getByRole("button", { name: /SpacetimeDB/i });
    await expect(stdbHeader).toBeVisible({ timeout: 10_000 });
  });

  test("ingest service section renders", async ({ page }) => {
    const ingestHeader = page.getByRole("button", { name: /Ingest service/i });
    await expect(ingestHeader).toBeVisible({ timeout: 10_000 });
  });

  test("public APIs and feeds section renders", async ({ page }) => {
    const feedsHeader = page.getByRole("button", { name: /Public APIs/i });
    await expect(feedsHeader).toBeVisible({ timeout: 10_000 });
  });
});
