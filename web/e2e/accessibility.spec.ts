import { expect, test } from "@playwright/test";

/**
 * Lightweight UX checks — landmark roles and keyboard affordances.
 */
test.describe("accessibility smoke", () => {
  test("home has main landmark and left navigation", async ({ page }) => {
    await page.goto("/?demo=1#/");
    await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("command palette opens with Ctrl+K", async ({ page }) => {
    await page.goto("/?demo=1#/");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  });
});
