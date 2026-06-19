import { expect, test } from "@playwright/test";

import { gotoDemo } from "./demo-goto";

test.describe("Matrix views", () => {
  test.beforeEach(async ({ page }) => {
    await gotoDemo(page, "/matrix/threat");
    await expect(
      page.getByRole("status").filter({ hasText: /Demo \/ test data/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("matrix view loads at /matrix/threat", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: /Global Threat Matrix/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("#/matrix/threat");
  });

  test("chart panels render on matrix page", async ({ page }) => {
    await expect(
      page.getByText("Domain snapshot"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Risk by domain"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("tab navigation switches between overview telemetry and incidents", async ({ page }) => {
    const telemetryTab = page.getByRole("tab", { name: /Telemetry/i });
    await expect(telemetryTab).toBeVisible({ timeout: 10_000 });
    await telemetryTab.click();
    await expect(page.getByText("Live telemetry")).toBeVisible({ timeout: 5_000 });
    const incidentsTab = page.getByRole("tab", { name: /Incidents/i });
    await expect(incidentsTab).toBeVisible();
    await incidentsTab.click();
    await expect(page.getByText("Active flashpoints")).toBeVisible({ timeout: 5_000 });
    const overviewTab = page.getByRole("tab", { name: /Overview/i });
    await expect(overviewTab).toBeVisible();
    await overviewTab.click();
    await expect(page.getByText("Domain snapshot")).toBeVisible({ timeout: 5_000 });
  });

  test("AI synthesis panel renders", async ({ page }) => {
    await expect(
      page.getByText("AI Strategic Synthesis"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("unknown matrix id shows error state", async ({ page }) => {
    await gotoDemo(page, "/matrix/unknown-matrix-id");
    await expect(page.getByText("Unknown matrix")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /Back to executive hub/i }),
    ).toBeVisible();
  });

  test("back to hub button navigates correctly", async ({ page }) => {
    await gotoDemo(page, "/matrix/unknown-matrix-id");
    await expect(page.getByText("Unknown matrix")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Back to executive hub/i }).click();
    await expect(page.getByTitle("Active view")).toHaveText("Hub", { timeout: 8_000 });
  });

  test("multiple matrix routes are reachable", async ({ page }) => {
    await gotoDemo(page, "/matrix/economic");
    await expect(
      page.getByRole("heading", { level: 1, name: /Global Economic Matrix/i }),
    ).toBeVisible({ timeout: 10_000 });
    await gotoDemo(page, "/matrix/health");
    await expect(
      page.getByRole("heading", { level: 1, name: /Global Health Matrix/i }),
    ).toBeVisible({ timeout: 10_000 });
    await gotoDemo(page, "/matrix/cyber");
    await expect(
      page.getByRole("heading", { level: 1, name: /Global Cyber Matrix/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signals panel renders in telemetry tab", async ({ page }) => {
    const telemetryTab = page.getByRole("tab", { name: /Telemetry/i });
    await expect(telemetryTab).toBeVisible({ timeout: 10_000 });
    await telemetryTab.click();
    await expect(page.getByText("Live telemetry")).toBeVisible({ timeout: 5_000 });
  });
});
