// ============================================================
// BrowserUse - Playwright-based browser automation for AI agents
// Designed for: revive OpenHands chat, web automation, E2E tests
// ============================================================

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "fs";
import path from "path";

export interface BrowserActionResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
}

const COOKIE_PATH = process.env.BROWSER_COOKIE_PATH || "/tmp/browser-cookies.json";

// ─── Module-level singleton ──────────────────────────────────
let sharedBrowser: Browser | null = null;
let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;
let refCount: number = 0;

// ─── Smart Sleep State ───────────────────────────────────────
let isActive = true;           // manual on/off
let isSleeping = false;        // auto-sleep (browser closed)
let idleCount = 0;             // consecutive idle checks
const MAX_IDLE_CHECKS = 3;     // sleep after 3 idle checks

async function getSharedPage(): Promise<Page> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    sharedContext = await sharedBrowser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });

    // Load saved cookies if available
    if (fs.existsSync(COOKIE_PATH)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, "utf-8"));
        await sharedContext.addCookies(cookies);
      } catch (e) {
        // Ignore corrupt cookie file
      }
    }

    sharedPage = await sharedContext.newPage();
  }
  return sharedPage!;
}

async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
    sharedContext = null;
    sharedPage = null;
  }
}

// ─── BrowserUse Class ────────────────────────────────────────

export class BrowserUse {
  private page: Page | null = null;

  async init(): Promise<void> {
    refCount++;
    this.page = await getSharedPage();
  }

  async close(): Promise<void> {
    refCount--;
    if (refCount <= 0) {
      await closeSharedBrowser();
    }
    this.page = null;
  }

  /** Check if browser is still alive by evaluating a simple script */
  async isHealthy(): Promise<boolean> {
    try {
      const p = this.page || sharedPage;
      if (!p) return false;
      await p.evaluate("1+1");
      return true;
    } catch {
      return false;
    }
  }

  /** Save current cookies to disk for session persistence */
  async saveCookies(): Promise<void> {
    try {
      const ctx = sharedContext || this.page?.context();
      if (!ctx) return;
      const cookies = await ctx.cookies();
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    } catch {
      // Silently fail — cookies are optional
    }
  }

  /** Force restart browser instance */
  async restart(): Promise<boolean> {
    try {
      await closeSharedBrowser();
      refCount = 0;
      this.page = null;
      await this.init();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Smart Sleep: Manual Control ───────────────────────────

  /** เปิด browser — ให้ Watchdog ตรวจต่อไป */
  activate(): void {
    isActive = true;
    isSleeping = false;
    idleCount = 0;
    console.log("[BrowserUse] Activated");
  }

  /** ปิด browser — Watchdog หยุดตรวจ, browser ถูกปิด */
  async deactivate(): Promise<void> {
    isActive = false;
    isSleeping = false;
    idleCount = 0;
    await closeSharedBrowser();
    refCount = 0;
    this.page = null;
    console.log("[BrowserUse] Deactivated — browser closed");
  }

  /** ปลุกจาก sleep — เรียกเมื่อมี request เข้า /api/chat */
  async wake(): Promise<boolean> {
    if (!isActive) {
      console.log("[BrowserUse] Cannot wake — browser is deactivated");
      return false;
    }
    if (!isSleeping) return true; // already awake
    isSleeping = false;
    idleCount = 0;
    console.log("[BrowserUse] Waking from sleep...");
    try {
      await this.init();
      return true;
    } catch (err: any) {
      console.error("[BrowserUse] Wake failed:", err.message);
      return false;
    }
  }

  /** ตรวจสอบว่า browser ควร sleep หรือไม่ (เรียกโดย Watchdog) */
  checkIdle(): { shouldSleep: boolean; idleCount: number } {
    if (!isActive || isSleeping) {
      return { shouldSleep: false, idleCount: 0 };
    }
    idleCount++;
    const shouldSleep = idleCount >= MAX_IDLE_CHECKS;
    if (shouldSleep) {
      isSleeping = true;
      console.log("[BrowserUse] Idle threshold reached — going to sleep");
      // ปิด browser จริงๆ ตอน sleep
      closeSharedBrowser().catch(() => {});
      refCount = 0;
      this.page = null;
    }
    return { shouldSleep, idleCount };
  }

  /** รีเซ็ต idle count — เรียกเมื่อมี activity */
  resetIdle(): void {
    idleCount = 0;
  }

  /** ดูสถานะปัจจุบัน */
  getStatus(): { active: boolean; sleeping: boolean; idleCount: number; healthy: boolean; url: string } {
    const p = this.page || sharedPage;
    const healthy = p !== null && !p.isClosed();
    return {
      active: isActive,
      sleeping: isSleeping,
      idleCount,
      healthy,
      url: p ? p.url() : "",
    };
  }

  // ─── Navigation ────────────────────────────────────────────

  async navigate(url: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) await this.init();
      const p = this.page!;
      await p.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const title = await p.title();
      const content = await this.getPageText();
      return {
        success: true,
        data: { url: p.url(), title, contentPreview: content.slice(0, 2000) },
      };
    } catch (err: any) {
      return { success: false, error: "Navigation failed: " + err.message };
    }
  }

  // ─── Click ─────────────────────────────────────────────────

  async click(selector: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.click(selector);
      await this.page.waitForTimeout(500);
      const content = await this.getPageText();
      return {
        success: true,
        data: { url: this.page.url(), contentPreview: content.slice(0, 2000) },
      };
    } catch (err: any) {
      return { success: false, error: "Click failed: " + err.message };
    }
  }

  // ─── Fill ──────────────────────────────────────────────────

  async fill(selector: string, value: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.waitForSelector(selector, { timeout: 5000 });
      await this.page.fill(selector, value);
      return { success: true, data: { filled: selector } };
    } catch (err: any) {
      return { success: false, error: "Fill failed: " + err.message };
    }
  }

  // ─── Screenshot ────────────────────────────────────────────

  async screenshot(fullPage: boolean = false): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      const buffer = await this.page.screenshot({ fullPage, type: "png" });
      return {
        success: true,
        data: { screenshot: buffer.toString("base64"), url: this.page.url() },
      };
    } catch (err: any) {
      return { success: false, error: "Screenshot failed: " + err.message };
    }
  }

  // ─── Read Page ─────────────────────────────────────────────

  async readPage(): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      const content = await this.getPageText();
      const title = await this.page.title();
      return {
        success: true,
        data: { url: this.page.url(), title, content },
      };
    } catch (err: any) {
      return { success: false, error: "Read page failed: " + err.message };
    }
  }

  // ─── Evaluate JS ───────────────────────────────────────────

  async evaluate(script: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      const result = await this.page.evaluate(script);
      return { success: true, data: { result } };
    } catch (err: any) {
      return { success: false, error: "Evaluate failed: " + err.message };
    }
  }

  // ─── Wait ──────────────────────────────────────────────────

  async wait(ms: number): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.waitForTimeout(ms);
      return { success: true, data: { waited: ms } };
    } catch (err: any) {
      return { success: false, error: "Wait failed: " + err.message };
    }
  }

  // ─── Scroll ────────────────────────────────────────────────

  async scroll(deltaX: number, deltaY: number): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.evaluate(({ dx, dy }) => window.scrollBy(dx, dy), { dx: deltaX, dy: deltaY });
      await this.page.waitForTimeout(300);
      return { success: true, data: { scrolled: { x: deltaX, y: deltaY } } };
    } catch (err: any) {
      return { success: false, error: "Scroll failed: " + err.message };
    }
  }

  // ─── Get Current URL ───────────────────────────────────────

  async getUrl(): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      return { success: true, data: { url: this.page.url() } };
    } catch (err: any) {
      return { success: false, error: "getUrl failed: " + err.message };
    }
  }

  // ─── Get Page Title ────────────────────────────────────────

  async getTitle(): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      const title = await this.page.title();
      return { success: true, data: { title } };
    } catch (err: any) {
      return { success: false, error: "getTitle failed: " + err.message };
    }
  }

  // ─── Wait for Selector ─────────────────────────────────────

  async waitForSelector(selector: string, timeoutMs: number = 10000): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.waitForSelector(selector, { timeout: timeoutMs });
      return { success: true, data: { selector, found: true } };
    } catch (err: any) {
      return { success: false, error: `waitForSelector failed: ${err.message}` };
    }
  }

  // ─── State ─────────────────────────────────────────────────

  getState(): { active: boolean; url: string } {
    const p = this.page || sharedPage;
    return {
      active: p !== null && !p.isClosed(),
      url: p ? p.url() : "",
    };
  }

  // ─── Private Helpers ───────────────────────────────────────

  private async getPageText(): Promise<string> {
    const p = this.page || sharedPage;
    if (!p || p.isClosed()) return "";
    try {
      return await p.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        if (!main) return "";
        const clone = main.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script, style, nav, footer, header, iframe, svg").forEach((el) => el.remove());
        return clone.innerText.replace(/\s+/g, " ").trim();
      });
    } catch {
      return "";
    }
  }
}
