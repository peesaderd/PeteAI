// ============================================================
// Agent Worker - Background agent that processes tasks
// Each agent runs as a separate process with its own role
// ============================================================

import { AgentRegistry, type AgentRole } from './registry.js';
import { TaskQueue, type Task } from './queue.js';

export interface WorkerConfig {
  role: AgentRole;
  agentId: string;
  pollIntervalMs: number;
  erpApiUrl: string;
  openhandsApiKey?: string;
}

export class AgentWorker {
  private config: WorkerConfig;
  private registry: AgentRegistry;
  private queue: TaskQueue;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.registry = new AgentRegistry();
    this.queue = new TaskQueue();
  }

  start(): void {
    this.running = true;
    const agent = this.registry.getById(this.config.agentId);
    if (agent) {
      this.registry.updateStatus(this.config.agentId, 'idle');
      console.log('[Agent] Started: ' + agent.name);
    }
    this.pollTimer = setInterval(() => this.poll(), this.config.pollIntervalMs);
    console.log('[Agent] Polling every ' + this.config.pollIntervalMs + 'ms');
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.registry.updateStatus(this.config.agentId, 'offline');
    console.log('[Agent] Stopped');
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    this.registry.heartbeat(this.config.agentId);
    const task = this.queue.claimNextTask(this.config.role, this.config.agentId);
    if (!task) return;
    this.registry.updateStatus(this.config.agentId, 'busy');
    console.log('[Agent] Processing task: ' + task.id + ' - ' + task.title);
    try {
      await this.processTask(task);
    } catch (err: any) {
      console.error('[Agent] Task ' + task.id + ' failed:', err.message);
      this.queue.updateTaskStatus(task.id, 'failed', { outputData: { error: err.message } });
    } finally {
      this.registry.updateStatus(this.config.agentId, 'idle');
    }
  }

  private async processTask(task: Task): Promise<void> {
    const input = JSON.parse(task.inputData || '{}');
    let output: any;
    switch (this.config.role) {
      case 'brainstorm': output = await this.handleBrainstorm(input); break;
      case 'rd': output = await this.handleRd(input); break;
      case 'design': output = await this.handleDesign(input); break;
      case 'production': output = await this.handleProduction(input); break;
      case 'marketing': output = await this.handleMarketing(input); break;
      default: throw new Error('Unknown role: ' + this.config.role);
    }
    if (input.requireApproval) {
      this.queue.updateTaskStatus(task.id, 'awaiting_approval', { outputData: output });
      console.log('[Agent] Task ' + task.id + ' awaiting human approval');
    } else {
      this.queue.updateTaskStatus(task.id, 'done', { outputData: output });
      console.log('[Agent] Task ' + task.id + ' completed');
      if (input.forwardTo) {
        this.forwardToNext(task, input.forwardTo, output);
      }
    }
  }

  private forwardToNext(originalTask: Task, nextRole: AgentRole, output: any): void {
    this.queue.createTask({
      tenantId: originalTask.tenantId,
      title: '[' + this.config.role + ' -> ' + nextRole + '] ' + originalTask.title,
      description: originalTask.description,
      sourceRole: this.config.role,
      targetRole: nextRole,
      priority: originalTask.priority,
      inputData: { ...JSON.parse(originalTask.inputData || '{}'), previousOutput: output },
      projectId: originalTask.projectId,
      parentTaskId: originalTask.id,
    });
  }

  private async handleBrainstorm(input: any): Promise<any> {
    return { ideas: ['Generated ideas for: ' + (input.brief || input.title)], strategy: 'Brainstorming complete', timestamp: Date.now() };
  }

  private async handleRd(input: any): Promise<any> {
    return { research: 'Research findings for: ' + (input.brief || input.title), feasibility: 'Feasibility analysis complete', recommendations: ['Recommendation 1'], timestamp: Date.now() };
  }

  private async handleDesign(input: any): Promise<any> {
    return { designSpec: 'Design specification for: ' + (input.brief || input.title), assets: [], timestamp: Date.now() };
  }

  private async handleProduction(input: any): Promise<any> {
    return { implementation: 'Implementation for: ' + (input.brief || input.title), code: input.code || 'No code provided', deployed: false, timestamp: Date.now() };
  }

  private async handleMarketing(input: any): Promise<any> {
    return { campaign: 'Marketing campaign for: ' + (input.brief || input.title), channels: ['social_media', 'email', 'etsy'], timestamp: Date.now() };
  }
}
