// ============================================================
// Unified LLM Gateway
// ศูนย์กลาง LLM สำหรับทั้งระบบ — Telegram, Web UI, Agent Loop
// Provider: DeepSeek (default), รองรับ OpenAI-compatible API
// ============================================================

import fs from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface LLMResponse {
    reasoningContent: string | null;
  content: string | null;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, any> }>;
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface LLMConfig {
  provider: "deepseek" | "openai" | "anthropic" | "ollama";
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

// ─── Log Entry ───────────────────────────────────────────────

export interface LLMLogEntry {
  timestamp: string;
  sessionId: string;
  source: "telegram" | "dashboard" | "agent_loop" | "chat_api" | "system";
  messages: LLMMessage[];
  response: LLMResponse | null;
  error: string | null;
  durationMs: number;
}

// ─── LLM Gateway Class ───────────────────────────────────────

export class LLMGateway {
  private config: LLMConfig;
  private logs: LLMLogEntry[] = [];
  private maxLogs = 1000;
  private logDir: string;

  constructor() {
    this.config = {
      provider: (process.env.LLM_PROVIDER as LLMConfig["provider"]) || "deepseek",
      apiUrl: process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
      apiKey: process.env.LLM_API_KEY || "",
      model: process.env.LLM_MODEL || "deepseek-chat",
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    };
    this.logDir = process.env.LLM_LOG_DIR || "/tmp/llm-logs";
    if (!fs.existsSync(this.logDir)) {
      try { fs.mkdirSync(this.logDir, { recursive: true }); } catch { /* ignore */ }
    }
  }

  isConfigured(): boolean {
    return !!(this.config.apiUrl && this.config.apiKey);
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /** เปลี่ยน provider หรือ model แบบ runtime */
  updateConfig(partial: Partial<LLMConfig>): void {
    Object.assign(this.config, partial);
    console.log(`[LLMGateway] Config updated: ${this.config.provider}/${this.config.model}`);
  }

  /** System prompt รวม context — ใช้กับทุก session */
  buildSystemPrompt(extraContext?: string): string {
    const parts = [
      "You are PeteAI, an autonomous AI agent that controls browser automation, APIs, and file systems.",
      "",
      "CAPABILITIES:",
      "- Control a web browser (navigate, click, fill forms, screenshot, read content)",
      "- Execute API calls to external services (Etsy, eBay, Amazon, WordPress, etc.)",
      "- Read and write files on the server",
      "- Create GitHub issues and manage repositories",
      "- Search knowledge base for information",
      "",
      "RULES:",
      "1. Analyze tasks thoroughly before taking action",
      "2. Use tools to gather information and execute work",
      "3. Think step-by-step about what needs to be done",
      "4. When a task is complete, summarize what was done",
      "5. If a tool fails, try an alternative approach",
      "6. Keep responses concise and direct",
      "7. You can use browser for any web-based task",
      "8. Respond in the SAME LANGUAGE as the user's message (Thai, English, etc.)",
      "",
    ];

    if (extraContext) {
      parts.push("ADDITIONAL CONTEXT:");
      parts.push(extraContext);
      parts.push("");
    }

    return parts.join("\n");
  }

  /** ส่ง chat ไปยัง LLM — ทุก request ถูก log */
  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      sessionId?: string;
      source?: LLMLogEntry["source"];
    },
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const sessionId = options?.sessionId || "unknown";
    const source = options?.source || "system";

    if (!this.isConfigured()) {
      throw new Error("LLM not configured. Set LLM_API_KEY and LLM_BASE_URL");
    }

    const body: any = {
      model: this.config.model,
      messages: messages.map((m) => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        return msg;
      }),
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response: LLMResponse | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(`${this.config.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LLM API error (${res.status}): ${text.slice(0, 500)}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("LLM returned empty response");

      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined;

      const toolCalls = choice.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      }));

      response = {
        content: choice.message?.content || null,
        reasoningContent: choice.message?.reasoning_content || null,
        toolCalls,
        finishReason: choice.finish_reason || "stop",
        usage,
      };

      if (usage) {
        console.log(`[LLMGateway] ${source}/${sessionId}: ${usage.totalTokens} tokens (${this.config.model})`);
      }
    } catch (err: any) {
      error = err.message;
      console.error(`[LLMGateway] Error: ${err.message}`);
      throw err;
    } finally {
      clearTimeout(timeout);
      this.log({
        timestamp: new Date().toISOString(),
        sessionId,
        source,
        messages,
        response,
        error,
        durationMs: Date.now() - startTime,
      });
    }

    return response;
  }

  /** Log ลง memory + file */
  private log(entry: LLMLogEntry): void {
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) this.logs.pop();

    // เขียน file log (ไม่ blocking)
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const logFile = path.join(this.logDir, `llm-${dateStr}.jsonl`);
      fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
    } catch { /* ignore */ }
  }

  /** ดึง logs ล่าสุด */
  getRecentLogs(limit = 50, source?: LLMLogEntry["source"]): LLMLogEntry[] {
    let filtered = this.logs;
    if (source) filtered = filtered.filter((l) => l.source === source);
    return filtered.slice(0, limit);
  }

  /** ดึง logs จาก file */
  getLogsFromFile(dateStr: string): LLMLogEntry[] {
    try {
      const logFile = path.join(this.logDir, `llm-${dateStr}.jsonl`);
      if (!fs.existsSync(logFile)) return [];
      const content = fs.readFileSync(logFile, "utf-8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  /** นับ tokens คร่าวๆ */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** truncate messages ให้อยู่ใน budget */
  static truncateMessages(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
    let total = 0;
    const result: LLMMessage[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        result.push(msg);
        total += LLMGateway.estimateTokens(msg.content);
      }
    }
    const others = messages.filter((m) => m.role !== "system").reverse();
    for (const msg of others) {
      const tokens = LLMGateway.estimateTokens(msg.content);
      if (total + tokens > maxTokens) {
        const remaining = maxTokens - total;
        const chars = remaining * 4;
        result.push({ ...msg, content: msg.content.slice(0, chars) + "\n...[truncated]" });
        break;
      }
      result.push(msg);
      total += tokens;
    }
    return result;
  }
}
