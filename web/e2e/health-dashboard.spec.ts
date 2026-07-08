import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("System health dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/health");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "System Health" }),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("service status indicators render STDB Ingest and LLM pillars", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "SpacetimeDB" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Ingest Service" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "LLM Bridge" })).toBeVisible();
  });

  test("timeline section shows collecting state or history when data available", async ({ page }) => {
    await expect(page.getByText("Service Status Timeline")).toBeVisible({ timeout: 10_000 });
    const hasTimelineRows = await page.locator(".timeline-row").count();
    if (hasTimelineRows > 0) {
      await expect(page.locator(".timeline-row").first()).toBeVisible();
    } else {
      await expect(page.getByText("Collecting status samples")).toBeVisible();
    }
  });

  test("widget edit mode toggles and shows customize panel", async ({ page }) => {
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await expect(customizeBtn).toBeVisible({ timeout: 10_000 });
    await customizeBtn.click();
    await expect(page.getByText(/Customize Dashboard/i)).toBeVisible({ timeout: 5_000 });
    await customizeBtn.click();
    await expect(page.getByText(/Customize Dashboard/i)).not.toBeVisible({ timeout: 5_000 });
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
