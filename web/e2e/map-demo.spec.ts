import { expect, test } from "@playwright/test";

/** Demo globe home — hash router, no live SpacetimeDB. */
const demoGlobe = "/?demo=1#/";

function mapLayersToggle(page: import("@playwright/test").Page) {
  return page.locator('button[aria-controls="map-layers-panel"]');
}

test.describe("demo map layers & solar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(demoGlobe);
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 });
  });

  test("layers panel opens and Escape closes it", async ({ page }) => {
    const layersBtn = mapLayersToggle(page);
    await expect(layersBtn).toBeVisible({ timeout: 20_000 });
    await layersBtn.click();
    const panel = page.locator("#map-layers-panel");
    await expect(panel).toHaveClass(/is-open/, { timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(panel).not.toHaveClass(/is-open/, { timeout: 5_000 });
  });

  test("terminator overlay toggle is reachable in layers", async ({ page }) => {
    await mapLayersToggle(page).click();
    const termLabel = page
      .getByRole("group", { name: /Map overlays/i })
      .locator("label.map-layers-pill")
      .filter({ hasText: "Term" });
    await expect(termLabel).toBeVisible({ timeout: 5_000 });
    const checkbox = termLabel.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await termLabel.click();
    await expect(checkbox).toBeChecked();
  });

  test("solar scrub updates UTC clock label", async ({ page }) => {
    await mapLayersToggle(page).click();
    const scrub = page.getByRole("group", { name: /Simulated UTC time of day/i });
    await expect(scrub).toBeVisible({ timeout: 5_000 });
    const clock = scrub.locator("time");
    const before = (await clock.textContent())?.trim() ?? "";
    expect(before).toMatch(/^\d{2}:\d{2}$/);
    const slider = scrub.getByRole("slider", {
      name: /Scrub simulated time of day/i,
    });
    await slider.fill("720");
    await expect(clock).toHaveText("12:00", { timeout: 5_000 });
    const phase = scrub.locator(".solar-scrub-phase span").last();
    await expect(phase).toHaveText(/Day|Dawn|Dusk|Night/i);
  });
});
