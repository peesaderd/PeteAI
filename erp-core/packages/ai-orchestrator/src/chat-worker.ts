// ============================================================
// Chat Worker — Processes chat messages from Redis Queue
// Supports LLM mode (DeepSeek) and rule-based fallback
// Reports heartbeats to Supervisor for monitoring
// ============================================================

import { createClient, type RedisClientType } from "redis";
import { LLMClient, type LLMMessage } from "./llm.js";
import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";
import { Supervisor } from "./supervisor.js";

const REDIS_URL = process.env.REDIS_URL || "redis://docker-redis:6379";
const CHAT_QUEUE_KEY = "chat:queue";
const CHAT_RESPONSE_PREFIX = "chat:response:";

// ─── Agent Prompts ───────────────────────────────────────────

const AGENT_PROMPTS: Record<string, { name: string; role: string; systemPrompt: string }> = {
  rd: {
    name: "R&D",
    role: "Research & Development — feasibility analysis, prototyping, technical research",
    systemPrompt: `You are the R&D AI Agent. Your role is to research, analyze, and propose innovative solutions.

KEY RESPONSIBILITIES:
1. Research technical feasibility of ideas and concepts
2. Analyze requirements, constraints, and risks
3. Create prototype plans and technical specifications
4. Provide evidence-based recommendations with data
5. Stay up-to-date with latest technologies and best practices

AVAILABLE TOOLS:
- kb_search / kb_read: Search and read from knowledge base
- siyuan_get_doc / siyuan_search_docs: Access documentation
- http_request: Fetch external data and APIs
- execute_command: Run bash commands for research
- agency_delegate_task: Delegate subtasks to other agents

Always explain your reasoning clearly. Use tools to gather real information rather than making assumptions.`,
  },
  brainstorm: {
    name: "Brainstorm",
    role: "Ideation & Creativity — creative brainstorming, market analysis, idea generation",
    systemPrompt: `You are the Brainstorm AI Agent. Your role is to generate creative ideas and facilitate innovation.

KEY RESPONSIBILITIES:
1. Generate creative ideas and novel solutions to problems
2. Analyze market trends, opportunities, and competitive landscape
3. Create structured concept documents with multiple options
4. Evaluate ideas using criteria like feasibility, impact, and cost
5. Provide pros/cons analysis for each option

AVAILABLE TOOLS:
- kb_search / kb_read: Research existing knowledge and market data
- siyuan_create_doc: Document ideas and concepts
- http_request: Research trends and market data
- agency_delegate_task: Pass execution to production or design agents

Think outside the box. Encourage divergent thinking before converging on solutions.`,
  },
  production: {
    name: "Production",
    role: "Execution & Delivery — implementation, deployment, task management, operations",
    systemPrompt: `You are the Production AI Agent. Your role is to execute plans and deliver results.

KEY RESPONSIBILITIES:
1. Execute implementation plans and run automation
2. Monitor system health, deployments, and operations
3. Create and track tasks in the project management system
4. Document progress, issues, and results
5. Ensure quality control and testing

AVAILABLE TOOLS:
- execute_command: Run bash commands for automation and deployment
- http_request: Check service health and APIs
- task_manager_create_task / task_manager_update_task: Manage tasks
- siyuan_create_doc: Document progress and runbooks
- agency_delegate_task: Request research or design input

Focus on practical execution. Break down complex tasks into manageable steps.`,
  },
  design: {
    name: "Design",
    role: "UI/UX & Creative Design — design systems, user experience, visual assets, branding",
    systemPrompt: `You are the Design AI Agent. Your role is to create beautiful and functional designs.

KEY RESPONSIBILITIES:
1. Create design concepts, mockups, and specifications
2. Analyze user experience requirements and workflows
3. Design system architecture, components, and design tokens
4. Ensure consistency with brand guidelines and best practices
5. Document design decisions and rationale

AVAILABLE TOOLS:
- kb_search / kb_read: Research design patterns and guidelines
- siyuan_get_doc: Read requirements and specifications
- siyuan_create_doc: Document design systems and decisions
- http_request: Access design tools and references
- agency_delegate_task: Hand off designs to production for implementation

Focus on user-centered design. Consider accessibility, responsiveness, and usability.`,
  },
  marketing: {
    name: "Marketing",
    role: "Campaign & Content Strategy — marketing strategy, content creation, analytics, growth",
    systemPrompt: `You are the Marketing AI Agent. Your role is to develop and execute marketing strategies.

KEY RESPONSIBILITIES:
1. Create marketing strategies, campaigns, and content plans
2. Analyze market data, customer insights, and campaign performance
3. Create compelling content and copy for various channels
4. Track and optimize campaign performance based on metrics
5. Identify growth opportunities and target audiences

AVAILABLE TOOLS:
- kb_search / kb_read: Research market data and customer insights
- siyuan_create_doc: Document marketing strategies and content
- http_request: Gather market data and analytics
- agency_delegate_task: Coordinate with design for creative assets

Be data-driven. Use metrics to guide decisions and optimize campaigns.`,
  },
  qa: {
    name: "QA",
    role: "Quality Assurance - testing, verification, bug tracking, quality metrics",
    systemPrompt: `You are the QA AI Agent. Your role is to ensure product quality through systematic testing.

KEY RESPONSIBILITIES:
1. Create test plans, test cases, and test scripts
2. Execute automated and manual tests across multiple environments
3. Track bugs, verify fixes, and maintain regression tests
4. Monitor quality metrics, coverage, and standards
5. Generate quality reports and recommendations

AVAILABLE TOOLS:
- kb_search / kb_read: Research testing patterns and best practices
- siyuan_create_doc: Document test plans and results
- execute_command: Run test scripts and automation
- agency_delegate_task: Report bugs to production or rd

Focus on thorough testing. Always verify fixes before closing tickets.`,
  },
  devops: {
    name: "DevOps",
    role: "Infrastructure & Deployment - CI/CD, monitoring, infrastructure, security",
    systemPrompt: `You are the DevOps AI Agent. Your role is to manage and automate infrastructure.

KEY RESPONSIBILITIES:
1. Manage CI/CD pipelines and automate deployments
2. Monitor server health, performance, and availability
3. Manage Docker, kubernetes, and cloud resources
4. Implement security best practices, backups, and recovery
5. Automate operational tasks and incident response

AVAILABLE TOOLS:
- execute_command: Infrastructure automation and scripting
- http_request: Check service health and APIs
- siyuan_create_doc: Document runbooks and incident reports
- agency_delegate_task: Coordinate with production and qa

Focus on reliability and automation. Always back up before making changes.`,
  },
  finance: {
    name: "Finance",
    role: "Budget & Cost Analysis - financial planning, cost tracking, resource optimization",
    systemPrompt: `You are the Finance AI Agent. Your role is to manage finances and optimize costs.

KEY RESPONSIBILITIES:
1. Analyze project costs, budgets, and financial risks
2. Track expenses, resource utilization, and ROI
3. Create financial forecasts, reports, and dashboards
4. Identify cost saving opportunities and optimizations
5. Provide data-driven recommendations for investment decisions

AVAILABLE TOOLS:
- kb_search / kb_read: Research financial data and trends
- siyuan_get_doc: Read project requirements and specs
- siyuan_create_doc: Document financial reports and analyses
- agency_delegate_task: Request cost estimates from production or rd

Focus on accuracy and data-driven decisions. Always provide evidence for recommendations.`,
  },
};

// ─── Chat Worker Class ───────────────────────────────────────

export class ChatWorker {
  private redis: RedisClientType | null = null;
  private connected = false;
  private llm: LLMClient;
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private supervisor: Supervisor;
  private running = false;
  private workerId: string;
  private pollTimer: NodeJS.Timeout | null = null;
  private processing = false;
  private consecutiveFailures = 0;

  constructor(
    toolRouter: ToolRouter,
    memory: MemoryStore,
    supervisor: Supervisor,
  ) {
    this.workerId = `chat-worker-${Date.now()}`;
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.supervisor = supervisor;
    this.llm = new LLMClient();
  }

  async connect(): Promise<void> {
    try {
      this.redis = createClient({ url: REDIS_URL });
      this.redis.on("error", (err) => {
        console.error(`[ChatWorker] Redis error:`, err.message);
        this.connected = false;
      });
      this.redis.on("connect", () => {
        console.log(`[ChatWorker] Connected to Redis`);
        this.connected = true;
      });
      await this.redis.connect();
    } catch (err: any) {
      console.warn(`[ChatWorker] Redis unavailable:`, err.message);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.stop();
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.connected = false;
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[ChatWorker] Started (workerId=${this.workerId})`);
    this.pollTimer = setInterval(() => this.poll(), 500); // Poll every 500ms
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log(`[ChatWorker] Stopped`);
  }

  // ─── Poll Redis Queue ──────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running || this.processing || !this.connected || !this.redis) return;

    this.processing = true;
    try {
      // Check circuit breaker first
      const cb = this.supervisor.checkCircuitBreaker("chat-worker");
      if (!cb.allowed) {
        this.processing = false;
        return;
      }

      // Pop message from queue
      const result = await this.redis.brPop(CHAT_QUEUE_KEY, 1);
      if (!result) {
        this.processing = false;
        return;
      }

      const task = JSON.parse(result.element);
      await this.processMessage(task);

      // Record success — reset circuit breaker
      this.consecutiveFailures = 0;
      this.supervisor.recordCircuitSuccess("chat-worker");
      this.supervisor.recordHeartbeat(this.workerId, "chat-worker", "alive");
    } catch (err: any) {
      this.consecutiveFailures++;
      this.supervisor.recordFailure(this.workerId);
      this.supervisor.recordCircuitFailure("chat-worker");
      console.error(`[ChatWorker] Poll error:`, err.message);
    } finally {
      this.processing = false;
    }
  }

  // ─── Process a Chat Message ────────────────────────────────

  private async processMessage(task: {
    sessionId: string;
    message: string;
    agent: string;
    language: string;
    timestamp: number;
  }): Promise<void> {
    const { sessionId, message, agent, language } = task;
    // Ensure session exists in memory
    if (!this.memory.getSession(sessionId)) {
      this.memory.createSessionWithId(sessionId, agent, "default");
    }
    console.log(`[ChatWorker] Processing ${agent}: "${message.slice(0, 50)}..."`);

    try {
      // Check for loop detection
      const loopResult = this.supervisor.checkLoop("chat-worker", sessionId, message);
      if (loopResult && loopResult.action === "pause") {
        // Send loop detection response
        await this.publishResponse(sessionId, {
          response: "⚠️ I detected that we're going in circles. Let me take a step back and approach this differently. Could you rephrase or clarify what you're looking for?",
          agent,
          toolResults: [{ tool: "supervisor", result: { loopDetected: true, repeatCount: loopResult.repeatCount } }],
        });
        this.supervisor.clearLoopCounter("chat-worker", sessionId);
        return;
      }

      // Try LLM mode first
      const llmConfigured = this.llm.isConfigured();
      if (llmConfigured) {
        await this.processWithLLM(sessionId, message, agent, language);
      } else {
        await this.processWithRules(sessionId, message, agent);
      }
    } catch (err: any) {
      console.error(`[ChatWorker] Process error:`, err.message);
      // Fallback to rule-based on error
      try {
        await this.processWithRules(sessionId, message, agent);
      } catch {
        await this.publishResponse(sessionId, {
          response: `I encountered an error processing your request. Please try again.`,
          agent,
          toolResults: [{ tool: "error", result: err.message }],
        });
      }
    }
  }

  // ─── LLM Mode ──────────────────────────────────────────────

  private async processWithLLM(
    sessionId: string,
    message: string,
    agent: string,
    language: string,
  ): Promise<void> {
    const agentConfig = AGENT_PROMPTS[agent] || AGENT_PROMPTS.rd;
    const tools = this.toolRouter.getTools();

    // Build tool definitions
    const toolDefs = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    // Get conversation history from memory
    const history = this.memory.getConversationContext(sessionId, 20);

    // Build messages
    const llmMessages: LLMMessage[] = [
      { role: "system", content: agentConfig.systemPrompt },
      ...history.map((m: any) => ({
        role: m.role as LLMMessage["role"],
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // Add language instruction
    if (language === "th") {
      llmMessages.push({
        role: "system",
        content: "Please respond in Thai language unless the user asks otherwise.",
      });
    }

    const response = await this.llm.chat(llmMessages, toolDefs, {
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "4096", 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.3"),
    });

    // Execute any tool calls
    const toolResults: any[] = [];
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        try {
          const result = await this.toolRouter.executeTool(tc.name, tc.args);
          toolResults.push({ tool: tc.name, args: tc.args, result });
        } catch (err: any) {
          toolResults.push({ tool: tc.name, args: tc.args, error: err.message });
        }
      }
    }

    const reply = response.content || "I processed your request but couldn't generate a response.";

    // Store in memory
    this.memory.addMessage(sessionId, "user", message);
    this.memory.addMessage(sessionId, "assistant", reply, {
      toolResults: JSON.stringify(toolResults),
    });

    // Publish response
    await this.publishResponse(sessionId, {
      response: reply,
      agent,
      toolResults,
    });

    // Clear loop counter on successful LLM response
    this.supervisor.clearLoopCounter("chat-worker", sessionId);
  }

  // ─── Rule-based Fallback ───────────────────────────────────

  private async processWithRules(
    sessionId: string,
    message: string,
    agent: string,
  ): Promise<void> {
    const msg = message.toLowerCase();
    const agentConfig = AGENT_PROMPTS[agent] || AGENT_PROMPTS.rd;
    let response = "";
    const toolResults: any[] = [];

    if (msg.includes("hello") || msg.includes("hi") || msg.includes("สวัสดี")) {
      response = `Hello! I am the **${agentConfig.name} Agent** (${agentConfig.role}). How can I help you today?`;
    } else if (msg.includes("tool") || msg.includes("what can you do") || msg.includes("help")) {
      const tools = this.toolRouter.getTools();
      response = `I am the **${agentConfig.name} Agent**. I have access to the following tools:\n\n` +
        tools.map((t) => `  - **${t.name}**: ${t.description}`).join("\n");
    } else if (msg.includes("research") || msg.includes("search") || msg.includes("find") || msg.includes("ค้นหา")) {
      response = `Let me research that for you. I'll search the knowledge base and explore available information.`;
      // Try a knowledge base search
      try {
        const result = await this.toolRouter.executeTool("kb_search", { query: message });
        toolResults.push({ tool: "kb_search", result });
        if (result.success && result.data?.length > 0) {
          response += `\n\nI found ${result.data.length} relevant results in the knowledge base.`;
        }
      } catch {}
    } else if (msg.includes("status") || msg.includes("health") || msg.includes("สถานะ")) {
      try {
        const health = await this.toolRouter.executeTool("orchestrator_health", {});
        toolResults.push({ tool: "orchestrator_health", result: health.data });
        response = `**System Status:**\n\`\`\`json\n${JSON.stringify(health.data, null, 2)}\n\`\`\``;
      } catch {
        response = `I'm running but couldn't fetch system status.`;
      }
    } else if (msg.includes("delegate") || msg.includes("assign") || msg.includes("ส่งต่อ")) {
      response = `I can delegate tasks to other agents. Please tell me:\n1. Which agent should handle this? (brainstorm, production, design, marketing)\n2. What task needs to be done?\n3. Any specific requirements?`;
    } else {
      response = `I understand your message. As the **${agentConfig.name} Agent**, I can help you with:\n` +
        `- Researching topics and analyzing information\n` +
        `- Searching the knowledge base\n` +
        `- Checking system status\n` +
        `- Delegating tasks to other AI agents\n` +
        `- Answering questions about the system\n\n` +
        `*For full AI capabilities, please configure LLM_API_KEY in .env to enable DeepSeek.*`;
    }

    // Store in memory
    this.memory.addMessage(sessionId, "user", message);
    this.memory.addMessage(sessionId, "assistant", response, {
      toolResults: JSON.stringify(toolResults),
    });

    // Publish response
    await this.publishResponse(sessionId, {
      response,
      agent,
      toolResults,
    });
  }

  // ─── Publish Response to Redis ─────────────────────────────

  private async publishResponse(
    sessionId: string,
    data: { response: string; agent: string; toolResults: any[] },
  ): Promise<void> {
    if (!this.connected || !this.redis) return;

    const channel = `${CHAT_RESPONSE_PREFIX}${sessionId}`;
    await this.redis.publish(channel, JSON.stringify(data));

    // Also store the response with a TTL of 5 minutes (for polling fallback)
    await this.redis.setEx(`${channel}:data`, 300, JSON.stringify(data));
  }

  // ─── Push a Chat Message to the Queue ──────────────────────

  async pushMessage(
    sessionId: string,
    message: string,
    agent: string,
    language: string,
  ): Promise<boolean> {
    if (!this.connected || !this.redis) return false;

    const task = {
      sessionId,
      message,
      agent,
      language,
      timestamp: Date.now(),
    };

    await this.redis.lPush(CHAT_QUEUE_KEY, JSON.stringify(task));
    return true;
  }

  // ─── Wait for Response (used by Chat API) ─────────────────

  async waitForResponse(
    sessionId: string,
    timeoutMs: number = 30000,
  ): Promise<{ response: string; agent: string; toolResults: any[] } | null> {
    if (!this.connected || !this.redis) return null;

    const channel = `${CHAT_RESPONSE_PREFIX}${sessionId}`;

    // First check if response already exists
    const existing = await this.redis.get(`${channel}:data`);
    if (existing) {
      return JSON.parse(existing);
    }

    // Subscribe and wait for response
    return new Promise((resolve) => {
      const subscriber = this.redis!.duplicate();
      subscriber.connect().then(() => {
        subscriber.subscribe(channel, (message) => {
          subscriber.quit().catch(() => {});
          resolve(JSON.parse(message));
        });
      });

      // Timeout
      setTimeout(() => {
        subscriber.quit().catch(() => {});
        resolve(null);
      }, timeoutMs);
    });
  }
}
