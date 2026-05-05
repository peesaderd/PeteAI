// ============================================================
// Browser Watchdog — ตรวจสอบ health ของ Browser instance
// และ revive อัตโนมัติเมื่อ browser ตาย
//
// ทำงานเป็น background interval:
//   - ทุก 30 วิ เช็คว่า browser ยัง alive ไหม
//   - ถ้าตาย → restart browser + login ใหม่
//   - log สถานะให้รู้
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
