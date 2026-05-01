// ============================================================
// Memory Store - Persistent memory for AI agents
// Stores conversation history, context, and agent state
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
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      title TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

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

    CREATE INDEX IF NOT EXISTS idx_mem_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_mem_created ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_mem_agent ON sessions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_tool_cache_hash ON tool_cache(tool_name, args_hash);
  `);
}

export interface Session {
  id: string;
  agentId: string;
  tenantId: string;
  title: string | null;
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: string;
  toolResults?: string;
  createdAt: number;
}

export class MemoryStore {
  private d: Database.Database;

  constructor() {
    this.d = getOrchestratorDb();
  }

  createSession(agentId: string, tenantId: string, title?: string): Session {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    this.d
      .prepare(
        "INSERT INTO sessions (id, agent_id, tenant_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(id, agentId, tenantId, title || null, now, now);
    return this.getSession(id)!;
  }

  getSession(id: string): Session | null {
    const row = this.d.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.rowToSession(row);
  }

  listSessions(agentId?: string, tenantId?: string, limit = 50): Session[] {
    let sql = "SELECT * FROM sessions WHERE 1=1";
    const params: any[] = [];
    if (agentId) {
      sql += " AND agent_id = ?";
      params.push(agentId);
    }
    if (tenantId) {
      sql += " AND tenant_id = ?";
      params.push(tenantId);
    }
    sql += " ORDER BY updated_at DESC LIMIT ?";
    params.push(limit);
    return (this.d.prepare(sql).all(...params) as any[]).map((r) =>
      this.rowToSession(r)
    );
  }

  addMessage(
    sessionId: string,
    role: Message["role"],
    content: string,
    extra?: { toolCalls?: string; toolResults?: string }
  ): Message {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    this.d
      .prepare(
        "INSERT INTO messages (id, session_id, role, content, tool_calls, tool_results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id,
        sessionId,
        role,
        content,
        extra?.toolCalls || null,
        extra?.toolResults || null,
        now
      );
    this.d
      .prepare("UPDATE sessions SET updated_at = ? WHERE id = ?")
      .run(now, sessionId);
    return this.getMessage(id)!;
  }

  getMessage(id: string): Message | null {
    const row = this.d.prepare("SELECT * FROM messages WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.rowToMessage(row);
  }

  getSessionMessages(
    sessionId: string,
    limit = 100,
    before?: number
  ): Message[] {
    let sql = "SELECT * FROM messages WHERE session_id = ?";
    const params: any[] = [sessionId];
    if (before) {
      sql += " AND created_at < ?";
      params.push(before);
    }
    sql += " ORDER BY created_at ASC LIMIT ?";
    params.push(limit);
    return (this.d.prepare(sql).all(...params) as any[]).map((r) =>
      this.rowToMessage(r)
    );
  }

  getConversationContext(sessionId: string, maxMessages = 20): Message[] {
    return this.getSessionMessages(sessionId, maxMessages);
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

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      agentId: row.agent_id,
      tenantId: row.tenant_id,
      title: row.title,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToMessage(row: any): Message {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      toolCalls: row.tool_calls,
      toolResults: row.tool_results,
      createdAt: row.created_at,
    };
  }
}
