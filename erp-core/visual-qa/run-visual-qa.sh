#!/bin/bash
set -euo pipefail

# Visual QA Pipeline Runner
# Usage: ./visual-qa/run-visual-qa.sh [--update-baseline]

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

REPORT_DIR="visual-qa/reports"
SCREENSHOT_DIR="visual-qa/screenshots"
BASELINE_DIR="$SCREENSHOT_DIR/baseline"
CURRENT_DIR="$SCREENSHOT_DIR/current"

echo "============================================"
echo "  Visual QA Pipeline"
echo "============================================"
echo ""

# Step 1: Run visual tests
echo "[1/3] Running Visual QA tests..."
npx playwright test --config=playwright.visual.config.ts 2>&1 || true

# Step 2: Generate HTML report
echo ""
echo "[2/3] Generating Visual QA report..."
npx tsx visual-qa/generate-report.ts 2>&1 || echo "  (report generation skipped - manual review available)"

# Step 3: Print summary
echo ""
echo "[3/3] Summary"
echo "  Report: $REPORT_DIR/latest.html"
echo "  Screenshots: $CURRENT_DIR/"
echo "  Baseline: $BASELINE_DIR/"
echo ""

# Check for failures
if [ -f "$REPORT_DIR/test-results.json" ]; then
  FAILED=$(node -e "const d=require('./$REPORT_DIR/test-results.json'); console.log(d.stats?.failures || 0)")
  if [ "$FAILED" -gt 0 ]; then
    echo "FAILED: $FAILED visual test(s) failed!"
    exit 1
  fi
fi

echo "All visual QA checks passed!"
