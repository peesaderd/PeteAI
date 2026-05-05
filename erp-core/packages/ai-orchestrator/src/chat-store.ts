// ============================================================
// Chat Store — Session & message storage for AI chat
// Both Telegram and Web UI use this as the single source of truth
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";

const DB_PATH =
  process.env.ORCHESTRATOR_DB_PATH ||
  path.join(process.cwd(), "data", "orchestrator.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
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
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_msg_created ON chat_messages(created_at, id);
  `);
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: string;
  toolResults?: string;
  createdAt: number;
}

export class ChatStore {
  private d: Database.Database;

  constructor() {
    this.d = getDb();
  }

  // ─── Sessions ─────────────────────────────────────────────

  createSession(id: string, title?: string): ChatSession {
    const now = Date.now();
    this.d
      .prepare(
        "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, title || "", now, now);
    return this.getSession(id)!;
  }

  getSession(id: string): ChatSession | null {
    const row = this.d
      .prepare("SELECT * FROM chat_sessions WHERE id = ?")
      .get(id) as any;
    if (!row) return null;
    return this.rowToSession(row);
  }

  listSessions(limit = 50): ChatSession[] {
    const rows = this.d
      .prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map((r) => this.rowToSession(r));
  }

  deleteSession(id: string): void {
    this.d.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
    this.d.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
  }

  // ─── Messages ─────────────────────────────────────────────

  addMessage(
    sessionId: string,
    role: ChatMessage["role"],
    content: string,
    extra?: { toolCalls?: string; toolResults?: string }
  ): ChatMessage {
    const id = uuid();
    const now = Date.now();
    this.d
      .prepare(
        "INSERT INTO chat_messages (id, session_id, role, content, tool_calls, tool_results, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(id, sessionId, role, content, extra?.toolCalls || null, extra?.toolResults || null, now);
    this.d
      .prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?")
      .run(now, sessionId);
    return this.getMessage(id)!;
  }

  getMessage(id: string): ChatMessage | null {
    const row = this.d
      .prepare("SELECT * FROM chat_messages WHERE id = ?")
      .get(id) as any;
    if (!row) return null;
    return this.rowToMessage(row);
  }

  getMessages(sessionId: string, limit = 100): ChatMessage[] {
    const rows = this.d
      .prepare(
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT ?"
      )
      .all(sessionId, limit) as any[];
    return rows.map((r) => this.rowToMessage(r));
  }

  getContext(sessionId: string, maxMessages = 20): ChatMessage[] {
    const rows = this.d
      .prepare(
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
      )
      .all(sessionId, maxMessages) as any[];
    return rows.reverse().map((r) => this.rowToMessage(r));
  }

  deleteLastMessage(sessionId: string): void {
    const row = this.d
      .prepare(
        "SELECT id FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1"
      )
      .get(sessionId) as any;
    if (row) {
      this.d.prepare("DELETE FROM chat_messages WHERE id = ?").run(row.id);
    }
  }

  // ─── Row Mappers ──────────────────────────────────────────

  private rowToSession(row: any): ChatSession {
    return {
      id: row.id,
      title: row.title || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToMessage(row: any): ChatMessage {
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
