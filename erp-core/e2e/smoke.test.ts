import { test, expect } from "@playwright/test";

test.describe("ERP Web UI Smoke Tests", () => {
  test("homepage loads and shows title", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/ERP/);
  });

  test("navigation sidebar is visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.locator("nav, aside, [role=navigation], .sidebar");
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });

  test("can navigate to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const dashboardLink = page.locator("a:has-text(\"Dashboard\"), a:has-text(\"หน้าหลัก\")");
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await page.waitForURL(/dashboard/);
    }
  });
});
