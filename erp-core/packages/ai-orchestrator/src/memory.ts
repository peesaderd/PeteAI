// ============================================================
// Memory Store — Agent state & tool cache
// Chat sessions/messages moved to chat-store.ts
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";

const DB_PATH =
  process.env.ORCHESTRATOR_DB_PATH ||
  path.join(process.cwd(), "data", "orchestrator.db");

let db: Database.Database | null = null;

export function getOrchestratorDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS agent_state (
      agent_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (agent_id, tenant_id, key)
    );

    CREATE TABLE IF NOT EXISTS tool_cache (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      args_hash TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_cache_hash ON tool_cache(tool_name, args_hash);
  `);
}

export class MemoryStore {
  private d: Database.Database;

  constructor() {
    this.d = getOrchestratorDb();
  }

  setAgentState(
    agentId: string,
    tenantId: string,
    key: string,
    value: string
  ): void {
    const now = Math.floor(Date.now() / 1000);
    this.d
      .prepare(
        "INSERT OR REPLACE INTO agent_state (agent_id, tenant_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(agentId, tenantId, key, value, now);
  }

  getAgentState(
    agentId: string,
    tenantId: string,
    key: string
  ): string | null {
    const row = this.d
      .prepare(
        "SELECT value FROM agent_state WHERE agent_id = ? AND tenant_id = ? AND key = ?"
      )
      .get(agentId, tenantId, key) as any;
    return row?.value || null;
  }

  getAllAgentState(agentId: string, tenantId: string): Record<string, string> {
    const rows = this.d
      .prepare(
        "SELECT key, value FROM agent_state WHERE agent_id = ? AND tenant_id = ?"
      )
      .all(agentId, tenantId) as any[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }

  cacheToolResult(
    toolName: string,
    args: any,
    result: string,
    ttlSeconds = 300
  ): string {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    const argsHash = this.hashArgs(args);
    this.d
      .prepare(
        "INSERT INTO tool_cache (id, tool_name, args_hash, result, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, toolName, argsHash, result, now, now + ttlSeconds);
    return id;
  }

  getCachedToolResult(toolName: string, args: any): string | null {
    const now = Math.floor(Date.now() / 1000);
    const argsHash = this.hashArgs(args);
    const row = this.d
      .prepare(
        "SELECT result FROM tool_cache WHERE tool_name = ? AND args_hash = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(toolName, argsHash, now) as any;
    return row?.result || null;
  }

  private hashArgs(args: any): string {
    const str = JSON.stringify(args, Object.keys(args).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash.toString(36);
  }

}
