import { expect, Page } from "@playwright/test";
import { VISUAL_QA_CONFIG } from "../config";

/**
 * Style Assertion Helpers
 *
 * These helpers check ACTUAL computed CSS properties of DOM elements,
 * not just class names. This catches real visual regressions like:
 * - Dark mode not applying colors
 * - Font sizes not changing with theme
 * - Spacing/layout broken after refresh
 */

type CSSProperty = string;
type ExpectedValue = string | RegExp;

interface StyleCheck {
  property: CSSProperty;
  expected: ExpectedValue;
}

/**
 * Assert that an element has specific computed CSS style values.
 * Uses window.getComputedStyle() for accurate results.
 */
export async function expectStyle(
  page: Page,
  selector: string,
  checks: StyleCheck[],
  options?: { timeout?: number }
) {
  for (const { property, expected } of checks) {
    const actual = await page.locator(selector).evaluate(
      (el, prop: string) => getComputedStyle(el).getPropertyValue(prop),
      property
    );

    if (expected instanceof RegExp) {
      expect(actual.trim(), `${selector} → ${property}`).toMatch(expected);
    } else {
      expect(actual.trim(), `${selector} → ${property}`).toBe(expected);
    }
  }
}

/**
 * Assert CSS custom properties (theme variables) on :root or html element.
 * This is the most reliable way to check theme state.
 */
export async function expectCssVar(
  page: Page,
  varName: string,
  expected: string,
  options?: { selector?: string }
) {
  const selector = options?.selector || ":root";
  const actual = await page.locator(selector).evaluate(
    (el, v: string) => getComputedStyle(el).getPropertyValue(v).trim(),
    varName
  );
  expect(actual, `CSS var ${varName}`).toBe(expected);
}

/**
 * Check all theme CSS variables match expected theme.
 * This catches dark mode not applying correctly.
 */
export async function expectThemeVars(
  page: Page,
  theme: "light" | "dark"
) {
  const vars = VISUAL_QA_CONFIG.themeProperties[theme];
  for (const [varName, expected] of Object.entries(vars)) {
    await expectCssVar(page, varName, expected);
  }
}

/**
 * Take a screenshot and compare with baseline using pixelmatch.
 * Returns diff pixel count for reporting.
 */
export async function visualDiff(
  page: Page,
  name: string,
  options?: { threshold?: number }
): Promise<{ pass: boolean; diffPixels: number; diffPercent: number }> {
  const pixelmatch = (await import("pixelmatch")).default;
  const { PNG } = await import("pngjs");
  const fs = await import("fs/promises");
  const path = await import("path");

  const threshold = options?.threshold ?? VISUAL_QA_CONFIG.visualThreshold;
  const screenshotDir = path.join(process.cwd(), "visual-qa", "screenshots");
  const baselinePath = path.join(screenshotDir, "baseline", `${name}.png`);
  const currentPath = path.join(screenshotDir, "current", `${name}.png`);
  const diffPath = path.join(screenshotDir, "current", `${name}-diff.png`);

  // Ensure directories exist
  await fs.mkdir(path.dirname(currentPath), { recursive: true });

  // Take current screenshot
  await page.screenshot({ path: currentPath, fullPage: true });

  // If no baseline, this is the first run — save as baseline and skip
  try {
    await fs.access(baselinePath);
  } catch {
    await fs.mkdir(path.dirname(baselinePath), { recursive: true });
    await fs.copyFile(currentPath, baselinePath);
    return { pass: true, diffPixels: 0, diffPercent: 0 };
  }

  // Compare
  const baselineImg = PNG.sync.read(await fs.readFile(baselinePath));
  const currentImg = PNG.sync.read(await fs.readFile(currentPath));

  const { width, height } = baselineImg;
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    baselineImg.data,
    currentImg.data,
    diff.data,
    width,
    height,
    { threshold }
  );

  const totalPixels = width * height;
  const diffPercent = (diffPixels / totalPixels) * 100;

  // Save diff image
  await fs.writeFile(diffPath, PNG.sync.write(diff));

  const pass = diffPercent <= threshold * 100;

  return { pass, diffPixels, diffPercent };
}

/**
 * Check that font sizes are consistent across the page.
 * Helps catch issues where theme changes break typography.
 */
export async function expectFontSizes(
  page: Page,
  selectors: string[],
  expectedMinPx: number,
  expectedMaxPx: number
) {
  for (const selector of selectors) {
    const elements = page.locator(selector);
    const count = await elements.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const fontSize = await elements.nth(i).evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize)
      );
      expect(
        fontSize,
        `${selector}[${i}] font-size ${fontSize}px not in range [${expectedMinPx}, ${expectedMaxPx}]`
      ).toBeGreaterThanOrEqual(expectedMinPx);
      expect(
        fontSize,
        `${selector}[${i}] font-size ${fontSize}px not in range [${expectedMinPx}, ${expectedMaxPx}]`
      ).toBeLessThanOrEqual(expectedMaxPx);
    }
  }
}

/**
 * Check color contrast ratio between text and background.
 * WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
 */
export async function expectContrast(
  page: Page,
  selector: string,
  minRatio: number = 4.5
) {
  const ratio = await page.locator(selector).evaluate((el) => {
    const style = getComputedStyle(el);
    const fg = style.color;
    const bg = style.backgroundColor;

    // Helper to parse rgb/rgba to luminance
    const luminance = (rgb: string): number => {
      const match = rgb.match(/(\d+)/g);
      if (!match) return 0;
      const [r, g, b] = match.map(Number).map((c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  });

  expect(
    ratio,
    `${selector} contrast ratio ${ratio.toFixed(2)}:1 < ${minRatio}:1`
  ).toBeGreaterThanOrEqual(minRatio);
}
