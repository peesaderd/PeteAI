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
    const dashboardLink = page.locator(
      'a:has-text("Dashboard"), a:has-text("\u0e2b\u0e19\u0e49\u0e32\u0e2b\u0e25\u0e31\u0e01")'
    );
    if (await dashboardLink.isVisible()) {
      await dashboardLink.click();
      await page.waitForURL(/dashboard/);
    }
  });
});

test.describe("ERP Core API Smoke Tests", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510";

  test("GET /api/health returns ok", async ({ request }) => {
    const resp = await request.get(BASE + "/api/health");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.status).toBeDefined();
  });

  test("GET /api returns valid response", async ({ request }) => {
    const resp = await request.get(BASE + "/api");
    expect(resp.ok()).toBeTruthy();
  });
});

test.describe("ERP Core MCP Smoke Tests", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510";

  test("POST /mcp with valid tool call returns result", async ({ request }) => {
    const resp = await request.post(BASE + "/mcp", {
      data: {
        tool: "get_trial_balance",
        args: { date: "2026-05-05" },
      },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toBeDefined();
  });

  test("POST /mcp with missing args returns 400", async ({ request }) => {
    const resp = await request.post(BASE + "/mcp", {
      data: { tool: "test" },
    });
    expect(resp.ok()).toBeFalsy();
  });
});

test.describe("ERP Core Auth Smoke Tests", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510";

  test("POST /api/auth/login with invalid credentials returns 401", async ({
    request,
  }) => {
    const resp = await request.post(BASE + "/api/auth/login", {
      data: { username: "invalid", password: "invalid" },
    });
    expect(resp.status()).toBe(401);
  });
});

test.describe("ERP Core 404 Handling", () => {
  const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510";

  test("GET /api/nonexistent returns 404", async ({ request }) => {
    const resp = await request.get(BASE + "/api/nonexistent-route");
    expect(resp.status()).toBe(404);
  });
});
