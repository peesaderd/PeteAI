import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://docker-redis:6379";

export interface QueueTask {
  id: string;
  type: "agent_task" | "delegation" | "system";
  targetAgent: string;
  title: string;
  description: string;
  priority: number;
  payload: Record<string, any>;
  createdAt: string;
  source?: string;
}

export class RedisTaskQueue {
  private client: RedisClientType | null = null;
  private connected = false;
  private prefix = "agent:queue:";

  async connect(): Promise<void> {
    if (this.connected) return;
    try {
      this.client = createClient({ url: REDIS_URL });
      this.client.on("error", (err) => {
        console.error("[RedisQueue] Connection error:", err.message);
        this.connected = false;
      });
      this.client.on("connect", () => {
        console.log("[RedisQueue] Connected to Redis");
        this.connected = true;
      });
      await this.client.connect();
    } catch (err: any) {
      console.warn("[RedisQueue] Redis unavailable, running in polling mode:", err.message);
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async pushTask(task: QueueTask): Promise<boolean> {
    if (!this.connected || !this.client) return false;
    try {
      const key = this.prefix + task.targetAgent;
      await this.client.zAdd(key, { score: task.priority, value: JSON.stringify(task) });
      await this.client.publish("agent:signal", task.targetAgent);
      return true;
    } catch (err: any) {
      console.error("[RedisQueue] pushTask error:", err.message);
      return false;
    }
  }

  async popTask(agentName: string): Promise<QueueTask | null> {
    if (!this.connected || !this.client) return null;
    try {
      const key = this.prefix + agentName;
      const result = await this.client.zPopMin(key);
      if (result) {
        return JSON.parse(result.value) as QueueTask;
      }
      return null;
    } catch {
      return null;
    }
  }

  async queueLength(agentName: string): Promise<number> {
    if (!this.connected || !this.client) return 0;
    try {
      return await this.client.zCard(this.prefix + agentName);
    } catch {
      return 0;
    }
  }

  async getAllQueueLengths(): Promise<Record<string, number>> {
    if (!this.connected || !this.client) return {};
    try {
      const keys = await this.client.keys(this.prefix + "*");
      const result: Record<string, number> = {};
      for (const key of keys) {
        result[key.replace(this.prefix, "")] = await this.client.zCard(key);
      }
      return result;
    } catch {
      return {};
    }
  }

  async subscribe(agentName: string, callback: () => void): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      await subscriber.subscribe("agent:signal", (message) => {
        if (message === agentName || message === "all") {
          callback();
        }
      });
    } catch (err: any) {
      console.error("[RedisQueue] subscribe error:", err.message);
    }
  }

  async clearAll(): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      const keys = await this.client.keys(this.prefix + "*");
      if (keys.length > 0) await this.client.del(keys);
    } catch { /* ignore */ }
  }
}
