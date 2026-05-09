// ============================================================
// Task Dispatcher
// Human-in-the-Loop + Agent Assignment + Task Board Logic
// ============================================================

import { TaskQueue, Task, TaskStatus } from "./task-queue.js";
import { LLMGateway, LLMMessage } from "./llm-gateway.js";
import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";

export type AgentId = "rd" | "brainstorm" | "production" | "design" | "marketing" | "system";

export interface DispatchRule {
  agent: AgentId;
  keywords: string[];
  priority: number;
  requiresApproval: boolean;
}

const DEFAULT_RULES: DispatchRule[] = [
  { agent: "rd", keywords: ["research", "investigate", "bug", "issue", "technical debt"], priority: 2, requiresApproval: false },
  { agent: "brainstorm", keywords: ["idea", "brainstorm", "suggestion", "improve", "innovation"], priority: 3, requiresApproval: false },
  { agent: "production", keywords: ["deploy", "release", "production", "rollout", "publish"], priority: 1, requiresApproval: true },
  { agent: "design", keywords: ["design", "ui", "ux", "layout", "style", "frontend"], priority: 3, requiresApproval: false },
  { agent: "marketing", keywords: ["marketing", "promote", "campaign", "social", "content"], priority: 4, requiresApproval: false },
];

export class TaskDispatcher {
  private taskQueue: TaskQueue;
  private llm: LLMGateway;
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private rules: DispatchRule[];

  constructor(
    taskQueue: TaskQueue,
    llm: LLMGateway,
    toolRouter: ToolRouter,
    memory: MemoryStore,
    rules?: DispatchRule[],
  ) {
    this.taskQueue = taskQueue;
    this.llm = llm;
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.rules = rules || DEFAULT_RULES;
  }

  async dispatchFromText(
    text: string,
    source: string,
    sessionId?: string,
  ): Promise<Task> {
    const lower = text.toLowerCase();
    let matchedRule: DispatchRule | null = null;

    for (const rule of this.rules) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      matchedRule = await this.classifyWithLLM(text);
    }

    const taskId = "task-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const task = this.taskQueue.push({
      id: taskId,
      type: "llm",
      priority: matchedRule.priority,
      title: text.slice(0, 80) + (text.length > 80 ? "..." : ""),
      description: text,
      input: { text, source, sessionId, assignedAgent: matchedRule.agent },
      sessionId: sessionId || null,
      source,
      approvalRequired: matchedRule.requiresApproval,
      approvalToken: matchedRule.requiresApproval ? crypto.randomUUID() : null,
    });

    if (matchedRule.requiresApproval) {
      this.taskQueue.updateStatus(task.id, "pending_approval");
    }

    console.log("[TaskDispatcher] Dispatched to " + matchedRule.agent + " (approval: " + matchedRule.requiresApproval + ")");
    return task;
  }

  private async classifyWithLLM(text: string): Promise<DispatchRule> {
    try {
      const messages: LLMMessage[] = [
        {
          role: "system",
          content: "You are a task classifier. Classify the following request into one of these agents:\n- rd: technical/research/bug issues\n- brainstorm: ideas/suggestions/improvements\n- production: deployments/releases\n- design: UI/UX/frontend\n- marketing: promotions/content\nRespond with ONLY the agent name.",
        },
        { role: "user", content: text },
      ];

      const response = await this.llm.chat(messages, undefined, { sessionId: "task-classifier" });
      const agent = (response.content || "").trim().toLowerCase() as AgentId;

      if (this.rules.some((r) => r.agent === agent)) {
        return this.rules.find((r) => r.agent === agent)!;
      }
    } catch (err) {
      console.warn("[TaskDispatcher] LLM classification failed, defaulting to rd");
    }

    return { agent: "rd", keywords: [], priority: 3, requiresApproval: false };
  }

  async executeTask(taskId: string): Promise<void> {
    const task = this.taskQueue.get(taskId);
    if (!task || task.status !== "queued") return;

    this.taskQueue.updateStatus(taskId, "running");
    try {
      const agent = task.input.assignedAgent || "rd";
      const result = await this.toolRouter.executeTool(agent + "_process", {
        taskId: task.id,
        title: task.title,
        description: task.description,
        input: task.input,
      });

      this.taskQueue.updateStatus(taskId, "done", {
        output: result.data || result,
      });
      console.log("[TaskDispatcher] Task " + taskId + " completed by " + agent);
    } catch (err: any) {
      this.taskQueue.updateStatus(taskId, "failed", {
        error: err.message,
      });
      console.error("[TaskDispatcher] Task " + taskId + " failed: " + err.message);
    }
  }

  approveTask(taskId: string, approvedBy: string): Task | null {
    const task = this.taskQueue.approveTask(taskId, approvedBy);
    if (task) {
      setImmediate(() => this.executeTask(taskId));
    }
    return task;
  }

  rejectTask(taskId: string, rejectedBy: string, reason: string): Task | null {
    return this.taskQueue.rejectTask(taskId, reason);
  }

  getPendingApproval(): Task[] {
    return this.taskQueue.list({ status: "pending_approval" });
  }

  listTasks(filter?: { status?: TaskStatus; agent?: string }): Task[] {
    return this.taskQueue.list(filter as any);
  }

  getTask(id: string): Task | null {
    return this.taskQueue.get(id);
  }
}
