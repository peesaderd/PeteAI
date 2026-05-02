// ============================================================
// Agent Workflow Engine
// Orchestrates multi-agent workflows where agents collaborate
// autonomously: brainstorm -> rd -> design -> production -> marketing
// ============================================================

import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";
import { LLMClient, type LLMMessage } from "./llm.js";
import { RedisTaskQueue } from "./redis-queue.js";

export interface WorkflowStep {
  id: string;
  agent: string;
  title: string;
  description: string;
  inputData: Record<string, any>;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  outputData?: Record<string, any>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  contextData: Record<string, any>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: { agent: string; title: string; descriptionTemplate: string }[];
}

const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "full-product-idea",
    name: "Full Product Ideation -> Delivery",
    description: "Brainstorm -> R&D -> Design -> Production -> Marketing",
    steps: [
      { agent: "brainstorm", title: "Idea Generation", descriptionTemplate: "Generate ideas for: {{input}}" },
      { agent: "rd", title: "Feasibility Research", descriptionTemplate: "Research feasibility for: {{input}}" },
      { agent: "design", title: "UI/UX Design", descriptionTemplate: "Design for: {{input}}" },
      { agent: "production", title: "Implementation Plan", descriptionTemplate: "Plan implementation for: {{input}}" },
      { agent: "marketing", title: "Marketing Strategy", descriptionTemplate: "Create marketing for: {{input}}" },
    ],
  },
  {
    id: "research-to-prototype",
    name: "Research -> Prototype",
    description: "R&D -> Production for rapid prototyping",
    steps: [
      { agent: "rd", title: "Research & Feasibility", descriptionTemplate: "Research: {{input}}" },
      { agent: "production", title: "Build Prototype", descriptionTemplate: "Build prototype for: {{input}}" },
    ],
  },
  {
    id: "design-to-launch",
    name: "Design -> Launch",
    description: "Design -> Production -> Marketing",
    steps: [
      { agent: "design", title: "Design Spec", descriptionTemplate: "Design: {{input}}" },
      { agent: "production", title: "Implement", descriptionTemplate: "Implement: {{input}}" },
      { agent: "marketing", title: "Launch Campaign", descriptionTemplate: "Launch: {{input}}" },
    ],
  },
  {
    id: "product-launch",
    name: "Product Launch Campaign",
    description: "Marketing -> Design -> Production for launching a product",
    steps: [
      { agent: "marketing", title: "Launch Strategy", descriptionTemplate: "Create launch strategy for: {{input}}" },
      { agent: "design", title: "Campaign Assets", descriptionTemplate: "Design campaign assets for: {{input}}" },
      { agent: "production", title: "Execute Launch", descriptionTemplate: "Execute launch plan for: {{input}}" },
      { agent: "marketing", title: "Monitor & Optimize", descriptionTemplate: "Monitor and optimize launch of: {{input}}" },
    ],
  },
  {
    id: "bug-fix",
    name: "Bug Fix Pipeline",
    description: "R&D -> Production -> QA for fixing bugs",
    steps: [
      { agent: "rd", title: "Bug Analysis", descriptionTemplate: "Analyze bug: {{input}}" },
      { agent: "production", title: "Implement Fix", descriptionTemplate: "Implement fix for: {{input}}" },
      { agent: "qa", title: "Quality Assurance", descriptionTemplate: "Test and verify fix for: {{input}}" },
      { agent: "production", title: "Deploy Fix", descriptionTemplate: "Deploy fix for: {{input}}" },
    ],
  },
  {
    id: "content-pipeline",
    name: "Content Creation Pipeline",
    description: "Brainstorm -> Design -> Production -> Marketing for content",
    steps: [
      { agent: "brainstorm", title: "Content Ideation", descriptionTemplate: "Brainstorm content ideas for: {{input}}" },
      { agent: "design", title: "Content Design", descriptionTemplate: "Design content assets for: {{input}}" },
      { agent: "production", title: "Content Production", descriptionTemplate: "Produce content for: {{input}}" },
      { agent: "marketing", title: "Content Distribution", descriptionTemplate: "Distribute and promote: {{input}}" },
    ],
  },
  {
    id: "full-devops",
    name: "DevOps Pipeline",
    description: "Production -> QA -> DevOps for infrastructure and deployment",
    steps: [
      { agent: "production", title: "Build & Package", descriptionTemplate: "Build and package: {{input}}" },
      { agent: "qa", title: "Automated Testing", descriptionTemplate: "Run automated tests for: {{input}}" },
      { agent: "devops", title: "Deploy to Staging", descriptionTemplate: "Deploy to staging: {{input}}" },
      { agent: "qa", title: "Staging Verification", descriptionTemplate: "Verify staging deployment: {{input}}" },
      { agent: "devops", title: "Deploy to Production", descriptionTemplate: "Deploy to production: {{input}}" },
    ],
  },
  {
    id: "finance-budget",
    name: "Finance & Budget Planning",
    description: "Brainstorm -> R&D -> Finance -> Production for budget planning",
    steps: [
      { agent: "brainstorm", title: "Project Ideation", descriptionTemplate: "Define project scope: {{input}}" },
      { agent: "rd", title: "Cost Research", descriptionTemplate: "Research costs for: {{input}}" },
      { agent: "finance", title: "Budget Analysis", descriptionTemplate: "Analyze budget for: {{input}}" },
      { agent: "production", title: "Resource Planning", descriptionTemplate: "Plan resources for: {{input}}" },
      { agent: "finance", title: "Final Review", descriptionTemplate: "Final budget review for: {{input}}" },
    ],
  },
];

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private llm: LLMClient;
  private redisQueue: RedisTaskQueue | null = null;

  constructor(toolRouter: ToolRouter, memory: MemoryStore, llm: LLMClient, redisQueue?: RedisTaskQueue) {
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.llm = llm;
    this.redisQueue = redisQueue || null;
  }

  setRedisQueue(queue: RedisTaskQueue): void { this.redisQueue = queue; }
  getTemplates(): WorkflowTemplate[] { return TEMPLATES; }
  getTemplate(id: string): WorkflowTemplate | undefined { return TEMPLATES.find((t) => t.id === id); }

  createWorkflow(params: {
    templateId?: string; name: string; description: string;
    steps?: { agent: string; title: string; description: string }[];
    inputData?: Record<string, any>; createdBy?: string;
  }): Workflow {
    const id = "wf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    let steps: WorkflowStep[] = [];

    if (params.templateId) {
      const t = TEMPLATES.find((x) => x.id === params.templateId);
      if (!t) throw new Error("Template not found: " + params.templateId);
      steps = t.steps.map((s, i) => ({
        id: id + "-s" + i, agent: s.agent, title: s.title,
        description: s.descriptionTemplate.replace("{{input}}", params.inputData?.input || params.description || ""),
        inputData: { ...params.inputData, originalInput: params.inputData?.input || params.description },
        status: "pending" as const,
      }));
    } else if (params.steps) {
      steps = params.steps.map((s, i) => ({
        id: id + "-s" + i, agent: s.agent, title: s.title, description: s.description,
        inputData: { ...params.inputData, originalInput: params.inputData?.input || params.description },
        status: "pending" as const,
      }));
    } else {
      throw new Error("templateId or steps required");
    }

    const wf: Workflow = { id, name: params.name, description: params.description, steps,
      status: "pending", createdAt: now, updatedAt: now, createdBy: params.createdBy,
      contextData: params.inputData || {} };
    this.workflows.set(id, wf);
    console.log("[Workflow] Created \"" + params.name + "\" (" + id + ") " + steps.length + " steps");
    return wf;
  }

  async startWorkflow(id: string): Promise<Workflow> {
    const wf = this.workflows.get(id);
    if (!wf) throw new Error("Workflow not found: " + id);
    if (wf.status !== "pending") throw new Error("Workflow already started");
    wf.status = "running";
    wf.updatedAt = Date.now();
    console.log("[Workflow] Starting \"" + wf.name + "\"");
    this.executeNextStep(wf, 0).catch((err) => { console.error("[Workflow] Error:", err.message); wf.status = "failed"; });
    return wf;
  }

  private async executeNextStep(wf: Workflow, idx: number): Promise<void> {
    if (idx >= wf.steps.length) {
      wf.status = "completed"; wf.updatedAt = Date.now();
      console.log("[Workflow] \"" + wf.name + "\" completed");
      return;
    }
    const step = wf.steps[idx];
    step.status = "running"; step.startedAt = Date.now(); wf.updatedAt = Date.now();
    console.log("[Workflow] Step " + (idx + 1) + "/" + wf.steps.length + ": \"" + step.title + "\" -> " + step.agent);

    try {
      if (this.redisQueue && this.redisQueue.isConnected()) {
        await this.redisQueue.pushTask({
          id: step.id, type: "agent_task", targetAgent: step.agent,
          title: step.title, description: step.description, priority: 1,
          payload: { workflowId: wf.id, stepIndex: idx, totalSteps: wf.steps.length,
            inputData: step.inputData, contextData: wf.contextData,
            previousSteps: wf.steps.filter((s) => s.status === "completed").map((s) => ({
              agent: s.agent, title: s.title, outputData: s.outputData })) },
          createdAt: new Date().toISOString(), source: "workflow-engine",
        });
      } else {
        const prompts: Record<string, string> = {
          brainstorm: "You are the Brainstorm Agent. Generate creative ideas.",
          rd: "You are the R&D Agent. Research feasibility.",
          design: "You are the Design Agent. Create design concepts.",
          production: "You are the Production Agent. Execute plans.",
          marketing: "You are the Marketing Agent. Create strategies.",
        };
        const msg: LLMMessage[] = [
          { role: "system", content: prompts[step.agent] || "You are an AI agent." },
          { role: "user", content: "Task: " + step.title + "\n\n" + step.description },
        ];
        if (this.llm.isConfigured()) {
          const resp = await this.llm.chat(msg, undefined, { maxTokens: 2048, temperature: 0.3 });
          step.outputData = { response: resp.content, toolResults: [] };
        } else {
          step.outputData = { response: "[" + step.agent.toUpperCase() + "] Task completed (rule-based)" };
        }
      }
      step.status = "completed"; step.completedAt = Date.now(); wf.updatedAt = Date.now();
      await this.executeNextStep(wf, idx + 1);
    } catch (err: any) {
      step.status = "failed"; step.error = err.message; wf.status = "failed"; wf.updatedAt = Date.now();
      console.error("[Workflow] Step " + (idx + 1) + " failed:", err.message);
    }
  }

  reportStepCompletion(wfId: string, stepId: string, data: Record<string, any>): boolean {
    const wf = this.workflows.get(wfId);
    if (!wf) return false;
    const step = wf.steps.find((s) => s.id === stepId);
    if (!step) return false;
    step.status = "completed"; step.completedAt = Date.now(); step.outputData = data; wf.updatedAt = Date.now();
    if (wf.steps.every((s) => s.status === "completed" || s.status === "skipped")) {
      wf.status = "completed";
      console.log("[Workflow] \"" + wf.name + "\" all steps done!");
    }
    return true;
  }

  getWorkflow(id: string): Workflow | undefined { return this.workflows.get(id); }
  listWorkflows(status?: string): Workflow[] {
    const all = Array.from(this.workflows.values());
    return status ? all.filter((w) => w.status === status) : all.sort((a, b) => b.createdAt - a.createdAt);
  }
  cancelWorkflow(id: string): boolean {
    const wf = this.workflows.get(id);
    if (!wf || wf.status === "completed") return false;
    wf.status = "failed"; wf.updatedAt = Date.now(); return true;
  }
}
