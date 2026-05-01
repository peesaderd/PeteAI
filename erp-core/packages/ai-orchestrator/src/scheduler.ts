// ============================================================
// Hybrid Automation Scheduler
// API-only routine jobs (0 Token) + conditional LLM tasks
// ============================================================

import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";

const SIYUAN_API = process.env.SIYUAN_API_URL || "http://localhost:54511";
const SIYUAN_TOKEN = process.env.SIYUAN_TOKEN || "9w4oqxucqvq1o8sd";

interface RoutineJob {
  name: string;
  intervalMs: number;
  lastRun: number;
  run: () => Promise<void>;
  type: "api" | "hybrid";
}

export class Scheduler {
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private jobs: RoutineJob[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(toolRouter: ToolRouter, memory: MemoryStore) {
    this.toolRouter = toolRouter;
    this.memory = memory;
  }

  registerDefaultJobs() {
    // ============================================================
    // API-only jobs (0 Token cost)
    // ============================================================

    // 1. Health check every 5 minutes
    this.addJob({
      name: "system-health-check",
      intervalMs: 5 * 60 * 1000,
      type: "api",
      run: async () => {
        const health = await this.toolRouter.executeTool("orchestrator_health", {});
        const services = health.data?.services || {};
        const unhealthy = Object.entries(services)
          .filter(([_, s]) => s !== "connected")
          .map(([name]) => name);

        if (unhealthy.length > 0) {
          console.warn(`[Scheduler] Unhealthy services: ${unhealthy.join(", ")}`);
          this.memory.setAgentState(
            "system", "erp-core",
            `alert_${Date.now()}`,
            JSON.stringify({ services: unhealthy, time: new Date().toISOString() })
          );
        }
      },
    });

    // 2. Cleanup old sessions every 24 hours
    this.addJob({
      name: "cleanup-old-sessions",
      intervalMs: 24 * 60 * 60 * 1000,
      type: "api",
      run: async () => {
        const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
        const { getOrchestratorDb } = await import("./memory.js");
        const db = getOrchestratorDb();
        const deleted = db.prepare("DELETE FROM sessions WHERE updated_at < ?").run(cutoff);
        db.prepare("DELETE FROM messages WHERE session_id NOT IN (SELECT id FROM sessions)").run();
        console.log(`[Scheduler] Cleaned up ${deleted.changes} old sessions`);
      },
    });

    // 3. Cache warmup every 15 minutes
    this.addJob({
      name: "cache-warmup",
      intervalMs: 15 * 60 * 1000,
      type: "api",
      run: async () => {
        const warmTools = [
          { name: "get_dashboard_summary", args: {} },
          { name: "list_products", args: { limit: 10 } },
        ];
        for (const t of warmTools) {
          try { await this.toolRouter.executeTool(t.name, t.args); }
          catch { /* best-effort */ }
        }
      },
    });

    // 4. Auto-retry failed tasks every 10 minutes
    this.addJob({
      name: "auto-retry-tasks",
      intervalMs: 10 * 60 * 1000,
      type: "api",
      run: async () => {
        const result = await this.toolRouter.executeTool("agency_list_tasks", {
          status: "failed", limit: 20,
        });
        const tasks = result.data || [];
        for (const task of tasks.slice(0, 5)) {
          const retryKey = `retry_count_${task.id}`;
          const retryCount = this.memory.getAgentState("system", "erp-core", retryKey);
          const count = parseInt(retryCount || "0");
          if (count < 3) {
            this.memory.setAgentState("system", "erp-core", retryKey, String(count + 1));
            console.log(`[Scheduler] Retrying task ${task.id} (attempt ${count + 1})`);
          }
        }
      },
    });

    // 5. Sync SiYuan KB with ERP data every hour
    this.addJob({
      name: "siyuan-kb-sync",
      intervalMs: 60 * 60 * 1000,
      type: "api",
      run: async () => {
        try {
          const ordersRes = await this.toolRouter.executeTool("list_orders", { limit: 5 });
          const orders = ordersRes.data || [];
          for (const order of orders.slice(0, 3)) {
            const content = [
              `# Order ${order.id}`,
              "",
              `- Status: ${order.status}`,
              `- Amount: ${order.total}`,
              `- Date: ${order.createdAt}`,
              "",
              "## Items",
              ...(order.items || []).map((i: any) => `- ${i.name} x${i.quantity}: $${i.price}`),
            ].join("\n");

            await fetch(`${SIYUAN_API}/api/import`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SIYUAN_TOKEN}`,
              },
              body: JSON.stringify({
                notebook: "20260430223407-0hd7gev",
                path: `/ERP Sync/Orders/${order.id}`,
                content,
              }),
            });
          }
          console.log(`[Scheduler] Synced ${orders.length} orders to SiYuan`);
        } catch (err: any) {
          console.error(`[Scheduler] SiYuan sync failed:`, err.message);
        }
      },
    });

    // 6. Backup orchestrator DB every 6 hours
    this.addJob({
      name: "db-backup",
      intervalMs: 6 * 60 * 60 * 1000,
      type: "api",
      run: async () => {
        const fs = await import("fs");
        const path = await import("path");
        const dbPath = process.env.ORCHESTRATOR_DB_PATH || "./data/orchestrator.db";
        const backupDir = path.dirname(dbPath) + "/backups";
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const date = new Date().toISOString().replace(/[:.]/g, "-");
        fs.copyFileSync(dbPath, `${backupDir}/orchestrator-${date}.db`);
        const files = fs.readdirSync(backupDir)
          .filter((f: string) => f.startsWith("orchestrator-"))
          .sort().reverse();
        for (const f of files.slice(8)) fs.unlinkSync(`${backupDir}/${f}`);
        console.log(`[Scheduler] DB backup complete`);
      },
    });

    // ============================================================
    // Hybrid jobs (API + conditional LLM)
    // ============================================================

    // 7. Summarize new SiYuan notes every 30 minutes
    this.addJob({
      name: "summarize-new-notes",
      intervalMs: 30 * 60 * 1000,
      type: "hybrid",
      run: async () => {
        try {
          const res = await fetch(`${SIYUAN_API}/api/list`, {
            headers: { Authorization: `Bearer ${SIYUAN_TOKEN}` },
          });
          const docs = await res.json();
          const lastSync = this.memory.getAgentState("system", "erp-core", "last_siyuan_sync");
          const lastSyncTime = parseInt(lastSync || "0");
          const newDocs = (docs || []).filter((d: any) => d.updatedAt > lastSyncTime);

          if (newDocs.length === 0) {
            console.log(`[Scheduler] No new notes to summarize`);
            return;
          }

          console.log(`[Scheduler] ${newDocs.length} new notes, creating summarize tasks`);
          for (const doc of newDocs.slice(0, 3)) {
            await this.toolRouter.executeTool("agency_create_task", {
              tenantId: "erp-core",
              title: `Summarize: ${doc.title || "Untitled"}`,
              description: `Summarize the new document: ${doc.content?.slice(0, 500) || ""}`,
              sourceRole: "system",
              targetRole: "rd",
              priority: "low",
              inputData: { docId: doc.id, source: "siyuan" },
            });
          }
          this.memory.setAgentState("system", "erp-core", "last_siyuan_sync", String(Date.now()));
        } catch (err: any) {
          console.error(`[Scheduler] Note summarization failed:`, err.message);
        }
      },
    });
  }

  addJob(job: RoutineJob) {
    this.jobs.push(job);
  }

  start() {
    console.log(`[Scheduler] Starting ${this.jobs.length} routine jobs...`);
    for (const job of this.jobs) {
      this.runJob(job);
      const timer = setInterval(() => this.runJob(job), job.intervalMs);
      this.timers.push(timer);
      console.log(
        `[Scheduler]  ${job.type === "api" ? "\u26a1" : "🧠"} ${job.name} every ${Math.round(job.intervalMs / 60000)}min`
      );
    }
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private async runJob(job: RoutineJob) {
    try {
      job.lastRun = Date.now();
      await job.run();
    } catch (err: any) {
      console.error(`[Scheduler] Job "${job.name}" failed:`, err.message);
    }
  }

  getJobs() {
    return this.jobs.map((j) => ({
      name: j.name,
      intervalMs: j.intervalMs,
      type: j.type,
      lastRun: j.lastRun,
      nextRun: j.lastRun + j.intervalMs,
    }));
  }
}
