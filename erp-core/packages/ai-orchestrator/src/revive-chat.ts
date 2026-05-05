// ============================================================
// Revive OpenHands Chat — ใช้ Browser ปลุกแชท OpenHands
// ให้ทำงานต่อโดยอัตโนมัติ
//
// Flow:
//   1. เปิด browser → ไปที่ OpenHands URL
//   2. login ด้วย credentials (ถ้า cookies หมดอายุ)
//   3. หาแชท session ที่ต้องการ
//   4. ส่ง message ไปให้ OpenHands ทำงาน
//   5. อ่าน response กลับมา
//   6. บันทึก cookies ไว้ใช้ครั้งต่อไป
// ============================================================

import { BrowserUse } from "./browser-use.js";

const OPENHANDS_URL = process.env.OPENHANDS_URL || "http://localhost:3001";
const OPENHANDS_EMAIL = process.env.OPENHANDS_EMAIL || "";
const OPENHANDS_PASSWORD = process.env.OPENHANDS_PASSWORD || "";

export interface ReviveResult {
  success: boolean;
  message?: string;
  response?: string;
  error?: string;
  screenshot?: string;
}

export class ReviveChat {
  private browser: BrowserUse;

  constructor(browser: BrowserUse) {
    this.browser = browser;
  }

  /**
   * ตรวจสอบว่ามีการ login แล้วหรือไม่
   * โดยดูจาก cookies ที่บันทึกไว้
   */
  async isLoggedIn(): Promise<boolean> {
    const healthy = await this.browser.isHealthy();
    if (!healthy) return false;

    // ลอง navigate ไปที่ OpenHands ก่อน
    const nav = await this.browser.navigate(OPENHANDS_URL);
    if (!nav.success) return false;

    // ถ้าเจอ input[type=email] หรือ password แสดงว่ายังไม่ login
    const check = await this.browser.evaluate(
      `document.querySelector('input[type="email"]') !== null`
    );
    return !check.data?.result;
  }

  /**
   * login เข้า OpenHands ด้วย email/password
   */
  async login(): Promise<boolean> {
    console.log("[ReviveChat] Logging in to OpenHands...");

    // ไปที่หน้า login
    const nav = await this.browser.navigate(OPENHANDS_URL);
    if (!nav.success) {
      console.error("[ReviveChat] Cannot reach OpenHands:", nav.error);
      return false;
    }

    // รอให้ form โหลด
    await this.browser.wait(2000);

    // กรอก email
    const emailField = 'input[type="email"], input[name="email"], input#email';
    const emailRes = await this.browser.fill(emailField, OPENHANDS_EMAIL);
    if (!emailRes.success) {
      console.error("[ReviveChat] Cannot find email field");
      return false;
    }

    // กรอก password
    const passField = 'input[type="password"], input[name="password"], input#password';
    const passRes = await this.browser.fill(passField, OPENHANDS_PASSWORD);
    if (!passRes.success) {
      console.error("[ReviveChat] Cannot find password field");
      return false;
    }

    // กดปุ่ม login
    const btnSelectors = [
      'button[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Login")',
      'button:has-text("Log in")',
    ];
    let clicked = false;
    for (const sel of btnSelectors) {
      const res = await this.browser.click(sel);
      if (res.success) {
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.error("[ReviveChat] Cannot find login button");
      return false;
    }

    // รอให้ login สำเร็จ
    await this.browser.wait(3000);

    // บันทึก cookies
    await this.browser.saveCookies();

    console.log("[ReviveChat] Login successful");
    return true;
  }

  /**
   * ส่ง message ไปยัง OpenHands chat
   * รอ response แล้วส่งกลับ
   */
  async sendMessage(message: string): Promise<ReviveResult> {
    // เช็ค health ก่อน
    const healthy = await this.browser.isHealthy();
    if (!healthy) {
      const restarted = await this.browser.restart();
      if (!restarted) {
        return { success: false, error: "Browser is dead and cannot be restarted" };
      }
    }

    // ตรวจสอบ login
    const loggedIn = await this.isLoggedIn();
    if (!loggedIn) {
      if (!OPENHANDS_EMAIL || !OPENHANDS_PASSWORD) {
        return {
          success: false,
          error: "Not logged in and no credentials provided. Set OPENHANDS_EMAIL and OPENHANDS_PASSWORD",
        };
      }
      const ok = await this.login();
      if (!ok) {
        return { success: false, error: "Login failed" };
      }
    }

    // หา input field สำหรับพิมพ์ข้อความ
    // OpenHands ใช้ textarea หรือ div[contenteditable]
    const inputSelectors = [
      'textarea',
      'div[contenteditable="true"]',
      'input[type="text"]',
      '[data-testid="chat-input"]',
      '.chat-input',
    ];

    let filled = false;
    for (const sel of inputSelectors) {
      const res = await this.browser.fill(sel, message);
      if (res.success) {
        filled = true;
        break;
      }
    }
    if (!filled) {
      return { success: false, error: "Cannot find chat input field" };
    }

    // กดส่ง (Enter หรือปุ่ม send)
    const sendBtnSelectors = [
      'button[type="submit"]',
      'button:has-text("Send")',
      'button:has-text("ส่ง")',
      '[data-testid="send-button"]',
    ];

    let sent = false;
    for (const sel of sendBtnSelectors) {
      const res = await this.browser.click(sel);
      if (res.success) {
        sent = true;
        break;
      }
    }

    // ถ้าไม่มีปุ่ม send ให้กด Enter แทน
    if (!sent) {
      const enterRes = await this.browser.evaluate(`
        (() => {
          const el = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
          if (!el) return false;
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          return true;
        })()
      `);
      if (!enterRes.success) {
        return { success: false, error: "Cannot send message (no button, cannot press Enter)" };
      }
    }

    // รอให้ OpenHands ตอบ (รอสูงสุด 60 วิ)
    // สังเกตจาก: disable input field, loading indicator, หรือ response ปรากฏ
    await this.browser.wait(2000);

    // อ่าน response
    const readRes = await this.browser.readPage();
    if (!readRes.success) {
      return { success: false, error: "Cannot read response" };
    }

    // ถ่าย screenshot ไว้ดู
    const screenshotRes = await this.browser.screenshot();

    return {
      success: true,
      message: "Message sent to OpenHands",
      response: readRes.data?.content?.slice(-5000), // 5000 ตัวสุดท้าย
      screenshot: screenshotRes.data?.screenshot,
    };
  }

  /**
   * วนรอบรอ response จาก OpenHands
   * จนกว่าจะได้คำตอบหรือ timeout
   */
  async waitForResponse(timeoutMs: number = 120000): Promise<ReviveResult> {
    const start = Date.now();
    let lastContent = "";

    while (Date.now() - start < timeoutMs) {
      const readRes = await this.browser.readPage();
      if (!readRes.success) {
        await this.browser.wait(2000);
        continue;
      }

      const content = readRes.data?.content || "";
      if (content !== lastContent && content.length > 0) {
        // มี content เปลี่ยน แสดงว่าได้ response ใหม่
        const screenshotRes = await this.browser.screenshot();
        return {
          success: true,
          message: "Got response from OpenHands",
          response: content.slice(-5000),
          screenshot: screenshotRes.data?.screenshot,
        };
      }

      lastContent = content;
      await this.browser.wait(2000);
    }

    return { success: false, error: `Timeout waiting for response after ${timeoutMs}ms` };
  }
}
