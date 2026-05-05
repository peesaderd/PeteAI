import { describe, it, expect, beforeEach } from "vitest";
import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";

const mockFetch = async (url: string, _init?: any) => {
  if (url.includes("/api/search")) {
    return {
      ok: true,
      json: async () => [
        { id: "doc-1", title: "ERP System Overview", collection_id: "col-1", tags: "[\"erp\"]" },
        { id: "doc-2", title: "Database Schema", collection_id: "col-1", tags: "[\"erp\"]" },
      ],
    };
  }
  if (url.includes("/api/documents/")) {
    return {
      ok: true,
      json: async () => ({
        id: "doc-1",
        title: "ERP System Overview",
        content: "# ERP System\nThe ERP system manages inventory and orders.",
        tags: "[\"erp\"]",
      }),
    };
  }
  if (url.includes("/api/mcp")) {
    return {
      ok: true,
      json: async () => ({ success: true, data: { result: "ok" } }),
    };
  }
  return { ok: true, json: async () => ({}) };
};

(globalThis as any).fetch = mockFetch;

describe("ToolRouter", () => {
  let router: ToolRouter;

  beforeEach(() => {
    router = new ToolRouter(new MemoryStore());
  });

  describe("siyuan_search_docs", () => {
    it("should search KB API and return results", async () => {
      const result = await router.executeTool("siyuan_search_docs", { keyword: "ERP" });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      if (result.data && result.data.length > 0) {
        expect(result.data[0]).toHaveProperty("id");
        expect(result.data[0]).toHaveProperty("title");
      }
    });

    it("should return error for empty keyword", async () => {
      const result = await router.executeTool("siyuan_search_docs", { keyword: "" });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("siyuan_get_doc", () => {
    it("should return error for missing id", async () => {
      const result = await router.executeTool("siyuan_get_doc", {});
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("tool definitions", () => {
    it("should have all required tools registered", () => {
      const tools = router.getTools();
      const toolNames = tools.map((t: any) => t.name);
      expect(toolNames).toContain("siyuan_search_docs");
      expect(toolNames).toContain("siyuan_get_doc");
      expect(toolNames).toContain("siyuan_create_doc");
      expect(toolNames).toContain("siyuan_append_doc");
    });
  });
});
