// ============================================================
// Autonomous Agent Loop
// Each agent continuously polls for tasks, executes tools,
// analyzes results via LLM, and decides next actions.
// Falls back to rule-based decisions when no LLM configured.
// ============================================================

import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";
import { LLMClient, LLMMessage, LLMToolDef } from "./llm.js";

// ─── Types ───────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  maxConcurrentTasks: number;
  maxIterationsPerTask: number;
}

interface ActiveTask {
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

// ─── Agent Definitions ───────────────────────────────────────

const AGENT_DEFINITIONS: AgentConfig[] = [
  {
    name: "rd",
    role: "Research & Development - feasibility analysis, prototyping, technical research",
    systemPrompt: `You are the R&D Agent. Your job is to:
1. Research technical feasibility of ideas
2. Analyze requirements and constraints
3. Create prototype plans and technical specifications
4. Identify risks and mitigation strategies
5. Provide evidence-based recommendations

Use http_request to research, siyuan_get_doc to read existing knowledge, and agency_create_task to delegate.`,
    maxConcurrentTasks: 3,
    maxIterationsPerTask: 15,
  },
  {
    name: "brainstorm",
    role: "Research & Ideation - creative brainstorming, market analysis, idea generation",
    systemPrompt: `You are the Brainstorm Agent. Your job is to:
1. Generate creative ideas and solutions
2. Analyze market trends and opportunities
3. Create structured concept documents
4. Evaluate ideas against criteria
5. Provide multiple options with pros/cons

Use http_request to research trends, siyuan_get_doc to read existing knowledge, and siyuan_create_doc to document ideas.`,
    maxConcurrentTasks: 3,
    maxIterationsPerTask: 15,
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
  {
    name: "design",
    role: "UI/UX & Creative - design systems, user experience, visual assets",
    systemPrompt: `You are the Design Agent. Your job is to:
1. Create design concepts and specifications
2. Analyze user experience requirements
3. Design system architecture and components
4. Document design decisions and guidelines
5. Coordinate with production for implementation

Use siyuan_get_doc to read requirements, siyuan_create_doc for design docs, and http_request for design tools.`,
    maxConcurrentTasks: 2,
    maxIterationsPerTask: 15,
  },
  {
    name: "marketing",
    role: "Campaign & Content - marketing strategy, content creation, analytics",
    systemPrompt: `You are the Marketing Agent. Your job is to:
1. Create marketing strategies and campaigns
2. Analyze market data and customer insights
3. Create content and copy
4. Track campaign performance
5. Optimize based on results

Use http_request to gather market data, siyuan_create_doc for content, and agency_create_task to coordinate with design.`,
    maxConcurrentTasks: 2,
    maxIterationsPerTask: 15,
  },
];

// ─── AgentLoop Class ─────────────────────────────────────────

export class AgentLoop {
  private agents: Map<string, AgentConfig> = new Map();
  private activeTasks: Map<string, ActiveTask> = new Map();
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private llm: LLMClient;
  private pollInterval: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickCount = 0;

  constructor(
    toolRouter: ToolRouter,
    memory: MemoryStore,
    llm: LLMClient,
    pollIntervalMs = 15000
  ) {
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.llm = llm;
    this.pollInterval = pollIntervalMs;

    for (const def of AGENT_DEFINITIONS) {
      this.agents.set(def.name, def);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[AgentLoop] Starting ${this.agents.size} autonomous agents...`);
    for (const [name, config] of this.agents) {
      console.log(
        `[AgentLoop]  🤖 ${name} (${config.role}) maxTasks=${config.maxConcurrentTasks} maxIter=${config.maxIterationsPerTask}`
      );
    }
    console.log(
      `[AgentLoop] LLM: ${this.llm.isConfigured() ? this.llm.getConfig().model : "RULE-BASED (no LLM configured)"}`
    );
    // Run first tick immediately, then on interval
    this.tick();
    this.timer = setInterval(() => this.tick(), this.pollInterval);
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
      llmConfigured: this.llm.isConfigured(),
      llmModel: this.llm.isConfigured() ? this.llm.getConfig().model : null,
      agents: Array.from(this.agents.entries()).map(([name, cfg]) => ({
        name,
        role: cfg.role,
        activeTasks: this.getActiveTaskCount(name),
        maxConcurrent: cfg.maxConcurrentTasks,
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

  private async tick(): Promise<void> {
    if (!this.running) return;
    this.tickCount++;

    try {
      // Phase 1: Process active tasks (continue existing work)
      await this.processActiveTasks();

      // Phase 2: Poll for new tasks (if agents have capacity)
      await this.pollNewTasks();
    } catch (err: any) {
      console.error(`[AgentLoop] Tick error:`, err.message);
    }
  }

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
    const messages = this.memory.getConversationContext(task.sessionId, 30);
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

      // Store assistant response
      if (result.content) {
        this.memory.addMessage(task.sessionId, "assistant", result.content);
      }

      // Execute tool calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
          const toolResult = await this.toolRouter.executeTool(tc.name, tc.args);
          this.memory.addMessage(task.sessionId, "tool", JSON.stringify(toolResult), {
            toolCalls: JSON.stringify([tc]),
            toolResults: JSON.stringify([toolResult]),
          });
        }
        return true; // Continue loop
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
        this.memory.addMessage(task.sessionId, "tool", JSON.stringify(result), {
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
        this.memory.addMessage(task.sessionId, "assistant", summary);
        task.status = "completed";
        return false;
      }

      console.log(`[AgentLoop] ${task.agentName}: phase=1 executing ${nextActions.length} follow-up actions`);
      for (const action of nextActions) {
        console.log(`[AgentLoop] ${task.agentName}: → ${action.tool}(${JSON.stringify(action.args)})`);
        const res = await this.toolRouter.executeTool(action.tool, action.args);
        this.memory.addMessage(task.sessionId, "tool", JSON.stringify(res), {
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
    this.memory.addMessage(task.sessionId, "assistant", summary);
    task.status = "completed";
    return false;
  }

  // ─── Initial Actions Per Agent ─────────────────────────────

  private getInitialActions(
    agentName: string,
    taskData: any
  ): Array<{ tool: string; args: any }> {
    const title = taskData.title || "";
    const desc = taskData.description || "";
    const input = taskData.inputData || {};

    switch (agentName) {
      case "rd":
        return [
          {
            tool: "orchestrator_list_tools",
            args: {},
          },
          {
            tool: "memory_get_state",
            args: { agentId: "rd", tenantId: "erp-core", key: "last_research_topic" },
          },
        ];

      case "brainstorm":
        return [
          {
            tool: "orchestrator_list_tools",
            args: { category: "erp" },
          },
        ];

      case "production":
        return [
          {
            tool: "orchestrator_health",
            args: {},
          },
        ];

      case "design":
        return [
          {
            tool: "orchestrator_list_tools",
            args: {},
          },
        ];

      case "marketing":
        return [
          {
            tool: "orchestrator_list_tools",
            args: { category: "erp" },
          },
        ];

      default:
        return [
          {
            tool: "orchestrator_health",
            args: {},
          },
        ];
    }
  }

  // ─── Next Actions Based on Results ─────────────────────────

  private getNextActions(
    agentName: string,
    taskData: any,
    lastResult: any
  ): Array<{ tool: string; args: any }> {
    // If tool failed, try alternative
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
      ];
    }

    // Agent-specific follow-up logic
    switch (agentName) {
      case "rd": {
        const topic = taskData.title || "research";
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
            tool: "siyuan_create_doc",
            args: {
              notebookId: "20260430171620-3x8gib1",
              title: `RD-${topic.slice(0, 30)}-${Date.now()}`,
              content: `# Research: ${topic}\n\n## Task\n${taskData.description || ""}\n\n## Findings\nAnalysis complete. Tools available and system healthy.\n\n## Status\nReady for next steps.`,
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
        ];
      }

      case "brainstorm":
      case "design":
      case "marketing": {
        return [
          {
            tool: "siyuan_create_doc",
            args: {
              notebookId: "20260430171620-3x8gib1",
              title: `${agentName.toUpperCase()}-${(taskData.title || "task").slice(0, 30)}-${Date.now()}`,
              content: `# ${agentName} Analysis: ${taskData.title || "Untitled"}\n\n## Description\n${taskData.description || ""}\n\n## Results\nAnalysis complete.\n\n## Output\nDocumented in SiYuan knowledge base.`,
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

    return [
      `## ${agentName.toUpperCase()} Agent - Task Complete`,
      "",
      `**Task:** ${taskData.title || "Untitled"}`,
      `**Description:** ${taskData.description || "N/A"}`,
      `**Iterations:** ${messages.length} steps`,
      `**Tool Results:** ${toolResults.length} tools executed`,
      "",
      "### Summary",
      `Agent ${agentName} has completed analysis of the assigned task.`,
      `Findings have been documented in the knowledge base.`,
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
    // Try agency API first
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
    const session = this.memory.createSession(
      agentName,
      "erp-core",
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
      this.memory.addMessage(session.id, "system", systemPrompt);
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

    this.memory.addMessage(session.id, "user", taskContent);

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
    console.log(
      `[AgentLoop] 🤖 ${agentName} claimed task "${task.title}" (${task.id})`
    );
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
        llmMessages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.id,
        });
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
