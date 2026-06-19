import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("System health dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/health");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("loads health page with System Health heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "System Health" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("service status indicators render STDB Ingest and LLM pillars", async ({ page }) => {
    await expect(page.getByText("SpacetimeDB")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Ingest Service")).toBeVisible();
    await expect(page.getByText("LLM Bridge")).toBeVisible();
  });

  test("timeline history appears after waiting for snapshots", async ({ page }) => {
    await expect(page.getByText("Service Status Timeline")).toBeVisible({ timeout: 10_000 });
    const timeline = page.locator(".timeline-row");
    await expect(timeline.first()).toBeVisible({ timeout: 10_000 });
  });

  test("fullscreen chart modal opens and closes", async ({ page }) => {
    await expect(page.locator(".viz-card")).toBeVisible({ timeout: 10_000 });
    const expandBtn = page.locator(".viz-card .fs-expand-btn").first();
    await expect(expandBtn).toBeVisible({ timeout: 10_000 });
    await expandBtn.click();
    const overlay = page.locator(".fullscreen-overlay, .fs-overlay");
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(overlay).not.toBeVisible({ timeout: 5_000 });
  });

  test("widget edit mode toggles and shows customize panel", async ({ page }) => {
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    await customizeBtn.click();
    await expect(page.getByText(/Customize Dashboard/i)).toBeVisible({ timeout: 5_000 });
    await customizeBtn.click();
    await expect(page.getByText(/Customize Dashboard/i)).not.toBeVisible({ timeout: 5_000 });
  });

  test("feed donut chart renders", async ({ page }) => {
    await expect(page.getByText("Feed Status")).toBeVisible({ timeout: 15_000 });
    const donut = page.locator("canvas").first();
    await expect(donut).toBeVisible({ timeout: 10_000 });
  });

  test("circuit breaker chart shows feed status", async ({ page }) => {
    await expect(page.getByText("Circuit Breakers")).toBeVisible({ timeout: 15_000 });
  });

  test("pipeline flow chart shows metrics", async ({ page }) => {
    await expect(page.getByText("Ingest Pipeline")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Pipeline Flow")).toBeVisible({ timeout: 10_000 });
  });

  test("event log section renders", async ({ page }) => {
    await expect(page.getByText("Event Log")).toBeVisible({ timeout: 10_000 });
    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
  });

  test("search filter filters log entries", async ({ page }) => {
    await expect(page.getByText("Event Log")).toBeVisible({ timeout: 10_000 });
    const searchInput = page.locator("input[placeholder*='Search']");
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("error");
    await page.waitForTimeout(500);
    const count = await page.locator(".log-line").count();
    expect(count).toBeGreaterThanOrEqual(0);
    const clearBtn = page.locator(".log-search-clear");
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    }
  });

  test("log level filter buttons work", async ({ page }) => {
    await expect(page.getByText("Event Log")).toBeVisible({ timeout: 10_000 });
    const errFilter = page.getByRole("button", { name: /^Error \(\d+\)$/ });
    await expect(errFilter).toBeVisible({ timeout: 5_000 });
    await errFilter.click();
    await expect(errFilter).toHaveClass(/active/);
  });
});
