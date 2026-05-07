import { describe, it, expect, vi, beforeEach } from "vitest";
import { EtsyBrowserWorkflow, type EtsyListingParams } from "./etsy-browser-workflow.js";

// Create mock browser instance
const createMockBrowser = () => ({
  navigate: vi.fn(),
  click: vi.fn(),
  fill: vi.fn(),
  screenshot: vi.fn(),
  evaluate: vi.fn(),
  wait: vi.fn(),
  waitForSelector: vi.fn(),
  getUrl: vi.fn(),
  getTitle: vi.fn(),
  scroll: vi.fn(),
  getStatus: vi.fn(),
  restart: vi.fn(),
  init: vi.fn(),
  close: vi.fn(),
  readPage: vi.fn(),
  getState: vi.fn(),
  resetIdle: vi.fn(),
});

vi.mock("./browser-use.js", () => ({
  BrowserUse: vi.fn(),
}));

import { BrowserUse } from "./browser-use.js";

describe("EtsyBrowserWorkflow", () => {
  let workflow: EtsyBrowserWorkflow;
  let mockBrowser: ReturnType<typeof createMockBrowser>;

  const sampleListing: EtsyListingParams = {
    images: ["fakebase64image=="],
    title: "Handmade Ceramic Mug",
    description: "A beautiful handmade ceramic mug, perfect for morning coffee.",
    price: 29.99,
    quantity: 5,
    tags: ["ceramic", "mug", "handmade", "coffee"],
    materials: ["clay", "glaze"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowser = createMockBrowser();
    vi.mocked(BrowserUse).mockReturnValue(mockBrowser as any);
    workflow = new EtsyBrowserWorkflow(mockBrowser as any);
  });

  describe("createListing", () => {
    it("should complete full workflow successfully", async () => {
      mockBrowser.navigate.mockResolvedValue({ success: true });
      mockBrowser.waitForSelector.mockResolvedValue({ success: true });
      mockBrowser.fill.mockResolvedValue({ success: true });
      mockBrowser.click.mockResolvedValue({ success: true });
      mockBrowser.wait.mockResolvedValue({ success: true });
      mockBrowser.getUrl.mockResolvedValue({ success: true, data: { url: "https://www.etsy.com/listing/123456" } });
      mockBrowser.evaluate.mockResolvedValue({ success: true, data: { result: "found" } });
      mockBrowser.screenshot.mockResolvedValue({ success: true, data: { screenshot: "base64screenshot" } });

      process.env.ETSY_EMAIL = "test@example.com";
      process.env.ETSY_PASSWORD = "password123";

      const result = await workflow.createListing(sampleListing);

      expect(result.success).toBe(true);
      expect(result.step).toBe("done");
      expect(result.listingUrl).toContain("etsy.com");
      expect(result.listingId).toBe("123456");
    });

    it("should fail if login step fails", async () => {
      mockBrowser.navigate.mockResolvedValue({ success: true });
      mockBrowser.waitForSelector.mockResolvedValue({ success: true });
      mockBrowser.fill.mockResolvedValue({ success: true });
      mockBrowser.click.mockResolvedValue({ success: true });
      mockBrowser.wait.mockResolvedValue({ success: true });
      mockBrowser.getUrl.mockResolvedValue({ success: true, data: { url: "https://www.etsy.com/signin" } });
      mockBrowser.screenshot.mockResolvedValue({ success: true, data: { screenshot: "base64screenshot" } });

      process.env.ETSY_EMAIL = "test@example.com";
      process.env.ETSY_PASSWORD = "password123";

      const result = await workflow.createListing(sampleListing);

      expect(result.success).toBe(false);
      expect(result.step).toBe("login");
    }, 15000);

    it("should fail if ETSY_EMAIL is not set", async () => {
      delete process.env.ETSY_EMAIL;
      delete process.env.ETSY_PASSWORD;

      // Need to mock navigate for the first step (navigateToLogin)
      mockBrowser.navigate.mockResolvedValue({ success: true });

      const result = await workflow.createListing(sampleListing);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing");
    }, 15000);

    it("should retry on failure", async () => {
      let callCount = 0;
      mockBrowser.navigate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { success: false, error: "Network error" };
        return { success: true };
      });
      mockBrowser.waitForSelector.mockResolvedValue({ success: true });
      mockBrowser.fill.mockResolvedValue({ success: true });
      mockBrowser.click.mockResolvedValue({ success: true });
      mockBrowser.wait.mockResolvedValue({ success: true });
      mockBrowser.getUrl.mockResolvedValue({ success: true, data: { url: "https://www.etsy.com/listing/123456" } });
      mockBrowser.evaluate.mockResolvedValue({ success: true, data: { result: "found" } });
      mockBrowser.screenshot.mockResolvedValue({ success: true, data: { screenshot: "base64screenshot" } });

      process.env.ETSY_EMAIL = "test@example.com";
      process.env.ETSY_PASSWORD = "password123";

      const result = await workflow.createListing(sampleListing);

      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe("getCurrentStep", () => {
    it("should return idle initially", () => {
      expect(workflow.getCurrentStep()).toBe("idle");
    });

    it("should return done after successful workflow", async () => {
      mockBrowser.navigate.mockResolvedValue({ success: true });
      mockBrowser.waitForSelector.mockResolvedValue({ success: true });
      mockBrowser.fill.mockResolvedValue({ success: true });
      mockBrowser.click.mockResolvedValue({ success: true });
      mockBrowser.wait.mockResolvedValue({ success: true });
      mockBrowser.getUrl.mockResolvedValue({ success: true, data: { url: "https://www.etsy.com/listing/123456" } });
      mockBrowser.evaluate.mockResolvedValue({ success: true, data: { result: "found" } });
      mockBrowser.screenshot.mockResolvedValue({ success: true, data: { screenshot: "base64screenshot" } });

      process.env.ETSY_EMAIL = "test@example.com";
      process.env.ETSY_PASSWORD = "password123";

      await workflow.createListing(sampleListing);
      expect(workflow.getCurrentStep()).toBe("done");
    });
  });
});
