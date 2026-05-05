// ============================================================
// Browser Watchdog — ตรวจสอบ health ของ Browser instance
// และ revive อัตโนมัติเมื่อ browser ตาย
//
// Smart Sleep Logic:
//   - ถ้า browser ถูก deactivate → หยุดตรวจทั้งหมด
//   - ถ้า browser active แต่ไม่มี chat activity 3 รอบ → sleep
//   - sleep แล้ว browser ถูกปิดจริงๆ
//   - wake อัตโนมัติเมื่อมี request เข้า /api/chat
// ============================================================

import { BrowserUse } from "./browser-use.js";
import { ReviveChat } from "./revive-chat.js";

const CHECK_INTERVAL_MS = parseInt(process.env.BROWSER_WATCHDOG_INTERVAL || "30000", 10);

export class BrowserWatchdog {
  private browser: BrowserUse;
  private revive: ReviveChat;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;

  constructor(browser: BrowserUse) {
    this.browser = browser;
    this.revive = new ReviveChat(browser);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[Watchdog] Started (check every ${CHECK_INTERVAL_MS}ms)`);
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[Watchdog] Stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  private async check(): Promise<void> {
    if (!this.running) return;

    try {
      const status = this.browser.getStatus();

      // ─── ถ้า deactivate → ไม่ต้องทำอะไร ─────────────────
      if (!status.active) return;

      // ─── ถ้า sleeping → ไม่ต้องตรวจ health ──────────────
      if (status.sleeping) return;

      // ─── Smart Sleep: idle check ─────────────────────────
      // Watchdog เรียก checkIdle() ซึ่งจะนับ idle count
      // ถ้าครบ 3 → ปิด browser อัตโนมัติ
      const idle = this.browser.checkIdle();
      if (idle.shouldSleep) {
        console.log("[Watchdog] Browser went to sleep (idle threshold reached)");
        return;
      }

      // ─── Health check ปกติ ──────────────────────────────
      const healthy = await this.browser.isHealthy();

      if (healthy) {
        // ปกติดี — reset failure count
        this.consecutiveFailures = 0;
        return;
      }

      // Browser ไม่ตอบสนอง
      this.consecutiveFailures++;
      console.warn(`[Watchdog] Browser unhealthy (${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);

      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.log("[Watchdog] Browser is dead — attempting restart...");
        await this.recover();
      }
    } catch (err: any) {
      console.error("[Watchdog] Check error:", err.message);
    }
  }

  private async recover(): Promise<boolean> {
    // 1. restart browser
    const restarted = await this.browser.restart();
    if (!restarted) {
      console.error("[Watchdog] Browser restart failed");
      this.consecutiveFailures = 0; // reset เพื่อลองใหม่รอบหน้า
      return false;
    }
    console.log("[Watchdog] Browser restarted successfully");

    // 2. login ใหม่ (ถ้ามี credentials)
    if (process.env.OPENHANDS_EMAIL && process.env.OPENHANDS_PASSWORD) {
      const loggedIn = await this.revive.login();
      if (loggedIn) {
        console.log("[Watchdog] Re-logged in to OpenHands");
      } else {
        console.warn("[Watchdog] Re-login failed — will retry on next check");
      }
    }

    this.consecutiveFailures = 0;
    return true;
  }
}
