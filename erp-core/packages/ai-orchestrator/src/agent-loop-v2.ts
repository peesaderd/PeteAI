// ============================================================
// Agent Loop v2 — Controllable, Task-Based Autonomous Agent
//
// ใช้ LLM Gateway + Task Queue + BrowserUse
// สั่ง start/stop/pause/resume ได้
// ============================================================

import { LLMGateway, type LLMMessage, type LLMToolDef, type LLMResponse } from "./llm-gateway.js";
import { TaskQueue, type Task } from "./task-queue.js";
import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";
import { ChatStore } from "./chat-store.js";
import { BrowserUse } from "./browser-use.js";
import { ReviveChat } from "./revive-chat.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───────────────────────────────────────────────────

export type AgentStatus = "idle" | "running" | "paused" | "stopped";

export interface AgentState {
  status: AgentStatus;
  currentTask: Task | null;
  processedCount: number;
  failedCount: number;
  startedAt: string | null;
  uptimeMs: number;
}

// ─── Agent Loop v2 ───────────────────────────────────────────

export class AgentLoopV2 {
  private llm: LLMGateway;
  private queue: TaskQueue;
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private chatStore: ChatStore;
  private browser: BrowserUse | null = null;
  private reviveChat: ReviveChat | null = null;

  private status: AgentStatus = "stopped";
  private currentTask: Task | null = null;
  private processedCount = 0;
  private failedCount = 0;
  private startedAt: string | null = null;

  private loopTimer: NodeJS.Timeout | null = null;
  private loopIntervalMs = 2000; // ตรวจ task ทุก 2 วิ
  private maxIterationsPerTask = 10;

  // Error Handling config
  private maxRetries = 3;
  private retryDelayBase = 1000; // 1s, 2s, 4s (exponential)
  private taskTimeoutMs = 300000; // 5 นาทีสูงสุดต่อ task

  // Event callbacks
  public onTaskStart: ((task: Task) => void) | null = null;
  public onTaskComplete: ((task: Task) => void) | null = null;
  public onTaskFailed: ((task: Task, error: string) => void) | null = null;
  public onStatusChange: ((status: AgentStatus) => void) | null = null;

  constructor(
    llm: LLMGateway,
    queue: TaskQueue,
    toolRouter: ToolRouter,
    memory: MemoryStore,
    chatStore: ChatStore,
    browser?: BrowserUse,
    reviveChat?: ReviveChat,
  ) {
    this.llm = llm;
    this.queue = queue;
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.chatStore = chatStore;
    this.browser = browser || null;
    this.reviveChat = reviveChat || null;
  }

  // ─── Control ───────────────────────────────────────────────

  start(): void {
    if (this.status === "running") return;
    this.status = "running";
    this.startedAt = new Date().toISOString();
    console.log("[AgentLoopV2] Started");
    this.onStatusChange?.("running");
    this.scheduleNext();
  }

  stop(): void {
    this.status = "stopped";
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log(`[AgentLoopV2] Stopped (processed: ${this.processedCount}, failed: ${this.failedCount})`);
    this.onStatusChange?.("stopped");
  }

  pause(): void {
    if (this.status !== "running") return;
    this.status = "paused";
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log("[AgentLoopV2] Paused");
    this.onStatusChange?.("paused");
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "running";
    console.log("[AgentLoopV2] Resumed");
    this.onStatusChange?.("running");
    this.scheduleNext();
  }

  getState(): AgentState {
    return {
      status: this.status,
      currentTask: this.currentTask,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0,
    };
  }

  // ─── Main Loop ─────────────────────────────────────────────

  private scheduleNext(): void {
    if (this.status !== "running") return;

    this.loopTimer = setTimeout(async () => {
      await this.tick();
      this.scheduleNext();
    }, this.loopIntervalMs);
  }

  private async tick(): Promise<void> {
    if (this.status !== "running") return;

    // ถ้ากำลังทำงาน task อยู่ → ข้ามรอบนี้
    if (this.currentTask && this.currentTask.status === "running") {
      return;
    }

    // ดึง task ถัดไป (priority sorting)
    const task = this.queue.pop();
    if (!task) return; // ไม่มี task

    // ─── State Machine: queued → running ────────────────────
    this.queue.updateStatus(task.id, "running");
    this.currentTask = this.queue.get(task.id);
    this.onTaskStart?.(this.currentTask!);

    try {
      await this.processTask(this.currentTask!);
      this.processedCount++;
      this.currentTask = null;
    } catch (err: any) {
      this.failedCount++;
      this.currentTask = null;
      this.onTaskFailed?.(task, err.message);
    }
  }

  /** อัปเดตความคืบหน้าของ task ที่กำลังทำงาน */
  private updateProgress(progress: number, message: string): void {
    if (!this.currentTask) return;
    this.queue.updateStatus(this.currentTask.id, "running", {
      progress,
      progressMessage: message,
    });
  }

  // ─── Process Task ──────────────────────────────────────────

  private async processTask(task: Task): Promise<void> {
    console.log(`[AgentLoopV2] Processing task: ${task.id} (${task.title})`);

    // Timeout protection
    const timeout = setTimeout(() => {
      console.error(`[AgentLoopV2] Task ${task.id} timed out after ${this.taskTimeoutMs}ms`);
      this.queue.updateStatus(task.id, "failed", {
        error: `Task timed out after ${this.taskTimeoutMs}ms`,
      });
      this.onTaskFailed?.(this.queue.get(task.id)!, `Timeout after ${this.taskTimeoutMs}ms`);
      this.currentTask = null;
    }, this.taskTimeoutMs);

    try {
      await this.executeWithRetry(task);
    } catch (err: any) {
      this.queue.updateStatus(task.id, "failed", { error: err.message });
      this.onTaskFailed?.(this.queue.get(task.id)!, err.message);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Core execution logic with retry support */
  private async executeWithRetry(task: Task): Promise<void> {
    const planMessages = this.buildPlanMessages(task);
    const tools = this.buildToolDefs(task);

    let plan: LLMResponse;
    let lastError: string | null = null;

    // ─── Phase 1: LLM วางแผน (พร้อม retry) ─────────────────
    this.updateProgress(5, "Analyzing task and creating plan...");
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        plan = await this.llm.chat(planMessages, tools, {
          sessionId: task.sessionId || task.id,
          source: "agent_loop",
          maxTokens: 2048,
        });
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
          console.warn(`[AgentLoopV2] LLM plan attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
          this.updateProgress(5, `Retrying plan (attempt ${attempt + 1})...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          throw new Error(`LLM plan failed after ${this.maxRetries} attempts: ${lastError}`);
        }
      }
    }

    // ─── Phase 2: Execute tools ────────────────────────────
    let iteration = 0;
    let messages: LLMMessage[] = [...planMessages];
    let finalResponse = "";

    while (iteration < this.maxIterationsPerTask) {
      iteration++;

      if (!plan!.toolCalls || plan!.toolCalls.length === 0) {
        finalResponse = plan!.content || "";
        break;
      }

      this.updateProgress(
        10 + Math.round((iteration / this.maxIterationsPerTask) * 80),
        `Executing step ${iteration} (${plan!.toolCalls.length} tools)...`,
      );

      // Execute แต่ละ tool (พร้อม retry)
      for (const toolCall of plan!.toolCalls) {
        const result = await this.executeToolWithRetry(toolCall.name, toolCall.args, task);

        messages.push({
          role: "assistant",
          content: plan!.content || "",
          tool_calls: [
            {
              id: toolCall.id,
              type: "function",
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.args),
              },
            },
          ],
        });

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }

      // ส่งผลลัพท์กลับให้ LLM วิเคราะห์ (พร้อม retry)
      let llmOk = false;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          plan = await this.llm.chat(messages, tools, {
            sessionId: task.sessionId || task.id,
            source: "agent_loop",
            maxTokens: 2048,
          });
          llmOk = true;
          break;
        } catch (err: any) {
          lastError = err.message;
          if (attempt < this.maxRetries) {
            const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
            console.warn(`[AgentLoopV2] LLM iteration ${iteration} attempt ${attempt} failed, retrying in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (!llmOk) {
        throw new Error(`LLM iteration ${iteration} failed after ${this.maxRetries} attempts: ${lastError}`);
      }
    }

    // ─── Phase 3: สรุปผล ───────────────────────────────────
    this.updateProgress(95, "Finalizing results...");
    const output: Record<string, any> = {
      summary: finalResponse || plan!.content || "Task completed",
      iterations: iteration,
      toolCalls: messages.filter((m) => m.role === "tool").length,
    };

    this.queue.updateStatus(task.id, "done", { output });
    this.onTaskComplete?.(this.queue.get(task.id)!);

    if (task.sessionId) {
      this.chatStore.addMessage(task.sessionId, "assistant", output.summary);
    }
  }

  /** Execute tool with retry logic */
  private async executeToolWithRetry(
    name: string,
    args: Record<string, any>,
    task: Task,
  ): Promise<any> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.executeTool(name, args, task);
        if (result && result.success === false && attempt < this.maxRetries) {
          // Tool รายงาน fail — retry
          lastError = result.error || "Unknown tool error";
          const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
          console.warn(`[AgentLoopV2] Tool ${name} attempt ${attempt} failed, retrying in ${delay}ms: ${lastError}`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return result;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
          console.warn(`[AgentLoopV2] Tool ${name} attempt ${attempt} threw, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    return { success: false, error: `Tool ${name} failed after ${this.maxRetries} attempts: ${lastError}` };
  }

  // ─── Build Messages ────────────────────────────────────────

  private buildPlanMessages(task: Task): LLMMessage[] {
    const systemPrompt = this.llm.buildSystemPrompt(
      `Current task: ${task.title}\nDescription: ${task.description}`,
    );

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // เพิ่มประวัติจาก session ก่อน (context)
    if (task.sessionId) {
      const history = this.chatStore.getContext(task.sessionId, 10);
      for (const msg of history) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
      }
    }

    // คำสั่งปัจจุบันอยู่ท้ายสุด (สำคัญที่สุด)
    messages.push({
      role: "user",
      content: `Task: ${task.title}\n\nDescription: ${task.description}\n\nInput: ${JSON.stringify(task.input, null, 2)}\n\nAnalyze this task and use the available tools to complete it.`,
    });

    return messages;
  }

  // ─── Tool Definitions ──────────────────────────────────────

  private buildToolDefs(task: Task): LLMToolDef[] {
    const allTools = this.toolRouter.getTools();
    const tools: LLMToolDef[] = [];

    for (const t of allTools) {
      tools.push({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema || {},
        },
      });
    }

    // เพิ่ม revive_chat tool ถ้ามี ReviveChat
    if (this.reviveChat) {
      tools.push({
        type: "function",
        function: {
          name: "revive_chat",
          description: "Send a message to OpenHands chat and wait for response. Use this to ask OpenHands to perform complex tasks.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to send to OpenHands",
              },
            },
            required: ["message"],
          },
        },
      });
    }

    return tools;
  }

  // ─── Execute Tool ──────────────────────────────────────────

  private async executeTool(
    name: string,
    args: Record<string, any>,
    task: Task,
  ): Promise<any> {
    console.log(`[AgentLoopV2] Tool: ${name}(${JSON.stringify(args).slice(0, 200)})`);

    // ReviveChat tool
    if (name === "revive_chat" && this.reviveChat) {
      return await this.reviveChat.sendMessage(args.message);
    }

    // Browser tools ต้องใช้ browser instance
    if (name.startsWith("browser_") && this.browser) {
      return await this.executeBrowserTool(name, args);
    }

    // Tool ปกติผ่าน ToolRouter
    try {
      const result = await this.toolRouter.executeTool(name, args);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private async executeBrowserTool(
    name: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!this.browser) {
      return { success: false, error: "Browser not available" };
    }

    try {
      switch (name) {
        case "browser_navigate":
          return await this.browser.navigate(args.url);
        case "browser_click":
          return await this.browser.click(args.selector);
        case "browser_fill":
          return await this.browser.fill(args.selector, args.value);
        case "browser_screenshot":
          return await this.browser.screenshot(args.fullPage);
        case "browser_read":
          return await this.browser.readPage();
        case "browser_evaluate":
          return await this.browser.evaluate(args.script);
        case "browser_wait":
          return await this.browser.wait(args.ms);
        case "browser_scroll":
          return await this.browser.scroll(args.deltaX, args.deltaY);
        case "browser_get_url":
          return await this.browser.getUrl();
        case "browser_get_title":
          return await this.browser.getTitle();
        case "browser_wait_for_selector":
          return await this.browser.waitForSelector(args.selector, args.timeout);
        case "browser_health":
          return { success: true, data: this.browser.getStatus() };
        case "browser_restart":
          return { success: true, data: await this.browser.restart() };
        default:
          return { success: false, error: `Unknown browser tool: ${name}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Push Task จากภายนอก ───────────────────────────────────

  async createTask(params: {
    type: Task["type"];
    title: string;
    description?: string;
    input?: Record<string, any>;
    priority?: number;
    sessionId?: string;
    source?: string;
  }): Promise<Task> {
    const task = this.queue.push({
      id: uuidv4(),
      type: params.type,
      priority: params.priority || 3,
      title: params.title,
      description: params.description || "",
      input: params.input || {},
      sessionId: params.sessionId || null,
      source: params.source || "system",
    });

    return task;
  }

  /** ดึง task history */
  getTaskHistory(limit = 20): Task[] {
    return this.queue.list({ limit, offset: 0 });
  }

  /** ดึง tasks ที่ failed */
  getFailedTasks(limit = 20): Task[] {
    return this.queue.list({ status: "failed", limit });
  }
}
