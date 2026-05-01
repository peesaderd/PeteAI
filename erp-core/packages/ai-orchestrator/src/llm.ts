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

  constructor() {
    this.config = {
      apiUrl: process.env.LLM_API_URL || "",
      apiKey: process.env.LLM_API_KEY || "",
      model: process.env.LLM_MODEL || "gpt-4o",
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    };
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
