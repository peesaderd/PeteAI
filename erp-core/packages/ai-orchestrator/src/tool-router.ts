// ============================================================
// Tool Router - Routes tool calls to ERP Core MCP Server
// Also provides local tools for memory, session management, etc.
// ============================================================

import { MemoryStore } from "./memory.js";
import { execSync } from "child_process";

const ERP_MCP_URL =
  process.env.ERP_MCP_URL || "http://localhost:54510/api/mcp";
const AGENCY_API_URL =
  process.env.AGENCY_API_URL || "http://localhost:54515";
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
        return { success: res.ok, data };
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
