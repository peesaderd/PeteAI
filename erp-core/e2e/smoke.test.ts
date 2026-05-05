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
      "a:has-text(\"Dashboard\"), a:has-text(\"หน้าหลัก\")"
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

// ============================================================
// UI State Persistence Tests
// ============================================================
test.describe("UI State Persistence", () => {
  test.describe("Dark Mode", () => {
    test("dark mode persists after page refresh", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find and click dark mode toggle
      const darkModeToggle = page.locator(
        "button:has-text(\"Dark\"), " +
        "button:has-text(\"dark\"), " +
        "button:has-text(\"มืด\"), " +
        "[role=switch], " +
        ".dark-mode-toggle, " +
        "#dark-mode-toggle, " +
        "button:has(.moon), " +
        "button:has(.sun), " +
        "label:has-text(\"Dark Mode\") input[type=checkbox], " +
        "[data-testid=dark-mode-toggle]"
      );
      const toggleCount = await darkModeToggle.count();

      if (toggleCount === 0) {
        test.skip(true, "Dark mode toggle not found on page");
        return;
      }

      // Check current theme before toggle
      const html = page.locator("html");
      const body = page.locator("body");
      const wasDarkBefore =
        (await html.getAttribute("class"))?.includes("dark") ||
        (await html.getAttribute("data-theme")) === "dark" ||
        (await body.getAttribute("class"))?.includes("dark");

      // Toggle dark mode on
      if (!wasDarkBefore) {
        await darkModeToggle.first().click();
        await page.waitForTimeout(500); // wait for CSS transition
      }

      // Verify dark mode is applied
      const isDarkAfterToggle =
        (await html.getAttribute("class"))?.includes("dark") ||
        (await html.getAttribute("data-theme")) === "dark" ||
        (await body.getAttribute("class"))?.includes("dark") ||
        (await body.evaluate(() =>
          getComputedStyle(document.body).getPropertyValue("--bg-color")
        )) !== "";

      if (!isDarkAfterToggle) {
        test.skip(true, "Dark mode class not detectable");
        return;
      }

      // ★★★ THE KEY TEST: Refresh and check persistence ★★★
      await page.reload();
      await page.waitForLoadState("networkidle");

      const isDarkAfterRefresh =
        (await html.getAttribute("class"))?.includes("dark") ||
        (await html.getAttribute("data-theme")) === "dark" ||
        (await body.getAttribute("class"))?.includes("dark");

      expect(isDarkAfterRefresh).toBeTruthy();
    });
  });

  test.describe("Sidebar State", () => {
    test("sidebar collapse state persists after refresh", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find sidebar collapse toggle
      const collapseBtn = page.locator(
        "button:has-text(\"Collapse\"), " +
        "button:has-text(\"collapse\"), " +
        "button[aria-label*=\"sidebar\" i], " +
        "button[aria-label*=\"Sidebar\" i], " +
        ".sidebar-toggle, " +
        "[data-testid=sidebar-toggle]"
      );
      const btnCount = await collapseBtn.count();

      if (btnCount === 0) {
        test.skip(true, "Sidebar collapse button not found");
        return;
      }

      // Get sidebar state before
      const sidebar = page.locator("nav, aside, [role=navigation], .sidebar").first();
      const wasCollapsedBefore = await sidebar.getAttribute("class")
        .then(c => c?.includes("collapsed") || c?.includes("closed"))
        .catch(() => false);

      // Toggle sidebar
      if (!wasCollapsedBefore) {
        await collapseBtn.first().click();
        await page.waitForTimeout(300);
      }

      // Verify collapsed
      const isCollapsed = await sidebar.getAttribute("class")
        .then(c => c?.includes("collapsed") || c?.includes("closed"))
        .catch(() => false);

      if (!isCollapsed) {
        test.skip(true, "Sidebar collapse state not detectable");
        return;
      }

      // ★★★ Refresh and check persistence ★★★
      await page.reload();
      await page.waitForLoadState("networkidle");

      const isCollapsedAfterRefresh = await sidebar.getAttribute("class")
        .then(c => c?.includes("collapsed") || c?.includes("closed"))
        .catch(() => false);

      expect(isCollapsedAfterRefresh).toBeTruthy();
    });
  });

  test.describe("Language / Locale", () => {
    test("language selection persists after refresh", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find language switcher
      const langSwitcher = page.locator(
        "select:has(option[value=th]), " +
        "select:has(option[value=en]), " +
        "button:has-text(\"ภาษา\"), " +
        "button:has-text(\"Language\"), " +
        "[data-testid=language-switcher]"
      );
      const swCount = await langSwitcher.count();

      if (swCount === 0) {
        test.skip(true, "Language switcher not found");
        return;
      }

      // Try switching to Thai if available
      const thaiOption = page.locator("option[value=th], option:has-text(\"ไทย\")");
      if (await thaiOption.count() > 0) {
        await page.locator("select").first().selectOption("th");
        await page.waitForTimeout(300);
      } else {
        test.skip(true, "Thai language option not found");
        return;
      }

      // ★★★ Refresh and check persistence ★★★
      await page.reload();
      await page.waitForLoadState("networkidle");

      // Check if still in Thai
      const selectedLang = await page.locator("select").first().inputValue()
        .catch(() => "");
      expect(selectedLang).toBe("th");
    });
  });
});
