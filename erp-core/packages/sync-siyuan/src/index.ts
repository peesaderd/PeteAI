// ============================================================
// SiYuan Sync Service
// Syncs SiYuan notes to ERP Knowledge Base
// Uses SiYuan API: exportMdContent, filetree/getDoc
// ============================================================

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const PORT = parseInt(process.env.SYNC_PORT || "54513", 10);
const SIYUAN_URL = process.env.SIYUAN_URL || "http://siyuan:54511";
function getSiyuanToken(): string {
  return process.env.SIYUAN_TOKEN || process.env.SIYUAN_API_TOKEN || "";
}
const KB_URL = process.env.KB_URL || "http://knowledge-base:3100";
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL || "60000", 10);

interface SyncState {
  [docId: string]: {
    lastSync: number;
    hash: string;
  };
}

// ============================================================
// SiYuan API Client
// ============================================================

export async function siyuanPost(endpoint: string, body: any): Promise<any> {
  const url = `${SIYUAN_URL}${endpoint}`;
  const token = getSiyuanToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`SiYuan ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function listNotebooks(): Promise<any[]> {
  const data = await siyuanPost("/api/notebook/lsNotebooks", {});
  return data.data?.notebooks || [];
}

export async function listDocs(notebookId: string): Promise<any[]> {
  const data = await siyuanPost("/api/filetree/listDocsByPath", {
    notebook: notebookId,
    path: "/",
  });
  return data.data?.files || [];
}

export async function exportMd(docId: string): Promise<string> {
  const data = await siyuanPost("/api/export/exportMdContent", { id: docId });
  return data.data?.content || "";
}

export async function getDocInfo(docId: string): Promise<any> {
  const data = await siyuanPost("/api/filetree/getDoc", { id: docId });
  return data.data;
}

// ============================================================
// KB API Client
// ============================================================

export async function kbPost(endpoint: string, body: any): Promise<any> {
  const url = `${KB_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KB ${endpoint}: ${res.status} ${text}`);
  }
  return res.json();
}

export async function kbGet(endpoint: string): Promise<any> {
  const url = `${KB_URL}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KB GET ${endpoint}: ${res.status}`);
  return res.json();
}

export async function createKbDocument(
  collectionId: string,
  title: string,
  content: string,
  tags: string[]
): Promise<any> {
  return kbPost("/api/documents", { collectionId, title, content, tags });
}

export async function findKbCollection(name: string): Promise<string | null> {
  const collections: any[] = await kbGet("/api/collections");
  const found = collections.find((c) => c.name === name);
  return found ? found.id : null;
}

export async function ensureKbCollection(name: string): Promise<string> {
  const existing = await findKbCollection(name);
  if (existing) return existing;
  const col = await kbPost("/api/collections", {
    name,
    description: `Synced from SiYuan notebook: ${name}`,
    icon: "\ud83d\udce5",
  });
  return col.id;
}

// ============================================================
// Sync Engine
// ============================================================

export class SiYuanSync {
  private state: SyncState = {};
  private statePath = "./data/siyuan-sync-state.json";
  private isRunning = false;
  private stats = { totalSynced: 0, lastSyncTime: 0, errors: 0 };

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      if (fs.existsSync(this.statePath)) {
        this.state = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        console.log(`[Sync] Loaded state: ${Object.keys(this.state).length} docs tracked`);
      }
    } catch {
      this.state = {};
    }
  }

  private saveState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[Sync] Failed to save state:", e);
    }
  }

  private contentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  async syncAll(): Promise<{ synced: number; skipped: number; errors: number }> {
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const notebooks = await listNotebooks();
      console.log(`[Sync] Found ${notebooks.length} notebooks`);

      for (const nb of notebooks) {
        const notebookId = nb.id || nb.notebook?.id;
        const notebookName = nb.name || nb.notebook?.name || notebookId;
        if (!notebookId) continue;

        console.log(`[Sync] Processing notebook: ${notebookName} (${notebookId})`);
        const collectionId = await ensureKbCollection(notebookName);
        const docs = await listDocs(notebookId);
        console.log(`[Sync] Found ${docs.length} docs in ${notebookName}`);

        for (const doc of docs) {
          const docId = doc.id;
          if (!docId) continue;

          try {
            const content = await exportMd(docId);
            const hash = this.contentHash(content);
            const title = doc.name || doc.title || docId;

            const prev = this.state[docId];
            if (prev && prev.hash === hash) {
              skipped++;
              continue;
            }

            await createKbDocument(collectionId, title, content, ["siyuan", notebookName]);

            this.state[docId] = { lastSync: Date.now(), hash };
            synced++;
            console.log(`[Sync] Synced: ${title}`);
          } catch (err: any) {
            errors++;
            console.error(`[Sync] Error syncing doc ${docId}: ${err.message}`);
          }
        }
      }

      this.stats.totalSynced += synced;
      this.stats.lastSyncTime = Date.now();
      this.stats.errors += errors;
      this.saveState();
    } catch (err: any) {
      console.error(`[Sync] Sync cycle error: ${err.message}`);
      errors++;
    }

    return { synced, skipped, errors };
  }

  async startPeriodicSync() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[Sync] Starting periodic sync every ${SYNC_INTERVAL_MS}ms`);

    try {
      const result = await this.syncAll();
      console.log(`[Sync] Initial sync: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
    } catch (err: any) {
      console.error(`[Sync] Initial sync failed: ${err.message}`);
    }

    setInterval(async () => {
      try {
        const result = await this.syncAll();
        if (result.synced > 0 || result.errors > 0) {
          console.log(`[Sync] Cycle: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
        }
      } catch (err: any) {
        console.error(`[Sync] Cycle error: ${err.message}`);
      }
    }, SYNC_INTERVAL_MS);
  }

  getStats() {
    return {
      ...this.stats,
      trackedDocs: Object.keys(this.state).length,
      isRunning: this.isRunning,
    };
  }

  async syncDoc(docId: string): Promise<boolean> {
    try {
      const content = await exportMd(docId);
      const docInfo = await getDocInfo(docId);
      const notebookId = docInfo?.box;
      const hash = this.contentHash(content);

      let notebookName = "SiYuan";
      if (notebookId) {
        const notebooks = await listNotebooks();
        const nb = notebooks.find((n: any) => (n.id || n.notebook?.id) === notebookId);
        notebookName = nb?.name || nb?.notebook?.name || notebookId;
      }

      const collectionId = await ensureKbCollection(notebookName);
      const title = docInfo?.hPath?.replace(/^\//, "") || docId;

      await createKbDocument(collectionId, title, content, ["siyuan", notebookName]);

      this.state[docId] = { lastSync: Date.now(), hash };
      this.saveState();

      console.log(`[Sync] Webhook synced: ${title}`);
      return true;
    } catch (err: any) {
      console.error(`[Sync] Webhook sync error for ${docId}: ${err.message}`);
      return false;
    }
  }
}

// ============================================================
// HTTP Server
// ============================================================

export function createApp() {
  const sync = new SiYuanSync();
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: any, res: any) => {
    res.json({ status: "ok", service: "sync-siyuan", ...sync.getStats() });
  });

  app.post("/sync", async (_req: any, res: any) => {
    try {
      const result = await sync.syncAll();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/webhook/siyuan", async (req: any, res: any) => {
    try {
      const { docId } = req.body;
      if (!docId) return res.status(400).json({ error: "docId required" });
      const ok = await sync.syncDoc(docId);
      res.json({ success: ok });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/stats", (_req: any, res: any) => {
    res.json(sync.getStats());
  });

  setupReverseSync(app);

  return { app, sync };
}

export function startServer() {
  const { app, sync } = createApp();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Sync] SiYuan Sync Service running on http://0.0.0.0:${PORT}`);
    console.log(`[Sync] SiYuan: ${SIYUAN_URL}, KB: ${KB_URL}`);
    sync.startPeriodicSync();
  });
}

// ============================================================
// Reverse Sync (KB → SiYuan)
// Syncs KB documents back to SiYuan
// ============================================================

async function listKbDocuments(): Promise<any[]> {
  const data: any[] = await kbGet("/api/documents");
  return data;
}

async function getKbDocument(docId: string): Promise<any> {
  const data = await kbGet(`/api/documents/${docId}`);
  return data;
}

async function findSiYuanDoc(notebookId: string, title: string): Promise<string | null> {
  try {
    const docs = await listDocs(notebookId);
    const found = docs.find((d: any) => (d.name || d.title) === title);
    return found ? found.id : null;
  } catch {
    return null;
  }
}

async function updateSiYuanDoc(notebookId: string, docPath: string, markdown: string): Promise<boolean> {
  try {
    const result = await siyuanPost("/api/filetree/createDocWithMd", {
      notebook: notebookId,
      path: docPath,
      markdown: markdown
    });
    return result.code === 0;
  } catch (err: any) {
    console.error(`[ReverseSync] Error updating SiYuan doc: ${err.message}`);
    return false;
  }
}

export class ReverseSync {
  private statePath = "./data/reverse-sync-state.json";
  private state: { [kbDocId: string]: { lastSync: number; hash: string } } = {};
  private stats = { totalSynced: 0, lastSyncTime: 0, errors: 0 };

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      if (fs.existsSync(this.statePath)) {
        this.state = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        console.log(`[ReverseSync] Loaded state: ${Object.keys(this.state).length} docs tracked`);
      }
    } catch {
      this.state = {};
    }
  }

  private saveState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[ReverseSync] Failed to save state:", e);
    }
  }

  private contentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(36);
  }

  async syncAll(): Promise<{ synced: number; skipped: number; errors: number }> {
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const notebooks = await listNotebooks();
      const erpNotebook = notebooks.find((n: any) => {
        const name = n.name || n.notebook?.name || "";
        return name === "ERP System Documentation";
      });

      if (!erpNotebook) {
        console.log("[ReverseSync] ERP System Documentation notebook not found, skipping");
        return { synced: 0, skipped: 0, errors: 0 };
      }

      const notebookId = erpNotebook.id || erpNotebook.notebook?.id;
      const kbDocs = await listKbDocuments();

      for (const doc of kbDocs) {
        try {
          const docId = doc.id;
          const title = doc.title || doc.name;
          if (!docId || !title) continue;

          // Skip non-ERP docs
          if (!doc.tags?.includes("siyuan") && !doc.collectionId) continue;

          const content = doc.content || "";
          const hash = this.contentHash(content);

          const prev = this.state[docId];
          if (prev && prev.hash === hash) {
            skipped++;
            continue;
          }

          // Update or create doc in SiYuan
          const docPath = "/" + title;
          const success = await updateSiYuanDoc(notebookId, docPath, content);

          if (success) {
            this.state[docId] = { lastSync: Date.now(), hash };
            synced++;
            console.log(`[ReverseSync] Synced to SiYuan: ${title}`);
          } else {
            errors++;
          }
        } catch (err: any) {
          errors++;
          console.error(`[ReverseSync] Error: ${err.message}`);
        }
      }

      this.stats.totalSynced += synced;
      this.stats.lastSyncTime = Date.now();
      this.stats.errors += errors;
      this.saveState();
    } catch (err: any) {
      console.error(`[ReverseSync] Cycle error: ${err.message}`);
      errors++;
    }

    return { synced, skipped, errors };
  }

  getStats() {
    return {
      ...this.stats,
      trackedDocs: Object.keys(this.state).length
    };
  }
}

export function setupReverseSync(app: express.Application) {
  const reverseSync = new ReverseSync();

  // Add reverse sync endpoints
  app.get("/reverse/stats", (_req: any, res: any) => {
    res.json(reverseSync.getStats());
  });

  app.post("/reverse/sync", async (_req: any, res: any) => {
    try {
      const result = await reverseSync.syncAll();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Run reverse sync periodically (every 5 minutes)
  setInterval(async () => {
    try {
      const result = await reverseSync.syncAll();
      if (result.synced > 0 || result.errors > 0) {
        console.log(`[ReverseSync] Cycle: ${result.synced} synced, ${result.skipped} skipped, ${result.errors} errors`);
      }
    } catch (err: any) {
      console.error(`[ReverseSync] Cycle error: ${err.message}`);
    }
  }, 300000);

  console.log("[ReverseSync] Reverse sync initialized (runs every 5 minutes)");

  return reverseSync;
}

// Auto-start when run directly
startServer();
