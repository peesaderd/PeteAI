/**
 * Visual QA Report Generator
 *
 * Generates an HTML dashboard from visual QA test results.
 * Includes screenshot diffs, style assertion results, and theme checks.
 */

import fs from "fs/promises";
import path from "path";

interface TestResult {
  suite: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
  screenshots?: {
    baseline?: string;
    current?: string;
    diff?: string;
    diffPercent?: number;
  };
}

interface ReportData {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

export async function generateVisualQaReport(
  results: TestResult[],
  outputDir: string = "visual-qa/reports"
): Promise<string> {
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const report: ReportData = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    skipped,
    duration: totalDuration,
    results,
  };

  const passRate = results.length > 0
    ? ((passed / results.length) * 100).toFixed(1)
    : "0";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual QA Report - ${report.timestamp}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f0f1a; color: #e4e6eb; padding: 2rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .timestamp { color: #8b8fa3; margin-bottom: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1a1a2e; border-radius: 12px; padding: 1.2rem; text-align: center; border: 1px solid #2a2a3e; }
    .stat .value { font-size: 2rem; font-weight: 700; }
    .stat .label { font-size: 0.85rem; color: #8b8fa3; margin-top: 0.3rem; }
    .stat.passed .value { color: #4ade80; }
    .stat.failed .value { color: #f87171; }
    .stat.skipped .value { color: #fbbf24; }
    .stat.total .value { color: #60a5fa; }
    .suite { background: #1a1a2e; border-radius: 12px; margin-bottom: 1rem; border: 1px solid #2a2a3e; overflow: hidden; }
    .suite-header { padding: 1rem 1.5rem; font-weight: 600; font-size: 1.1rem; background: #16213e; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
    .suite-header:hover { background: #1e2a4a; }
    .suite-header .badge { font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; }
    .badge.passed { background: #166534; color: #4ade80; }
    .badge.failed { background: #7f1d1d; color: #f87171; }
    .test-row { padding: 0.8rem 1.5rem; border-top: 1px solid #2a2a3e; display: flex; justify-content: space-between; align-items: center; }
    .test-row .name { display: flex; align-items: center; gap: 0.5rem; }
    .test-row .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-dot.passed { background: #4ade80; }
    .status-dot.failed { background: #f87171; }
    .status-dot.skipped { background: #fbbf24; }
    .test-row .duration { color: #8b8fa3; font-size: 0.85rem; }
    .test-row .error { color: #f87171; font-size: 0.85rem; margin-top: 0.3rem; font-family: monospace; }
    .screenshots { display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap; }
    .screenshots img { max-width: 300px; border-radius: 8px; border: 1px solid #2a2a3e; }
    .pass-rate { font-size: 3rem; font-weight: 700; text-align: center; margin-bottom: 2rem; }
    .pass-rate .rate { color: #4ade80; }
    .pass-rate .rate.warning { color: #fbbf24; }
    .pass-rate .rate.danger { color: #f87171; }
  </style>
</head>
<body>
  <h1>Visual QA Report</h1>
  <p class="timestamp">Generated: ${report.timestamp} | Duration: ${(totalDuration / 1000).toFixed(1)}s</p>
  <div class="pass-rate">
    <div class="rate ${passRate >= 90 ? "" : passRate >= 70 ? "warning" : "danger"}">${passRate}%</div>
    <div style="font-size:1rem;color:#8b8fa3;">pass rate</div>
  </div>
  <div class="summary">
    <div class="stat total"><div class="value">${report.totalTests}</div><div class="label">Total Tests</div></div>
    <div class="stat passed"><div class="value">${report.passed}</div><div class="label">Passed</div></div>
    <div class="stat failed"><div class="value">${report.failed}</div><div class="label">Failed</div></div>
    <div class="stat skipped"><div class="value">${report.skipped}</div><div class="label">Skipped</div></div>
  </div>
  ${renderResults(report.results)}
</body>
</html>`;

  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, "visual-qa-report-" + Date.now() + ".html");
  await fs.writeFile(filePath, html);

  const latestPath = path.join(outputDir, "latest.html");
  await fs.writeFile(latestPath, html);

  console.log("Visual QA report: " + filePath);
  return filePath;
}

function renderResults(results: TestResult[]): string {
  const suites = groupBySuite(results);
  let html = "";

  for (const [suiteName, tests] of Object.entries(suites)) {
    const suitePassed = tests.filter((t) => t.status === "passed").length;
    const suiteFailed = tests.filter((t) => t.status === "failed").length;
    const badge = suiteFailed > 0 ? "failed" : "passed";

    html += '<div class="suite">';
    html += '<div class="suite-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===' + "\'none\'" + "?\'\':\'none\'" + '">';
    html += "<span>" + suiteName + "</span>";
    html += '<span class="badge ' + badge + '">' + suitePassed + "/" + tests.length + " passed</span>";
    html += "</div><div>";

    for (const test of tests) {
      html += '<div class="test-row"><div>';
      html += '<div class="name"><span class="status-dot ' + test.status + '"></span> ' + test.name + "</div>";
      if (test.error) {
        html += '<div class="error">' + escapeHtml(test.error) + "</div>";
      }
      html += renderScreenshots(test);
      html += "</div>";
      html += '<div class="duration">' + (test.duration / 1000).toFixed(2) + "s</div>";
      html += "</div>";
    }

    html += "</div></div>";
  }

  return html;
}

function renderScreenshots(test: TestResult): string {
  if (!test.screenshots) return "";
  const s = test.screenshots;
  let html = '<div class="screenshots">';
  if (s.current) html += "<div><div style=\'font-size:0.75rem;color:#8b8fa3;margin-bottom:0.3rem;\'>Current</div><img src=\'" + s.current + "\' alt=\'current\'></div>";
  if (s.baseline) html += "<div><div style=\'font-size:0.75rem;color:#8b8fa3;margin-bottom:0.3rem;\'>Baseline</div><img src=\'" + s.baseline + "\' alt=\'baseline\'></div>";
  if (s.diff) html += "<div><div style=\'font-size:0.75rem;color:#8b8fa3;margin-bottom:0.3rem;\'>Diff (" + (s.diffPercent?.toFixed(2) || "0") + "%)</div><img src=\'" + s.diff + "\' alt=\'diff\'></div>";
  html += "</div>";
  return html;
}

function groupBySuite(results: TestResult[]): Record<string, TestResult[]> {
  const groups: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!groups[r.suite]) groups[r.suite] = [];
    groups[r.suite].push(r);
  }
  return groups;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
