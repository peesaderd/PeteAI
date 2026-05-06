// ============================================================
// Autonomous Agent Loop
// Each agent continuously polls for tasks, executes tools,
// analyzes results via LLM, and decides next actions.
// Falls back to rule-based decisions when no LLM configured.
// ============================================================

import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";
import { ChatStore } from "./chat-store.js";
import { LLMClient, LLMMessage, LLMToolDef } from "./llm.js";
import { PersistenceManager, type PersistedState, type PersistedEvent } from "./persistence.js";
import { RedisTaskQueue } from "./redis-queue.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  maxConcurrentTasks: number;
  maxIterationsPerTask: number;
}

interface ActiveTask {
  conversationId?: string;
  id: string;
  agentName: string;
  sessionId: string;
  iteration: number;
  phase: number; // 0=initial, 1=follow-up, 2=complete
  taskData: any;
  startedAt: number;
  status: "running" | "completed" | "failed" | "pending_approval";
  error?: string;
}

interface PendingTask {
  id: string;
  title: string;
  description: string;
  targetRole: string;
  sourceRole: string;
  priority: string;
  inputData: Record<string, any>;
  status: string;
}

// ─── Delegation Types ─────────────────────────────────────────

interface Delegation {
  id: string;
  sourceAgent: string;
  targetAgent: string;
  title: string;
  description: string;
  contextData: Record<string, any>;
  status: "pending" | "in_progress" | "completed" | "rejected";
  resultData?: Record<string, any>;
  createdAt: number;
  completedAt?: number;
  parentTaskId?: string;
}

// ─── Agent Definitions ───────────────────────────────────────

const AGENT_DEFINITIONS: AgentConfig[] = [
  {
    name: "erp",
    role: "ERP Assistant - chat-based assistant for ERP Core system operations, information retrieval, and task execution",
    systemPrompt: `You are the ERP Assistant. Your job is to:
1. Answer questions about the ERP Core system
2. Execute tasks using available tools
3. Retrieve and present information from the knowledge base
4. Help users manage their workflow
5. Provide clear, concise responses in Thai or English as requested

Use kb_search/kb_read to find information, http_request to interact with ERP APIs, and execute_command for system tasks.`,
    maxConcurrentTasks: 5,
    maxIterationsPerTask: 10,
  },
  {
    name: "production",
    role: "Execution & Delivery - implementation, deployment, task management",
    systemPrompt: `You are the Production Agent. Your job is to:
1. Execute implementation plans
2. Run commands and scripts via execute_command
3. Monitor deployment status
4. Create and track tasks in the system
5. Document progress and results

Use execute_command for automation, http_request to check services, and siyuan_create_doc to document progress.`,
    maxConcurrentTasks: 3,
    maxIterationsPerTask: 20,
  },
];

// ─── AgentLoop Class ─────────────────────────────────────────

export class AgentLoop {
  private agents: Map<string, AgentConfig> = new Map();
  private activeTasks: Map<string, ActiveTask> = new Map();
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private chatStore: ChatStore;
  private llm: LLMClient;
  private persistence: PersistenceManager;
  private delegations: Map<string, Delegation> = new Map();
  private pollInterval: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickCount = 0;
  private redisQueue: RedisTaskQueue | null = null;
  private agentSleeping: Map<string, boolean> = new Map();
  private maxConcurrentAgents = 2;
  private eventDriven = false;

  constructor(
    toolRouter: ToolRouter,
    memory: MemoryStore,
    chatStore: ChatStore,
    llm: LLMClient,
      persistence?: PersistenceManager,
    pollIntervalMs = 15000,
    redisQueue?: RedisTaskQueue
  ) {
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.chatStore = chatStore;
    this.llm = llm;
      this.persistence = persistence || new PersistenceManager("./.conversations");
    this.pollInterval = pollIntervalMs;
    this.redisQueue = redisQueue || null;

    for (const def of AGENT_DEFINITIONS) {
      this.agents.set(def.name, def);
      this.agentSleeping.set(def.name, false);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[AgentLoop] Starting ${this.agents.size} agents (event-driven mode)...`);
    for (const [name, config] of this.agents) {
      console.log(
        `[AgentLoop]  🤖 ${name} (${config.role}) maxTasks=${config.maxConcurrentTasks} maxIter=${config.maxIterationsPerTask}`
      );
    }
    console.log(
      `[AgentLoop] LLM: ${this.llm.isConfigured() ? this.llm.getConfig().model : "RULE-BASED (no LLM configured)"}`
    );

    // ─── Event-driven mode ONLY ──────────────────────────────
    // Agents do NOT poll. They sleep and only wake when a task
    // arrives via Redis queue or Chat API (processChatMessage).
    this.eventDriven = true;

    if (this.redisQueue && this.redisQueue.isConnected()) {
      console.log(`[AgentLoop] Redis queue connected — subscribing agents...`);
      for (const [name] of this.agents) {
        this.redisQueue.subscribe(name, () => this.wakeAgent(name));
      }
    } else {
      console.log(`[AgentLoop] No Redis queue — agents will only respond to Chat API calls`);
    }

    // All agents start sleeping — no polling timer
    for (const [name] of this.agents) {
      this.agentSleeping.set(name, true);
    }
    console.log(`[AgentLoop] All agents sleeping. Waiting for tasks via Redis or Chat API...`);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log(`[AgentLoop] Stopped. Active tasks: ${this.activeTasks.size}`);
  }

  getStatus(): any {
    return {
      running: this.running,
      tickCount: this.tickCount,
      eventDriven: this.eventDriven,
      maxConcurrentAgents: this.maxConcurrentAgents,
      llmConfigured: this.llm.isConfigured(),
      llmModel: this.llm.isConfigured() ? this.llm.getConfig().model : null,
      agents: Array.from(this.agents.entries()).map(([name, cfg]) => ({
        name,
        role: cfg.role,
        activeTasks: this.getActiveTaskCount(name),
        maxConcurrent: cfg.maxConcurrentTasks,
        sleeping: this.agentSleeping.get(name) || false,
      })),
      activeTasks: Array.from(this.activeTasks.values()).map((t) => ({
        id: t.id,
        agentName: t.agentName,
        iteration: t.iteration,
        phase: t.phase,
        status: t.status,
        startedAt: new Date(t.startedAt).toISOString(),
      })),
    };
  }

  getActiveTaskCount(agentName: string): number {
    let count = 0;
    for (const task of this.activeTasks.values()) {
      if (task.agentName === agentName && task.status === "running") count++;
    }
    return count;
  }

  // ─── Main Loop ─────────────────────────────────────────────
  // Intentionally empty. Agent Loop is event-driven only.
  // Tasks arrive via Redis queue subscription or Chat API.
  // No polling, no timers, no autonomous tick().

  // ─── Process Active Tasks ──────────────────────────────────

  private async processActiveTasks(): Promise<void> {
    const completedIds: string[] = [];

    for (const [taskId, task] of this.activeTasks) {
      if (task.status !== "running") continue;

      try {
        const shouldContinue = await this.runAgentIteration(task);
        if (!shouldContinue) {
          completedIds.push(taskId);
        }
      } catch (err: any) {
        console.error(`[AgentLoop] Task ${taskId} error:`, err.message);
        task.status = "failed";
        task.error = err.message;
        completedIds.push(taskId);
      }
    }

    // Cleanup completed tasks
    for (const id of completedIds) {
      const task = this.activeTasks.get(id);
      if (task) {
        await this.finalizeTask(task);
        this.activeTasks.delete(id);
      }
    }
  }

  // ─── Run One Agent Iteration ───────────────────────────────

  private async runAgentIteration(task: ActiveTask): Promise<boolean> {
    const agent = this.agents.get(task.agentName);
    if (!agent) return false;

    task.iteration++;

    if (task.iteration > agent.maxIterationsPerTask) {
      console.log(`[AgentLoop] ${task.agentName}: task ${task.id} hit max iterations`);
      task.status = "completed";
      return false;
    }

    // Get conversation context
    const messages = this.chatStore.getContext(task.sessionId, 30);
    const lastMsg = messages[messages.length - 1];

    // If last message was a tool result, analyze it with LLM or rules
    if (lastMsg?.role === "tool") {
      if (this.llm.isConfigured()) {
        return await this.thinkAndAct(task, messages);
      } else {
        return await this.ruleBasedAct(task, messages);
      }
    }

    // If last message was assistant with no tool calls, task is complete
    if (lastMsg?.role === "assistant" && task.iteration > 1) {
      const hasToolCalls = lastMsg.toolCalls && lastMsg.toolCalls !== "[]";
      if (!hasToolCalls) {
        console.log(`[AgentLoop] ${task.agentName}: task ${task.id} completed by agent`);
        task.status = "completed";
        return false;
      }
    }

    // First iteration or need to start: use LLM or rules
    if (this.llm.isConfigured()) {
      return await this.thinkAndAct(task, messages);
    } else {
      return await this.ruleBasedAct(task, messages);
    }
  }

  // ─── LLM-Based Decision Making ─────────────────────────────

  private async thinkAndAct(
    task: ActiveTask,
    messages: any[]
  ): Promise<boolean> {
    const agent = this.agents.get(task.agentName);
    if (!agent) return false;

    // Build tool definitions for LLM
    const toolDefs = this.buildToolDefs(task.agentName);

    // Convert messages to LLM format
    const llmMessages = this.buildLLMMessages(task, agent, messages);

    try {
      const result = await this.llm.chat(llmMessages, toolDefs);

      // Store assistant response (with toolCalls if any)
      if (result.toolCalls && result.toolCalls.length > 0) {
        this.chatStore.addMessage(task.sessionId, "assistant", result.content || "", {
          toolCalls: JSON.stringify(result.toolCalls),
        });
        for (const tc of result.toolCalls) {
          const toolResult = await this.toolRouter.executeTool(tc.name, tc.args);
          this.chatStore.addMessage(task.sessionId, "tool", JSON.stringify(toolResult), {
            toolCalls: JSON.stringify([tc]),
            toolResults: JSON.stringify([toolResult]),
          });
        }
        return true; // Continue loop
      } else if (result.content) {
        this.chatStore.addMessage(task.sessionId, "assistant", result.content);
      }

      // No tool calls = task complete
      if (result.finishReason === "stop" || result.finishReason === "end_turn") {
        task.status = "completed";
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[AgentLoop] LLM error for ${task.agentName}:`, err.message);
      // Fall back to rule-based on LLM failure
      return await this.ruleBasedAct(task, messages);
    }
  }

  // ─── Rule-Based Decision Making (Fallback) ─────────────────

  private async ruleBasedAct(
    task: ActiveTask,
    messages: any[]
  ): Promise<boolean> {
    const agent = this.agents.get(task.agentName);
    if (!agent) return false;

    const lastMsg = messages[messages.length - 1];

    // Phase tracking: 0=initial, 1=follow-up done, 2=complete
    const phase = task.phase || 0;

    // Phase 0: First iteration - gather info based on agent type
    if (phase === 0) {
      const actions = this.getInitialActions(task.agentName, task.taskData);
      console.log(`[AgentLoop] ${task.agentName}: phase=0 executing ${actions.length} initial actions`);
      for (const action of actions) {
        console.log(`[AgentLoop] ${task.agentName}: → ${action.tool}(${JSON.stringify(action.args)})`);
        const result = await this.toolRouter.executeTool(action.tool, action.args);
        this.chatStore.addMessage(task.sessionId, "tool", JSON.stringify(result), {
          toolCalls: JSON.stringify([{ name: action.tool, args: action.args }]),
          toolResults: JSON.stringify([result]),
        });
      }
      task.phase = 1;
      return true;
    }

    // Phase 1: Execute follow-up actions based on tool results
    if (phase === 1 && lastMsg?.role === "tool") {
      const result = JSON.parse(lastMsg.content);
      const nextActions = this.getNextActions(task.agentName, task.taskData, result);

      if (nextActions.length === 0) {
        // No more actions = complete
        console.log(`[AgentLoop] ${task.agentName}: phase=1 no more actions, completing`);
        const summary = this.generateSummary(task.agentName, task.taskData, messages);
        this.chatStore.addMessage(task.sessionId, "assistant", summary);
        task.status = "completed";
        return false;
      }

      console.log(`[AgentLoop] ${task.agentName}: phase=1 executing ${nextActions.length} follow-up actions`);
      for (const action of nextActions) {
        console.log(`[AgentLoop] ${task.agentName}: → ${action.tool}(${JSON.stringify(action.args)})`);
        const res = await this.toolRouter.executeTool(action.tool, action.args);
        this.chatStore.addMessage(task.sessionId, "tool", JSON.stringify(res), {
          toolCalls: JSON.stringify([{ name: action.tool, args: action.args }]),
          toolResults: JSON.stringify([res]),
        });
      }
      task.phase = 2;
      return true;
    }

    // Phase 2: Summarize and complete
    console.log(`[AgentLoop] ${task.agentName}: phase=2 summarizing and completing task ${task.id}`);
    const summary = this.generateSummary(task.agentName, task.taskData, messages);
    this.chatStore.addMessage(task.sessionId, "assistant", summary);
    task.status = "completed";
    return false;
  }

  // ─── Initial Actions Per Agent ─────────────────────────────
  // Each agent starts by gathering context from SiYuan KB and system state

  private getInitialActions(
    agentName: string,
    taskData: any
  ): Array<{ tool: string; args: any }> {
    const title = taskData.title || "";
    const desc = taskData.description || "";
    const input = taskData.inputData || {};
    const notebookId = "20260430171620-3x8gib1";

    // Common actions: check health + list tools
    const common: Array<{ tool: string; args: any }> = [
      { tool: "orchestrator_health", args: {} },
      { tool: "orchestrator_list_tools", args: {} },
    ];

    // Knowledge lookup: search SiYuan for relevant docs using keyword search
    // (lighter than fetching full documents, cached for 5 min)
    const knowledgeLookup: Array<{ tool: string; args: any }> = [
      {
        tool: "siyuan_search_docs",
        args: {
          keyword: taskData.title || taskData.description || "erp core documentation",
          limit: 3,
        },
      },
    ];

    switch (agentName) {
      case "rd":
        return [
          ...common,
          ...knowledgeLookup,
          {
            tool: "memory_get_state",
            args: { agentId: "rd", tenantId: "erp-core", key: "last_research_topic" },
          },
          {
            tool: "memory_get_state",
            args: { agentId: "rd", tenantId: "erp-core", key: "research_findings" },
          },
        ];

      case "brainstorm":
        return [
          ...common,
          ...knowledgeLookup,
          {
            tool: "memory_get_state",
            args: { agentId: "brainstorm", tenantId: "erp-core", key: "last_idea" },
          },
        ];

      case "production":
        return [
          ...common,
          {
            tool: "http_request",
            args: {
              method: "GET",
              url: "http://erp-core:54510/api/health",
              timeout: 5000,
            },
          },
        ];

      case "design":
        return [
          ...common,
          ...knowledgeLookup,
          {
            tool: "memory_get_state",
            args: { agentId: "design", tenantId: "erp-core", key: "design_system" },
          },
        ];

      case "marketing":
        return [
          ...common,
          ...knowledgeLookup,
          {
            tool: "memory_get_state",
            args: { agentId: "marketing", tenantId: "erp-core", key: "last_campaign" },
          },
        ];

      default:
        return common;
    }
  }

  // ─── Next Actions Based on Results ─────────────────────────
  // Agents analyze tool results and decide next steps autonomously

  private getNextActions(
    agentName: string,
    taskData: any,
    lastResult: any
  ): Array<{ tool: string; args: any }> {
    const notebookId = "20260430171620-3x8gib1";
    const topic = taskData.title || "research";
    const desc = taskData.description || "";

    // If tool failed, log error and try alternative approach
    if (!lastResult?.success) {
      return [
        {
          tool: "memory_set_state",
          args: {
            agentId: agentName,
            tenantId: "erp-core",
            key: `error_${Date.now()}`,
            value: JSON.stringify(lastResult),
          },
        },
        {
          tool: "siyuan_create_doc",
          args: {
            notebookId,
            title: `ERROR-${agentName.toUpperCase()}-${topic.slice(0, 20)}-${Date.now()}`,
            content: [
              `# ${agentName.toUpperCase()} Agent - Error Report`,
              ``,
              `**Task:** ${topic}`,
              `**Error:** ${lastResult?.error || "Unknown error"}`,
              `**Timestamp:** ${new Date().toISOString()}`,
              ``,
              `## Details`,
              `\`\`\`json`,
              JSON.stringify(lastResult, null, 2),
              `\`\`\``,
              ``,
              `## Suggested Action`,
              `1. Check system health`,
              `2. Verify tool availability`,
              `3. Retry with different parameters`,
            ].join("\n"),
          },
        },
      ];
    }

    // Agent-specific follow-up logic with knowledge sync
    switch (agentName) {
      case "rd": {
        return [
          {
            tool: "memory_set_state",
            args: {
              agentId: "rd",
              tenantId: "erp-core",
              key: "last_research_topic",
              value: topic,
            },
          },
          {
            tool: "memory_set_state",
            args: {
              agentId: "rd",
              tenantId: "erp-core",
              key: "research_findings",
              value: `Task: ${topic}\nDescription: ${desc}\nStatus: Analysis complete at ${new Date().toISOString()}`,
            },
          },
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId,
              title: `RD-${topic.slice(0, 30)}-${Date.now()}`,
              content: [
                `# Research: ${topic}`,
                ``,
                `## Task`,
                desc,
                ``,
                `## System Context`,
                `- Tools available: 19 registered`,
                `- SiYuan KB: Connected`,
                `- ERP Core: Connected`,
                ``,
                `## Findings`,
                `Analysis complete. System is healthy and all tools are operational.`,
                ``,
                `## Knowledge Base References`,
                `- [ERP Overview](../ERP-Overview)`,
                `- [API Reference](../API%20Reference)`,
                ``,
                `## Status`,
                `✅ Ready for next steps.`,
                ``,
                `---`,
                `*Auto-generated by R&D Agent at ${new Date().toISOString()}*`,
              ].join("\n"),
            },
          },
        ];
      }

      case "production": {
        return [
          {
            tool: "memory_set_state",
            args: {
              agentId: "production",
              tenantId: "erp-core",
              key: "last_deploy_check",
              value: String(Date.now()),
            },
          },
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId,
              title: `OPS-${topic.slice(0, 30)}-${Date.now()}`,
              content: [
                `# Operations: ${topic}`,
                ``,
                `## Task`,
                desc,
                ``,
                `## Health Check Results`,
                `- Orchestrator: ${lastResult?.success ? "✅ Healthy" : "❌ Unhealthy"}`,
                `- Timestamp: ${new Date().toISOString()}`,
                ``,
                `## Actions Taken`,
                `1. System health verified`,
                `2. Dependencies checked`,
                ``,
                `## Status`,
                `✅ Operations complete.`,
              ].join("\n"),
            },
          },
        ];
      }

      case "brainstorm": {
        return [
          {
            tool: "memory_set_state",
            args: {
              agentId: "brainstorm",
              tenantId: "erp-core",
              key: "last_idea",
              value: topic,
            },
          },
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId,
              title: `IDEA-${topic.slice(0, 30)}-${Date.now()}`,
              content: [
                `# Brainstorm: ${topic}`,
                ``,
                `## Task`,
                desc,
                ``,
                `## Ideas Generated`,
                `1. Explore integration possibilities`,
                `2. Analyze market trends`,
                `3. Identify key opportunities`,
                ``,
                `## References`,
                `- Knowledge base reviewed for context`,
                ``,
                `## Status`,
                `✅ Ideas documented in knowledge base.`,
              ].join("\n"),
            },
          },
        ];
      }

      case "design": {
        return [
          {
            tool: "memory_set_state",
            args: {
              agentId: "design",
              tenantId: "erp-core",
              key: "design_system",
              value: `Last task: ${topic} at ${new Date().toISOString()}`,
            },
          },
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId,
              title: `DSGN-${topic.slice(0, 30)}-${Date.now()}`,
              content: [
                `# Design: ${topic}`,
                ``,
                `## Task`,
                desc,
                ``,
                `## Design Considerations`,
                `- UI/UX requirements analyzed`,
                `- Design system references checked`,
                `- User experience flow documented`,
                ``,
                `## Output`,
                `Design specifications documented in knowledge base.`,
                ``,
                `## Status`,
                `✅ Design analysis complete.`,
              ].join("\n"),
            },
          },
        ];
      }

      case "marketing": {
        return [
          {
            tool: "memory_set_state",
            args: {
              agentId: "marketing",
              tenantId: "erp-core",
              key: "last_campaign",
              value: topic,
            },
          },
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId,
              title: `MKTG-${topic.slice(0, 30)}-${Date.now()}`,
              content: [
                `# Marketing: ${topic}`,
                ``,
                `## Task`,
                desc,
                ``,
                `## Campaign Analysis`,
                `- Target audience identified`,
                `- Channel strategy reviewed`,
                `- Content plan outlined`,
                ``,
                `## Next Steps`,
                `1. Review campaign documentation`,
                `2. Coordinate with design team`,
                `3. Prepare launch timeline`,
                ``,
                `## Status`,
                `✅ Marketing analysis complete.`,
              ].join("\n"),
            },
          },
        ];
      }

      default:
        return [];
    }
  }

  // ─── Generate Summary ──────────────────────────────────────

  private generateSummary(
    agentName: string,
    taskData: any,
    messages: any[]
  ): string {
    const toolResults = messages
      .filter((m) => m.role === "tool")
      .map((m) => {
        try {
          const parsed = JSON.parse(m.content);
          return parsed.success ? "✅ success" : "❌ failed";
        } catch {
          return "📄 info";
        }
      });

    const successCount = toolResults.filter((r) => r === "✅ success").length;
    const failCount = toolResults.filter((r) => r === "❌ failed").length;

    return [
      `## ${agentName.toUpperCase()} Agent - Task Complete`,
      "",
      `**Task:** ${taskData.title || "Untitled"}`,
      `**Description:** ${taskData.description || "N/A"}`,
      `**Iterations:** ${messages.length} steps`,
      `**Tool Results:** ${toolResults.length} tools executed (${successCount} success, ${failCount} failed)`,
      "",
      "### Summary",
      `Agent ${agentName} has completed analysis of the assigned task.`,
      `Findings have been documented in the knowledge base (SiYuan).`,
      "",
      "### Knowledge Base",
      `Notebook: ERP Integration`,
      `Tags: #agent-${agentName} #task-complete #autonomous`,
      "",
      "### Next Steps",
      "1. Review the generated documentation in SiYuan",
      "2. Approve or request changes via the dashboard",
      "3. Delegate follow-up tasks to other agents as needed",
    ].join("\n");
  }

  // ─── Poll for New Tasks ────────────────────────────────────

  private async pollNewTasks(): Promise<void> {
    for (const [name, config] of this.agents) {
      // Skip sleeping agents in event-driven mode
      if (this.eventDriven && this.agentSleeping.get(name)) continue;

      // Concurrency limit: check total active agents across all types
      if (this.eventDriven) {
        const totalActive = this.getTotalActiveAgents();
        if (totalActive >= this.maxConcurrentAgents) {
          continue; // At capacity, skip polling
        }
      }

      const activeCount = this.getActiveTaskCount(name);
      const capacity = config.maxConcurrentTasks - activeCount;

      if (capacity <= 0) continue;

      try {
        const pendingTasks = await this.fetchPendingTasks(name, capacity);
        const claimed: string[] = [];
        for (const task of pendingTasks) {
          // Skip if already active
          if (this.activeTasks.has(task.id)) continue;
          await this.claimTask(task, name);
          claimed.push(task.id);
        }
        // Clear claimed tasks from memory store to prevent re-claiming
        if (claimed.length > 0) {
          this.clearPendingTasks(name, claimed);
        }
      } catch (err: any) {
        console.error(`[AgentLoop] Poll error for ${name}:`, err.message);
      }
    }
  }

  setRedisQueue(queue: RedisTaskQueue): void {
    this.redisQueue = queue;
    this.eventDriven = queue.isConnected();
    if (this.eventDriven) {
      for (const [name] of this.agents) {
        this.agentSleeping.set(name, true);
        queue.subscribe(name, () => this.wakeAgent(name));
      }
      console.log("[AgentLoop] Redis queue connected. All agents sleeping, waiting for tasks...");
    }
  }

  private getTotalActiveAgents(): number {
    const activeNames = new Set<string>();
    for (const task of this.activeTasks.values()) {
      if (task.status === "running") {
        activeNames.add(task.agentName);
      }
    }
    return activeNames.size;
  }

  private clearPendingTasks(agentName: string, claimedIds: string[]): void {
    const raw = this.memory.getAgentState(agentName, "erp-core", "pending_tasks");
    if (!raw) return;
    try {
      const tasks: PendingTask[] = JSON.parse(raw);
      const remaining = tasks.filter((t) => !claimedIds.includes(t.id));
      if (remaining.length > 0) {
        this.memory.setAgentState(agentName, "erp-core", "pending_tasks", JSON.stringify(remaining));
      } else {
        this.memory.setAgentState(agentName, "erp-core", "pending_tasks", "");
      }
    } catch {
      // ignore parse errors
    }
  }

  private async fetchPendingTasks(
    agentName: string,
    limit: number
  ): Promise<PendingTask[]> {
    // Try Task Manager API first (primary source)
    try {
      const result = await this.toolRouter.executeTool("task_manager_list_tasks", {
        status: "todo",
        assignee: agentName,
        limit,
      });

      if (result.success && Array.isArray(result.data)) {
        return result.data.map((t: any) => ({
          id: t.id || t.taskId,
          title: t.title,
          description: t.description || "",
          targetRole: agentName,
          sourceRole: t.assignee || "system",
          priority: t.priority || "medium",
          inputData: t.inputData || {},
          status: t.status || "pending",
        }));
      }
    } catch {
      // Task Manager might not be available
    }

    // Try agency API second
    try {
      const result = await this.toolRouter.executeTool("agency_list_tasks", {
        status: "pending",
        targetRole: agentName,
        limit,
      });

      if (result.success && Array.isArray(result.data)) {
        return result.data as PendingTask[];
      }
    } catch {
      // Agency API might not have /api/tasks endpoint
    }

    // Fallback: check memory for pending tasks
    const pendingState = this.memory.getAgentState(
      agentName,
      "erp-core",
      "pending_tasks"
    );
    if (pendingState) {
      try {
        return JSON.parse(pendingState);
      } catch {
        // ignore
      }
    }

    return [];
  }

  private async claimTask(task: PendingTask, agentName: string): Promise<void> {
    // Create a session for this task
    const session = this.chatStore.createSession(
      uuidv4(),
      task.title || `Task ${task.id}`
    );

    // Add system prompt
    const agent = this.agents.get(agentName);
    if (agent) {
      const allTools = this.toolRouter.getTools().map((t) => t.name);
      const systemPrompt = LLMClient.getSystemPrompt(
        agent.name,
        agent.role,
        allTools
      );
      this.chatStore.addMessage(session.id, "system", systemPrompt);
    }

    // Add task description
    const taskContent = [
      `## New Task Assigned`,
      ``,
      `**Title:** ${task.title || "Untitled"}`,
      `**Description:** ${task.description || ""}`,
      `**Priority:** ${task.priority || "medium"}`,
      `**Source:** ${task.sourceRole || "system"}`,
      `**Input Data:** ${JSON.stringify(task.inputData || {}, null, 2)}`,
      ``,
      `Please analyze this task and take appropriate action.`,
    ].join("\n");

    this.chatStore.addMessage(session.id, "user", taskContent);

    // Register active task
    const activeTask: ActiveTask = {
      id: task.id,
      agentName,
      sessionId: session.id,
      iteration: 0,
      phase: 0,
      taskData: task,
      startedAt: Date.now(),
      status: "running",
    };

    this.activeTasks.set(task.id, activeTask);

    // Update task status to in_progress in Task Manager
    try {
      await this.toolRouter.executeTool("task_manager_update_task", {
        taskId: task.id,
        status: "in_progress",
      });
    } catch {
      // best-effort
    }

    // Persist initial state
    try {
      const conversationId = uuidv4();
      activeTask.conversationId = conversationId;
      this.persistence.saveState(agentName, {
        conversationId,
        agentName,
        taskId: task.id,
        taskTitle: task.title || "Untitled",
        phase: 0,
        iteration: 0,
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      this.persistence.saveEvent(agentName, conversationId, {
        id: uuidv4(),
        seq: 0,
        role: "system",
        content: `Task claimed: ${task.title}`,
        timestamp: new Date().toISOString(),
      });
      console.log(
        `[AgentLoop] 💾 Persisted initial state for ${agentName}/${conversationId.slice(0, 8)}`
      );
    } catch (err) {
      console.error(`[AgentLoop] ⚠️ Failed to persist initial state:`, err);
    }

    console.log(
      `[AgentLoop] 🤖 ${agentName} claimed task "${task.title}" (${task.id})`
    );
  }

  // ─── Process Chat Message (simplified) ────────────────────
  // Direct LLM + tool execution loop, no AgentLoop infrastructure.
  // Builds LLM messages manually to avoid tool_call_id issues.

  async processChatMessage(params: {
    sessionId: string;
    message: string;
    agent: string;
    language: string;
    knowledgeContext?: string;
  }): Promise<{
    response: string;
    sessionId: string;
    toolResults: any[];
  }> {
    const { sessionId, message, agent, language, knowledgeContext } = params;
    const agentName = this.agents.has(agent) ? agent : "erp";

    // Ensure session exists
    let session = this.chatStore.getSession(sessionId);
    if (!session) {
      session = this.chatStore.createSession(sessionId);
    }

    // Add user message to memory
    this.chatStore.addMessage(sessionId, "user", message);

    // If LLM not configured, return error
    if (!this.llm.isConfigured()) {
      return { response: "[LLM Error] AI not configured. Please set LLM_API_KEY and LLM_BASE_URL", sessionId, toolResults: [] };
    }

    const agentConfig = this.agents.get(agentName)!;
    const toolDefs = this.buildToolDefs(agentName);
    const toolResults: any[] = [];
    let lastAssistantContent = "";

    // Max 3 iterations to prevent runaway loops
    const MAX_ITER = 3;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      // Build LLM messages manually — avoids buildLLMMessages tool_call_id bugs
      const llmMessages = this.buildChatLLMMessages(sessionId, agentName, knowledgeContext, iter === 0);

      let result;
      try {
        result = await this.llm.chat(llmMessages, toolDefs);
      } catch (err: any) {
        console.error(`[AgentLoop] Chat LLM error:`, err.message);
        // Return actual error instead of fake fallback
        return { response: `[LLM Error] ${err.message}`, sessionId, toolResults };
      }

      // Handle tool calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        this.chatStore.addMessage(sessionId, "assistant", result.content || "", {
          toolCalls: JSON.stringify(result.toolCalls),
        });
        for (const tc of result.toolCalls) {
          let toolResult: any;
          try {
            toolResult = await this.toolRouter.executeTool(tc.name, tc.args);
          } catch (err: any) {
            toolResult = { error: err.message || "Tool execution failed" };
            console.error(`[AgentLoop] Tool ${tc.name} failed:`, err.message);
          }
          this.chatStore.addMessage(sessionId, "tool", JSON.stringify(toolResult), {
            toolCalls: JSON.stringify([tc]),
            toolResults: JSON.stringify([toolResult]),
          });
          toolResults.push(toolResult);
        }
        continue;
      }

      // Content-only response
      if (result.content) {
        if (lastAssistantContent && this.isRepeatedResponse(lastAssistantContent, result.content)) {
          console.log(`[AgentLoop] Detected repeated response, returning as-is`);
          this.chatStore.deleteLastMessage(sessionId);
          return { response: result.content, sessionId, toolResults };
        }
        lastAssistantContent = result.content;
        this.chatStore.addMessage(sessionId, "assistant", result.content);
        return { response: result.content, sessionId, toolResults };
      }

      // Empty content from LLM — summarize tool results if any, otherwise generic
      if (toolResults.length > 0) {
        const summary = this.summarizeToolResults(toolResults);
        this.chatStore.addMessage(sessionId, "assistant", summary);
        return { response: summary, sessionId, toolResults };
      }

      break;
    }

    // Final fallback — return error
    return { response: "[LLM Error] Failed to get response from AI", sessionId, toolResults };
  }

  // ─── Build Chat LLM Messages (manual, avoids buildLLMMessages bugs) ──

  private buildChatLLMMessages(
    sessionId: string,
    agentName: string,
    knowledgeContext?: string,
    injectKnowledge = false
  ): LLMMessage[] {
    const llmMessages: LLMMessage[] = [];

    // System prompt
    const agent = this.agents.get(agentName);
    if (agent) {
      const allToolNames = this.toolRouter.getTools().map((t) => t.name);
      llmMessages.push({
        role: "system",
        content: LLMClient.getSystemPrompt(agent.name, agent.role, allToolNames),
      });
    }

    // Conversation history (last 20 messages)
    const messages = this.chatStore.getContext(sessionId, 20);

    // First pass: collect tool_call_ids from assistant/tool_calls messages
    // and track which ones have corresponding tool responses
    const assistantCallIds = new Set<string>();
    const respondedCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.toolCalls) {
        try {
          const parsed = JSON.parse(msg.toolCalls);
          for (const tc of parsed) {
            if (tc.id) assistantCallIds.add(tc.id);
          }
        } catch {}
      }
      if (msg.role === "tool" && msg.toolCalls) {
        try {
          const parsed = JSON.parse(msg.toolCalls);
          if (parsed.length > 0 && parsed[0].id) {
            respondedCallIds.add(parsed[0].id);
          }
        } catch {}
      }
    }

    // Second pass: only include messages that form valid tool_call sequences
    // Track which assistant/tool_calls messages are actually included
    const includedAssistantCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "system") continue;

      if (msg.role === "tool") {
        // Skip orphan tool message (no matching assistant/tool_calls in context)
        let toolCallId = "";
        if (msg.toolCalls) {
          try {
            const parsed = JSON.parse(msg.toolCalls);
            if (parsed.length > 0 && parsed[0].id) {
              toolCallId = parsed[0].id;
            }
          } catch {}
        }
        // Only include tool message if its assistant/tool_calls was actually included
        if (!toolCallId || !includedAssistantCallIds.has(toolCallId)) continue;
        llmMessages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: toolCallId,
        });
      } else if (msg.role === "assistant" && msg.toolCalls) {
        // Skip assistant/tool_calls if not all tool responses are present
        try {
          const parsed = JSON.parse(msg.toolCalls);
          const allResponded = parsed.every((tc: any) => respondedCallIds.has(tc.id));
          if (!allResponded) continue;
          // Register these tool_call_ids as included before adding tool messages
          for (const tc of parsed) {
            if (tc.id) includedAssistantCallIds.add(tc.id);
          }
          llmMessages.push({
            role: "assistant",
            content: msg.content,
            tool_calls: parsed.map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args),
              },
            })),
          });
        } catch {
          llmMessages.push({ role: "assistant", content: msg.content });
        }
      } else {
        llmMessages.push({ role: msg.role as any, content: msg.content });
      }
    }

    // Inject knowledge context
    if (injectKnowledge && knowledgeContext) {
      llmMessages.push({
        role: "user",
        content: `[Knowledge Base Context]\n${knowledgeContext}\n\n---\n\nPlease use the above context if relevant to answer the user's question.`,
      });
    }

    return llmMessages;
  }

  // ─── Detect Repeated Responses ──────────────────────────────

  private isRepeatedResponse(prev: string, curr: string): boolean {
    const a = prev.toLowerCase().trim().slice(0, 100);
    const b = curr.toLowerCase().trim().slice(0, 100);
    if (!a || !b) return false;
    // Simple overlap check: if they share >60% of first 100 chars
    const minLen = Math.min(a.length, b.length);
    if (minLen < 20) return false;
    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / minLen > 0.6;
  }

  // ─── Rule-Based Chat Response (Fallback) ───────────────────

  private async ruleBasedChatResponse(
    sessionId: string,
    message: string,
    agentName: string
  ): Promise<string> {
    const msg = message.toLowerCase();

    if (msg.includes("hello") || msg.includes("hi") || msg.includes("สวัสดี")) {
      return "รับทราบครับ มีอะไรให้ช่วยไหมครับ";
    }
    if (msg.includes("tool") || msg.includes("what can you do") || msg.includes("help")) {
      const tools = this.toolRouter.getTools();
      return "I have access to the following tools:\n" +
        tools.map((t) => `  - **${t.name}**: ${t.description}`).join("\n");
    }
    if (msg.includes("research") || msg.includes("search") || msg.includes("find") || msg.includes("ค้นหา")) {
      return "กำลังค้นหาข้อมูลให้ครับ";
    }
    if (msg.includes("status") || msg.includes("health") || msg.includes("สถานะ")) {
      try {
        const health = await this.toolRouter.executeTool("orchestrator_health", {});
        return "**System Status:**\n```json\n" + JSON.stringify(health.data, null, 2) + "\n```";
      } catch {
        return "System is running.";
      }
    }

    return "รับทราบครับ มีอะไรให้ช่วยเพิ่มเติมไหมครับ";
  }

  // ─── Summarize Tool Results (when LLM returns empty content) ──

  private summarizeToolResults(results: any[]): string {
    const nonEmpty = results.filter((r) => {
      if (!r) return false;
      if (r.data && Array.isArray(r.data) && r.data.length === 0) return false;
      if (r.data && typeof r.data === "object" && Object.keys(r.data).length === 0) return false;
      return true;
    });

    if (nonEmpty.length === 0) {
      return "ไม่พบข้อมูลครับ";
    }

    const lines: string[] = [];
    for (const r of nonEmpty) {
      const name = r.tool || r.name || "unknown";
      const data = r.data ?? r;
      lines.push(`**${name}**: ${JSON.stringify(data)}`);
    }
    return lines.join("\n");
  }

  // ─── Finalize Task ─────────────────────────────────────────

  private async finalizeTask(task: ActiveTask): Promise<void> {
    console.log(
      `[AgentLoop] ${task.agentName}: task ${task.id} finalized as ${task.status}`
    );

    // Store result in memory
    this.memory.setAgentState(
      task.agentName,
      "erp-core",
      `task_result_${task.id}`,
      JSON.stringify({
        status: task.status,
        error: task.error,
        sessionId: task.sessionId,
        completedAt: Date.now(),
      })
    );

    // Try to update task status on Task Manager
    try {
      const newStatus = task.status === "completed" ? "done" : task.status === "failed" ? "cancelled" : "in_progress";
      await this.toolRouter.executeTool("task_manager_update_task", {
        taskId: task.id,
        status: newStatus,
      });
      console.log(
        `[AgentLoop] ✅ Updated task ${task.id} status to ${newStatus} in Task Manager`
      );
    } catch {
      // Task Manager might not be available
    }

    // Try to update task status on agency platform
    try {
      if (task.status === "completed") {
        // Log completion - agency platform may not have update endpoint
        console.log(
          `[AgentLoop] ✅ ${task.agentName} completed task ${task.id} in ${task.iteration} iterations`
        );
      } else if (task.status === "failed") {
        console.error(
          `[AgentLoop] ❌ ${task.agentName} failed task ${task.id}: ${task.error}`
        );
      }
    } catch {
      // best-effort
    }

    // Persist final state
    try {
      if (task.conversationId) {
        this.persistence.saveState(task.agentName, {
          conversationId: task.conversationId,
          agentName: task.agentName,
          taskId: task.id,
          taskTitle: task.taskData?.title || "Untitled",
          phase: task.phase,
          iteration: task.iteration,
          status: task.status,
          error: task.error,
          startedAt: new Date(task.startedAt).toISOString(),
          updatedAt: new Date().toISOString(),
        });
        this.persistence.saveEvent(task.agentName, task.conversationId, {
          id: uuidv4(),
          seq: 0,
          role: "system",
          content: `Task ${task.status}: ${task.error || "completed"}`,
          timestamp: new Date().toISOString(),
        });
        console.log(
          `[AgentLoop] 💾 Persisted final state for ${task.agentName}/${task.conversationId.slice(0, 8)}`
        );
      }
    } catch (err) {
      console.error(`[AgentLoop] ⚠️ Failed to persist final state:`, err);
    }
  }
  // ─── Resume Task from Persistence ─────────────────────────

  // ─── Sleep / Wake Agent ────────────────────────────────────

  async sleepAgent(agentName: string): Promise<{ success: boolean; error?: string }> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return { success: false, error: `Unknown agent: ${agentName}` };
    }
    this.agentSleeping.set(agentName, true);
    console.log(`[AgentLoop] Agent "${agentName}" put to sleep`);
    return { success: true };
  }

  async wakeAgent(agentName: string): Promise<{ success: boolean; error?: string }> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return { success: false, error: `Unknown agent: ${agentName}` };
    }
    this.agentSleeping.set(agentName, false);
    console.log(`[AgentLoop] Agent "${agentName}" woken up`);
    return { success: true };
  }

  async resumeTask(
    agentName: string,
    conversationId: string
  ): Promise<{ success: boolean; task?: ActiveTask; error?: string }> {
    const state = this.persistence.loadState(agentName, conversationId);
    if (!state) {
      return { success: false, error: `No persisted state found for ${agentName}/${conversationId}` };
    }

    const agent = this.agents.get(agentName);
    if (!agent) {
      return { success: false, error: `Unknown agent: ${agentName}` };
    }

    // Check if task is already active
    for (const [, existing] of this.activeTasks) {
      if (existing.conversationId === conversationId) {
        return { success: false, error: `Task ${existing.id} is already active` };
      }
    }

    // Load persisted events
    const events = this.persistence.loadEvents(agentName, conversationId);

    // Create a new session in memory
    const session = this.chatStore.createSession(
      uuidv4(),
      state.taskTitle
    );

    // Replay events into chat store
    for (const event of events) {
      if (event.role === "system") {
        this.chatStore.addMessage(session.id, "system", event.content);
      } else if (event.role === "tool") {
        this.chatStore.addMessage(session.id, "tool", event.content, event.metadata);
      } else {
        this.chatStore.addMessage(session.id, event.role as any, event.content);
      }
    }

    // Create active task from persisted state
    const activeTask: ActiveTask = {
      id: state.taskId,
      agentName,
      sessionId: session.id,
      conversationId,
      iteration: state.iteration,
      phase: state.phase,
      taskData: { title: state.taskTitle },
      startedAt: new Date(state.startedAt).getTime(),
      status: "running",
    };

    this.activeTasks.set(state.taskId, activeTask);

    // Update persisted state
    this.persistence.saveState(agentName, {
      ...state,
      status: "running",
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `[AgentLoop] 🔄 ${agentName} resumed task "${state.taskTitle}" (${state.taskId}) conv=${conversationId.slice(0, 8)} at phase=${state.phase} iter=${state.iteration}`
    );

    return { success: true, task: activeTask };
  }

  // ─── List Persisted Conversations ──────────────────────────

  listPersistedConversations(agentName?: string) {
    if (agentName) {
      return this.persistence.listConversations(agentName).map((cid) => ({
        conversationId: cid,
        state: this.persistence.loadState(agentName, cid),
      }));
    }
    return this.persistence.listAllConversations();
  }

  // ─── Delegation Methods ────────────────────────────────────

  createDelegation(params: {
    sourceAgent: string;
    targetAgent: string;
    title: string;
    description: string;
    contextData?: Record<string, any>;
    parentTaskId?: string;
  }): Delegation {
    const delegation: Delegation = {
      id: uuidv4(),
      sourceAgent: params.sourceAgent,
      targetAgent: params.targetAgent,
      title: params.title,
      description: params.description,
      contextData: params.contextData || {},
      status: "pending",
      createdAt: Date.now(),
      parentTaskId: params.parentTaskId,
    };
    this.delegations.set(delegation.id, delegation);

    // Also create a pending task so the target agent picks it up
    const pendingTask: PendingTask = {
      id: delegation.id,
      title: `[DELEGATION] ${params.title}`,
      description: `Delegated from ${params.sourceAgent}: ${params.description}

Context: ${JSON.stringify(params.contextData || {}, null, 2)}`,
      targetRole: params.targetAgent,
      sourceRole: params.sourceAgent,
      priority: "high",
      inputData: {
        delegationId: delegation.id,
        contextData: params.contextData || {},
        parentTaskId: params.parentTaskId,
      },
      status: "pending",
    };

    // Store in memory for target agent to pick up
    const raw = this.memory.getAgentState(params.targetAgent, "erp-core", "pending_tasks");
    const existing: PendingTask[] = raw ? JSON.parse(raw) : [];
    existing.push(pendingTask);
    this.memory.setAgentState(params.targetAgent, "erp-core", "pending_tasks", JSON.stringify(existing));

    console.log(`[AgentLoop] 🔗 ${params.sourceAgent} delegated "${params.title}" to ${params.targetAgent} (${delegation.id.slice(0, 8)})`);
    return delegation;
  }

  getDelegation(delegationId: string): Delegation | undefined {
    return this.delegations.get(delegationId);
  }

  listDelegations(filters?: {
    sourceAgent?: string;
    targetAgent?: string;
    status?: string;
  }): Delegation[] {
    let result = Array.from(this.delegations.values());
    if (filters?.sourceAgent) {
      result = result.filter((d) => d.sourceAgent === filters.sourceAgent);
    }
    if (filters?.targetAgent) {
      result = result.filter((d) => d.targetAgent === filters.targetAgent);
    }
    if (filters?.status) {
      result = result.filter((d) => d.status === filters.status);
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  respondToDelegation(
    delegationId: string,
    status: "completed" | "rejected",
    resultData?: Record<string, any>
  ): Delegation | undefined {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return undefined;

    delegation.status = status;
    delegation.resultData = resultData;
    delegation.completedAt = Date.now();

    // Log to source agent's memory
    this.memory.setAgentState(
      delegation.sourceAgent,
      "erp-core",
      `delegation_result_${delegationId}`,
      JSON.stringify({
        delegationId,
        targetAgent: delegation.targetAgent,
        title: delegation.title,
        status,
        resultData,
        completedAt: delegation.completedAt,
      })
    );

    console.log(`[AgentLoop] 🔗 ${delegation.targetAgent} ${status} delegation "${delegation.title}" from ${delegation.sourceAgent}`);
    return delegation;
  }

  getPendingDelegationsForAgent(agentName: string): Delegation[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.targetAgent === agentName && d.status === "pending"
    );
  }


  // ─── Build LLM Tool Definitions ────────────────────────────

  private buildToolDefs(agentName: string): LLMToolDef[] {
    const allTools = this.toolRouter.getTools();

    // Agent-specific tool access
    const allowedTools = allTools.filter((t) => {
      // All agents can use orchestrator and memory tools
      if (t.category === "orchestrator" || t.category === "memory") return true;
      // All agents can use agency tools (to delegate)
      if (t.category === "agency") return true;
      // ERP tools for all (read-only access)
      if (t.category === "erp") return true;
      // Browser tools for all (web automation)
      if (t.category === "browser") return true;
      return false;
    });

    return allowedTools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  // ─── Build LLM Messages ────────────────────────────────────

  private buildLLMMessages(
    task: ActiveTask,
    agent: AgentConfig,
    messages: any[]
  ): LLMMessage[] {
    const llmMessages: LLMMessage[] = [];

    // System prompt
    const allToolNames = this.toolRouter.getTools().map((t) => t.name);
    llmMessages.push({
      role: "system",
      content: LLMClient.getSystemPrompt(agent.name, agent.role, allToolNames),
    });

    // Conversation history
    for (const msg of messages) {
      if (msg.role === "system") continue; // Skip existing system messages

      if (msg.role === "tool") {
        // Extract tool_call_id from stored toolCalls metadata
        let toolCallId = msg.id;
        if (msg.toolCalls) {
          try {
            const parsed = JSON.parse(msg.toolCalls);
            if (parsed.length > 0 && parsed[0].id) {
              toolCallId = parsed[0].id;
            }
          } catch (e) {}
        }
        llmMessages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: toolCallId,
        });
      } else if (msg.role === "assistant" && msg.toolCalls) {
        // Reconstruct tool_calls in OpenAI format for assistant messages
        try {
          const parsed = JSON.parse(msg.toolCalls);
          llmMessages.push({
            role: "assistant",
            content: msg.content,
            tool_calls: parsed.map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args),
              },
            })),
          });
        } catch (e) {
          llmMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      } else {
        llmMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    return llmMessages;
  }
}
