// ============================================================
// AI Orchestrator - Express Server
// Bridges AI agents with ERP Core MCP tools and Agency Team
// ============================================================

import express from "express";
import cors from "cors";
import { MemoryStore } from "./memory.js";
import { ToolRouter } from "./tool-router.js";
import { WebhookHandler, type WebhookEvent } from "./webhooks.js";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "54516", 10);

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Initialize core services
  const memory = new MemoryStore();
  const toolRouter = new ToolRouter(memory);
  const webhookHandler = new WebhookHandler(toolRouter, memory);

  // ============================================================
  // Health & Info
  // ============================================================

  app.get("/api/health", async (_req, res) => {
    const health = await toolRouter.executeTool("orchestrator_health", {});
    res.json({
      status: "ok",
      service: "ai-orchestrator",
      ...health.data,
    });
  });

  // ============================================================
  // Tool Execution API
  // For AI agents to call tools directly
  // ============================================================

  app.post("/api/tools/:toolName", async (req, res) => {
    try {
      const { toolName } = req.params;
      const args = req.body.args || req.body;
      const result = await toolRouter.executeTool(toolName, args);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get("/api/tools", (_req, res) => {
    const category = _req.query.category as string | undefined;
    const tools = toolRouter.getTools(category);
    res.json(
      tools.map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
        inputSchema: t.inputSchema,
      }))
    );
  });

  // ============================================================
  // Session & Memory API
  // ============================================================

  app.post("/api/sessions", (req, res) => {
    try {
      const { agentId, tenantId, title } = req.body;
      if (!agentId || !tenantId) {
        return res
          .status(400)
          .json({ error: "agentId and tenantId required" });
      }
      const session = memory.createSession(agentId, tenantId, title);
      res.status(201).json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/sessions", (req, res) => {
    const { agent_id, tenant_id, limit } = req.query;
    const sessions = memory.listSessions(
      agent_id as string,
      tenant_id as string,
      limit ? parseInt(limit as string) : 50
    );
    res.json(sessions);
  });

  app.get("/api/sessions/:id", (req, res) => {
    const session = memory.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  });

  app.get("/api/sessions/:id/context", (req, res) => {
    const { maxMessages } = req.query;
    const context = memory.getConversationContext(
      req.params.id,
      maxMessages ? parseInt(maxMessages as string) : 50
    );
    if (!context) return res.status(404).json({ error: "Session not found" });
    res.json(context);
  });

  app.get("/api/sessions/:id/messages", (req, res) => {
    const { limit, before } = req.query;
    const messages = memory.getSessionMessages(
      req.params.id,
      limit ? parseInt(limit as string) : 100,
      before ? parseInt(before as string) : undefined
    );
    res.json(messages);
  });

  app.post("/api/sessions/:id/messages", (req, res) => {
    try {
      const { role, content, toolCalls, toolResults } = req.body;
      if (!role || !content) {
        return res.status(400).json({ error: "role and content required" });
      }
      const msg = memory.addMessage(req.params.id, role, content, {
        toolCalls,
        toolResults,
      });
      res.status(201).json(msg);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Agent State API
  // ============================================================

  app.get("/api/agents/:agentId/state", (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) {
      return res.status(400).json({ error: "tenant_id required" });
    }
    const state = memory.getAllAgentState(
      req.params.agentId,
      tenant_id as string
    );
    res.json(state);
  });

  app.post("/api/agents/:agentId/state", (req, res) => {
    try {
      const { tenant_id, key, value } = req.body;
      if (!tenant_id || !key || value === undefined) {
        return res
          .status(400)
          .json({ error: "tenant_id, key, and value required" });
      }
      memory.setAgentState(req.params.agentId, tenant_id, key, String(value));
      res.json({ key, value });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Webhook Receiver
  // Receives events from ERP Core Gateway
  // ============================================================

  app.post("/api/webhooks/:source", async (req, res) => {
    try {
      const { source } = req.params;
      const event: WebhookEvent = {
        source,
        type: req.body.type || "unknown",
        payload: req.body.payload || req.body,
        timestamp: Date.now(),
      };

      console.log(
        `[Webhook] Received from ${source}:`,
        JSON.stringify(event).slice(0, 300)
      );

      // Process through trigger rules
      const results = await webhookHandler.handleEvent(event);

      res.json({
        received: true,
        source,
        type: event.type,
        triggers: results,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Trigger Rules API
  // ============================================================

  app.get("/api/triggers", (_req, res) => {
    res.json(webhookHandler.getRules());
  });

  app.post("/api/triggers", (req, res) => {
    try {
      webhookHandler.addRule(req.body);
      res.status(201).json(req.body);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/triggers/:id", (req, res) => {
    const rule = webhookHandler.updateRule(req.params.id, req.body);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    res.json(rule);
  });

  // ============================================================
  // MCP-compatible endpoint (for AI agents that speak MCP)
  // ============================================================

  app.post("/api/mcp", async (req, res) => {
    try {
      const { tool, args } = req.body;
      if (!tool || !args) {
        return res
          .status(400)
          .json({ error: "tool and args required" });
      }
      const result = await toolRouter.executeTool(tool, args);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ============================================================
  // Start Server
  // ============================================================

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AI Orchestrator] Running on http://0.0.0.0:${PORT}`);
    console.log(
      `[AI Orchestrator] Tools: ${toolRouter.getTools().length} registered`
    );
    console.log(
      `[AI Orchestrator] Triggers: ${webhookHandler.getRules().length} rules`
    );
    console.log(
      `[AI Orchestrator] ERP MCP: ${process.env.ERP_MCP_URL || "http://localhost:54510/api/mcp"}`
    );
    console.log(
      `[AI Orchestrator] Agency API: ${process.env.AGENCY_API_URL || "http://localhost:54515"}`
    );
  });
}

main().catch(console.error);
