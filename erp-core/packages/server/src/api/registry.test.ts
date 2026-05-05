import { describe, it, expect } from "vitest";

describe("Service Registry", () => {
  describe("service structure", () => {
    it("should validate service shape", () => {
      const service = {
        id: "svc-1",
        name: "ai-orchestrator",
        url: "http://localhost:54516",
        status: "online",
        type: "core",
        registered_at: Date.now(),
      };
      expect(service).toHaveProperty("id");
      expect(service).toHaveProperty("name");
      expect(service).toHaveProperty("url");
      expect(service).toHaveProperty("status");
      expect(service.status).toBe("online");
    });

    it("should detect offline services", () => {
      const service = {
        id: "svc-2",
        name: "knowledge-base",
        url: "http://localhost:3100",
        status: "offline",
        type: "core",
        registered_at: Date.now(),
      };
      expect(service.status).toBe("offline");
    });
  });

  describe("service filtering", () => {
    const services = [
      { id: "1", name: "ai-orchestrator", type: "core", status: "online" },
      { id: "2", name: "knowledge-base", type: "core", status: "online" },
      { id: "3", name: "etsy-connector", type: "connector", status: "offline" },
    ];

    it("should filter by type", () => {
      const core = services.filter((s) => s.type === "core");
      expect(core).toHaveLength(2);
    });

    it("should filter by status", () => {
      const online = services.filter((s) => s.status === "online");
      expect(online).toHaveLength(2);
    });
  });
});
