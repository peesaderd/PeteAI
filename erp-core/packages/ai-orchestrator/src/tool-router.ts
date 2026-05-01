// ============================================================
// Tool Router - Routes tool calls to ERP Core MCP Server
// Also provides local tools for memory, session management, etc.
// ============================================================

import { MemoryStore } from "./memory.js";

const ERP_MCP_URL =
  process.env.ERP_MCP_URL || "http://localhost:54510/api/mcp";
const AGENCY_API_URL =
  process.env.AGENCY_API_URL || "http://localhost:54515";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  category: "erp" | "agency" | "memory" | "orchestrator";
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  fromCache?: boolean;
}

export class ToolRouter {
  private memory: MemoryStore;
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(memory: MemoryStore) {
    this.memory = memory;
    this.registerLocalTools();
  }

  private registerLocalTools() {
    // Memory tools
    this.registerTool({
      name: "memory_create_session",
      description: "Create a new conversation session for an agent",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Agent identifier" },
          tenantId: { type: "string", description: "Tenant identifier" },
          title: { type: "string", description: "Session title" },
        },
        required: ["agentId", "tenantId"],
      },
      category: "memory",
    });

    this.registerTool({
      name: "memory_get_context",
      description: "Get conversation history for a session",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID" },
          maxMessages: {
            type: "number",
            description: "Max messages to return",
          },
        },
        required: ["sessionId"],
      },
      category: "memory",
    });

    this.registerTool({
      name: "memory_add_message",
      description: "Add a message to a session",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Session ID" },
          role: {
            type: "string",
            enum: ["user", "assistant", "tool", "system"],
          },
          content: { type: "string" },
        },
        required: ["sessionId", "role", "content"],
      },
      category: "memory",
    });

    this.registerTool({
      name: "memory_get_state",
      description: "Get agent state by key",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          tenantId: { type: "string" },
          key: { type: "string" },
        },
        required: ["agentId", "tenantId", "key"],
      },
      category: "memory",
    });

    this.registerTool({
      name: "memory_set_state",
      description: "Set agent state",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string" },
          tenantId: { type: "string" },
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["agentId", "tenantId", "key", "value"],
      },
      category: "memory",
    });

    // Agency tools
    this.registerTool({
      name: "agency_list_agents",
      description: "List all registered AI agents in the Agency Team",
      inputSchema: {
        type: "object",
        properties: {},
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_create_task",
      description: "Create a task for an AI agent in the Agency Team",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          sourceRole: { type: "string" },
          targetRole: {
            type: "string",
            enum: ["rd", "brainstorm", "production", "design", "marketing"],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          inputData: { type: "object" },
        },
        required: ["tenantId", "title", "sourceRole", "targetRole"],
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_get_task",
      description: "Get task details and status",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
        },
        required: ["taskId"],
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_list_tasks",
      description: "List tasks with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string" },
          targetRole: { type: "string" },
          limit: { type: "number" },
        },
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_get_pending_approvals",
      description: "Get tasks awaiting human approval",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
        },
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_approve_task",
      description: "Approve a task (human-in-the-loop)",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          approvedBy: { type: "string" },
        },
        required: ["taskId"],
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_reject_task",
      description: "Reject a task (human-in-the-loop)",
      inputSchema: {
        type: "object",
        properties: {
          taskId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["taskId"],
      },
      category: "agency",
    });

    // Orchestrator tools
    this.registerTool({
      name: "orchestrator_health",
      description: "Check orchestrator health and connected services",
      inputSchema: {
        type: "object",
        properties: {},
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "orchestrator_list_tools",
      description: "List all available tools across all categories",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["erp", "agency", "memory", "orchestrator"],
          },
        },
      },
      category: "orchestrator",
    });
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTools(category?: string): ToolDefinition[] {
    const all = Array.from(this.tools.values());
    if (category) return all.filter((t) => t.category === category);
    return all;
  }

  async executeTool(
    toolName: string,
    args: any
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    try {
      switch (tool.category) {
        case "memory":
          return await this.executeMemoryTool(toolName, args);
        case "agency":
          return await this.executeAgencyTool(toolName, args);
        case "orchestrator":
          return await this.executeOrchestratorTool(toolName, args);
        case "erp":
          return await this.executeErpTool(toolName, args);
        default:
          return { success: false, error: `Unknown category: ${tool.category}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private async executeMemoryTool(
    toolName: string,
    args: any
  ): Promise<ToolResult> {
    switch (toolName) {
      case "memory_create_session": {
        const session = this.memory.createSession(
          args.agentId,
          args.tenantId,
          args.title
        );
        return { success: true, data: session };
      }
      case "memory_get_context": {
        const messages = this.memory.getConversationContext(
          args.sessionId,
          args.maxMessages || 20
        );
        return { success: true, data: messages };
      }
      case "memory_add_message": {
        const msg = this.memory.addMessage(
          args.sessionId,
          args.role,
          args.content
        );
        return { success: true, data: msg };
      }
      case "memory_get_state": {
        const value = this.memory.getAgentState(
          args.agentId,
          args.tenantId,
          args.key
        );
        return { success: true, data: { key: args.key, value } };
      }
      case "memory_set_state": {
        this.memory.setAgentState(
          args.agentId,
          args.tenantId,
          args.key,
          args.value
        );
        return { success: true, data: { key: args.key, value: args.value } };
      }
      default:
        return { success: false, error: `Unknown memory tool: ${toolName}` };
    }
  }

  private async executeAgencyTool(
    toolName: string,
    args: any
  ): Promise<ToolResult> {
    const agencyUrl = AGENCY_API_URL;

    switch (toolName) {
      case "agency_list_agents": {
        const res = await fetch(`${agencyUrl}/api/agents`);
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_create_task": {
        const res = await fetch(`${agencyUrl}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: args.tenantId,
            title: args.title,
            description: args.description || "",
            sourceRole: args.sourceRole,
            targetRole: args.targetRole,
            priority: args.priority || "medium",
            inputData: args.inputData || {},
          }),
        });
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_get_task": {
        const res = await fetch(`${agencyUrl}/api/tasks/${args.taskId}`);
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_list_tasks": {
        const params = new URLSearchParams();
        if (args.status) params.set("status", args.status);
        if (args.targetRole) params.set("target_role", args.targetRole);
        if (args.limit) params.set("limit", String(args.limit));
        const res = await fetch(
          `${agencyUrl}/api/tasks?${params.toString()}`
        );
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_get_pending_approvals": {
        const params = new URLSearchParams();
        if (args.tenantId) params.set("tenant_id", args.tenantId);
        const res = await fetch(
          `${agencyUrl}/api/approvals?${params.toString()}`
        );
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_approve_task": {
        const res = await fetch(
          `${agencyUrl}/api/tasks/${args.taskId}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              approvedBy: args.approvedBy || "orchestrator",
            }),
          }
        );
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "agency_reject_task": {
        const res = await fetch(
          `${agencyUrl}/api/tasks/${args.taskId}/reject`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              approvedBy: args.approvedBy || "orchestrator",
              reason: args.reason || "Rejected by orchestrator",
            }),
          }
        );
        if (!res.ok) throw new Error(`Agency API error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      default:
        return {
          success: false,
          error: `Unknown agency tool: ${toolName}`,
        };
    }
  }

  private async executeOrchestratorTool(
    toolName: string,
    _args: any
  ): Promise<ToolResult> {
    switch (toolName) {
      case "orchestrator_health": {
        // Check ERP Core health
        let erpStatus = "unknown";
        try {
          const res = await fetch(
            `${ERP_MCP_URL.replace("/api/mcp", "/api/health")}`
          );
          erpStatus = res.ok ? "connected" : "error";
        } catch {
          erpStatus = "unreachable";
        }

        // Check Agency Team health
        let agencyStatus = "unknown";
        try {
          const res = await fetch(`${AGENCY_API_URL}/health`);
          agencyStatus = res.ok ? "connected" : "error";
        } catch {
          agencyStatus = "unreachable";
        }

        return {
          success: true,
          data: {
            status: "ok",
            services: {
              erp: erpStatus,
              agency: agencyStatus,
            },
            tools: this.tools.size,
            timestamp: Date.now(),
          },
        };
      }
      case "orchestrator_list_tools": {
        const tools = this.getTools(_args.category);
        return {
          success: true,
          data: tools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            inputSchema: t.inputSchema,
          })),
        };
      }
      default:
        return {
          success: false,
          error: `Unknown orchestrator tool: ${toolName}`,
        };
    }
  }

  private async executeErpTool(
    toolName: string,
    args: any
  ): Promise<ToolResult> {
    // Check cache first
    const cached = this.memory.getCachedToolResult(toolName, args);
    if (cached) {
      return { success: true, data: JSON.parse(cached), fromCache: true };
    }

    // Forward to ERP Core MCP endpoint
    const res = await fetch(ERP_MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolName, args }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ERP MCP error (${res.status}): ${text}`);
    }

    const data = await res.json();

    // Cache successful reads (not mutations)
    const readTools = [
      "list_products",
      "get_product",
      "list_orders",
      "get_order",
      "get_inventory",
      "list_customers",
      "get_customer",
      "get_finance_summary",
      "list_transactions",
      "list_production_orders",
      "get_sales_report",
      "get_inventory_report",
      "get_dashboard_summary",
      "get_product_performance",
      "get_sales_trends",
      "get_channel_breakdown",
      "get_top_products",
      "get_etsy_analytics",
      "list_kb_collections",
      "list_kb_documents",
      "get_kb_document",
      "kb_search",
    ];
    if (readTools.includes(toolName) && data) {
      this.memory.cacheToolResult(toolName, args, JSON.stringify(data));
    }

    return { success: true, data };
  }
}
