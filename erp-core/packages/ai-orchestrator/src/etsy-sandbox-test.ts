// ============================================================
// Etsy Sandbox Test Script
// ============================================================
// รัน: npx tsx src/etsy-sandbox-test.ts
//
// โหมดการทำงาน:
//   1. dry-run (default) — จำลองทุกขั้นตอน ไม่ต้องใช้ Etsy จริง
//   2. api-test — ทดสอบการเชื่อมต่อ Etsy API (ต้องมี API keys)
//   3. browser-test — ทดสอบ browser workflow จริง (ต้องมี Etsy credentials)
//
// ขั้นตอนการเตรียมตัวสำหรับ browser-test:
//   1. ไปที่ https://www.etsy.com/developers/register
//   2. สมัคร Developer Account และสร้าง App
//   3. เปิด https://www.etsy.com/developers/your-apps เพื่อรับ API Key
//   4. สร้างร้านค้าทดสอบที่ https://www.etsy.com/your/shops/me
//   5. ตั้งค่า environment variables:
//      - ETSY_EMAIL: อีเมลที่ใช้ login Etsy
//      - ETSY_PASSWORD: รหัสผ่าน Etsy
//      - ETSY_API_KEY: API key จาก Etsy Developers
//      - ETSY_API_SECRET: Shared secret
//      - ETSY_SHOP_ID: ID ร้านค้า (ดูได้จาก Shop Manager URL)
// ============================================================

import { EtsyBrowserWorkflow, type EtsyListingParams } from "./etsy-browser-workflow.js";
import { BrowserUse } from "./browser-use.js";
import { VisionAnalysis } from "./vision-analysis.js";

// ─── Configuration ──────────────────────────────────────────

const MODE = process.env.TEST_MODE || "dry-run"; // "dry-run" | "api-test" | "browser-test"
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/tmp/etsy-sandbox-test";

interface TestStep {
  name: string;
  status: "pending" | "passed" | "failed" | "skipped";
  duration?: number;
  error?: string;
  screenshot?: string;
}

interface TestReport {
  timestamp: string;
  mode: string;
  steps: TestStep[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

// ─── Mock Browser สำหรับ Dry-Run ────────────────────────────

class MockBrowser {
  private log: string[] = [];

  async navigate(url: string) {
    this.log.push(`[Mock] navigate: ${url}`);
    return { success: true, data: { url } };
  }

  async click(selector: string) {
    this.log.push(`[Mock] click: ${selector}`);
    return { success: true };
  }

  async fill(selector: string, value: string) {
    this.log.push(`[Mock] fill: ${selector} = "${value.slice(0, 30)}..."`);
    return { success: true };
  }

  async screenshot(fullPage?: boolean) {
    return { success: true, data: { screenshot: "mock-screenshot-base64" } };
  }

  async evaluate(script: string) {
    this.log.push(`[Mock] evaluate: ${script.slice(0, 60)}...`);
    return { success: true, data: { result: "mock" } };
  }

  async wait(ms: number) {
    this.log.push(`[Mock] wait: ${ms}ms`);
    return { success: true };
  }

  async waitForSelector(selector: string, timeout?: number) {
    this.log.push(`[Mock] waitForSelector: ${selector}`);
    return { success: true };
  }

  async getUrl() {
    return { success: true, data: { url: "https://www.etsy.com/listing/123456789" } };
  }

  async getTitle() {
    return { success: true, data: { title: "Mock Etsy Page" } };
  }

  async scroll(deltaX: number, deltaY: number) {
    return { success: true };
  }

  async getStatus() {
    return { status: "connected", page: true };
  }

  async restart() {
    return { success: true };
  }

  async init() {
    return { success: true };
  }

  async close() {
    return { success: true };
  }

  async readPage() {
    return { success: true, data: { content: "<html><body>Mock page</body></html>" } };
  }

  getState() {
    return { url: "https://www.etsy.com", title: "Mock" };
  }

  resetIdle() {}

  getLogs(): string[] {
    return this.log;
  }
}

// ─── Test Runner ────────────────────────────────────────────

class EtsySandboxTest {
  private steps: TestStep[] = [];
  private startTime: number = 0;
  private mockBrowser: MockBrowser | null = null;
  private realBrowser: BrowserUse | null = null;

  async run(): Promise<TestReport> {
    console.log("=".repeat(60));
    console.log("🧪 Etsy Sandbox Test Suite");
    console.log(`   Mode: ${MODE}`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log("=".repeat(60));
    console.log();

    this.startTime = Date.now();

    switch (MODE) {
      case "dry-run":
        await this.runDryRun();
        break;
      case "api-test":
        await this.runApiTest();
        break;
      case "browser-test":
        await this.runBrowserTest();
        break;
      default:
        console.error(`Unknown mode: ${MODE}. Use: dry-run, api-test, browser-test`);
    }

    return this.generateReport();
  }

  // ─── Dry Run Mode ───────────────────────────────────────

  private async runDryRun() {
    console.log("📋 Dry Run Mode — จำลองทุกขั้นตอนโดยไม่ต้องเชื่อมต่อ Etsy จริง\n");

    this.mockBrowser = new MockBrowser();
    const workflow = new EtsyBrowserWorkflow(this.mockBrowser as any);

    // ตั้งค่า env ชั่วคราว
    const oldEmail = process.env.ETSY_EMAIL;
    const oldPass = process.env.ETSY_PASSWORD;
    process.env.ETSY_EMAIL = "test-sandbox@example.com";
    process.env.ETSY_PASSWORD = "sandbox-password";

    const sampleListing: EtsyListingParams = {
      images: [
        // 1x1 pixel PNG (base64)
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ],
      title: "Sandbox Test - Handmade Ceramic Mug",
      description: "This is a test listing created by EtsySandboxTest. " +
        "A beautiful handmade ceramic mug, perfect for morning coffee.",
      price: 29.99,
      quantity: 1,
      tags: ["ceramic", "mug", "handmade", "coffee", "test"],
      materials: ["clay", "glaze"],
    };

    // Step 1: ตรวจสอบ params
    await this.recordStep("validate_params", async () => {
      if (!sampleListing.images.length) throw new Error("No images");
      if (!sampleListing.title) throw new Error("No title");
      if (!sampleListing.price || sampleListing.price <= 0) throw new Error("Invalid price");
      if (sampleListing.tags && sampleListing.tags.length > 13) throw new Error("Too many tags");
      console.log("   ✅ Params valid:", sampleListing.title);
    });

    // Step 2: ตรวจสอบ environment
    await this.recordStep("check_env", async () => {
      if (!process.env.ETSY_EMAIL) throw new Error("ETSY_EMAIL not set");
      if (!process.env.ETSY_PASSWORD) throw new Error("ETSY_PASSWORD not set");
      console.log("   ✅ Env vars configured");
    });

    // Step 3: Vision Analysis (ถ้ามี API key)
    await this.recordStep("vision_analysis", async () => {
      const vision = new VisionAnalysis();
      const isConfigured = vision.isConfigured();
      console.log(`   ℹ️  Vision Analysis ${isConfigured ? "configured" : "not configured (skip)"}`);
      if (isConfigured) {
        // วิเคราะห์รูปตัวอย่าง
        const result = await vision.analyze({
          imageBase64: sampleListing.images[0],
          question: "Describe the style of this image",
        });
        console.log(`   ✅ Vision analysis: ${result.success ? "success" : "failed"}`);
      }
    });

    // Step 4: Browser Workflow (จำลอง)
    await this.recordStep("browser_workflow", async () => {
      const result = await workflow.createListing(sampleListing);
      if (!result.success) {
        throw new Error(`Workflow failed at step '${result.step}': ${result.error}`);
      }
      console.log(`   ✅ Listing created: ${result.listingUrl}`);
      console.log(`   📍 Listing ID: ${result.listingId}`);
    });

    // Step 5: ตรวจสอบ logs
    await this.recordStep("verify_logs", async () => {
      const logs = this.mockBrowser!.getLogs();
      const expectedActions = ["navigate", "fill", "click", "evaluate"];
      const found = expectedActions.filter(a => logs.some(l => l.includes(a)));
      console.log(`   ✅ Browser actions executed: ${found.length}/${expectedActions.length}`);
      if (logs.length < 5) throw new Error(`Too few browser actions: ${logs.length}`);
    });

    // Step 6: Etsy API Connector (ตรวจสอบว่า import ได้)
    await this.recordStep("api_connector_check", async () => {
      try {
        // ตรวจสอบว่าไฟล์ connector มีอยู่จริง
        const fs = await import("fs");
        const path = await import("path");
        const connectorPath = path.resolve(__dirname, "../../connectors/etsy/src/index.ts");
        if (fs.existsSync(connectorPath)) {
          console.log(`   ✅ Etsy API Connector found at: ${connectorPath}`);
        } else {
          console.log(`   ℹ️  Etsy API Connector not found at expected path`);
        }
      } catch (err: any) {
        console.log(`   ℹ️  Could not check connector: ${err.message}`);
      }
    });

    // คืนค่า env
    if (oldEmail) process.env.ETSY_EMAIL = oldEmail;
    else delete process.env.ETSY_EMAIL;
    if (oldPass) process.env.ETSY_PASSWORD = oldPass;
    else delete process.env.ETSY_PASSWORD;

    console.log("\n📋 Browser Action Log:");
    for (const log of this.mockBrowser.getLogs()) {
      console.log(`   ${log}`);
    }
  }

  // ─── API Test Mode ──────────────────────────────────────

  private async runApiTest() {
    console.log("🔌 API Test Mode — ทดสอบการเชื่อมต่อ Etsy API\n");

    const apiKey = process.env.ETSY_API_KEY;
    const apiSecret = process.env.ETSY_API_SECRET;
    const shopId = process.env.ETSY_SHOP_ID;

    if (!apiKey) {
      console.log("   ⚠️  ไม่พบ ETSY_API_KEY environment variable");
      console.log("   ข้ามการทดสอบ API (ใช้ dry-run mode แทน)\n");
      await this.runDryRun();
      return;
    }

    // Step 1: ตรวจสอบ API key format
    await this.recordStep("api_key_check", async () => {
      if (!apiKey || apiKey.length < 10) throw new Error("Invalid API key format");
      console.log(`   ✅ API Key: ${apiKey.slice(0, 8)}...`);
    });

    // Step 2: ทดสอบ OAuth flow
    await this.recordStep("oauth_flow", async () => {
      // ตรวจสอบว่าไฟล์ oauth.ts มีอยู่จริง
      const fs = await import("fs");
      const path = await import("path");
      const oauthPath = path.resolve(__dirname, "../../connectors/etsy/src/oauth.ts");
      if (fs.existsSync(oauthPath)) {
        console.log(`   ✅ OAuth module found at: ${oauthPath}`);
        console.log(`   🔗 Client ID: ${apiKey!.slice(0, 8)}...`);
        console.log(`   ℹ️  ต้องทำ OAuth flow ด้วยตนเองผ่าน browser`);
        console.log(`   ℹ️  หลังจาก authorize แล้วจะได้ code ใน redirect URL`);
      } else {
        console.log(`   ℹ️  OAuth module not found`);
      }
    });

    // Step 3: ตรวจสอบ shop
    if (shopId) {
      await this.recordStep("shop_check", async () => {
        console.log(`   ✅ Shop ID: ${shopId}`);
        console.log(`   ℹ️  ต้องมี access token เพื่อเรียก API จริง`);
      });
    } else {
      await this.recordStep("shop_check", async () => {
        console.log(`   ℹ️  ไม่มี ETSY_SHOP_ID — ข้าม`);
      }, true);
    }
  }

  // ─── Browser Test Mode ──────────────────────────────────

  private async runBrowserTest() {
    console.log("🌐 Browser Test Mode — ทดสอบ Etsy Browser Workflow จริง\n");

    const email = process.env.ETSY_EMAIL;
    const password = process.env.ETSY_PASSWORD;

    if (!email || !password) {
      console.log("   ⚠️  ไม่พบ ETSY_EMAIL หรือ ETSY_PASSWORD");
      console.log("   กรุณาตั้งค่า environment variables ก่อนรัน browser-test");
      console.log("   หรือใช้ TEST_MODE=dry-run เพื่อทดสอบแบบจำลอง\n");
      await this.runDryRun();
      return;
    }

    // Step 1: เริ่มต้น Browser
    await this.recordStep("browser_init", async () => {
      this.realBrowser = new BrowserUse();
      await this.realBrowser.init();
      console.log("   ✅ Browser initialized");
    });

    // Step 2: สร้าง Workflow และรัน
    const sampleListing: EtsyListingParams = {
      images: [
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ],
      title: "Sandbox Test - Handmade Ceramic Mug " + Date.now(),
      description: "This is a test listing created by EtsySandboxTest automated script.",
      price: 29.99,
      quantity: 1,
      tags: ["ceramic", "mug", "handmade", "coffee", "test"],
      materials: ["clay", "glaze"],
    };

    await this.recordStep("create_listing", async () => {
      const workflow = new EtsyBrowserWorkflow(this.realBrowser!);
      const result = await workflow.createListing(sampleListing);
      if (!result.success) {
        throw new Error(`Workflow failed at '${result.step}': ${result.error}`);
      }
      console.log(`   ✅ Listing created: ${result.listingUrl}`);
      console.log(`   📍 Listing ID: ${result.listingId}`);
    });

    // Step 3: ปิด Browser
    await this.recordStep("browser_cleanup", async () => {
      await this.realBrowser!.close();
      console.log("   ✅ Browser closed");
    });
  }

  // ─── Helpers ────────────────────────────────────────────

  private async recordStep(name: string, fn: () => Promise<void>, skip = false) {
    const step: TestStep = { name, status: "pending" };
    this.steps.push(step);

    if (skip) {
      step.status = "skipped";
      console.log(`⏭️  ${name}: skipped\n`);
      return;
    }

    const start = Date.now();
    try {
      await fn();
      step.status = "passed";
      step.duration = Date.now() - start;
      console.log(`   ✅ ${name} (${step.duration}ms)\n`);
    } catch (err: any) {
      step.status = "failed";
      step.duration = Date.now() - start;
      step.error = err.message;
      console.log(`   ❌ ${name} FAILED: ${err.message} (${step.duration}ms)\n`);
    }
  }

  private generateReport(): TestReport {
    const summary = {
      total: this.steps.length,
      passed: this.steps.filter(s => s.status === "passed").length,
      failed: this.steps.filter(s => s.status === "failed").length,
      skipped: this.steps.filter(s => s.status === "skipped").length,
    };

    const report: TestReport = {
      timestamp: new Date().toISOString(),
      mode: MODE,
      steps: this.steps,
      summary,
    };

    // Print summary
    console.log("=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`   Mode: ${MODE}`);
    console.log(`   Total: ${summary.total}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Skipped: ${summary.skipped}`);
    console.log(`   Duration: ${Date.now() - this.startTime}ms`);

    if (summary.failed > 0) {
      console.log("\n❌ Failed Steps:");
      for (const step of this.steps.filter(s => s.status === "failed")) {
        console.log(`   - ${step.name}: ${step.error}`);
      }
    }

    console.log("\n💡 Next Steps:");
    console.log("   1. ไปที่ https://www.etsy.com/developers/register เพื่อสมัคร Developer Account");
    console.log("   2. สร้าง App และรับ API Key");
    console.log("   3. ตั้งค่า environment variables สำหรับ API test");
    console.log("   4. รัน TEST_MODE=api-test เพื่อทดสอบ API connection");
    console.log("   5. รัน TEST_MODE=browser-test เพื่อทดสอบ browser workflow จริง");
    console.log();

    return report;
  }
}

// ─── Main ──────────────────────────────────────────────────

const test = new EtsySandboxTest();
test.run().then((report) => {
  process.exit(report.summary.failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
