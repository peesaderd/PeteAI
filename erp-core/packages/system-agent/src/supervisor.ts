// ============================================================
// Agent Supervisor
// Loop detection, auto-restart, healthcheck, circuit breaker,
// and Slack/LINE alerting.
// ============================================================

import { AgentLifecycle } from "./lifecycle.js";

// ── Types ──────────────────────────────────────────────────────

export interface AgentAction {
  agentName: string;
  action: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface SupervisorConfig {
  /** How often to check agent health (ms) */
  healthcheckIntervalMs: number;
  /** Max time without action before considering agent stuck (ms) */
  stuckTimeoutMs: number;
  /** Max identical consecutive actions before loop detected */
  maxLoopCount: number;
  /** Max restarts before circuit breaker trips */
  maxRestarts: number;
  /** How long to pause after circuit breaker trips (ms) */
  circuitBreakerPauseMs: number;
  /** Slack webhook URL (optional) */
  slackWebhookUrl: string;
  /** LINE Notify token (optional) */
  lineNotifyToken: string;
}

export interface AgentStatus {
  name: string;
  status: "running" | "stuck" | "paused" | "unknown";
  lastAction: string;
  lastActionTime: string;
  loopCount: number;
  restartCount: number;
  circuitBreakerTripped: boolean;
  circuitBreakerUntil: string | null;
  healthy: boolean;
}

const DEFAULT_CONFIG: SupervisorConfig = {
  healthcheckIntervalMs: 30_000,   // 30 seconds
  stuckTimeoutMs: 60_000,          // 60 seconds
  maxLoopCount: 3,                 // 3 identical actions = loop
  maxRestarts: 3,                  // 3 restarts then pause
  circuitBreakerPauseMs: 300_000,  // 5 minutes pause
  slackWebhookUrl: "",
  lineNotifyToken: "",
};

// ── Supervisor Class ───────────────────────────────────────────

export class AgentSupervisor {
  private config: SupervisorConfig;
  private lifecycle: AgentLifecycle;
  private agents: Map<string, {
    lastAction: string;
    lastActionTime: number;
    loopCount: number;
    restartCount: number;
    circuitBreakerTripped: boolean;
    circuitBreakerUntil: number;
    status: "running" | "stuck" | "paused" | "unknown";
  }> = new Map();
  private healthTimer: NodeJS.Timeout | null = null;
  private actionHistory: AgentAction[] = [];
  private maxHistory = 1000;

  constructor(lifecycle: AgentLifecycle) {
    this.lifecycle = lifecycle;
    this.config = { ...DEFAULT_CONFIG };
  }

  // ── Public API ───────────────────────────────────────────────

  async start(): Promise<void> {
    console.log("[Supervisor] Starting with healthcheck interval " + this.config.healthcheckIntervalMs + "ms");
    // Register default agents
    for (const name of ["rd", "brainstorm", "production", "design", "marketing"]) {
      this.registerAgent(name);
    }
    // Start periodic healthcheck
    this.healthTimer = setInterval(() => this.healthcheck(), this.config.healthcheckIntervalMs);
    // Run first check immediately
    await this.healthcheck();
  }

  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  updateConfig(partial: Partial<SupervisorConfig>): void {
    this.config = { ...this.config, ...partial };
    console.log("[Supervisor] Config updated", this.config);
    if (partial.healthcheckIntervalMs && this.healthTimer) {
      this.stop();
      this.start();
    }
  }

  getConfig(): SupervisorConfig {
    return { ...this.config };
  }

  getStatus(): Record<string, any> {
    const agentStatuses: Record<string, AgentStatus> = {};
    for (const [name, state] of this.agents) {
      agentStatuses[name] = {
        name,
        status: state.status,
        lastAction: state.lastAction,
        lastActionTime: new Date(state.lastActionTime).toISOString(),
        loopCount: state.loopCount,
        restartCount: state.restartCount,
        circuitBreakerTripped: state.circuitBreakerTripped,
        circuitBreakerUntil: state.circuitBreakerUntil > 0
          ? new Date(state.circuitBreakerUntil).toISOString() : null,
        healthy: this.isAgentHealthy(name),
      };
    }
    return {
      running: this.healthTimer !== null,
      config: this.config,
      agents: agentStatuses,
      recentActions: this.actionHistory.slice(-20),
    };
  }

  /** Report an action from an agent (called by the agent itself or orchestrator) */
  reportAction(agentName: string, action: string, success: boolean, error?: string): void {
    const entry: AgentAction = { agentName, action, timestamp: Date.now(), success, error };
    this.actionHistory.push(entry);
    if (this.actionHistory.length > this.maxHistory) {
      this.actionHistory = this.actionHistory.slice(-this.maxHistory);
    }

    const state = this.agents.get(agentName);
    if (!state) return;

    // Update state
    state.lastAction = action;
    state.lastActionTime = Date.now();

    // Loop detection: check if same action as before
    if (action === state.lastAction && !success) {
      state.loopCount++;
      console.warn("[Supervisor] Loop detected for " + agentName + " (count: " + state.loopCount + ")");
      if (state.loopCount >= this.config.maxLoopCount) {
        console.warn("[Supervisor] Loop threshold reached for " + agentName + ", forcing break...");
        this.forceBreak(agentName, "Loop detected: repeated action '" + action + "' " + state.loopCount + " times");
        state.loopCount = 0;
      }
    } else {
      state.loopCount = 0;
    }
  }

  /** Force-break a stuck agent */
  async forceBreak(agentName: string, reason: string): Promise<{ success: boolean; message: string }> {
    console.log("[Supervisor] Force-breaking " + agentName + ": " + reason);
    const state = this.agents.get(agentName);
    if (!state) return { success: false, message: "Unknown agent: " + agentName };

    // Send alert
    await this.sendAlert(":warning: Agent Force Break", [
      "Agent: **" + agentName + "**",
      "Reason: " + reason,
      "Time: " + new Date().toISOString(),
    ]);

    // Restart the agent via lifecycle
    const result = await this.restartAgent(agentName);
    return result;
  }

  /** Restart an agent */
  async restartAgent(agentName: string): Promise<{ success: boolean; message: string }> {
    const state = this.agents.get(agentName);
    if (!state) return { success: false, message: "Unknown agent: " + agentName };

    // Check circuit breaker
    if (state.circuitBreakerTripped) {
      if (Date.now() < state.circuitBreakerUntil) {
        const remaining = Math.round((state.circuitBreakerUntil - Date.now()) / 1000);
        return {
          success: false,
          message: "Circuit breaker active for " + agentName + " (" + remaining + "s remaining)",
        };
      } else {
        // Reset circuit breaker
        state.circuitBreakerTripped = false;
        state.circuitBreakerUntil = 0;
        state.restartCount = 0;
      }
    }

    // Increment restart count
    state.restartCount++;

    // Check if we need to trip circuit breaker
    if (state.restartCount > this.config.maxRestarts) {
      state.circuitBreakerTripped = true;
      state.circuitBreakerUntil = Date.now() + this.config.circuitBreakerPauseMs;
      state.status = "paused";
      const pauseMin = Math.round(this.config.circuitBreakerPauseMs / 60000);

      await this.sendAlert(":fire: Circuit Breaker Tripped", [
        "Agent: **" + agentName + "**",
        "Restarts: " + state.restartCount + " (threshold: " + this.config.maxRestarts + ")",
        "Pausing for: " + pauseMin + " minutes",
        "Time: " + new Date().toISOString(),
      ]);

      return {
        success: false,
        message: "Circuit breaker tripped for " + agentName + ", pausing " + pauseMin + "m",
      };
    }

    // Perform restart: sleep then wake
    console.log("[Supervisor] Restarting " + agentName + " (attempt " + state.restartCount + ")");
    await this.lifecycle.sleepAgent(agentName);
    await new Promise(r => setTimeout(r, 2000));
    const wakeResult = await this.lifecycle.wakeAgent(agentName);

    if (wakeResult.success) {
      state.status = "running";
      state.lastActionTime = Date.now();
      state.loopCount = 0;
      console.log("[Supervisor] Successfully restarted " + agentName);
    }

    return wakeResult;
  }

  /** Register a new agent to supervise */
  registerAgent(name: string): void {
    if (!this.agents.has(name)) {
      this.agents.set(name, {
        lastAction: "",
        lastActionTime: Date.now(),
        loopCount: 0,
        restartCount: 0,
        circuitBreakerTripped: false,
        circuitBreakerUntil: 0,
        status: "unknown",
      });
      console.log("[Supervisor] Registered agent: " + name);
    }
  }

  /** Unregister an agent */
  unregisterAgent(name: string): void {
    this.agents.delete(name);
    console.log("[Supervisor] Unregistered agent: " + name);
  }

  // ── Healthcheck ──────────────────────────────────────────────

  private async healthcheck(): Promise<void> {
    for (const [name, state] of this.agents) {
      try {
        const healthy = this.isAgentHealthy(name);
        if (!healthy && state.status !== "paused") {
          console.warn("[Supervisor] Agent " + name + " is unhealthy (last action: " +
            (Date.now() - state.lastActionTime) / 1000 + "s ago)");
          state.status = "stuck";
          await this.restartAgent(name);
        } else if (healthy) {
          state.status = "running";
        }
      } catch (err: any) {
        console.error("[Supervisor] Healthcheck failed for " + name + ":", err.message);
      }
    }
  }

  private isAgentHealthy(name: string): boolean {
    const state = this.agents.get(name);
    if (!state) return false;
    if (state.circuitBreakerTripped) return false;
    const elapsed = Date.now() - state.lastActionTime;
    return elapsed < this.config.stuckTimeoutMs;
  }

  // ── Alerting ─────────────────────────────────────────────────

  async sendAlert(title: string, lines: string[]): Promise<void> {
    const message = lines.join("\n");
    console.log("[Supervisor] Alert: " + title + " - " + message);

    // Slack
    if (this.config.slackWebhookUrl) {
      await this.sendSlack(title, lines);
    }

    // LINE
    if (this.config.lineNotifyToken) {
      await this.sendLine(title + "\n" + message);
    }
  }

  private async sendSlack(title: string, lines: string[]): Promise<void> {
    try {
      const blocks = [
        {
          type: "header",
          text: { type: "plain_text", text: title },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: lines.join("\n"),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "System Agent Supervisor | " + new Date().toISOString(),
            },
          ],
        },
      ];

      await fetch(this.config.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      console.error("[Supervisor] Slack alert failed:", err.message);
    }
  }

  private async sendLine(message: string): Promise<void> {
    try {
      await fetch("https://notify-api.line.me/api/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Bearer " + this.config.lineNotifyToken,
        },
        body: new URLSearchParams({ message }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      console.error("[Supervisor] LINE alert failed:", err.message);
    }
  }
}
