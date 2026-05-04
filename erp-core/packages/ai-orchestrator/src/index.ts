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
import { LLMClient, type LLMMessage } from "./llm.js";
import { AgentLoop } from "./agent-loop.js";
import { RedisTaskQueue } from "./redis-queue.js";
import { Supervisor } from "./supervisor.js";
import { createClient } from "redis";
import { ChatWorker } from "./chat-worker.js";
import { v4 as uuidv4 } from "uuid";
import { WorkflowEngine } from "./workflow.js";

const PORT = parseInt(process.env.ORCHESTRATOR_PORT || "54516", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://docker-redis:6379";

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Initialize core services
  const memory = new MemoryStore();
  const toolRouter = new ToolRouter(memory);
  const webhookHandler = new WebhookHandler(toolRouter, memory);

  // Initialize scheduler for routine jobs
  const scheduler = new Scheduler(toolRouter, memory);
  scheduler.registerDefaultJobs();

  // Initialize LLM client and autonomous agent loop
  const llm = new LLMClient(process.env.ERP_TENANT_ID || "8347c7ab-e4e0-4cc9-ac8d-2683718602b3");
  const agentLoop = new AgentLoop(toolRouter, memory, llm);
  toolRouter.agentLoop = agentLoop;

  // Initialize Redis task queue (event-driven mode)
  const redisQueue = new RedisTaskQueue();
  await redisQueue.connect();
  if (redisQueue.isConnected()) {
    agentLoop.setRedisQueue(redisQueue);
  }

  // ============================================================
  // Supervisor — Loop Detection, Circuit Breaker, Healthcheck
  // ============================================================

  const supervisor = new Supervisor({
    heartbeatTimeoutMs: 30000,
    loopDetectionThreshold: 3,
    circuitBreakerThreshold: 3,
    circuitBreakerCooldownMs: 60000,
    healthcheckIntervalMs: 30000,
    inactivityTimeoutMs: parseInt(process.env.SUPERVISOR_INACTIVITY_TIMEOUT_MS || "300000", 10),
    inactivityAlertTimeoutMs: parseInt(process.env.SUPERVISOR_INACTIVITY_ALERT_TIMEOUT_MS || "900000", 10),
    autoPromptEnabled: process.env.SUPERVISOR_AUTO_PROMPT_ENABLED !== "false",
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
    lineWebhookUrl: process.env.LINE_WEBHOOK_URL || undefined,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
  });

  supervisor.setAlertHandler((message: string) => {
    console.log(`[Supervisor Alert] ${message}`);
    // TODO: Send to Slack/LINE webhook when configured
  });

  await supervisor.connect();
  supervisor.start();

  // Auto-prompt handler — pushes prompt to Redis when supervisor detects inactivity
  supervisor.setAutoPromptHandler((sessionId: string, agentName: string) => {
    const prompts: Record<string, string> = {
      rd: "คุณเป็น R&D Agent ของทีม ERP โปรดตรวจสอบงานที่ค้างอยู่และรายงานสถานะปัจจุบัน",
      brainstorm: "คุณเป็น Brainstorm Agent โปรดเสนอไอเดียหรือแนวทางใหม่ๆ สำหรับระบบ ERP",
      production: "คุณเป็น Production Agent โปรดตรวจสอบงาน implementation ที่ค้างอยู่",
      design: "คุณเป็น Design Agent โปรดตรวจสอบ design system และ UI components",
      marketing: "คุณเป็น Marketing Agent โปรดตรวจสอบ campaign และ content ที่ค้างอยู่",
    };
    const prompt = prompts[agentName] || `โปรดดำเนินการงานของคุณในฐานะ ${agentName} Agent`;
    const redis = createClient({ url: REDIS_URL });
    redis.connect().then(() => {
      redis.lPush("queue:chat:messages", JSON.stringify({
        sessionId,
        agentName,
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      })).then(() => {
        console.log(`[Supervisor] Auto-prompt sent to ${agentName} session ${sessionId.slice(0, 8)}`);
      }).finally(() => redis.disconnect());
    });
  });


  // ============================================================
  // Chat Worker — Processes chat messages via Redis Queue
  // ============================================================

  const chatWorker = new ChatWorker(toolRouter, memory, supervisor);
  await chatWorker.connect();
  chatWorker.start();
const workflowEngine = new WorkflowEngine(toolRouter, memory, llm, redisQueue);


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
      const { sessionId, message, agent = "rd", language = "th" } = req.body;
      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }

      // Validate agent name
      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
      const agentName = validAgents.includes(agent) ? agent : "rd";

      // Generate session ID if not provided
      const sid = sessionId || "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

      // Track activity for inactivity detection
      supervisor.trackActivity(sid, agentName);

      // Check circuit breaker before processing
      const cb = supervisor.checkCircuitBreaker("chat-worker");
      if (!cb.allowed) {
        const cooldownRemaining = cb.state.cooldownUntil
          ? Math.ceil((cb.state.cooldownUntil - Date.now()) / 1000)
          : 60;
        return res.json({
          sessionId: sid,
          response: "\u26a0\ufe0f The chat service is temporarily paused due to repeated issues. It will resume automatically in " + cooldownRemaining + " seconds. Please try again shortly.",
          agent: agentName,
          toolResults: [{ tool: "supervisor", result: { circuitBreaker: "open", cooldownRemaining } }],
        });
      }

      // Check if LLM is configured
      const llmConfigured = !!(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== "sk-your-key-here");

      if (llmConfigured && chatWorker.isConnected()) {
        // Redis Queue mode: push to queue and wait for response
        const pushed = await chatWorker.pushMessage(sid, message, agentName, language);
        if (pushed) {
          const response = await chatWorker.waitForResponse(sid, 30000);
          if (response) {
            return res.json({
              sessionId: sid,
              ...response,
            });
          }
          console.warn("[Chat] Redis response timeout for " + sid + ", falling back to direct");
        }
      }

      // Direct processing (fallback if Redis unavailable or timeout)
      const agentPrompts: Record<string, string> = {
        rd: "You are an R&D AI agent. Your role is to research, analyze, and propose innovative solutions.",
        brainstorm: "You are a Brainstorm AI agent. Your role is to generate creative ideas and facilitate brainstorming sessions.",
        production: "You are a Production AI agent. Your role is to oversee production processes, optimize workflows, and ensure quality control.",
        design: "You are a Design AI agent. Your role is to create beautiful and functional designs, provide design feedback, and maintain design systems.",
        marketing: "You are a Marketing AI agent. Your role is to develop marketing strategies, create content, and analyze market trends.",
      };

      if (llmConfigured) {
        // Direct LLM mode
        const systemPrompt = agentPrompts[agentName] || agentPrompts.rd;
        const llmMessages: LLMMessage[] = [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ];

        if (language === "th") {
          llmMessages.push({ role: "system", content: "Please respond in Thai language." });
        }

        const response = await llm.chat(llmMessages, undefined, {
          maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
          temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
        });

        const reply = response.content || "I apologize, but I was unable to generate a response.";

        // Ensure session exists
        if (!memory.getSession(sid)) {
          memory.createSessionWithId(sid, agentName, "chat");
        }

        // Store in memory
        memory.addMessage(sid, "user", message);
        memory.addMessage(sid, "assistant", reply);

        // Record heartbeat
        supervisor.recordHeartbeat("chat-direct", agentName, "alive");

        return res.json({
          sessionId: sid,
          response: reply,
          agent: agentName,
          toolResults: [],
        });
      }

      // Rule-based fallback
      const msg = message.toLowerCase();
      let response = "";

      if (msg.includes("hello") || msg.includes("hi") || msg.includes("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35")) {
        response = "รับทราบครับ มีอะไรให้ช่วยไหมครับ";
      } else if (msg.includes("tool") || msg.includes("what can you do") || msg.includes("help")) {
        const tools = toolRouter.getTools();
        response = "I have access to the following tools:\n" +
          tools.map((t) => "  - **" + t.name + "**: " + t.description).join("\n");
      } else if (msg.includes("research") || msg.includes("search") || msg.includes("find") || msg.includes("\u0e04\u0e49\u0e19\u0e2b\u0e32")) {
        response = "กำลังค้นหาข้อมูลให้ครับ";
      } else if (msg.includes("status") || msg.includes("health") || msg.includes("\u0e2a\u0e16\u0e32\u0e19\u0e30")) {
        try {
          const health = await toolRouter.executeTool("orchestrator_health", {});
          response = "**System Status:**\n\\\`\\\`\\\`json\n" + JSON.stringify(health.data, null, 2) + "\n\\\`\\\`\\\`";
        } catch {
          response = "System is running.";
        }
      } else {
        response = "รับทราบครับ มีอะไรให้ช่วยเพิ่มเติมไหมครับ";
      }

      // Ensure session exists
      if (!memory.getSession(sid)) {
        memory.createSessionWithId(sid, agentName, "chat");
      }

      // Store in memory
      memory.addMessage(sid, "user", message);
      memory.addMessage(sid, "assistant", response);

      // Record heartbeat
      supervisor.recordHeartbeat("chat-direct", agentName, "alive");

      res.json({
        sessionId: sid,
        response,
        agent: agentName,
        toolResults: [],
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

      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
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
      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
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
      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
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
  scheduler.start();
  if (process.env.AGENT_LOOP_ENABLED === "true") {
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
      `[AI Orchestrator] Agent Loop: ${process.env.AGENT_LOOP_ENABLED === "true" ? "RUNNING" : "STOPPED (set AGENT_LOOP_ENABLED=true to start)"}`
    );
    console.log(`[AI Orchestrator] Supervisor: RUNNING (loop=${supervisor.getStatus().config.loopDetectionThreshold}x, breaker=${supervisor.getStatus().config.circuitBreakerThreshold}x)`);
    console.log(`[AI Orchestrator] Chat Worker: ${chatWorker.isConnected() ? "REDIS QUEUE" : "DIRECT MODE (Redis unavailable)"}`);
  });
}

main().catch(console.error);
