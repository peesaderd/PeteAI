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
import { RateLimiter } from "./rate-limiter.js";
import { VisionAnalysis, type VisionAnalysisParams } from "./vision-analysis.js";
import { EtsyBrowserWorkflow, type EtsyListingParams } from "./etsy-browser-workflow.js";
import { EtsyApiClient, EtsyApiError, type EtsyApiConfig, type EtsyToken } from "./etsy-api-client.js";
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
  private rateLimiter: RateLimiter;
  private vision: VisionAnalysis;
  private etsyWorkflow: EtsyBrowserWorkflow | null = null;
  private etsyApi: EtsyApiClient | null = null;

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
    rateLimiter?: RateLimiter,
    etsyApiConfig?: EtsyApiConfig,
  ) {
    this.llm = llm;
    this.queue = queue;
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.chatStore = chatStore;
    this.browser = browser || null;
    this.reviveChat = reviveChat || null;
    this.rateLimiter = rateLimiter || new RateLimiter();
    this.vision = new VisionAnalysis();
    if (this.browser) {
      this.etsyWorkflow = new EtsyBrowserWorkflow(this.browser);
    }
    if (etsyApiConfig) {
      this.etsyApi = new EtsyApiClient(etsyApiConfig);
    }
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
    // ─── Phase 0: SiYuan Knowledge Retrieval ──────────────
    this.updateProgress(3, "Searching knowledge base for context...");
    const kbContext = await this.retrieveKnowledge(task);
    if (kbContext) {
      console.log(`[AgentLoopV2] Retrieved ${kbContext.length} chars from KB for task ${task.id}`);
    }

    const planMessages = this.buildPlanMessages(task, kbContext);
    const tools = this.buildToolDefs(task);

    let plan: LLMResponse;
    let lastError: string | null = null;

    // ─── Phase 1: LLM วางแผน (พร้อม retry + fallback) ──────
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
        }
      }
    }

    // Fallback: ถ้า LLM ล้มทั้งหมด → ใช้ KB/cache response
    if (lastError) {
      console.warn(`[AgentLoopV2] LLM failed after ${this.maxRetries} attempts, using fallback: ${lastError}`);
      const fallbackResponse = await this.getFallbackResponse(task, kbContext);
      this.queue.updateStatus(task.id, "done", {
        output: {
          summary: fallbackResponse,
          iterations: 0,
          toolCalls: 0,
          fallback: true,
          fallbackReason: lastError,
        },
      });
      this.onTaskComplete?.(this.queue.get(task.id)!);
      return;
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

      // ส่งผลลัพท์กลับให้ LLM วิเคราะห์ (พร้อม retry + fallback)
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
        // Fallback: ใช้ KB/cache response แทนการ throw error
        console.warn(`[AgentLoopV2] LLM iteration ${iteration} failed, using fallback response`);
        const fallbackResponse = await this.getFallbackResponse(task, kbContext);
        finalResponse = fallbackResponse;
        break;
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

  private buildPlanMessages(task: Task, kbContext: string | null = null): LLMMessage[] {
    const systemPrompt = this.llm.buildSystemPrompt(
      `Current task: ${task.title}\nDescription: ${task.description}`,
    );

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // เพิ่ม KB context ถ้ามี (จาก SiYuan)
    if (kbContext) {
      messages.push({
        role: "system",
        content: `Here is relevant information from the knowledge base to help with this task:\n\n${kbContext}`,
      });
    }

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

  /** ดึงความรู้จาก SiYuan/KB ก่อนทำงาน */
  private async retrieveKnowledge(task: Task): Promise<string | null> {
    const searchTerms = this.extractSearchTerms(task);
    if (!searchTerms.length) return null;

    try {
      // Try all terms together first, then each term individually
      // (KB search uses LIKE '%query%' which does AND matching across the whole string)
      const queries = [
        searchTerms.join(" "),
        ...searchTerms,
      ];

      const seen = new Set<string>();
      const docs: string[] = [];

      for (const q of queries) {
        if (docs.length >= 3) break;
        const result = await this.toolRouter.executeTool("siyuan_search_docs", {
          query: q,
          limit: 3,
        });

        if (result?.success && result?.data?.length > 0) {
          for (const doc of result.data) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            if (doc.content && docs.length < 3) {
              docs.push(`--- ${doc.title || "Untitled"} ---\n${doc.content}`);
            }
          }
        }
      }

      if (docs.length > 0) {
        return docs.join("\n\n");
      }
    } catch (err: any) {
      console.warn(`[AgentLoopV2] Knowledge retrieval failed: ${err.message}`);
    }

    return null;
  }

  /** Fallback response เมื่อ LLM ล้ม — ดึงจาก KB → cache → rule-based */
  private async getFallbackResponse(task: Task, kbContext: string | null = null): Promise<string> {
    // 1. ถ้ามี KB context จาก Phase 0 ให้ใช้เลย
    if (kbContext) {
      // ดึงเฉพาะส่วนที่เกี่ยวข้อง
      const lines = kbContext.split("\n").filter((l) => l.trim());
      const relevant = lines.slice(0, 20).join("\n");
      return `[Fallback — LLM unavailable]\n\nBased on knowledge base:\n${relevant}\n\nNote: This is a fallback response. The LLM was temporarily unavailable.`;
    }

    // 2. ลองค้นหาจาก cache
    try {
      const cacheKey = `fallback:${task.type}:${task.title}`;
      const cached = this.memory.getAgentState("system", "fallback", cacheKey);
      if (cached) {
        return `[Fallback — from cache]\n\n${cached}`;
      }
    } catch {
      // ignore cache errors
    }

    // 3. ลองค้นหาจาก SiYuan โดยตรง
    try {
      const result = await this.toolRouter.executeTool("siyuan_search_docs", {
        query: task.title,
        limit: 1,
      });
      if (result?.success && result?.data?.[0]?.content) {
        const content = result.data[0].content;
        return `[Fallback — from SiYuan]\n\n${content.slice(0, 2000)}`;
      }
    } catch {
      // ignore search errors
    }

    // 4. Rule-based สุดท้าย
    return `[Fallback — LLM unavailable]\n\nI received your request "${task.title}" but the AI service is currently unavailable. Please try again later. If this persists, check the LLM configuration and API status.`;
  }

  /** สกัดคำค้นหาจาก task — ใช้เฉพาะคำภาษาอังกฤษ (KB content เป็นภาษาอังกฤษ) */
  private extractSearchTerms(task: Task): string[] {
    const terms = new Set<string>();
    const text = `${task.title} ${task.description} ${JSON.stringify(task.input || {})}`.toLowerCase();

    // ตัดคำที่สำคัญ (อย่างน้อย 3 ตัวอักษร, ภาษาอังกฤษเท่านั้น)
    const words = text.split(/[\s,._\-:;!?()]+/);
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "has", "have", "had", "do", "does", "did", "will", "would",
      "can", "could", "shall", "should", "may", "might", "must",
      "this", "that", "these", "those", "and", "or", "but", "not",
      "for", "with", "without", "from", "to", "in", "on", "at",
      "by", "of", "it", "its", "task", "description", "input",
    ]);

    for (const word of words) {
      // กรองเฉพาะคำภาษาอังกฤษ (a-z) ความยาว >= 3 และไม่ใช่ stop word
      if (word.length >= 3 && /^[a-z]+$/.test(word) && !stopWords.has(word)) {
        terms.add(word);
      }
    }

    return Array.from(terms).slice(0, 10);
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

    // Vision Analysis tool
    if (this.vision.isConfigured()) {
      tools.push({
        type: "function",
        function: {
          name: "analyze_image",
          description: "Analyze an image using AI vision (GPT-4V, Claude, or Ollama). Returns composition, colors, lighting, style analysis, and a style prompt for image generation.",
          parameters: {
            type: "object",
            properties: {
              imageBase64: { type: "string", description: "Base64-encoded image data" },
              mimeType: { type: "string", description: "MIME type (e.g. image/png, image/jpeg)", default: "image/png" },
              question: { type: "string", description: "Optional specific question about the image" },
              provider: { type: "string", enum: ["openai", "anthropic", "ollama"], description: "Vision provider to use" },
            },
            required: ["imageBase64"],
          },
        },
      });
    }

    // Etsy workflow tools (browser-based)
    if (this.etsyWorkflow) {
      tools.push({
        type: "function",
        function: {
          name: "etsy_create_listing",
          description: "Create a new Etsy listing with images, title, description, pricing, and tags. Uses browser automation to login and publish.",
          parameters: {
            type: "object",
            properties: {
              images: { type: "array", items: { type: "string" }, description: "Array of base64-encoded images" },
              title: { type: "string", description: "Listing title" },
              description: { type: "string", description: "Listing description" },
              price: { type: "number", description: "Price in USD" },
              quantity: { type: "number", description: "Stock quantity", default: 1 },
              tags: { type: "array", items: { type: "string" }, description: "Up to 13 tags" },
              materials: { type: "array", items: { type: "string" }, description: "Materials used" },
            },
            required: ["images", "title", "description", "price"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_get_status",
          description: "Get current Etsy workflow status and the last step executed.",
          parameters: { type: "object", properties: {} },
        },
      });
    }

    // Etsy API tools (REST-based — ไม่ต้องใช้ browser)
    if (this.etsyApi) {
      tools.push({
        type: "function",
        function: {
          name: "etsy_api_get_auth_url",
          description: "ขั้นตอนที่ 1: สร้าง Etsy OAuth authorization URL สำหรับให้ user เปิดใน browser เพื่อให้ permission",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_exchange_code",
          description: "ขั้นตอนที่ 2: แลก authorization code จาก URL callback เป็น access token",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "Authorization code จาก URL callback (query param ?code=...)" },
              codeVerifier: { type: "string", description: "code_verifier จากขั้นตอน get_auth_url" },
            },
            required: ["code", "codeVerifier"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_get_shop_id",
          description: "ค้นหา Shop ID จากชื่อร้านค้า หรือดึงจาก user ที่ login อยู่",
          parameters: {
            type: "object",
            properties: {
              shopName: { type: "string", description: "ชื่อร้านค้าบน Etsy (ไม่ต้องใส่) — ถ้าไม่ใส่จะดึงจาก user ที่ login" },
            },
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_create_draft_listing",
          description: "สร้าง Draft Listing ใหม่ในร้านค้า ยังไม่เผยแพร่ ต้องเรียก publish ทีหลัง",
          parameters: {
            type: "object",
            properties: {
              shopId: { type: "number", description: "Etsy Shop ID" },
              title: { type: "string", description: "ชื่อสินค้า" },
              description: { type: "string", description: "รายละเอียดสินค้า" },
              price: { type: "number", description: "ราคาใน USD" },
              quantity: { type: "number", description: "จำนวนสินค้าใน stock", default: 1 },
              taxonomy_id: { type: "number", description: "Taxonomy ID (หมวดหมู่สินค้า). ดูจาก ETSY_TAXONOMIES" },
              who_made: { type: "string", enum: ["i_did", "someone_else", "collective"], description: "ใครเป็นคนทำ" },
              when_made: { type: "string", description: "ช่วงเวลาที่ทำ เช่น '2020_2026', '2010_2019', 'made_to_order'" },
              tags: { type: "array", items: { type: "string" }, description: "ป้ายกำกับสูงสุด 13 อัน" },
              materials: { type: "array", items: { type: "string" }, description: "วัสดุที่ใช้" },
              type: { type: "string", enum: ["physical", "download", "both"], default: "physical" },
              should_auto_renew: { type: "boolean", default: true },
            },
            required: ["shopId", "title", "description", "price", "quantity", "taxonomy_id", "who_made", "when_made"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_upload_image",
          description: "อัปโหลดรูปภาพให้กับ Draft Listing (รองรับ base64)",
          parameters: {
            type: "object",
            properties: {
              shopId: { type: "number", description: "Etsy Shop ID" },
              listingId: { type: "number", description: "Listing ID ที่ได้จาก create_draft_listing" },
              imageBase64: { type: "string", description: "รูปภาพในรูปแบบ base64" },
              rank: { type: "number", description: "ลำดับของรูป (1 = รูปหลัก)", default: 1 },
              altText: { type: "string", description: "ข้อความ alt สำหรับรูป" },
            },
            required: ["shopId", "listingId", "imageBase64"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_publish_listing",
          description: "เผยแพร่ Draft Listing → Active (สินค้าจะปรากฏบน Etsy)",
          parameters: {
            type: "object",
            properties: {
              shopId: { type: "number", description: "Etsy Shop ID" },
              listingId: { type: "number", description: "Listing ID ที่ต้องการเผยแพร่" },
            },
            required: ["shopId", "listingId"],
          },
        },
      });

      tools.push({
        type: "function",
        function: {
          name: "etsy_api_get_listings",
          description: "ดึงรายการสินค้าทั้งหมดของร้านค้า",
          parameters: {
            type: "object",
            properties: {
              shopId: { type: "number", description: "Etsy Shop ID" },
            },
            required: ["shopId"],
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

    // Rate limiter check
    const agentId = task.sessionId || task.id;
    try {
      this.rateLimiter.check(agentId);
    } catch (err: any) {
      return { success: false, error: err.message, rateLimited: true };
    }

    // ReviveChat tool
    if (name === "revive_chat" && this.reviveChat) {
      this.rateLimiter.increment(agentId);
      return await this.reviveChat.sendMessage(args.message);
    }

    // Vision Analysis tool
    if (name === "analyze_image") {
      this.rateLimiter.increment(agentId);
      return await this.vision.analyze(args as VisionAnalysisParams);
    }

    // Etsy workflow tools (browser-based)
    if (name === "etsy_create_listing" && this.etsyWorkflow) {
      this.rateLimiter.increment(agentId);
      return await this.etsyWorkflow.createListing(args as EtsyListingParams);
    }
    if (name === "etsy_get_status" && this.etsyWorkflow) {
      return { success: true, data: { step: this.etsyWorkflow.getCurrentStep() } };
    }

    // ─── Etsy API tools (REST-based) ──────────────────────
    if (name.startsWith("etsy_api_") && this.etsyApi) {
      this.rateLimiter.increment(agentId);
      return await this.executeEtsyApiTool(name, args);
    }

    // Browser tools ต้องใช้ browser instance
    if (name.startsWith("browser_") && this.browser) {
      this.rateLimiter.increment(agentId);
      return await this.executeBrowserTool(name, args);
    }

    // Tool ปกติผ่าน ToolRouter
    try {
      this.rateLimiter.increment(agentId);
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

  // ─── Etsy API Tool Execution ───────────────────────────────

  private async executeEtsyApiTool(
    name: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!this.etsyApi) {
      return { success: false, error: "Etsy API client not configured" };
    }

    try {
      switch (name) {
        case "etsy_api_get_auth_url": {
          const result = this.etsyApi.generateAuthUrl();
          return {
            success: true,
            data: result,
            message: "กรุณาเปิด URL นี้ใน browser เพื่อให้ permission กับ Etsy:\n" + result.url +
              "\n\nหลังจาก approve แล้ว Etsy จะ redirect ไปยัง redirect URI พร้อม query param ?code=...\n" +
              "ให้นำ code นั้นมาใช้กับ etsy_api_exchange_code",
          };
        }

        case "etsy_api_exchange_code": {
          const token = await this.etsyApi.exchangeCode(args.code, args.codeVerifier);
          return {
            success: true,
            data: {
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              expiresIn: token.expires_in,
            },
            message: "✅ OAuth สำเร็จ! Token จะหมดอายุใน " + token.expires_in + " วินาที",
          };
        }

        case "etsy_api_get_shop_id": {
          if (args.shopName) {
            const shops = await this.etsyApi.findShops(args.shopName);
            if (shops.length === 0) {
              return { success: false, error: "ไม่พบร้านค้าชื่อ: " + args.shopName };
            }
            return { success: true, data: shops[0] };
          }
          // ดึงจาก user ที่ login
          const user = await this.etsyApi.getMe();
          const shops = await this.etsyApi.getShopByOwnerUserId(user.user_id);
          if (shops.length === 0) {
            return { success: false, error: "User นี้ไม่มีร้านค้า" };
          }
          return {
            success: true,
            data: { user, shop: shops[0] },
          };
        }

        case "etsy_api_create_draft_listing": {
          const listing = await this.etsyApi.createDraftListing(args.shopId, {
            title: args.title,
            description: args.description,
            price: args.price,
            quantity: args.quantity ?? 1,
            taxonomy_id: args.taxonomy_id,
            who_made: args.who_made,
            when_made: args.when_made,
            tags: args.tags,
            materials: args.materials,
            type: args.type ?? "physical",
            should_auto_renew: args.should_auto_renew ?? true,
          });
          return {
            success: true,
            data: listing,
            message: `✅ สร้าง Draft Listing แล้ว! Listing ID: ${listing.listing_id}`,
          };
        }

        case "etsy_api_upload_image": {
          const image = await this.etsyApi.uploadListingImage(args.shopId, {
            listingId: args.listingId,
            imageBase64: args.imageBase64,
            rank: args.rank ?? 1,
            altText: args.altText,
          });
          return {
            success: true,
            data: image,
            message: `✅ อัปโหลดรูปภาพสำเร็จ! Image ID: ${image.listing_image_id}`,
          };
        }

        case "etsy_api_publish_listing": {
          const listing = await this.etsyApi.publishListing(args.shopId, args.listingId);
          return {
            success: true,
            data: listing,
            message: `✅ เผยแพร่ Listing สำเร็จ! สินค้าพร้อมขายที่: ${listing.url}`,
          };
        }

        case "etsy_api_get_listings": {
          const listings = await this.etsyApi.getListingsByShop(args.shopId);
          return {
            success: true,
            data: listings,
            count: listings.length,
          };
        }

        default:
          return { success: false, error: `Unknown Etsy API tool: ${name}` };
      }
    } catch (err: any) {
      if (err instanceof EtsyApiError) {
        return { success: false, error: err.message, status: err.status };
      }
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
