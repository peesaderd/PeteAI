// ============================================================
// Supervisor — Loop Detection, Circuit Breaker, Healthcheck
// Monitors chat workers and agent loops for anomalies
// ============================================================

import { createClient, type RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://docker-redis:6379";

// ─── Types ───────────────────────────────────────────────────

export interface WorkerHeartbeat {
  workerId: string;
  agentName: string;
  status: "alive" | "busy" | "idle";
  lastHeartbeat: number;
  tasksProcessed: number;
  failures: number;
  memoryUsageMb: number;
}

export interface LoopDetection {
  agentName: string;
  sessionId: string;
  repeatCount: number;
  lastMessage: string;
  detectedAt: number;
  action: "warn" | "pause" | "restart";
}

export interface CircuitBreakerState {
  agentName: string;
  failureCount: number;
  lastFailureAt: number;
  state: "closed" | "open" | "half-open";
  openedAt?: number;
  cooldownUntil?: number;
}

export interface SupervisorConfig {
  heartbeatTimeoutMs: number;
  loopDetectionThreshold: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
  healthcheckIntervalMs: number;
  alertWebhookUrl?: string;
}

const DEFAULT_CONFIG: SupervisorConfig = {
  heartbeatTimeoutMs: 30000,
  loopDetectionThreshold: 3,
  circuitBreakerThreshold: 3,
  circuitBreakerCooldownMs: 60000,
  healthcheckIntervalMs: 30000,
};

// ─── Supervisor Class ────────────────────────────────────────

export class Supervisor {
  private redis: RedisClientType | null = null;
  private connected = false;
  private config: SupervisorConfig;
  private heartbeats: Map<string, WorkerHeartbeat> = new Map();
  private loopCounters: Map<string, { count: number; lastMessage: string }> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private healthTimer: NodeJS.Timeout | null = null;
  private running = false;
  private onAlert: ((message: string) => void) | null = null;

  constructor(config?: Partial<SupervisorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    try {
      this.redis = createClient({ url: REDIS_URL });
      this.redis.on("error", (err) => {
        console.error("[Supervisor] Redis error:", err.message);
      });
      this.redis.on("connect", () => {
        console.log("[Supervisor] Connected to Redis");
        this.connected = true;
      });
      await this.redis.connect();
    } catch (err: any) {
      console.warn("[Supervisor] Redis unavailable:", err.message);
      this.connected = false;
    }
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
    console.log(`[Supervisor] Started (heartbeat=${this.config.heartbeatTimeoutMs}ms, loop=${this.config.loopDetectionThreshold}x, breaker=${this.config.circuitBreakerThreshold}x)`);
    this.healthTimer = setInterval(() => this.healthcheck(), this.config.healthcheckIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    console.log("[Supervisor] Stopped");
  }

  setAlertHandler(handler: (message: string) => void): void {
    this.onAlert = handler;
  }

  // ─── Heartbeat ─────────────────────────────────────────────

  recordHeartbeat(workerId: string, agentName: string, status: WorkerHeartbeat["status"] = "alive"): void {
    const existing = this.heartbeats.get(workerId);
    this.heartbeats.set(workerId, {
      workerId,
      agentName,
      status,
      lastHeartbeat: Date.now(),
      tasksProcessed: (existing?.tasksProcessed || 0) + 1,
      failures: existing?.failures || 0,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  }

  recordFailure(workerId: string): void {
    const hb = this.heartbeats.get(workerId);
    if (hb) {
      hb.failures++;
      hb.status = "busy";
    }
  }

  getHeartbeat(workerId: string): WorkerHeartbeat | undefined {
    return this.heartbeats.get(workerId);
  }

  getAllHeartbeats(): WorkerHeartbeat[] {
    return Array.from(this.heartbeats.values());
  }

  // ─── Loop Detection ────────────────────────────────────────

  checkLoop(agentName: string, sessionId: string, message: string): LoopDetection | null {
    const key = `${agentName}:${sessionId}`;
    const counter = this.loopCounters.get(key);

    if (counter && counter.lastMessage === message) {
      counter.count++;
      if (counter.count >= this.config.loopDetectionThreshold) {
        const detection: LoopDetection = {
          agentName,
          sessionId,
          repeatCount: counter.count,
          lastMessage: message,
          detectedAt: Date.now(),
          action: counter.count >= this.config.loopDetectionThreshold + 2 ? "restart" : "warn",
        };

        if (counter.count >= this.config.loopDetectionThreshold + 1) {
          detection.action = "pause";
          this.alert(`[LOOP] Agent "${agentName}" session "${sessionId.slice(0, 8)}" repeated ${counter.count}x — PAUSED`);
        } else {
          this.alert(`[LOOP] Agent "${agentName}" session "${sessionId.slice(0, 8)}" repeated ${counter.count}x`);
        }

        return detection;
      }
    } else {
      this.loopCounters.set(key, { count: 1, lastMessage: message });
    }

    return null;
  }

  clearLoopCounter(agentName: string, sessionId: string): void {
    const key = `${agentName}:${sessionId}`;
    this.loopCounters.delete(key);
  }

  // ─── Circuit Breaker ───────────────────────────────────────

  checkCircuitBreaker(agentName: string): { allowed: boolean; state: CircuitBreakerState } {
    let cb = this.circuitBreakers.get(agentName);

    if (!cb) {
      cb = {
        agentName,
        failureCount: 0,
        lastFailureAt: 0,
        state: "closed",
      };
      this.circuitBreakers.set(agentName, cb);
    }

    if (cb.state === "open" && cb.cooldownUntil && Date.now() > cb.cooldownUntil) {
      cb.state = "half-open";
      console.log(`[Supervisor] Circuit breaker for "${agentName}" → half-open`);
    }

    const allowed = cb.state !== "open";
    return { allowed, state: cb };
  }

  recordCircuitFailure(agentName: string): CircuitBreakerState {
    let cb = this.circuitBreakers.get(agentName);
    if (!cb) {
      cb = {
        agentName,
        failureCount: 0,
        lastFailureAt: 0,
        state: "closed",
      };
      this.circuitBreakers.set(agentName, cb);
    }

    cb.failureCount++;
    cb.lastFailureAt = Date.now();

    if (cb.failureCount >= this.config.circuitBreakerThreshold) {
      cb.state = "open";
      cb.openedAt = Date.now();
      cb.cooldownUntil = Date.now() + this.config.circuitBreakerCooldownMs;
      this.alert(`[CIRCUIT] Agent "${agentName}" circuit OPEN after ${cb.failureCount} failures — paused ${this.config.circuitBreakerCooldownMs / 1000}s`);
      console.log(`[Supervisor] 🔴 Circuit breaker OPEN for "${agentName}" (${cb.failureCount} failures)`);
    }

    return cb;
  }

  recordCircuitSuccess(agentName: string): void {
    const cb = this.circuitBreakers.get(agentName);
    if (cb) {
      cb.failureCount = 0;
      cb.state = "closed";
      cb.openedAt = undefined;
      cb.cooldownUntil = undefined;
      console.log(`[Supervisor] ✅ Circuit breaker CLOSED for "${agentName}"`);
    }
  }

  getCircuitBreakerState(agentName: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(agentName);
  }

  getAllCircuitBreakers(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }

  // ─── Healthcheck ───────────────────────────────────────────

  private async healthcheck(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    const staleWorkers: string[] = [];

    for (const [workerId, hb] of this.heartbeats) {
      const elapsed = now - hb.lastHeartbeat;
      if (elapsed > this.config.heartbeatTimeoutMs) {
        staleWorkers.push(workerId);
        this.alert(`[HEARTBEAT] Worker "${workerId}" (${hb.agentName}) stale — ${Math.round(elapsed / 1000)}s since last heartbeat`);
      }
    }

    for (const id of staleWorkers) {
      this.heartbeats.delete(id);
    }

    const alive = this.heartbeats.size;
    const openBreakers = Array.from(this.circuitBreakers.values()).filter(cb => cb.state === "open").length;
    if (alive > 0 || openBreakers > 0) {
      console.log(`[Supervisor] Healthcheck: ${alive} workers, ${openBreakers} open circuits`);
    }
  }

  // ─── Alert ─────────────────────────────────────────────────

  private alert(message: string): void {
    console.log(`[Supervisor] ⚠️ ${message}`);
    if (this.onAlert) {
      this.onAlert(message);
    }
    if (this.connected && this.redis) {
      this.redis.publish("supervisor:alert", JSON.stringify({
        message,
        timestamp: Date.now(),
      })).catch(() => {});
    }
  }

  // ─── Status ────────────────────────────────────────────────

  getStatus(): any {
    return {
      running: this.running,
      config: this.config,
      workers: this.getAllHeartbeats(),
      circuitBreakers: this.getAllCircuitBreakers(),
      activeLoops: Array.from(this.loopCounters.entries())
        .filter(([_, c]) => c.count >= 2)
        .map(([key, c]) => ({ key, count: c.count })),
    };
  }
}
