// ============================================================
// Etsy Browser Workflow — Agent ลงสินค้าบน Etsy ผ่าน Browser
//
// ใช้ Playwright (BrowserUse) เพื่อ:
// 1. Login Etsy
// 2. สร้าง listing ใหม่
// 3. อัปโหลดรูป
// 4. กรอกข้อมูลสินค้า
// 5. Publish
//
// มี Retry + Fallback เมื่อ UI เปลี่ยน
// ============================================================

import { BrowserUse, type BrowserActionResult } from "./browser-use.js";

// ─── Types ───────────────────────────────────────────────────

export interface EtsyListingParams {
  /** รูปภาพ (base64) */
  images: string[];
  /** ชื่อสินค้า */
  title: string;
  /** คำอธิบาย */
  description: string;
  /** ราคา */
  price: number;
  /** จำนวนใน stock */
  quantity: number;
  /** หมวดหมู่ (tags) */
  tags: string[];
  /** หมวดหมู่ Etsy path */
  categoryPath?: string;
  /** น้ำหนัก (oz) */
  weightOz?: number;
  /** ขนาด */
  dimensions?: { length: number; width: number; height: number; unit: "in" | "cm" };
  /** วัสดุ */
  materials?: string[];
  /** รูปแบบการผลิต */
  productionPartner?: string;
  /** WHO made it? */
  whoMade?: "i_did" | "someone_else" | "collective";
  /** เมื่อไหร่ที่ทำ */
  whenMade?: "made_to_order" | "2020_2025" | "2010_2019" | "2009_before";
}

export interface EtsyWorkflowResult {
  success: boolean;
  listingUrl?: string;
  listingId?: string;
  step: string;
  error?: string;
  screenshot?: string;
}

type WorkflowStep =
  | "idle"
  | "navigate_login"
  | "login"
  | "navigate_shop"
  | "create_listing"
  | "upload_images"
  | "fill_details"
  | "set_pricing"
  | "publish"
  | "done"
  | "failed";

// ─── Selectors (อาจเปลี่ยนเมื่อ Etsy อัปเดต UI) ─────────────

const SELECTORS = {
  signInButton: 'button:has-text("Sign in")',
  emailInput: 'input[name="email"]',
  passwordInput: 'input[name="password"]',
  submitButton: 'button[type="submit"]',
  shopManagerLink: 'a:has-text("Shop Manager")',
  listingsTab: 'a:has-text("Listings")',
  addListingButton: 'button:has-text("Add a listing"), a:has-text("Add a listing")',
  listingTitleInput: 'input[name="title"], input[data-test="listing-title"]',
  listingDescriptionInput: 'textarea[name="description"], textarea[data-test="listing-description"]',
  listingPriceInput: 'input[name="price"], input[data-test="listing-price"]',
  listingQuantityInput: 'input[name="quantity"], input[data-test="listing-quantity"]',
  imageUploadInput: 'input[type="file"]',
  imageUploadButton: 'button:has-text("Add photos"), button:has-text("Upload")',
  tagsInput: 'input[name="tags"], input[data-test="tags-input"]',
  publishButton: 'button:has-text("Publish"), button:has-text("Save and publish"), button:has-text("Save")',
  continueButton: 'button:has-text("Continue")',
  nextButton: 'button:has-text("Next")',
};

// ─── Etsy Browser Workflow ──────────────────────────────────

export class EtsyBrowserWorkflow {
  private browser: BrowserUse;
  private currentStep: WorkflowStep = "idle";
  private maxRetries = 3;
  private retryDelay = 2000;

  constructor(browser: BrowserUse) {
    this.browser = browser;
  }

  /** รัน workflow ทั้งหมด */
  async createListing(params: EtsyListingParams): Promise<EtsyWorkflowResult> {
    this.currentStep = "navigate_login";
    let result = await this.withRetry(() => this.navigateToLogin());
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "login";
    result = await this.withRetry(() => this.login());
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "navigate_shop";
    result = await this.withRetry(() => this.navigateToShopManager());
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "create_listing";
    result = await this.withRetry(() => this.clickAddListing());
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "upload_images";
    result = await this.withRetry(() => this.uploadImages(params.images));
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "fill_details";
    result = await this.withRetry(() => this.fillDetails(params));
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "set_pricing";
    result = await this.withRetry(() => this.setPricing(params));
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "publish";
    result = await this.withRetry(() => this.publish());
    if (!result.success) return { ...result, step: this.currentStep };

    this.currentStep = "done";
    return {
      success: true,
      listingUrl: result.listingUrl,
      listingId: result.listingId,
      step: "done",
    };
  }

  // ─── Step Implementations ─────────────────────────────

  private async navigateToLogin(): Promise<EtsyWorkflowResult> {
    const nav = await this.browser.navigate("https://www.etsy.com/signin");
    if (!nav.success) return { success: false, step: this.currentStep, error: nav.error };
    return { success: true, step: this.currentStep };
  }

  private async login(): Promise<EtsyWorkflowResult> {
    const email = process.env.ETSY_EMAIL;
    const password = process.env.ETSY_PASSWORD;

    if (!email || !password) {
      return { success: false, step: this.currentStep, error: "Missing ETSY_EMAIL or ETSY_PASSWORD env vars" };
    }

    await this.browser.waitForSelector(SELECTORS.emailInput, 10000);

    let fill = await this.browser.fill(SELECTORS.emailInput, email);
    if (!fill.success) {
      fill = await this.browser.fill('input[type="email"]', email);
    }
    if (!fill.success) return { success: false, step: this.currentStep, error: `Email fill failed: ${fill.error}` };

    fill = await this.browser.fill(SELECTORS.passwordInput, password);
    if (!fill.success) {
      fill = await this.browser.fill('input[type="password"]', password);
    }
    if (!fill.success) return { success: false, step: this.currentStep, error: `Password fill failed: ${fill.error}` };

    const click = await this.browser.click(SELECTORS.submitButton);
    if (!click.success) {
      await this.browser.evaluate('document.querySelector("form")?.requestSubmit()');
    }

    await this.browser.wait(3000);

    const url = await this.browser.getUrl();
    if (url.success && url.data?.url?.includes("signin")) {
      const screenshot = await this.browser.screenshot();
      return {
        success: false,
        step: this.currentStep,
        error: "Login may have failed - still on signin page",
        screenshot: screenshot.success ? screenshot.data?.screenshot : undefined,
      };
    }

    return { success: true, step: this.currentStep };
  }

  private async navigateToShopManager(): Promise<EtsyWorkflowResult> {
    const nav = await this.browser.navigate("https://www.etsy.com/your/shops/me/dashboard");
    if (!nav.success) {
      await this.browser.navigate("https://www.etsy.com");
      await this.browser.wait(2000);
      await this.browser.click(SELECTORS.shopManagerLink);
    }
    await this.browser.wait(2000);
    return { success: true, step: this.currentStep };
  }

  private async clickAddListing(): Promise<EtsyWorkflowResult> {
    await this.browser.navigate("https://www.etsy.com/your/shops/me/listings");
    await this.browser.wait(2000);

    let click = await this.browser.click(SELECTORS.addListingButton);
    if (!click.success) {
      const nav = await this.browser.navigate("https://www.etsy.com/your/shops/me/listings/new");
      if (!nav.success) {
        return { success: false, step: this.currentStep, error: `Cannot navigate to new listing: ${nav.error}` };
      }
    }

    await this.browser.wait(3000);
    return { success: true, step: this.currentStep };
  }

  private async uploadImages(images: string[]): Promise<EtsyWorkflowResult> {
    if (images.length === 0) {
      return { success: false, step: this.currentStep, error: "No images to upload" };
    }

    // ใช้ browser.evaluate เพื่อสร้าง File จาก base64 และอัปโหลด
    // โดยการหา input[type=file] แล้ว set files
    for (let i = 0; i < images.length; i++) {
      const result = await this.browser.evaluate(`
        (() => {
          const input = document.querySelector('input[type="file"]');
          if (!input) {
            // สร้าง input ใหม่ถ้าไม่มี
            const newInput = document.createElement('input');
            newInput.type = 'file';
            newInput.multiple = true;
            newInput.style.display = 'none';
            newInput.id = 'etsy-upload-input';
            document.body.appendChild(newInput);
          }
          return 'ready';
        })()
      `);
      if (!result.success) {
        return { success: false, step: this.currentStep, error: "Cannot find/create file upload input" };
      }
    }

    // อัปโหลดผ่าน DataTransfer API ใน browser
    const uploadResult = await this.browser.evaluate(`
      (async () => {
        const input = document.querySelector('input[type="file"]') || document.getElementById('etsy-upload-input');
        if (!input) return { error: 'No file input found' };

        const files = [];
        for (let i = 0; i < ${images.length}; i++) {
          const byteChars = atob('${images[0]}');
          const byteArrays = [];
          for (let offset = 0; offset < byteChars.length; offset += 512) {
            const slice = byteChars.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let j = 0; j < slice.length; j++) {
              byteNumbers[j] = slice.charCodeAt(j);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
          }
          files.push(new File(byteArrays, 'image-' + i + '.png', { type: 'image/png' }));
        }

        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        Object.defineProperty(input, 'files', { value: dt.files });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, fileCount: files.length };
      })()
    `);

    if (!uploadResult.success) {
      return { success: false, step: this.currentStep, error: "Upload eval failed: " + (uploadResult.data?.result?.error || "unknown") };
    }

    // รอให้ Etsy ประมวลผลรูป
    await this.browser.wait(5000);

    return { success: true, step: this.currentStep };
  }

  private async fillDetails(params: EtsyListingParams): Promise<EtsyWorkflowResult> {
    let fill = await this.browser.fill(SELECTORS.listingTitleInput, params.title);
    if (!fill.success) {
      fill = await this.browser.fill('input[aria-label*="title" i], input[placeholder*="title" i]', params.title);
    }

    fill = await this.browser.fill(SELECTORS.listingDescriptionInput, params.description);
    if (!fill.success) {
      fill = await this.browser.fill('textarea[aria-label*="description" i], textarea[placeholder*="description" i]', params.description);
    }

    if (params.tags.length > 0) {
      for (const tag of params.tags.slice(0, 13)) {
        fill = await this.browser.fill(SELECTORS.tagsInput, tag);
        if (!fill.success) break;
        await this.browser.wait(300);
        await this.browser.evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
        await this.browser.wait(200);
      }
    }

    if (params.materials && params.materials.length > 0) {
      const materialsInput = 'input[name="materials"], input[data-test="materials-input"]';
      for (const mat of params.materials) {
        fill = await this.browser.fill(materialsInput, mat);
        if (!fill.success) break;
        await this.browser.wait(300);
        await this.browser.evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}))`);
        await this.browser.wait(200);
      }
    }

    return { success: true, step: this.currentStep };
  }

  private async setPricing(params: EtsyListingParams): Promise<EtsyWorkflowResult> {
    let fill = await this.browser.fill(SELECTORS.listingPriceInput, params.price.toString());
    if (!fill.success) {
      fill = await this.browser.fill('input[aria-label*="price" i]', params.price.toString());
    }

    fill = await this.browser.fill(SELECTORS.listingQuantityInput, params.quantity.toString());
    if (!fill.success) {
      fill = await this.browser.fill('input[aria-label*="quantity" i]', params.quantity.toString());
    }

    return { success: true, step: this.currentStep };
  }

  private async publish(): Promise<EtsyWorkflowResult> {
    let click = await this.browser.click(SELECTORS.publishButton);
    if (!click.success) {
      const fallbacks = [
        'button:has-text("Publish")',
        'button:has-text("Save")',
        'button[data-test="publish-button"]',
        'button[type="submit"]',
      ];
      for (const sel of fallbacks) {
        click = await this.browser.click(sel);
        if (click.success) break;
      }
    }

    await this.browser.wait(3000);

    const url = await this.browser.getUrl();
    const listingId = url.success ? this.extractListingId(url.data?.url || "") : undefined;

    const screenshot = await this.browser.screenshot();

    return {
      success: click.success,
      step: this.currentStep,
      listingUrl: url.success ? url.data?.url : undefined,
      listingId,
      screenshot: screenshot.success ? screenshot.data?.screenshot : undefined,
    };
  }

  // ─── Helpers ──────────────────────────────────────────

  private async withRetry(fn: () => Promise<EtsyWorkflowResult>): Promise<EtsyWorkflowResult> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const result = await fn();
      if (result.success) return result;

      console.log(`[EtsyWorkflow] Retry ${attempt + 1}/${this.maxRetries} after error: ${result.error}`);
      if (attempt < this.maxRetries - 1) {
        await this.sleep(this.retryDelay * Math.pow(2, attempt));
      }
    }
    return await fn();
  }

  private extractListingId(url: string): string | undefined {
    const match = url.match(/\/listing\/(\d+)/);
    return match?.[1];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getCurrentStep(): WorkflowStep {
    return this.currentStep;
  }
}
