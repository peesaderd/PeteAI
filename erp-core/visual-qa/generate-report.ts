#!/usr/bin/env tsx
/**
 * Generate Visual QA HTML report from Playwright JSON results.
 * Run after: npx playwright test --config=playwright.visual.config.ts
 */

import fs from "fs/promises";
import path from "path";
import { generateVisualQaReport } from "./report-generator";

interface PlaywrightStats {
  failures: number;
  passes: number;
  pending: number;
  suites: number;
  tests: number;
  duration: number;
}

interface PlaywrightTest {
  title: string;
  fullTitle: string;
  file: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: { message?: string };
}

async function main() {
  const resultsPath = path.join(process.cwd(), "visual-qa", "reports", "test-results.json");
  
  let results: any[];
  try {
    const raw = await fs.readFile(resultsPath, "utf-8");
    const data = JSON.parse(raw);
    results = data.suites || [];
  } catch {
    console.log("No test results found. Run visual tests first.");
    return;
  }

  // Flatten suites into TestResult[]
  const testResults: any[] = [];
  
  function walkSuite(suite: any, suiteName: string) {
    const name = suite.title || suiteName;
    for (const spec of suite.specs || []) {
      const test: any = {
        suite: name,
        name: spec.title,
        status: "skipped",
        duration: 0,
      };
      
      for (const testResult of spec.tests || []) {
        test.status = testResult.status || "skipped";
        test.duration = testResult.duration || 0;
        if (testResult.errors?.[0]?.message) {
          test.error = testResult.errors[0].message;
        }
      }
      
      testResults.push(test);
    }
    
    for (const child of suite.suites || []) {
      walkSuite(child, name);
    }
  }
  
  for (const suite of results) {
    walkSuite(suite, suite.title || "Unknown");
  }

  await generateVisualQaReport(testResults);
  console.log("Report generated successfully.");
}

main().catch(console.error);
