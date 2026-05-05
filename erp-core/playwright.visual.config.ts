import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual-qa/suites",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:54510",
    headless: true,
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "visual-qa",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  reporter: [
    ["list"],
    ["json", { outputFile: "visual-qa/reports/test-results.json" }],
  ],
});
