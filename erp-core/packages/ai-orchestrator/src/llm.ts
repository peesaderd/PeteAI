// ============================================================
// LLM Client - Agent decision making via OpenAI-compatible API
// Supports OpenAI, Anthropic, Ollama, OpenHands SDK, etc.
// Fallback to rule-based decisions when no LLM configured
// ============================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface LLMToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export class LLMClient {
  private config: LLMConfig;
  private tokenBudget: number;
  private tokenUsed: number;
  private tokenBudgetPeriod: number; // ms
  private tokenBudgetStart: number;

  constructor() {
    this.config = {
      apiUrl: process.env.LLM_API_URL || "",
      apiKey: process.env.LLM_API_KEY || "",
      model: process.env.LLM_MODEL || "gpt-4o",
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    };
    // Token budget: max tokens per period (default 100K per minute)
    this.tokenBudget = parseInt(process.env.LLM_TOKEN_BUDGET || "100000", 10);
    this.tokenUsed = 0;
    this.tokenBudgetPeriod = parseInt(process.env.LLM_TOKEN_BUDGET_PERIOD || "60000", 10);
    this.tokenBudgetStart = Date.now();
  }

  // Check if we have budget remaining
  hasBudget(estimatedTokens: number = 0): boolean {
    this.resetBudgetIfExpired();
    return (this.tokenUsed + estimatedTokens) <= this.tokenBudget;
  }

  // Get remaining budget
  getRemainingBudget(): number {
    this.resetBudgetIfExpired();
    return Math.max(0, this.tokenBudget - this.tokenUsed);
  }

  // Reset budget if period expired
  private resetBudgetIfExpired(): void {
    if (Date.now() - this.tokenBudgetStart > this.tokenBudgetPeriod) {
      this.tokenUsed = 0;
      this.tokenBudgetStart = Date.now();
    }
  }

  // Track token usage from API response
  private trackUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): void {
    if (!usage) return;
    const total = usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
    this.tokenUsed += total;
    console.log(`[LLM] Token usage: +${total} (total this period: ${this.tokenUsed}/${this.tokenBudget})`);
  }

  // Estimate token count for a string (rough: 4 chars per token)
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Truncate messages to fit within budget
  static truncateMessages(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
    let total = 0;
    const result: LLMMessage[] = [];
    // Always keep system message
    for (const msg of messages) {
      if (msg.role === "system") {
        result.push(msg);
        total += LLMClient.estimateTokens(msg.content);
      }
    }
    // Add other messages from newest to oldest until budget exceeded
    const others = messages.filter(m => m.role !== "system").reverse();
    for (const msg of others) {
      const tokens = LLMClient.estimateTokens(msg.content);
      if (total + tokens > maxTokens) {
        // Truncate content
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

  isConfigured(): boolean {
    return !!(this.config.apiUrl && this.config.apiKey);
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<{
    content: string | null;
    toolCalls?: Array<{ name: string; args: Record<string, any> }>;
    finishReason: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error("LLM not configured. Set LLM_API_URL and LLM_API_KEY");
    }

    const body: any = {
      model: this.config.model,
      messages: messages.map((m) => {
        const msg: any = { role: m.role, content: m.content };
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        if (m.name) msg.name = m.name;
        return msg;
      }),
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

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

      // Track token usage
      this.trackUsage(data.usage);

      // Check if we exceeded budget
      if (!this.hasBudget()) {
        console.warn(`[LLM] Token budget exhausted (${this.tokenUsed}/${this.tokenBudget}). Consider increasing LLM_TOKEN_BUDGET.`);
      }

      const toolCalls = choice.message?.tool_calls?.map((tc: any) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments),
      }));

      return {
        content: choice.message?.content || null,
        toolCalls,
        finishReason: choice.finish_reason || "stop",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Build system prompt for an agent role
  static getSystemPrompt(agentName: string, role: string, tools: string[]): string {
    return `You are ${agentName}, an autonomous AI agent with role: ${role}.

AVAILABLE TOOLS:
${tools.map((t) => `  - ${t}`).join("\n")}

YOUR RESPONSIBILITIES:
1. Analyze tasks thoroughly before taking action
2. Use available tools to gather information and execute work
3. Think step-by-step about what needs to be done
4. When you have enough information, provide a complete response
5. If you need human input, set task status to "pending_approval"

RULES:
- Always explain your reasoning before using a tool
- Use the minimum number of tool calls needed
- If a tool fails, try an alternative approach
- When the task is complete, summarize what was done
- Never make up information - use tools to verify`;
  }
}
