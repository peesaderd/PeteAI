// ============================================================
// AI Orchestrator - Express Server
// Bridges AI agents with ERP Core MCP tools and Agency Team
// ============================================================

import express from "express";
import cors from "cors";
import { MemoryStore } from "./memory.js";
import { ToolRouter } from "./tool-router.js";
import { WebhookHandler, type WebhookEvent } from "./webhooks.js";
import { Scheduler } from "./scheduler.js";
import { LLMClient } from "./llm.js";
import { AgentLoop } from "./agent-loop.js";
import { RedisTaskQueue } from "./redis-queue.js";
import { v4 as uuidv4 } from "uuid";
import { WorkflowEngine } from "./workflow.js";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "54516", 10);

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Initialize core services
  const memory = new MemoryStore();
  const toolRouter = new ToolRouter(memory);
  const webhookHandler = new WebhookHandler(toolRouter, memory);

  // Initialize scheduler for routine jobs -- DISABLED by default
  const scheduler = new Scheduler(toolRouter, memory);
  if (process.env.SCHEDULER_ENABLED === "true") {
    scheduler.registerDefaultJobs();
  }

  // Initialize LLM client and autonomous agent loop
  const llm = new LLMClient(process.env.ERP_TENANT_ID || "8347c7ab-e4e0-4cc9-ac8d-2683718602b3");
  const agentLoop = new AgentLoop(toolRouter, memory, llm);
  toolRouter.agentLoop = agentLoop;

  // Initialize Redis task queue (event-driven mode) -- DISABLED by default
  const redisQueue = new RedisTaskQueue();
  if (process.env.REDIS_QUEUE_ENABLED === "true") {
    await redisQueue.connect();
    if (redisQueue.isConnected()) {
      agentLoop.setRedisQueue(redisQueue);
    }
  }

  let workflowEngine: any = null;
  if (process.env.WORKFLOW_ENABLED === "true") {
    workflowEngine = new WorkflowEngine(toolRouter, memory, llm, redisQueue);
  }

  // ============================================================

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

  // ============================================================
  // R&D Agent Chat API (with LLM support)
  // ============================================================

  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message, agent = "erp", language = "th" } = req.body;
      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }

      // Validate agent name
      const validAgents = ["erp"];
      const agentName = validAgents.includes(agent) ? agent : "erp";

      // Generate session ID if not provided
      const sid = sessionId || "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

      // RAG: Search Knowledge Base for relevant context (pre-processing)
      let knowledgeContext = "";
      try {
        const kbUrl = process.env.KB_URL || "http://localhost:3100";
        const searchRes = await fetch(kbUrl + "/api/search?q=" + encodeURIComponent(message) + "&limit=3", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData && searchData.length > 0) {
            const contexts: string[] = [];
            for (const doc of searchData.slice(0, 3)) {
              try {
                const docRes = await fetch(kbUrl + "/api/documents/" + doc.id, {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                });
                if (docRes.ok) {
                  const docData = await docRes.json();
                  const docContent = (docData.content || "").slice(0, 1000);
                  if (docContent.trim()) {
                    contexts.push("--- " + doc.title + " ---\n" + docContent);
                  }
                }
              } catch {}
            }
            if (contexts.length > 0) {
              knowledgeContext = contexts.join("\n\n");
            }
          }
        }
      } catch {}

      // Process message through Agent Loop
      const result = await agentLoop.processChatMessage({
        sessionId: sid,
        message,
        agent: agentName,
        language,
        knowledgeContext: knowledgeContext || undefined,
      });

      res.json({
        sessionId: result.sessionId,
        response: result.response,
        agent: agentName,
        toolResults: result.toolResults,
      });
    } catch (err: any) {
      console.error("[Chat API] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

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
  // Agent Loop Control API
  // ============================================================

  app.get("/api/agents/loop", (_req, res) => {
    res.json(agentLoop.getStatus());
  });

app.post("/api/agents/loop/start", (_req, res) => {
    agentLoop.start();
    res.json({ status: "started", agents: agentLoop.getStatus() });
  });

app.post("/api/agents/loop/stop", (_req, res) => {
    agentLoop.stop();
    res.json({ status: "stopped" });
  });

  // ============================================================
  // Agent Sleep/Wake API (Event-driven mode)
  // ============================================================

  app.post("/api/agents/:agentId/sleep", async (req, res) => {
    try {
      const result = await agentLoop.sleepAgent(req.params.agentId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.post("/api/agents/:agentId/wake", async (req, res) => {
    try {
      const result = await agentLoop.wakeAgent(req.params.agentId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Redis Queue API
  // ============================================================

  app.get("/api/queue", async (_req, res) => {
    try {
      if (redisQueue && redisQueue.isConnected()) {
        const lengths = await redisQueue.getAllQueueLengths();
        res.json({ connected: true, queues: lengths });
      } else {
        res.json({ connected: false, queues: {} });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.post("/api/queue/push", async (req, res) => {
    try {
      if (!redisQueue || !redisQueue.isConnected()) {
        return res.status(503).json({ error: "Redis queue not connected" });
      }
      const { targetAgent, title, description, priority, payload } = req.body;
      if (!targetAgent || !title) {
        return res.status(400).json({ error: "targetAgent and title are required" });
      }
      const task = {
        id: uuidv4(),
        type: "agent_task" as const,
        targetAgent,
        title,
        description: description || "",
        priority: priority || 2,
        payload: payload || {},
        createdAt: new Date().toISOString(),
        source: "api",
      };
      const pushed = await redisQueue.pushTask(task);
      res.json({ success: pushed, task });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Resume API — Resume a persisted agent conversation
  // ============================================================

  app.post("/api/agents/:agentId/resume", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { conversationId } = req.body;

      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }

      const validAgents = ["erp"];
      if (!validAgents.includes(agentId)) {
        return res.status(400).json({
          error: `Invalid agent. Must be one of: ${validAgents.join(", ")}`,
        });
      }

      const result = await agentLoop.resumeTask(agentId, conversationId);
      if (result.success) {
        res.json({
          status: "resumed",
          agent: agentId,
          conversationId,
          task: {
            id: result.task!.id,
            phase: result.task!.phase,
            iteration: result.task!.iteration,
          },
        });
      } else {
        res.status(404).json({ error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List persisted conversations for an agent
  app.get("/api/agents/:agentId/conversations", (req, res) => {
    try {
      const { agentId } = req.params;
      const validAgents = ["erp"];
      if (!validAgents.includes(agentId)) {
        return res.status(400).json({
          error: `Invalid agent. Must be one of: ${validAgents.join(", ")}`,
        });
      }
      const conversations = agentLoop.listPersistedConversations(agentId);
      res.json({ agent: agentId, conversations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all persisted conversations across all agents
  app.get("/api/conversations", (_req, res) => {
    try {
      const all = agentLoop.listPersistedConversations();
      res.json({ conversations: all });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Delegation API — Cross-Agent Delegation
  // ============================================================

  app.post("/api/delegations", (req, res) => {
    try {
      const { sourceAgent, targetAgent, title, description, contextData, parentTaskId } = req.body;
      if (!sourceAgent || !targetAgent || !title) {
        return res.status(400).json({ error: "sourceAgent, targetAgent, and title are required" });
      }
      const validAgents = ["erp"];
      if (!validAgents.includes(sourceAgent) || !validAgents.includes(targetAgent)) {
        return res.status(400).json({ error: `Invalid agent. Must be one of: ${validAgents.join(", ")}` });
      }
      const delegation = agentLoop.createDelegation({
        sourceAgent,
        targetAgent,
        title,
        description,
        contextData,
        parentTaskId,
      });
      res.status(201).json({ success: true, data: delegation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.get("/api/delegations", (req, res) => {
    try {
      const { sourceAgent, targetAgent, status } = req.query;
      const delegations = agentLoop.listDelegations({
        sourceAgent: sourceAgent as string | undefined,
        targetAgent: targetAgent as string | undefined,
        status: status as string | undefined,
      });
      res.json({ success: true, data: delegations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.get("/api/delegations/:id", (req, res) => {
    try {
      const delegation = agentLoop.getDelegation(req.params.id);
      if (!delegation) {
        return res.status(404).json({ error: "Delegation not found" });
      }
      res.json({ success: true, data: delegation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.post("/api/delegations/:id/respond", (req, res) => {
    try {
      const { status, resultData } = req.body;
      if (!status || !["completed", "rejected"].includes(status)) {
        return res.status(400).json({ error: "status must be 'completed' or 'rejected'" });
      }
      const delegation = agentLoop.respondToDelegation(req.params.id, status, resultData);
      if (!delegation) {
        return res.status(404).json({ error: "Delegation not found" });
      }
      res.json({ success: true, data: delegation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Task Queue API (for creating tasks consumed by Agent Loop)
  // ============================================================

  app.post("/api/tasks", (req, res) => {
    try {
      const { title, description, assignee, priority, inputData } = req.body;
      if (!title || !assignee) {
        return res.status(400).json({ error: "title and assignee are required" });
      }
      const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        description: description || "",
        assignee,
        priority: priority || 0,
        inputData: inputData || {},
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const existing = memory.getAgentState(assignee, "erp-core", "pending_tasks");
      let tasks: any[] = [];
      if (existing) {
        try { tasks = JSON.parse(existing); } catch {}
      }
      tasks.push(task);
      memory.setAgentState(assignee, "erp-core", "pending_tasks", JSON.stringify(tasks));
      res.status(201).json({ status: "created", task });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

app.get("/api/tasks", (req, res) => {
    try {
      const assignee = req.query.assignee as string | undefined;
      const status = req.query.status as string | undefined;
      const allTasks: any[] = [];
      const agentNames = ["rd", "brainstorm", "production", "design", "marketing"];
      for (const agent of agentNames) {
        if (assignee && agent !== assignee) continue;
        const raw = memory.getAgentState(agent, "erp-core", "pending_tasks");
        if (raw) {
          try {
            const tasks = JSON.parse(raw);
            for (const t of tasks) {
              if (!status || t.status === status) {
                allTasks.push({ ...t, agent });
              }
            }
          } catch {}
        }
      }
      res.json({ tasks: allTasks });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

  // ===============================================================================================
  // Workflow API - Multi-Agent Collaboration
  // ===============================================================================================

  app.get("/api/workflows/templates", (_req, res) => {
    res.json({ templates: workflowEngine.getTemplates() });
  });

  app.get("/api/workflows/templates/:id", (req, res) => {
    const t = workflowEngine.getTemplate(req.params.id);
    if (!t) return res.status(404).json({ error: "Template not found" });
    res.json(t);
  });

  app.post("/api/workflows", (req, res) => {
    try {
      const wf = workflowEngine.createWorkflow(req.body);
      res.status(201).json(wf);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/workflows", (req, res) => {
    const status = req.query.status as string | undefined;
    res.json({ workflows: workflowEngine.listWorkflows(status) });
  });

  app.get("/api/workflows/:id", (req, res) => {
    const wf = workflowEngine.getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ error: "Workflow not found" });
    res.json(wf);
  });

  app.post("/api/workflows/:id/start", async (req, res) => {
    try {
      const wf = await workflowEngine.startWorkflow(req.params.id);
      res.json(wf);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/workflows/:id/cancel", (req, res) => {
    const ok = workflowEngine.cancelWorkflow(req.params.id);
    if (!ok) return res.status(404).json({ error: "Workflow not found or already completed" });
    res.json({ status: "cancelled" });
  });

  app.post("/api/workflows/:id/steps/:stepId/complete", (req, res) => {
    const ok = workflowEngine.reportStepCompletion(req.params.id, req.params.stepId, req.body.outputData || {});
    if (!ok) return res.status(404).json({ error: "Workflow or step not found" });
    res.json({ status: "completed" });
  });
// ============================================================
  // Start Server
  // ============================================================

  // Start scheduler and agent loop
  if (process.env.SCHEDULER_ENABLED === "true") {
    scheduler.start();
  }
  // Agent Loop starts automatically when LLM is configured,
  // or explicitly via AGENT_LOOP_ENABLED=true
  const llmConfigured = !!(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "sk-your-key-here");
  if (process.env.AGENT_LOOP_ENABLED === "true" || llmConfigured) {
    agentLoop.start();
  }

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
    console.log(
      `[AI Orchestrator] Agent Loop: ${agentLoop ? "RUNNING" : "STOPPED"}`
    );
  });
}

main().catch(console.error);
