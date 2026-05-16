// ============================================================
// Orchestrator API — ตัวกลางระหว่าง Agent Loop V2 กับ LLM Gateway
//
// Agent Loop V2 เรียกผ่าน Orchestrator API เท่านั้น
// Orchestrator API เป็นคนเรียก LLMGateway.chat() จริงๆ
// ============================================================

import { LLMGateway, type LLMMessage, type LLMToolDef, type LLMResponse } from "./llm-gateway.js";
import { AuditLog } from "./audit-log.js";
import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SUPERVISOR_CHANNEL = "supervisor:events";

export interface OrchestratorChatOptions {
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
  source?: "telegram" | "dashboard" | "agent_loop" | "chat_api" | "system";
  taskId?: string;
}

export class OrchestratorAPI {
  private llmGateway: LLMGateway;
  private auditLog: AuditLog;
  private redisClient: RedisClientType | null = null;
  private redisConnected = false;

  constructor(llmGateway: LLMGateway, auditLog: AuditLog) {
    this.llmGateway = llmGateway;
    this.auditLog = auditLog;
    this.initRedis();
  }

  /** เชื่อมต่อ Redis สำหรับ Supervisor Channel */
  private async initRedis(): Promise<void> {
    try {
      this.redisClient = createClient({ url: REDIS_URL });
      this.redisClient.on("error", () => { this.redisConnected = false; });
      this.redisClient.on("connect", () => { this.redisConnected = true; });
      await this.redisClient.connect();
      this.redisConnected = true;
      console.log("[OrchestratorAPI] Redis connected for Supervisor Channel");
    } catch (err: any) {
      console.warn("[OrchestratorAPI] Redis not available — Supervisor Channel disabled:", err.message);
      this.redisConnected = false;
    }
  }

  /** ส่ง event ไปยัง Supervisor Channel (Redis Pub/Sub) */
  private async publishToSupervisor(event: {
    type: string;
    taskId: string | null;
    source: string;
    message: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.redisConnected || !this.redisClient) return;
    try {
      await this.redisClient.publish(SUPERVISOR_CHANNEL, JSON.stringify({
        timestamp: new Date().toISOString(),
        agentId: "orchestrator-api",
        ...event,
      }));
    } catch {
      // ignore publish errors
    }
  }

  /**
   * ส่ง chat ไปยัง LLM — ผ่าน Orchestrator API เท่านั้น
   * - validate input
   * - log audit
   * - publish to Supervisor Channel
   * - เรียก LLMGateway.chat() จริงๆ
   */
  async chat(
    messages: LLMMessage[],
    tools?: LLMToolDef[],
    options?: OrchestratorChatOptions,
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const sessionId = options?.sessionId || "unknown";
    const source = options?.source || "system";
    const taskId = options?.taskId || null;

    // Validate
    if (!messages || messages.length === 0) {
      throw new Error("[OrchestratorAPI] messages is required");
    }

    // Log audit — started
    this.auditLog.log({
      agentId: "orchestrator-api",
      taskId,
      action: "llm_chat",
      status: "started",
      message: "LLM chat: " + messages.length + " messages, " + (tools?.length || 0) + " tools",
      metadata: {
        messageCount: messages.length,
        toolCount: tools?.length || 0,
        sessionId,
        source,
      },
      tokensUsed: 0,
      durationMs: 0,
    });

    // Publish to Supervisor — started
    this.publishToSupervisor({
      type: "llm_chat_started",
      taskId,
      source,
      message: "LLM chat: " + messages.length + " messages, " + (tools?.length || 0) + " tools",
      metadata: { messageCount: messages.length, toolCount: tools?.length || 0, sessionId },
    });

    try {
      // เรียก LLMGateway.chat() จริงๆ
      const response = await this.llmGateway.chat(messages, tools, {
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        sessionId,
        source,
      });

      const durationMs = Date.now() - startTime;

      // Log audit — success
      this.auditLog.log({
        agentId: "orchestrator-api",
        taskId,
        action: "llm_chat",
        status: "success",
        message: "LLM chat completed: " + (response.usage?.totalTokens || 0) + " tokens",
        metadata: {
          finishReason: response.finishReason,
          toolCalls: response.toolCalls?.length || 0,
          hasContent: !!response.content,
          usage: response.usage,
        },
        tokensUsed: response.usage?.totalTokens || 0,
        durationMs,
      });

      // Publish to Supervisor — success
      this.publishToSupervisor({
        type: "llm_chat_completed",
        taskId,
        source,
        message: "LLM chat completed: " + (response.usage?.totalTokens || 0) + " tokens",
        metadata: {
          finishReason: response.finishReason,
          toolCalls: response.toolCalls?.length || 0,
          tokensUsed: response.usage?.totalTokens || 0,
          durationMs,
        },
      });

      return response;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;

      // Log audit — failed
      this.auditLog.log({
        agentId: "orchestrator-api",
        taskId,
        action: "llm_chat",
        status: "failed",
        message: "LLM chat failed: " + (err.message || "").slice(0, 200),
        metadata: {
          error: (err.message || "").slice(0, 2000),
        },
        tokensUsed: 0,
        durationMs,
      });

      // Publish to Supervisor — failed
      this.publishToSupervisor({
        type: "llm_chat_failed",
        taskId,
        source,
        message: "LLM chat failed: " + (err.message || "").slice(0, 200),
        metadata: { error: (err.message || "").slice(0, 500), durationMs },
      });

      throw err;
    }
  }

  /** ตรวจสอบว่า LLM พร้อมใช้งาน */
  isConfigured(): boolean {
    return this.llmGateway.isConfigured();
  }

  /** ดึง config ปัจจุบัน */
  getConfig() {
    return this.llmGateway.getConfig();
  }

  /** ปิ�Tการเชื่อมต่อ Redis */
  async disconnect(): Promise<void> {
    if (this.redisClient && this.redisConnected) {
      try {
        await this.redisClient.quit();
      } catch { /* ignore */ }
      this.redisConnected = false;
    }
  }
}
