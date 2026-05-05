import { test, expect } from "@playwright/test";
import { VISUAL_QA_CONFIG } from "../config";
import { expectContrast } from "../helpers/style-asserts";

const BASE = VISUAL_QA_CONFIG.baseUrl;

test.describe("♿ Visual QA: Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
  });

  test("all images have alt text", async ({ page }) => {
    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt, `img[${i}] missing alt text`).not.toBeNull();
    }
  });

  test("buttons and links have accessible names", async ({ page }) => {
    const interactive = page.locator("button, a");
    const count = await interactive.count();

    for (let i = 0; i < Math.min(count, 20); i++) {
      const el = interactive.nth(i);
      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      const text = await el.textContent().catch(() => "");
      const ariaLabel = await el.getAttribute("aria-label").catch(() => null);
      const title = await el.getAttribute("title").catch(() => null);

      const hasName = (text?.trim() || ariaLabel || title || "").length > 0;
      expect(hasName, `Element ${i} (${await el.evaluate(e => e.tagName)}) has no accessible name`).toBeTruthy();
    }
  });

  test("focus indicators are visible", async ({ page }) => {
    // Tab through interactive elements and check focus style
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    const focused = page.locator("*:focus");
    const count = await focused.count();

    if (count > 0) {
      const outlineStyle = await focused.first().evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          outline: style.outline,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          boxShadow: style.boxShadow,
        };
      });

      const hasFocusIndicator =
        (outlineStyle.outline !== "none" && outlineStyle.outline !== "") ||
        (outlineStyle.boxShadow !== "none" && outlineStyle.boxShadow !== "");

      expect(hasFocusIndicator, "Focused element has visible focus indicator").toBeTruthy();
    }
  });

  test("color contrast meets WCAG AA for body text", async ({ page }) => {
    await expectContrast(page, "body", 4.5);
  });

  test("color contrast meets WCAG AA for headings", async ({ page }) => {
    await expectContrast(page, "h1", 4.5);
    await expectContrast(page, "h2", 4.5);
    await expectContrast(page, "h3", 3.0);
  });
});
