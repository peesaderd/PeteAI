import express from "express";
import cors from "cors";
import { ResourceMonitor } from "./monitor.js";
import { CleanupManager } from "./cleanup.js";
import { AgentLifecycle } from "./lifecycle.js";
import { Watchdog } from "./watchdog.js";
import { AgentSupervisor } from "./supervisor.js";
import { DocGenerator, DocType } from "./doc-generator.js";

const PORT = parseInt(process.env.SYSTEM_AGENT_PORT || "54520", 10);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:54516";

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const monitor = new ResourceMonitor();
  const cleanup = new CleanupManager(ORCHESTRATOR_URL);
  const lifecycle = new AgentLifecycle(ORCHESTRATOR_URL);
  const watchdog = new Watchdog(monitor, cleanup, lifecycle);
  const supervisor = new AgentSupervisor(lifecycle);
  const docGen = new DocGenerator();

  app.get("/api/health", async (_req, res) => {
    const status = await monitor.getStatus();
    res.json({ status: "ok", service: "system-agent", ...status });
  });

  app.get("/api/resources", async (_req, res) => {
    res.json(await monitor.getAll());
  });

  app.post("/api/cleanup", async (_req, res) => {
    const result = await cleanup.runAll();
    res.json({ success: true, ...result });
  });

  app.post("/api/cleanup/:category", async (req, res) => {
    const result = await cleanup.runCategory(req.params.category);
    res.json({ success: true, ...result });
  });

  app.get("/api/agents", async (_req, res) => {
    res.json(await lifecycle.listAgents());
  });

  app.post("/api/agents/:name/sleep", async (req, res) => {
    res.json(await lifecycle.sleepAgent(req.params.name));
  });

  app.post("/api/agents/:name/wake", async (req, res) => {
    res.json(await lifecycle.wakeAgent(req.params.name));
  });

  app.get("/api/watchdog", async (_req, res) => {
    res.json(watchdog.getStatus());
  });

  app.post("/api/watchdog/config", async (req, res) => {
    watchdog.updateConfig(req.body);
    res.json({ success: true });
  });

  // --- Supervisor Routes ---
  app.get("/api/supervisor", async (_req, res) => {
    res.json(supervisor.getStatus());
  });

  app.get("/api/supervisor/config", async (_req, res) => {
    res.json(supervisor.getConfig());
  });

  app.post("/api/supervisor/config", async (req, res) => {
    supervisor.updateConfig(req.body);
    res.json({ success: true });
  });

  app.post("/api/supervisor/agents/:name/register", async (req, res) => {
    supervisor.registerAgent(req.params.name);
    res.json({ success: true, message: "Agent " + req.params.name + " registered" });
  });

  app.post("/api/supervisor/agents/:name/unregister", async (req, res) => {
    supervisor.unregisterAgent(req.params.name);
    res.json({ success: true, message: "Agent " + req.params.name + " unregistered" });
  });

  app.post("/api/supervisor/agents/:name/restart", async (req, res) => {
    const result = await supervisor.restartAgent(req.params.name);
    res.json(result);
  });

  app.post("/api/supervisor/agents/:name/force-break", async (req, res) => {
    const reason = req.body?.reason || "Manual force break";
    const result = await supervisor.forceBreak(req.params.name, reason);
    res.json(result);
  });

  app.post("/api/supervisor/report-action", async (req, res) => {
    const { agentName, action, success, error } = req.body || {};
    if (!agentName || !action) {
      res.status(400).json({ success: false, error: "agentName and action required" });
      return;
    }
    supervisor.reportAction(agentName, action, success, error);
    res.json({ success: true });
  });

  app.post("/api/supervisor/alert", async (req, res) => {
    const { title, lines } = req.body || {};
    if (!title) {
      res.status(400).json({ success: false, error: "title required" });
      return;
    }
    await supervisor.sendAlert(title, lines || []);
    res.json({ success: true });
  });

  // --- Doc Generator Routes ---
  app.post("/api/docs/generate", async (req, res) => {
    try {
      const type: DocType = (req.body?.type as DocType) || "all";
      const results = await docGen.generate(type);
      if (results.length > 0) {
        res.json({
          success: true,
          count: results.length,
          types: results.map(r => r.type),
          published: results.filter(r => r.published).map(r => ({ type: r.type, docId: r.published!.docId })),
        });
      } else {
        res.json({ success: true, message: "No changes to document" });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  app.get("/api/docs/types", async (_req, res) => {
    const { DOC_TYPES, DOC_LABELS } = await import("./templates.js");
    res.json({ types: DOC_TYPES, labels: DOC_LABELS });
  });

  // Auto-generate docs every 6 hours
  setInterval(async () => {
    console.log("[DocGenerator] Scheduled run...");
    try {
      await docGen.generate("all");
    } catch (err) {
      console.error("[DocGenerator] Scheduled run failed:", (err as Error).message);
    }
  }, 6 * 60 * 60 * 1000);

  // Also generate on startup (with delay for services to be ready)
  setTimeout(async () => {
    console.log("[DocGenerator] Startup run...");
    try {
      await docGen.generate("all");
    } catch (err) {
      console.error("[DocGenerator] Startup run failed:", (err as Error).message);
    }
  }, 15000);

  await supervisor.start();
  await watchdog.start();
  console.log("[SystemAgent] Started on port " + PORT);
  console.log("[SystemAgent] Orchestrator: " + ORCHESTRATOR_URL);

  app.listen(PORT, "0.0.0.0", () => {
    console.log("[SystemAgent] HTTP server listening on 0.0.0.0:" + PORT);
  });
}

main().catch((err) => {
  console.error("[SystemAgent] Fatal:", err);
  process.exit(1);
});
