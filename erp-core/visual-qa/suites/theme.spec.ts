import { test, expect } from "@playwright/test";
import { VISUAL_QA_CONFIG } from "../config";
import {
  expectCssVar,
  expectThemeVars,
  expectStyle,
  expectFontSizes,
  expectContrast,
} from "../helpers/style-asserts";

const BASE = VISUAL_QA_CONFIG.baseUrl;

test.describe("🎨 Visual QA: Theme System", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
  });

  test("light theme applies correct CSS custom properties", async ({ page }) => {
    await expectThemeVars(page, "light");
  });

  test("dark theme applies correct CSS custom properties", async ({ page }) => {
    // Try toggling dark mode
    const toggle = page.locator(
      "button:has-text(\"Dark\"), " +
      "button:has-text(\"dark\"), " +
      "[data-testid=dark-mode-toggle], " +
      "[role=switch]"
    );

    if (await toggle.count() > 0) {
      await toggle.first().click();
      await page.waitForTimeout(500);
    }

    await expectThemeVars(page, "dark");
  });

  test("dark mode persists after page refresh", async ({ page }) => {
    const toggle = page.locator(
      "button:has-text(\"Dark\"), " +
      "button:has-text(\"dark\"), " +
      "[data-testid=dark-mode-toggle], " +
      "[role=switch]"
    );

    if (await toggle.count() === 0) {
      test.skip(true, "Dark mode toggle not found");
      return;
    }

    // Toggle dark mode on
    await toggle.first().click();
    await page.waitForTimeout(500);

    // Verify dark mode is applied
    await expectThemeVars(page, "dark");

    // ★★★ REFRESH AND CHECK PERSISTENCE ★★★
    await page.reload();
    await page.waitForLoadState("networkidle");

    // This will FAIL if dark mode resets to light after refresh
    await expectThemeVars(page, "dark");
  });

  test("font sizes are consistent across the page", async ({ page }) => {
    // Body text should be 14-18px
    await expectStyle(page, "body", [
      { property: "font-size", expected: /14|15|16|17|18px/ },
    ]);

    // Headings should be larger than body text
    const bodySize = await page.locator("body").evaluate(
      (el) => parseFloat(getComputedStyle(el).fontSize)
    );

    for (const tag of ["h1", "h2"]) {
      const headingSize = await page.locator(tag).first().evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize)
      );
      expect(
        headingSize,
        `${tag} (${headingSize}px) should be > body (${bodySize}px)`
      ).toBeGreaterThan(bodySize);
    }
  });

  test("color contrast meets WCAG AA minimum", async ({ page }) => {
    // Test body text contrast
    await expectContrast(page, "body", 4.5);

    // Test heading contrast
    await expectContrast(page, "h1", 4.5);
    await expectContrast(page, "h2", 4.5);
  });
});
