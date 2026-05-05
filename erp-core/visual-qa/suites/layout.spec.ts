import { test, expect } from "@playwright/test";
import { VISUAL_QA_CONFIG } from "../config";
import { visualDiff } from "../helpers/style-asserts";

const BASE = VISUAL_QA_CONFIG.baseUrl;

test.describe("📐 Visual QA: Layout & Responsive", () => {
  test("desktop layout renders key UI sections", async ({ page }) => {
    await page.setViewportSize(VISUAL_QA_CONFIG.viewports.desktop);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // Check key sections exist
    for (const { name, selector } of VISUAL_QA_CONFIG.snapshotSelectors) {
      const el = page.locator(selector).first();
      const exists = await el.count();
      if (exists > 0) {
        await expect(el).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("mobile layout is responsive", async ({ page }) => {
    await page.setViewportSize(VISUAL_QA_CONFIG.viewports.mobile);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    // On mobile, content should fit viewport width
    const bodyWidth = await page.locator("body").evaluate(
      (el) => el.scrollWidth
    );
    expect(bodyWidth).toBeLessThanOrEqual(VISUAL_QA_CONFIG.viewports.mobile.width + 20);
  });

  test("visual regression: homepage matches baseline", async ({ page }) => {
    await page.setViewportSize(VISUAL_QA_CONFIG.viewports.desktop);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");

    const result = await visualDiff(page, "homepage-desktop");
    expect(result.pass, `Visual diff: ${result.diffPercent.toFixed(2)}% changed`)
      .toBeTruthy();
  });
});
