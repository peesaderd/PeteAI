import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "ai-orchestrator",
      root: "./packages/ai-orchestrator",
      include: ["src/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "knowledge-base",
      root: "./packages/knowledge-base",
      include: ["src/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "server",
      root: "./packages/server",
      include: ["src/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "sync-siyuan",
      root: "./packages/sync-siyuan",
      include: ["src/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      environment: "node",
    },
  },
  {
    test: {
      name: "e2e",
      root: "./e2e",
      include: ["*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      environment: "node",
      // This is a placeholder - actual e2e tests use Playwright
    },
  },
]);
