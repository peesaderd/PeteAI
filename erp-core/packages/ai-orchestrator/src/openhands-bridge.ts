// ============================================================
// OpenHands Bridge — REST API + Browser fallback for OpenHands
//
// ส่ง task ไปให้ OpenHands agent ทำงานผ่าน:
//   1. REST API (primary) — POST /api/conversations
//   2. Browser fallback — ใช้ ReviveChat ส่งข้อความผ่าน UI
//
// Flow:
//   sendTask(task) → try REST API → fallback ReviveChat → return result
// ============================================================

import { BrowserUse } from "./browser-use.js";
import { LLMGateway } from "./llm-gateway.js";
import { ReviveChat } from "./revive-chat.js";

// ─── Types ───────────────────────────────────────────────────

export interface OpenHandsTask {
  id: string;
  title: string;
  description: string;
  input?: Record<string, any>;
  sessionId?: string;
}

export interface OpenHandsResult {
  success: boolean;
  conversationId?: string;
  response?: string;
  error?: string;
  method: "api" | "browser" | "none";
  status?: "created" | "started" | "completed" | "failed" | "stopped";
}

interface ConversationResponse {
  status: string;
  conversation_id: string;
  message?: string;
  conversation_status?: string;
}

// ─── OpenHandsBridge ─────────────────────────────────────────

export class OpenHandsBridge {
  private browserUse: BrowserUse;
  private llmGateway: LLMGateway;
  private reviveChat: ReviveChat | null = null;
  private configured: boolean;
  private baseUrl: string;
  private apiKey: string;

  // Track active conversations
  private activeConversations: Map<string, {
    taskId: string;
    status: string;
    createdAt: number;
  }> = new Map();

  constructor(browserUse: BrowserUse, llmGateway: LLMGateway) {
    this.browserUse = browserUse;
    this.llmGateway = llmGateway;
    this.baseUrl = (process.env.OPENHANDS_URL || "").replace(/\/+$/, "");
    this.apiKey = process.env.OPENHANDS_API_KEY || "";
    this.configured = !!this.baseUrl;

    // Initialize ReviveChat as fallback (only if browser is available)
    if (this.baseUrl) {
      this.reviveChat = new ReviveChat(browserUse);
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getConfig(): { url: string; apiKey: string } {
    return {
      url: this.baseUrl,
      apiKey: this.apiKey,
    };
  }

  /**
   * ส่ง task ไปให้ OpenHands ทำงาน
   * Primary: REST API → POST /api/conversations
   * Fallback: ReviveChat (browser-based)
   */
  async sendTask(task: OpenHandsTask): Promise<OpenHandsResult> {
    if (!this.configured) {
      return {
        success: false,
        error: "OpenHands not configured. Set OPENHANDS_URL and OPENHANDS_API_KEY",
        method: "none",
      };
    }

    // ─── Try REST API first ────────────────────────────────
    try {
      const result = await this.sendViaApi(task);
      if (result.success) {
        return result;
      }
      // API failed — fall through to browser fallback
      console.warn(`[OpenHandsBridge] API failed, trying browser fallback: ${result.error}`);
    } catch (err: any) {
      console.warn(`[OpenHandsBridge] API error, trying browser fallback: ${err.message}`);
    }

    // ─── Fallback: ReviveChat (browser-based) ──────────────
    return this.sendViaBrowser(task);
  }

  /**
   * ส่ง task ผ่าน REST API ของ OpenHands
   */
  private async sendViaApi(task: OpenHandsTask): Promise<OpenHandsResult> {
    const url = `${this.baseUrl}/api/conversations`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // ─── Step 1: Create conversation ───────────────────────
    const createBody = {
      initial_user_msg: `Task: ${task.title}\n\n${task.description}\n\n${task.input ? JSON.stringify(task.input, null, 2) : ""}`,
      conversation_instructions: `This is an automated task from ERP Core. Task ID: ${task.id}. Please complete the task and provide a summary of what was done.`,
    };

    const createRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "Unknown error");
      return { success: false, error: `API create failed (${createRes.status}): ${errText.slice(0, 500)}`, method: "api" };
    }

    const convData: ConversationResponse = await createRes.json();
    if (convData.status !== "ok" || !convData.conversation_id) {
      return { success: false, error: `API create returned unexpected response: ${JSON.stringify(convData)}`, method: "api" };
    }

    const conversationId = convData.conversation_id;
    this.activeConversations.set(conversationId, {
      taskId: task.id,
      status: "created",
      createdAt: Date.now(),
    });

    // ─── Step 2: Start conversation (agent loop) ───────────
    const startUrl = `${this.baseUrl}/api/conversations/${conversationId}/start`;
    const startRes = await fetch(startUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ providers_set: [] }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => "Unknown error");
      return {
        success: false,
        error: `API start failed (${startRes.status}): ${errText.slice(0, 500)}`,
        method: "api",
        conversationId,
        status: "created",
      };
    }

    const startData: ConversationResponse = await startRes.json();
    this.activeConversations.set(conversationId, {
      taskId: task.id,
      status: startData.conversation_status || "started",
      createdAt: Date.now(),
    });

    // ─── Step 3: Poll for completion ───────────────────────
    const pollResult = await this.pollConversation(conversationId, headers);
    return {
      ...pollResult,
      conversationId,
      method: "api",
    };
  }

  /**
   * Poll สถานะ conversation จนกว่าจะเสร็จหรือ timeout
   */
  private async pollConversation(
    conversationId: string,
    headers: Record<string, string>,
    timeoutMs = 300000,
    pollIntervalMs = 3000,
  ): Promise<OpenHandsResult> {
    const start = Date.now();
    const getUrl = `${this.baseUrl}/api/conversations/${conversationId}`;

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(getUrl, { headers });
        if (!res.ok) {
          if (res.status === 404) {
            return { success: true, response: "Conversation completed and removed", status: "completed", method: "api" };
          }
          await this.sleep(2000);
          continue;
        }

        const data = await res.json();
        const status = data?.status || data?.conversation_status;

        if (status === "stopped" || status === "completed" || !status) {
          return { success: true, response: "Task completed in OpenHands", status: "completed", method: "api" };
        }

        if (status === "error" || status === "failed") {
          return { success: false, error: `OpenHands conversation failed with status: ${status}`, status: "failed", method: "api" };
        }

        await this.sleep(pollIntervalMs);
      } catch (err: any) {
        await this.sleep(2000);
      }
    }

    return { success: false, error: `Timeout polling conversation after ${timeoutMs}ms`, status: "started", method: "api" };
  }

  /**
   * ส่ง task ผ่าน Browser (ReviveChat fallback)
   */
  private async sendViaBrowser(task: OpenHandsTask): Promise<OpenHandsResult> {
    if (!this.reviveChat) {
      return { success: false, error: "Browser fallback not available (ReviveChat not initialized)", method: "browser" };
    }

    try {
      const message = `Task: ${task.title}\n\n${task.description}\n\nPlease complete this task and provide a summary.`;

      const result = await this.reviveChat.sendMessage(message);
      if (!result.success) {
        return {
          success: false,
          error: result.error || "Browser fallback failed",
          method: "browser",
        };
      }

      return {
        success: true,
        response: result.response || "Task sent via browser",
        method: "browser",
        status: "completed",
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Browser fallback error: ${err.message}`,
        method: "browser",
      };
    }
  }

  /**
   * ดึงสถานะของ active conversations
   */
  getActiveConversations(): Array<{
    conversationId: string;
    taskId: string;
    status: string;
    createdAt: number;
  }> {
    const now = Date.now();
    for (const [convId, info] of this.activeConversations) {
      if (now - info.createdAt > 3600000) {
        this.activeConversations.delete(convId);
      }
    }

    return Array.from(this.activeConversations.entries()).map(([convId, info]) => ({
      conversationId: convId,
      ...info,
    }));
  }

  /**
   * หยุด conversation ที่กำลังทำงาน
   */
  async stopConversation(conversationId: string): Promise<boolean> {
    if (!this.configured) return false;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const url = `${this.baseUrl}/api/conversations/${conversationId}/stop`;
      const res = await fetch(url, { method: "POST", headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
