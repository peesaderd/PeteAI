// ============================================================
// Watchdog
// Periodically checks resource usage and takes action.
// ============================================================

import { ResourceMonitor } from "./monitor.js";
import { CleanupManager } from "./cleanup.js";
import { AgentLifecycle } from "./lifecycle.js";

interface WatchdogConfig {
  intervalMs: number;
  diskThresholdPercent: number;
  memThresholdPercent: number;
  autoCleanup: boolean;
  autoSleepIdle: boolean;
  notifyWebhook: string;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  intervalMs: 10 * 60 * 1000,  // 10 minutes
  diskThresholdPercent: 80,
  memThresholdPercent: 90,
  autoCleanup: true,
  autoSleepIdle: true,
  notifyWebhook: "",
};

export class Watchdog {
  private monitor: ResourceMonitor;
  private cleanup: CleanupManager;
  private lifecycle: AgentLifecycle;
  private config: WatchdogConfig;
  private timer: NodeJS.Timeout | null = null;
  private lastAlerts: string[] = [];
  private checkCount = 0;

  constructor(monitor: ResourceMonitor, cleanup: CleanupManager, lifecycle: AgentLifecycle) {
    this.monitor = monitor;
    this.cleanup = cleanup;
    this.lifecycle = lifecycle;
    this.config = { ...DEFAULT_CONFIG };
  }

  async start(): Promise<void> {
    console.log("[Watchdog] Starting with interval " + this.config.intervalMs + "ms");
    // Run immediately
    await this.check();
    // Then periodically
    this.timer = setInterval(() => this.check(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateConfig(partial: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...partial };
    console.log("[Watchdog] Config updated", this.config);
    // Restart with new interval if changed
    if (partial.intervalMs && this.timer) {
      this.stop();
      this.start();
    }
  }

  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  getStatus(): Record<string, any> {
    return {
      running: this.timer !== null,
      config: this.config,
      checkCount: this.checkCount,
      lastAlerts: this.lastAlerts,
    };
  }

  private async check(): Promise<void> {
    this.checkCount++;
    try {
      const status = await this.monitor.getStatus();
      const alerts: string[] = [];

      // Check disk
      if (status.diskPercent > this.config.diskThresholdPercent) {
        alerts.push("DISK: " + status.diskPercent + "% (threshold: " + this.config.diskThresholdPercent + "%)");
      }

      // Check memory
      if (status.memPercent > this.config.memThresholdPercent) {
        alerts.push("MEM: " + status.memPercent + "% (threshold: " + this.config.memThresholdPercent + "%)");
      }

      this.lastAlerts = alerts;

      if (alerts.length > 0) {
        console.warn("[Watchdog] Alerts detected:", alerts.join(", "));

        // Auto-cleanup if enabled
        if (this.config.autoCleanup) {
          console.log("[Watchdog] Running auto-cleanup...");
          const cleanResult = await this.cleanup.runAll();
          console.log("[Watchdog] Cleanup result:", JSON.stringify(cleanResult));
        }

        // Sleep idle agents if enabled
        if (this.config.autoSleepIdle) {
          console.log("[Watchdog] Sleeping idle agents...");
          const sleepResult = await this.lifecycle.sleepAllIdle();
          console.log("[Watchdog] Slept agents:", sleepResult.slept.join(", "));
        }

        // Notify webhook if configured
        if (this.config.notifyWebhook) {
          try {
            await fetch(this.config.notifyWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "watchdog_alert",
                alerts,
                timestamp: new Date().toISOString(),
                status,
              }),
            });
          } catch (err: any) {
            console.error("[Watchdog] Webhook notification failed:", err.message);
          }
        }
      }
    } catch (err: any) {
      console.error("[Watchdog] Check failed:", err.message);
    }
  }
}
