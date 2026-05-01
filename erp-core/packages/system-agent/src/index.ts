import express from "express";
import cors from "cors";
import { ResourceMonitor } from "./monitor.js";
import { CleanupManager } from "./cleanup.js";
import { AgentLifecycle } from "./lifecycle.js";
import { Watchdog } from "./watchdog.js";

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
