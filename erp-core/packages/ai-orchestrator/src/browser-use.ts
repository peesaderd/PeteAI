// ============================================================
// BrowserUse - Playwright-based browser automation for AI agents
// ============================================================

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface BrowserActionResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
}

// Module-level singleton browser instance
let sharedBrowser: Browser | null = null;
let sharedContext: BrowserContext | null = null;
let sharedPage: Page | null = null;
let sharedUrl: string = "";
let refCount: number = 0;

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
    sharedUrl = "";
  }
}

export class BrowserUse {
  private page: Page | null = null;
  private currentUrl: string = "";

  async init(headless: boolean = true): Promise<void> {
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

  isActive(): boolean {
    return this.page !== null || sharedPage !== null;
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) await this.init();
      const p = this.page!;
      await p.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      sharedUrl = p.url();
      this.currentUrl = p.url();
      const title = await p.title();
      const content = await this.getPageText();
      return {
        success: true,
        data: { url: this.currentUrl, title, contentPreview: content.slice(0, 2000) },
      };
    } catch (err: any) {
      return { success: false, error: "Navigation failed: " + err.message };
    }
  }

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

  async evaluate(script: string): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      const result = await this.page.evaluate(script);
      return { success: true, data: { result } };
    } catch (err: any) {
      return { success: false, error: "Evaluate failed: " + err.message };
    }
  }

  async wait(ms: number): Promise<BrowserActionResult> {
    try {
      if (!this.page) return { success: false, error: "Browser not initialized" };
      await this.page.waitForTimeout(ms);
      return { success: true, data: { waited: ms } };
    } catch (err: any) {
      return { success: false, error: "Wait failed: " + err.message };
    }
  }

  getState(): { active: boolean; url: string } {
    return { active: this.isActive(), url: this.currentUrl };
  }

  private async getPageText(): Promise<string> {
    const p = this.page || sharedPage;
    if (!p) return "";
    return await p.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      const clone = main.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script, style, nav, footer, header, iframe, svg").forEach((el) => el.remove());
      return clone.innerText.replace(/\s+/g, " ").trim();
    });
  }
}
