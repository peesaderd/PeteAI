import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "sync-siyuan",
    root: "./packages/sync-siyuan",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
