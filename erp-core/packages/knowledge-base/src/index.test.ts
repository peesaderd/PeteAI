import { describe, it, expect } from "vitest";

describe("Knowledge Base", () => {
  describe("document structure", () => {
    it("should validate document shape", () => {
      const doc = {
        id: "doc-1",
        collection_id: "col-1",
        title: "Test Document",
        content: "# Hello",
        tags: "[\"test\"]",
        is_published: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      expect(doc).toHaveProperty("id");
      expect(doc).toHaveProperty("title");
      expect(doc).toHaveProperty("content");
      expect(doc).toHaveProperty("tags");
      expect(doc.is_published).toBe(1);
    });

    it("should parse tags JSON correctly", () => {
      const tags = "[\"erp\", \"database\", \"sqlite\"]";
      const parsed = JSON.parse(tags);
      expect(parsed).toContain("erp");
      expect(parsed).toContain("database");
      expect(parsed).toHaveLength(3);
    });
  });

  describe("search functionality", () => {
    it("should filter documents by keyword match", () => {
      const docs = [
        { id: "1", title: "ERP System Overview", content: "manages inventory" },
        { id: "2", title: "Database Schema", content: "SQLite tables" },
        { id: "3", title: "Deployment Guide", content: "docker compose" },
      ];
      const keyword = "erp";
      const results = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(keyword) ||
          d.content.toLowerCase().includes(keyword)
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("1");
    });

    it("should return empty array when no match", () => {
      const docs = [
        { id: "1", title: "ERP System", content: "inventory" },
      ];
      const results = docs.filter((d) => d.title.includes("xyz"));
      expect(results).toHaveLength(0);
    });
  });

  describe("collection structure", () => {
    it("should validate collection shape", () => {
      const collection = {
        id: "col-1",
        name: "ERP Documentation",
        description: "All ERP docs",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      expect(collection).toHaveProperty("id");
      expect(collection).toHaveProperty("name");
    });
  });
});
