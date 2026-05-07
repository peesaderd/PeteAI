import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Mock fetch globally
// ============================================================

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

// Create shared mock functions for fs using vi.hoisted (runs before vi.mock)
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock fs and path for state management
vi.mock("fs", () => mockFs);

vi.mock("path", () => ({
  dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/")),
  join: vi.fn((...args: string[]) => args.join("/")),
}));

// Mock express and cors
vi.mock("express", () => {
  const mockApp = {
    use: vi.fn(() => mockApp),
    get: vi.fn(() => mockApp),
    post: vi.fn(() => mockApp),
    listen: vi.fn((_port: number, _host: string, cb: () => void) => {
      if (cb) cb();
      return { close: vi.fn() };
    }),
  };
  const expressFn: any = () => mockApp;
  expressFn.json = vi.fn(() => vi.fn());
  expressFn.static = vi.fn(() => vi.fn());
  return { default: expressFn };
});

vi.mock("cors", () => ({
  default: vi.fn(() => vi.fn()),
}));

// ============================================================
// Import after mocks
// ============================================================

import {
  siyuanPost,
  listNotebooks,
  listDocs,
  exportMd,
  getDocInfo,
  kbPost,
  kbGet,
  createKbDocument,
  findKbCollection,
  ensureKbCollection,
  SiYuanSync,
  ReverseSync,
  createApp,
} from "./index.ts";

// ============================================================
// Test Setup
// ============================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  });
  mockFs.existsSync.mockReturnValue(false);
});

// ============================================================
// SiYuan API Client Tests
// ============================================================

describe("SiYuan API Client", () => {
  describe("siyuanPost", () => {
    it("should make a POST request to the correct URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 0, data: { notebooks: [] } }),
      });

      const result = await siyuanPost("/api/notebook/lsNotebooks", {});

      expect(mockFetch).toHaveBeenCalledWith(
        "http://siyuan:54511/api/notebook/lsNotebooks",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual({ code: 0, data: { notebooks: [] } });
    });

    it("should include auth token when SIYUAN_API_TOKEN is set", async () => {
      const prevToken = process.env.SIYUAN_API_TOKEN;
      process.env.SIYUAN_API_TOKEN = "test-token-123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await siyuanPost("/api/test", {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Token test-token-123",
          }),
        })
      );

      process.env.SIYUAN_API_TOKEN = prevToken || "";
    });

    it("should throw on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(siyuanPost("/api/test", {})).rejects.toThrow(
        "SiYuan /api/test: 401 Unauthorized"
      );
    });
  });

  describe("listNotebooks", () => {
    it("should return notebooks from response", async () => {
      const mockNotebooks = [
        { id: "nb1", name: "Notebook 1" },
        { id: "nb2", name: "Notebook 2" },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { notebooks: mockNotebooks } }),
      });

      const result = await listNotebooks();
      expect(result).toEqual(mockNotebooks);
    });

    it("should return empty array when no notebooks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      const result = await listNotebooks();
      expect(result).toEqual([]);
    });
  });

  describe("listDocs", () => {
    it("should return docs for a notebook", async () => {
      const mockDocs = [
        { id: "doc1", name: "Doc 1" },
        { id: "doc2", name: "Doc 2" },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { files: mockDocs } }),
      });

      const result = await listDocs("nb1");
      expect(result).toEqual(mockDocs);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://siyuan:54511/api/filetree/listDocsByPath",
        expect.objectContaining({
          body: JSON.stringify({ notebook: "nb1", path: "/" }),
        })
      );
    });
  });

  describe("exportMd", () => {
    it("should return markdown content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { content: "# Hello World" } }),
      });

      const result = await exportMd("doc1");
      expect(result).toBe("# Hello World");
    });

    it("should return empty string when no content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: {} }),
      });

      const result = await exportMd("doc1");
      expect(result).toBe("");
    });
  });

  describe("getDocInfo", () => {
    it("should return doc info", async () => {
      const mockInfo = { id: "doc1", box: "nb1", hPath: "/My Doc" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockInfo }),
      });

      const result = await getDocInfo("doc1");
      expect(result).toEqual(mockInfo);
    });
  });
});

// ============================================================
// KB API Client Tests
// ============================================================

describe("KB API Client", () => {
  describe("kbPost", () => {
    it("should make a POST request to KB service", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "kb1" }),
      });

      const result = await kbPost("/api/documents", { title: "Test" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://knowledge-base:3100/api/documents",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Test" }),
        })
      );
      expect(result).toEqual({ id: "kb1" });
    });

    it("should throw on non-ok response with text body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(kbPost("/api/documents", {})).rejects.toThrow(
        "KB /api/documents: 500 Internal Server Error"
      );
    });
  });

  describe("kbGet", () => {
    it("should make a GET request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: "col1", name: "Collection 1" }]),
      });

      const result = await kbGet("/api/collections");
      expect(result).toEqual([{ id: "col1", name: "Collection 1" }]);
    });

    it("should throw on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(kbGet("/api/nonexistent")).rejects.toThrow(
        "KB GET /api/nonexistent: 404"
      );
    });
  });

  describe("createKbDocument", () => {
    it("should create a document with tags", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "doc-new" }),
      });

      const result = await createKbDocument("col1", "My Doc", "# Content", [
        "siyuan",
        "Notebook1",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://knowledge-base:3100/api/documents",
        expect.objectContaining({
          body: JSON.stringify({
            collectionId: "col1",
            title: "My Doc",
            content: "# Content",
            tags: ["siyuan", "Notebook1"],
          }),
        })
      );
      expect(result).toEqual({ id: "doc-new" });
    });
  });

  describe("findKbCollection", () => {
    it("should return collection ID if found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: "col1", name: "My Notebook" },
          { id: "col2", name: "Other Notebook" },
        ]),
      });

      const result = await findKbCollection("My Notebook");
      expect(result).toBe("col1");
    });

    it("should return null if not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: "col1", name: "My Notebook" },
        ]),
      });

      const result = await findKbCollection("Nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("ensureKbCollection", () => {
    it("should return existing collection ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: "col1", name: "My Notebook" },
        ]),
      });

      const result = await ensureKbCollection("My Notebook");
      expect(result).toBe("col1");
    });

    it("should create collection if not found", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        });

      const result = await ensureKbCollection("New Notebook");
      expect(result).toBe("col-new");
      expect(mockFetch).toHaveBeenLastCalledWith(
        "http://knowledge-base:3100/api/collections",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("New Notebook"),
        })
      );
    });
  });
});

// ============================================================
// Sync Engine Tests
// ============================================================

describe("SiYuanSync", () => {
  let sync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    sync = new SiYuanSync();
  });

  describe("contentHash", () => {
    it("should generate consistent hash for same content", () => {
      const hash1 = sync.contentHash("Hello World");
      const hash2 = sync.contentHash("Hello World");
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different content", () => {
      const hash1 = sync.contentHash("Hello World");
      const hash2 = sync.contentHash("Hello World!");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty string", () => {
      const hash = sync.contentHash("");
      expect(typeof hash).toBe("string");
    });
  });

  describe("syncAll", () => {
    it("should sync notebooks and docs successfully", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { notebooks: [{ id: "nb1", name: "Notebook 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { files: [{ id: "doc1", name: "Doc 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ data: { content: "# Doc 1 Content" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "kb-doc-1" }),
        });

      const result = await sync.syncAll();

      expect(result.synced).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it("should skip docs with unchanged content", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { notebooks: [{ id: "nb1", name: "Notebook 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { files: [{ id: "doc1", name: "Doc 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ data: { content: "# Doc 1 Content" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "kb-doc-1" }),
        });

      await sync.syncAll();

      vi.clearAllMocks();

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { notebooks: [{ id: "nb1", name: "Notebook 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { files: [{ id: "doc1", name: "Doc 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ data: { content: "# Doc 1 Content" } }),
        });

      const result = await sync.syncAll();

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
    });

    it("should handle API errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await sync.syncAll();

      expect(result.synced).toBe(0);
      expect(result.errors).toBe(1);
    });

    it("should handle individual doc sync errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { notebooks: [{ id: "nb1", name: "Notebook 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { files: [{ id: "doc1", name: "Doc 1" }] },
            }),
        })
        .mockRejectedValueOnce(new Error("Export failed"));

      const result = await sync.syncAll();

      expect(result.synced).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe("syncDoc", () => {
    it("should sync a single doc by ID", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ data: { content: "# Single Doc" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { id: "doc1", box: "nb1", hPath: "/My Doc" },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { notebooks: [{ id: "nb1", name: "Notebook 1" }] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "col-new" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: "kb-doc-1" }),
        });

      const result = await sync.syncDoc("doc1");
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Not found"));

      const result = await sync.syncDoc("invalid-id");
      expect(result).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should return sync statistics", () => {
      const stats = sync.getStats();
      expect(stats).toHaveProperty("totalSynced");
      expect(stats).toHaveProperty("lastSyncTime");
      expect(stats).toHaveProperty("errors");
      expect(stats).toHaveProperty("trackedDocs");
      expect(stats).toHaveProperty("isRunning");
      expect(stats.totalSynced).toBe(0);
      expect(stats.trackedDocs).toBe(0);
    });
  });
});

// ============================================================
// ReverseSync Tests
// ============================================================

describe("ReverseSync", () => {
  let reverseSync: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    reverseSync = new ReverseSync();
  });

  describe("syncAll", () => {
    it("should skip if ERP System Documentation notebook not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { notebooks: [{ id: "nb1", name: "Other Notebook" }] },
          }),
      });

      const result = await reverseSync.syncAll();
      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it("should sync KB docs to SiYuan", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                notebooks: [
                  { id: "nb1", name: "ERP System Documentation" },
                ],
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "kb1",
                title: "ERP Guide",
                content: "# ERP Guide Content",
                tags: ["siyuan"],
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ code: 0 }),
        });

      const result = await reverseSync.syncAll();
      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
    });

    it("should skip unchanged docs", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                notebooks: [
                  { id: "nb1", name: "ERP System Documentation" },
                ],
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "kb1",
                title: "ERP Guide",
                content: "# ERP Guide Content",
                tags: ["siyuan"],
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ code: 0 }),
        });

      await reverseSync.syncAll();

      vi.clearAllMocks();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                notebooks: [
                  { id: "nb1", name: "ERP System Documentation" },
                ],
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: "kb1",
                title: "ERP Guide",
                content: "# ERP Guide Content",
                tags: ["siyuan"],
              },
            ]),
        });

      const result = await reverseSync.syncAll();
      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe("getStats", () => {
    it("should return reverse sync statistics", () => {
      const stats = reverseSync.getStats();
      expect(stats).toHaveProperty("totalSynced");
      expect(stats).toHaveProperty("lastSyncTime");
      expect(stats).toHaveProperty("errors");
      expect(stats).toHaveProperty("trackedDocs");
    });
  });
});

// ============================================================
// createApp Tests
// ============================================================

describe("createApp", () => {
  it("should create an express app with sync and reverse sync", () => {
    const { app, sync } = createApp();
    expect(app).toBeDefined();
    expect(app.use).toHaveBeenCalled();
    expect(app.get).toHaveBeenCalled();
    expect(app.post).toHaveBeenCalled();
    expect(sync).toBeDefined();
    expect(sync.getStats).toBeDefined();
  });
});
