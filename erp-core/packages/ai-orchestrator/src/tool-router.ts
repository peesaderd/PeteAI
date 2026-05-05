// ============================================================
// Tool Router - Routes tool calls to ERP Core MCP Server
// Also provides local tools for memory, session management, etc.
// ============================================================

import { MemoryStore } from "./memory.js";
import { execSync } from "child_process";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const ERP_MCP_URL =
  process.env.ERP_MCP_URL || "http://localhost:54510/api/mcp";
const AGENCY_API_URL =
  process.env.AGENCY_API_URL || "http://localhost:54515";
// ─── Simple TTL Cache ─────────────────────────────────────────
interface CacheEntry {
  data: any;
  expiresAt: number;
}

class TTLCache {
  private store = new Map<string, CacheEntry>();
  private defaultTTL: number;

  constructor(defaultTTLMs = 5 * 60 * 1000) {
    this.defaultTTL = defaultTTLMs;
  }

  get(key: string): { data: any; fromCache: boolean } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { data: entry.data, fromCache: true };
  }

  set(key: string, data: any, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.defaultTTL),
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

const TASK_MANAGER_URL =
  process.env.TASK_MANAGER_URL || "http://task-manager:8081";

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
  private cache = new TTLCache();
  private siyuanCache = new TTLCache(5 * 60 * 1000); // 5 min TTL for SiYuan docs
  private memory: MemoryStore;
  private tools: Map<string, ToolDefinition> = new Map();
  private _agentLoop: any = null;

  set agentLoop(loop: any) {
    this._agentLoop = loop;
  }

  get agentLoop(): any {
    return this._agentLoop;
  }

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
    // ============================================================
    // ERP SQLite Tools (direct database access)
    // ============================================================
    this.registerTool({
      name: "erp_list_products",
      description: "List products with optional filters (category, status, search). Returns id, name, sku, price, quantity, status.",
      inputSchema: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "Filter by category ID" },
          status: { type: "string", enum: ["active", "inactive", "discontinued"], description: "Filter by status" },
          search: { type: "string", description: "Search by name or SKU" },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_get_product",
      description: "Get detailed product info by ID including current stock quantity",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product ID" },
        },
        required: ["product_id"],
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_get_order",
      description: "Get order details by ID including items, customer info, and status",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID" },
        },
        required: ["order_id"],
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_list_orders",
      description: "List orders with optional filters (status, customer)",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (pending, confirmed, shipped, delivered, cancelled)" },
          customer_name: { type: "string", description: "Filter by customer name" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_get_inventory",
      description: "Get inventory status. Returns current stock, low stock threshold, and alerts for items below threshold.",
      inputSchema: {
        type: "object",
        properties: {
          low_stock_only: { type: "boolean", description: "Show only products below low stock threshold" },
          product_id: { type: "string", description: "Specific product ID (optional)" },
        },
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_create_invoice",
      description: "Create a new invoice for a customer with line items",
      inputSchema: {
        type: "object",
        properties: {
          tenant_id: { type: "string", description: "Tenant ID" },
          customer_name: { type: "string", description: "Customer name" },
          customer_email: { type: "string", description: "Customer email" },
          items: {
            type: "array",
            description: "Invoice line items",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: "number" },
                quantity: { type: "integer" },
              },
              required: ["description", "amount", "quantity"],
            },
          },
          due_date: { type: "number", description: "Due date (unix timestamp)" },
        },
        required: ["tenant_id", "customer_name", "items"],
      },
      category: "erp",
    });
    this.registerTool({
      name: "erp_get_dashboard",
      description: "Get ERP dashboard summary: total products, total orders, low stock count, recent orders",
      inputSchema: {
        type: "object",
        properties: {},
      },
      category: "erp",
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

    this.registerTool({
      name: "agency_delegate_task",
      description: "Delegate a subtask to another AI agent with full context. Use when your task requires skills from another agent (e.g., R&D delegates prototype to Production, or Brainstorm delegates execution to Production).",
      inputSchema: {
        type: "object",
        properties: {
          sourceAgent: { type: "string", description: "Your agent name (the delegator)" },
          targetAgent: {
            type: "string",
            enum: ["rd", "brainstorm", "production", "design", "marketing"],
            description: "Target agent to delegate to",
          },
          title: { type: "string", description: "Title of the delegated subtask" },
          description: { type: "string", description: "Detailed description of what needs to be done" },
          contextData: {
            type: "object",
            description: "Context data to pass (findings, specs, results, etc.)",
          },
          parentTaskId: { type: "string", description: "Original task ID if applicable" },
        },
        required: ["sourceAgent", "targetAgent", "title", "description"],
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_list_delegations",
      description: "List delegations sent/received by an agent",
      inputSchema: {
        type: "object",
        properties: {
          sourceAgent: { type: "string", description: "Filter by source agent" },
          targetAgent: { type: "string", description: "Filter by target agent" },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "rejected"], description: "Filter by status" },
        },
      },
      category: "agency",
    });

    this.registerTool({
      name: "agency_respond_delegation",
      description: "Respond to a delegation (mark as completed or rejected with results)",
      inputSchema: {
        type: "object",
        properties: {
          delegationId: { type: "string", description: "Delegation ID to respond to" },
          status: { type: "string", enum: ["completed", "rejected"], description: "Response status" },
          resultData: { type: "object", description: "Results or output data from the delegated work" },
        },
        required: ["delegationId", "status"],
      },
      category: "agency",
    });

    // Task Manager tools
    this.registerTool({
      name: "task_manager_list_projects",
      description: "List all projects from Task Manager",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string", description: "Tenant ID (default: erp-core)" },
          status: { type: "string", description: "Filter by status (planning, active, on_hold, completed, cancelled)" },
          limit: { type: "number", description: "Max results" },
        },
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_create_project",
      description: "Create a new project in Task Manager",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string", description: "Tenant ID (default: erp-core)" },
          name: { type: "string", description: "Project name" },
          description: { type: "string", description: "Project description" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority" },
          dueDate: { type: "number", description: "Due date (unix timestamp)" },
        },
        required: ["name"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_get_project",
      description: "Get project details with all tasks",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["projectId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_update_project",
      description: "Update a project",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["planning", "active", "on_hold", "completed", "cancelled"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["projectId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_delete_project",
      description: "Delete a project and all its tasks",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["projectId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_list_tasks",
      description: "List tasks with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string", description: "Filter by project" },
          status: { type: "string", description: "Filter by status (todo, in_progress, review, done, cancelled)" },
          assignee: { type: "string", description: "Filter by assignee" },
          limit: { type: "number" },
        },
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_create_task",
      description: "Create a new task in Task Manager",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string", description: "Optional: assign to a project" },
          title: { type: "string", description: "Task title" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          assignee: { type: "string", description: "Who is responsible" },
          estimatedHours: { type: "number" },
          dueDate: { type: "number", description: "Due date (unix timestamp)" },
        },
        required: ["title"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_get_task",
      description: "Get task details with comments and dependencies",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          taskId: { type: "string" },
        },
        required: ["taskId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_update_task",
      description: "Update a task (status, assignee, priority, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          taskId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["todo", "in_progress", "review", "done", "cancelled"] },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          assignee: { type: "string" },
          estimatedHours: { type: "number" },
          actualHours: { type: "number" },
          dueDate: { type: "number" },
        },
        required: ["taskId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_delete_task",
      description: "Delete a task",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          taskId: { type: "string" },
        },
        required: ["taskId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_get_timeline",
      description: "Get project timeline with task progress summary",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          projectId: { type: "string" },
        },
        required: ["projectId"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "task_manager_add_comment",
      description: "Add a comment to a task",
      inputSchema: {
        type: "object",
        properties: {
          tenantId: { type: "string" },
          taskId: { type: "string" },
          author: { type: "string" },
          content: { type: "string" },
        },
        required: ["taskId", "author", "content"],
      },
      category: "orchestrator",
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

    // ============================================================
    // Autonomous Agent Tools - let agents probe/execute APIs
    // ============================================================

    this.registerTool({
      name: "http_request",
      description: "Send an HTTP request to any endpoint. Use this to probe APIs, fetch data, or call external services.",
      inputSchema: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method" },
          url: { type: "string", description: "Full URL (e.g. http://localhost:54511/api/...)" },
          headers: { type: "object", description: "Optional HTTP headers as key-value pairs" },
          body: { type: "object", description: "Optional JSON body for POST/PUT/PATCH" },
          timeout: { type: "number", description: "Request timeout in ms (default: 10000)" },
        },
        required: ["method", "url"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "execute_command",
      description: "Execute a bash command on the server. Use this to run scripts, inspect files, or automate tasks.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "Bash command to execute" },
          timeout: { type: "number", description: "Command timeout in ms (default: 15000)" },
          workdir: { type: "string", description: "Working directory (default: /root)" },
        },
        required: ["command"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "siyuan_get_doc",
      description: "Get a SiYuan document content by block ID. Uses /api/block/getBlockDOM internally.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Block/document ID" },
        },
        required: ["id"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "siyuan_create_doc",
      description: "Create a new document in SiYuan under the specified notebook.",
      inputSchema: {
        type: "object",
        properties: {
          notebookId: { type: "string", description: "Notebook ID" },
          title: { type: "string", description: "Document title" },
          content: { type: "string", description: "Optional initial content (Markdown)" },
        },
        required: ["notebookId", "title"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "siyuan_append_doc",
      description: "Append content to an existing SiYuan document.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Block/document ID to append to" },
          content: { type: "string", description: "Content to append (Markdown)" },
        },
        required: ["id", "content"],
      },
      category: "orchestrator",
    });

    this.registerTool({
      name: "siyuan_search_docs",
      description: "Search SiYuan documents by keyword. Returns matching doc titles and IDs ranked by relevance.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Search keyword or phrase" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["keyword"],
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
          return await this.executeErpSqlTool(toolName, args);
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
      case "agency_delegate_task": {
        if (!this.agentLoop) {
          return { success: false, error: "AgentLoop not available for delegation" };
        }
        const delegation = this.agentLoop.createDelegation({
          sourceAgent: args.sourceAgent,
          targetAgent: args.targetAgent,
          title: args.title,
          description: args.description,
          contextData: args.contextData,
          parentTaskId: args.parentTaskId,
        });
        return {
          success: true,
          data: {
            delegationId: delegation.id,
            status: delegation.status,
            targetAgent: delegation.targetAgent,
            title: delegation.title,
          },
        };
      }
      case "agency_list_delegations": {
        if (!this.agentLoop) {
          return { success: false, error: "AgentLoop not available" };
        }
        const delegations = this.agentLoop.listDelegations({
          sourceAgent: args.sourceAgent,
          targetAgent: args.targetAgent,
          status: args.status,
        });
        return { success: true, data: delegations };
      }
      case "agency_respond_delegation": {
        if (!this.agentLoop) {
          return { success: false, error: "AgentLoop not available" };
        }
        const result = this.agentLoop.respondToDelegation(
          args.delegationId,
          args.status,
          args.resultData
        );
        if (!result) {
          return { success: false, error: `Delegation ${args.delegationId} not found` };
        }
        return { success: true, data: result };
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
      case "http_request": {
        const { method, url, headers, body, timeout } = _args;
        if (!url) throw new Error("url is required");
        const fetchOpts: any = { method: method || "GET", headers: headers || {} };
        if (body && method !== "GET") {
          fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
          if (!fetchOpts.headers["Content-Type"]) {
            fetchOpts.headers["Content-Type"] = "application/json";
          }
        }
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeout || 10000);
        try {
          const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
          const text = await res.text();
          let data: any;
          try { data = JSON.parse(text); } catch { data = text; }
          return { success: res.ok, data };
        } finally {
          clearTimeout(t);
        }
      }
      case "execute_command": {
        const { command, timeout, workdir } = _args;
        if (!command) throw new Error("command is required");
        const output = execSync(command, {
          timeout: timeout || 15000,
          cwd: workdir || "/root",
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        return { success: true, data: output };
      }
      case "siyuan_get_doc": {
        const { id } = _args;
        if (!id) throw new Error("id is required");
        // Check cache first
        const cacheKey = "siyuan_get_doc:" + id;
        const cached = this.siyuanCache.get(cacheKey);
        if (cached) return { success: true, data: cached.data, fromCache: true };
        const siyuanUrl = process.env.SIYUAN_URL || "http://siyuan:54511";
        const siyuanToken = process.env.SIYUAN_TOKEN || "";
        const res = await fetch(`${siyuanUrl}/api/block/getBlockDOM`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${siyuanToken}`,
          },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        const result = { success: res.ok, data };
        // Cache for 5 minutes
        this.siyuanCache.set(cacheKey, result);
        return result;
      }
      case "siyuan_create_doc": {
        const { notebookId, title, content } = _args;
        if (!notebookId || !title) throw new Error("notebookId and title are required");
        const siyuanUrl2 = process.env.SIYUAN_URL || "http://siyuan:54511";
        const siyuanToken2 = process.env.SIYUAN_TOKEN || "";
        const res2 = await fetch(`${siyuanUrl2}/api/filetree/createDocWithMd`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${siyuanToken2}`,
          },
          body: JSON.stringify({ notebook: notebookId, path: "/" + title, markdown: content || "" }),
        });
        const data2 = await res2.json();
        return { success: res2.ok, data: data2 };
      }
      case "siyuan_append_doc": {
        const { id: blockId, content: appendContent } = _args;
        if (!blockId || !appendContent) throw new Error("id and content are required");
        const siyuanUrl3 = process.env.SIYUAN_URL || "http://siyuan:54511";
        const siyuanToken3 = process.env.SIYUAN_TOKEN || "";
        const res3 = await fetch(`${siyuanUrl3}/api/block/appendBlock`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Token ${siyuanToken3}`,
          },
          body: JSON.stringify({ parentID: blockId, data: appendContent, domain: 0 }),
        });
        const data3 = await res3.json();
        return { success: res3.ok, data: data3 };
      }
      case "siyuan_search_docs": {
        const { keyword, limit = 5 } = _args;
        if (!keyword) throw new Error("keyword is required");
        // Check cache first
        const cacheKey = "siyuan_search:" + keyword.toLowerCase();
        const cached = this.siyuanCache.get(cacheKey);
        if (cached) return { success: true, data: cached.data, fromCache: true };
        // Use Knowledge Base API (synced from SiYuan) instead of direct SiYuan SQL
        const kbUrl = process.env.KB_URL || "http://localhost:3100";
        try {
          const searchRes = await fetch(`${kbUrl}/api/search?q=${encodeURIComponent(keyword)}&limit=${limit}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          if (!searchRes.ok) throw new Error(`KB search failed: ${searchRes.status}`);
          const searchData = await searchRes.json();
          // Get full content for each result
          const docs = await Promise.all((searchData || []).slice(0, limit).map(async (doc: any) => {
            try {
              const docRes = await fetch(`${kbUrl}/api/documents/${doc.id}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
              });
              if (docRes.ok) {
                const docData = await docRes.json();
                return {
                  id: doc.id,
                  title: doc.title,
                  content: (docData.content || "").slice(0, 500),
                  tags: JSON.parse(doc.tags || "[]"),
                  updated: doc.updated_at,
                  relevance: 1.0,
                };
              }
            } catch {}
            return { id: doc.id, title: doc.title, content: "", tags: [], relevance: 0.5 };
          }));
          const result = { success: true, data: docs };
          this.siyuanCache.set(cacheKey, result, 2 * 60 * 1000); // 2 min TTL
          return result;
        } catch (err: any) {
          // Fallback: try direct SiYuan filetree search
          try {
            const siyuanUrl4 = process.env.SIYUAN_URL || "http://siyuan:54511";
            const siyuanToken4 = process.env.SIYUAN_TOKEN || "";
            const fallbackRes = await fetch(`${siyuanUrl4}/api/filetree/listDocTree`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Token ${siyuanToken4}`,
              },
              body: JSON.stringify({ notebook: _args.notebookId || "" }),
            });
            const fallbackData = await fallbackRes.json();
            const docs = (fallbackData.data || []).filter((d: any) =>
              d.title && d.title.toLowerCase().includes(keyword.toLowerCase())
            ).slice(0, limit).map((d: any) => ({
              id: d.id,
              title: d.title,
              content: "",
              tags: [],
              relevance: 1.0,
            }));
            const result = { success: true, data: docs };
            this.siyuanCache.set(cacheKey, result);
            return result;
          } catch (fallbackErr: any) {
            return { success: false, error: `Search failed: ${err.message}, fallback also failed: ${fallbackErr.message}` };
          }
        }
      }
      // ============================================================
      // Task Manager tools
      // ============================================================
      case "task_manager_list_projects": {
        const params = new URLSearchParams();
        params.set("tenant_id", _args.tenantId || "erp-core");
        if (_args.status) params.set("status", _args.status);
        if (_args.limit) params.set("limit", String(_args.limit));
        const res = await fetch(`${TASK_MANAGER_URL}/api/projects?${params.toString()}`);
        if (!res.ok) throw new Error(`Task Manager error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "task_manager_create_project": {
        const res = await fetch(`${TASK_MANAGER_URL}/api/projects?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: _args.name,
            description: _args.description || "",
            priority: _args.priority || "medium",
            dueDate: _args.dueDate || null,
          }),
        });
        if (!res.ok) throw new Error(`Task Manager error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "task_manager_get_project": {
        const res = await fetch(`${TASK_MANAGER_URL}/api/projects/${_args.projectId}?tenant_id=${_args.tenantId || "erp-core"}`);
        if (!res.ok) throw new Error(`Task Manager error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "task_manager_update_project": {
        const res = await fetch(`${TASK_MANAGER_URL}/api/projects/${_args.projectId}?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: _args.name,
            description: _args.description,
            status: _args.status,
            priority: _args.priority,
          }),
        });
        if (!res.ok) throw new Error(`Task Manager error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "task_manager_delete_project": {
        const res = await fetch(`${TASK_MANAGER_URL}/api/projects/${_args.projectId}?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`Task Manager error: ${res.status}`);
        const data = await res.json();
        return { success: true, data };
      }
      case "task_manager_list_tasks": {
        const params2 = new URLSearchParams();
        params2.set("tenant_id", _args.tenantId || "erp-core");
        if (_args.projectId) params2.set("project_id", _args.projectId);
        if (_args.status) params2.set("status", _args.status);
        if (_args.assignee) params2.set("assignee", _args.assignee);
        if (_args.limit) params2.set("limit", String(_args.limit));
        const res2 = await fetch(`${TASK_MANAGER_URL}/api/tasks?${params2.toString()}`);
        if (!res2.ok) throw new Error(`Task Manager error: ${res2.status}`);
        const data2 = await res2.json();
        return { success: true, data: data2 };
      }
      case "task_manager_create_task": {
        const res3 = await fetch(`${TASK_MANAGER_URL}/api/tasks?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: _args.projectId || null,
            title: _args.title,
            description: _args.description || "",
            priority: _args.priority || "medium",
            assignee: _args.assignee || "",
            estimatedHours: _args.estimatedHours || null,
            dueDate: _args.dueDate || null,
          }),
        });
        if (!res3.ok) throw new Error(`Task Manager error: ${res3.status}`);
        const data3 = await res3.json();
        return { success: true, data: data3 };
      }
      case "task_manager_get_task": {
        const res4 = await fetch(`${TASK_MANAGER_URL}/api/tasks/${_args.taskId}?tenant_id=${_args.tenantId || "erp-core"}`);
        if (!res4.ok) throw new Error(`Task Manager error: ${res4.status}`);
        const data4 = await res4.json();
        return { success: true, data: data4 };
      }
      case "task_manager_update_task": {
        const res5 = await fetch(`${TASK_MANAGER_URL}/api/tasks/${_args.taskId}?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: _args.title,
            description: _args.description,
            status: _args.status,
            priority: _args.priority,
            assignee: _args.assignee,
            estimatedHours: _args.estimatedHours,
            actualHours: _args.actualHours,
            dueDate: _args.dueDate,
          }),
        });
        if (!res5.ok) throw new Error(`Task Manager error: ${res5.status}`);
        const data5 = await res5.json();
        return { success: true, data: data5 };
      }
      case "task_manager_delete_task": {
        const res6 = await fetch(`${TASK_MANAGER_URL}/api/tasks/${_args.taskId}?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "DELETE",
        });
        if (!res6.ok) throw new Error(`Task Manager error: ${res6.status}`);
        const data6 = await res6.json();
        return { success: true, data: data6 };
      }
      case "task_manager_get_timeline": {
        const res7 = await fetch(`${TASK_MANAGER_URL}/api/projects/${_args.projectId}/timeline?tenant_id=${_args.tenantId || "erp-core"}`);
        if (!res7.ok) throw new Error(`Task Manager error: ${res7.status}`);
        const data7 = await res7.json();
        return { success: true, data: data7 };
      }
      case "task_manager_add_comment": {
        const res8 = await fetch(`${TASK_MANAGER_URL}/api/tasks/${_args.taskId}/comments?tenant_id=${_args.tenantId || "erp-core"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            author: _args.author,
            content: _args.content,
          }),
        });
        if (!res8.ok) throw new Error(`Task Manager error: ${res8.status}`);
        const data8 = await res8.json();
        return { success: true, data: data8 };
      }
      // ERP SQLite Tools
      case "erp_list_products":
      case "erp_get_product":
      case "erp_get_order":
      case "erp_list_orders":
      case "erp_get_inventory":
      case "erp_create_invoice":
      case "erp_get_dashboard":
        return this.executeErpSqlTool(toolName, _args);
      default:
        return {
          success: false,
          error: `Unknown orchestrator tool: ${toolName}`,
        };
    }
  }

  private async executeErpSqlTool(
    toolName: string,
    args: any
  ): Promise<ToolResult> {
    try {
      const dbPath = process.env.ERP_DB_PATH || path.join(process.cwd(), "..", "..", "data", "erp-core.db");
      if (!fs.existsSync(dbPath)) {
        return { success: false, error: `ERP database not found at ${dbPath}` };
      }
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      let result: any;
      switch (toolName) {
        case "erp_list_products": {
          let sql = "SELECT id, name, sku, price, quantity, status, category_id, low_stock_threshold, description FROM products WHERE tenant_id = ?";
          const params: any[] = ["tenant_001"];
          if (args.category_id) { sql += " AND category_id = ?"; params.push(args.category_id); }
          if (args.status) { sql += " AND status = ?"; params.push(args.status); }
          if (args.search) { sql += " AND (name LIKE ? OR sku LIKE ?)"; params.push(`%${args.search}%`, `%${args.search}%`); }
          sql += " ORDER BY name ASC LIMIT ?";
          params.push(args.limit || 50);
          const rows = db.prepare(sql).all(...params);
          result = { products: rows, total: rows.length };
          break;
        }
        case "erp_get_product": {
          const row = db.prepare("SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?").get(args.product_id);
          if (!row) return { success: false, error: `Product ${args.product_id} not found` };
          result = { product: row };
          break;
        }
        case "erp_get_order": {
          const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(args.order_id);
          if (!order) return { success: false, error: `Order ${args.order_id} not found` };
          const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(args.order_id);
          result = { order, items };
          break;
        }
        case "erp_list_orders": {
          let sql = "SELECT id, order_number, customer_name, status, total, channel, created_at FROM orders WHERE tenant_id = ?";
          const params: any[] = ["tenant_001"];
          if (args.status) { sql += " AND status = ?"; params.push(args.status); }
          if (args.customer_name) { sql += " AND customer_name LIKE ?"; params.push(`%${args.customer_name}%`); }
          sql += " ORDER BY created_at DESC LIMIT ?";
          params.push(args.limit || 20);
          const rows = db.prepare(sql).all(...params);
          result = { orders: rows, total: rows.length };
          break;
        }
        case "erp_get_inventory": {
          if (args.product_id) {
            const row = db.prepare("SELECT id, name, sku, quantity, low_stock_threshold, price FROM products WHERE id = ?").get(args.product_id) as any;
            if (!row) return { success: false, error: `Product ${args.product_id} not found` };
            result = { product: row, is_low_stock: row.quantity <= row.low_stock_threshold };
          } else {
            let sql = "SELECT id, name, sku, quantity, low_stock_threshold, price FROM products WHERE tenant_id = ?";
            const params: any[] = ["tenant_001"];
            if (args.low_stock_only) { sql += " AND quantity <= low_stock_threshold"; }
            sql += " ORDER BY quantity ASC";
            const rows = db.prepare(sql).all(...params);
            const lowStock = rows.filter((r: any) => r.quantity <= r.low_stock_threshold);
            result = { products: rows, low_stock_count: lowStock.length, total_products: rows.length };
          }
          break;
        }
        case "erp_create_invoice": {
          const tenantId = args.tenant_id || "tenant_001";
          const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = Date.now();
          const dueDate = args.due_date || (now + 30 * 24 * 60 * 60 * 1000);
          const totalAmount = (args.items || []).reduce((sum: number, item: any) => sum + (item.amount * item.quantity), 0);
          db.prepare("INSERT INTO invoices (id, tenant_id, subscription_id, amount, currency, status, due_date, created_at) VALUES (?, ?, NULL, ?, 'THB', 'draft', ?, ?)").run(invoiceId, tenantId, totalAmount, dueDate, now);
          for (const item of (args.items || [])) {
            const lineId = `invl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            db.prepare("INSERT INTO invoice_lines (id, invoice_id, description, amount, quantity) VALUES (?, ?, ?, ?, ?)").run(lineId, invoiceId, item.description, item.amount, item.quantity || 1);
          }
          result = { invoice_id: invoiceId, amount: totalAmount, status: "draft", due_date: dueDate };
          break;
        }
        case "erp_get_dashboard": {
          const productCount: any = db.prepare("SELECT COUNT(*) as count FROM products WHERE tenant_id = ?").get("tenant_001");
          const orderCount: any = db.prepare("SELECT COUNT(*) as count FROM orders WHERE tenant_id = ?").get("tenant_001");
          const lowStock: any = db.prepare("SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND quantity <= low_stock_threshold").get("tenant_001");
          const recentOrders = db.prepare("SELECT id, order_number, customer_name, status, total, created_at FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5").all("tenant_001");
          const totalRevenue: any = db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE tenant_id = ? AND status IN ('shipped', 'delivered')").get("tenant_001");
          result = {
            total_products: productCount.count,
            total_orders: orderCount.count,
            low_stock_count: lowStock.count,
            total_revenue: totalRevenue.total,
            recent_orders: recentOrders,
          };
          break;
        }
        default:
          db.close();
          return { success: false, error: `Unknown ERP SQLite tool: ${toolName}` };
      }
      db.close();
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: `ERP SQLite error: ${err.message}` };
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
      "ai_chat",
      "ai_generate_product_description",
      "ai_forecast_demand",
      "ai_detect_fraud",
      "ai_analyze_image",
    ];
    if (readTools.includes(toolName) && data) {
      this.memory.cacheToolResult(toolName, args, JSON.stringify(data));
    }

    return { success: true, data };
  }
}
