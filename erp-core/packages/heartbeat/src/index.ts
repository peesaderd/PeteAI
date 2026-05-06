// ============================================================
// Heartbeat Service
// Lightweight health-check service for ERP Core.
// Does NOT run any agent logic, task polling, or bot code.
// Reports health of registered services at a regular interval.
// ============================================================

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ServiceTarget {
  name: string;
  url: string;
  timeout: number;
}

interface HealthReport {
  timestamp: number;
  service: string;
  status: "ok" | "degraded" | "error";
  checks: Array<{
    name: string;
    status: "ok" | "error";
    latencyMs: number;
    error?: string;
  }>;
}

// ─── Config ─────────────────────────────────────────────────

function loadConfig(): { intervalMs: number; services: ServiceTarget[] } {
  const envPath = resolve(__dirname, "../.env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }

  const intervalMs = parseInt(process.env.HEARTBEAT_INTERVAL || "30000", 10);

  const services: ServiceTarget[] = [
    { name: "ai-orchestrator", url: process.env.ORCHESTRATOR_URL || "http://127.0.0.1:54516/api/health", timeout: 5000 },
    { name: "erp-server", url: process.env.ERP_URL || "http://127.0.0.1:3000/api/health", timeout: 5000 },
    { name: "knowledge-base", url: process.env.KB_URL ? `${process.env.KB_URL}/api/health` : "http://127.0.0.1:3100/api/health", timeout: 5000 },
  ];

  return { intervalMs, services };
}

// ─── Health Check ───────────────────────────────────────────

async function checkService(target: ServiceTarget): Promise<{
  name: string;
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await fetch(target.url, {
      method: "GET",
      signal: AbortSignal.timeout(target.timeout),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { name: target.name, status: "ok", latencyMs };
    }
    return { name: target.name, status: "error", latencyMs, error: `HTTP ${res.status}` };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return { name: target.name, status: "error", latencyMs, error: err.message || "Unknown error" };
  }
}

async function runHealthCheck(services: ServiceTarget[]): Promise<HealthReport> {
  const results = await Promise.all(services.map(checkService));
  const errors = results.filter((r) => r.status === "error");
  return {
    timestamp: Date.now(),
    service: "heartbeat",
    status: errors.length === 0 ? "ok" : errors.length < results.length ? "degraded" : "error",
    checks: results,
  };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const { intervalMs, services } = loadConfig();

  console.log(`[Heartbeat] Starting health checks every ${intervalMs}ms`);
  console.log(`[Heartbeat] Targets: ${services.map((s) => s.name).join(", ")}`);

  // Run immediately, then on interval
  const run = async () => {
    const report = await runHealthCheck(services);
    const status = report.checks.map((c) => `${c.name}=${c.status}`).join(" ");
    console.log(`[Heartbeat] ${report.status} | ${status}`);
  };

  await run();
  setInterval(run, intervalMs);
}

main().catch((err) => {
  console.error("[Heartbeat] Fatal error:", err);
  process.exit(1);
});
