/**
 * Visual QA Configuration
 * 
 * Central config for all visual regression and style tests.
 * Adjust thresholds and selectors to match the actual ERP Core UI.
 */

export const VISUAL_QA_CONFIG = {
  /** Base URL of the ERP Core app */
  baseUrl: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510",

  /** Viewport sizes to test responsive design */
  viewports: {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  },

  /** Pixelmatch threshold (0-1). Lower = stricter */
  visualThreshold: 0.05,

  /** Timeout for UI elements */
  timeout: 10000,

  /** Theme CSS custom properties to check */
  themeProperties: {
    light: {
      "--bg-primary": "#ffffff",
      "--bg-secondary": "#f8f9fa",
      "--text-primary": "#1a1a2e",
      "--text-secondary": "#6c757d",
      "--border-color": "#dee2e6",
      "--primary-color": "#0d6efd",
      "--font-size-base": "16px",
      "--font-size-lg": "18px",
      "--font-size-sm": "14px",
      "--spacing-unit": "8px",
    },
    dark: {
      "--bg-primary": "#1a1a2e",
      "--bg-secondary": "#16213e",
      "--text-primary": "#e4e6eb",
      "--text-secondary": "#b0b3b8",
      "--border-color": "#3e4042",
      "--primary-color": "#6c63ff",
      "--font-size-base": "16px",
      "--font-size-lg": "18px",
      "--font-size-sm": "14px",
      "--spacing-unit": "8px",
    },
  },

  /** CSS selectors for key UI elements to snapshot */
  snapshotSelectors: [
    { name: "navbar", selector: "nav, header, [role=banner]" },
    { name: "sidebar", selector: "aside, nav.sidebar, [role=navigation]" },
    { name: "main-content", selector: "main, [role=main], #content" },
    { name: "footer", selector: "footer, [role=contentinfo]" },
  ],

  /** Style properties to assert on key elements */
  styleAssertions: {
    body: [
      "font-family",
      "font-size",
      "line-height",
      "color",
      "background-color",
    ],
    "a, button": ["color", "font-size", "font-weight"],
    "h1, h2, h3": ["font-family", "font-size", "font-weight", "color"],
    "input, select, textarea": [
      "font-family",
      "font-size",
      "color",
      "background-color",
      "border-color",
    ],
  },
} as const;

export type ThemeName = keyof typeof VISUAL_QA_CONFIG.themeProperties;
