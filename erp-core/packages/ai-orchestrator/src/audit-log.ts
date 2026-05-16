// ============================================================
// Audit Log — เก็บประวัติการทํางานของ Agent ทุกขั้นตอน
// ใช้ SQLite + รองรับการ query เพื่อเอาไปแสดง Dashboard
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface AuditEntry {
  id?: number;
  timestamp: string;
  agentId: string;
  taskId: string | null;
  action: string;
  status: "started" | "success" | "failed" | "retry";
  message: string;
  metadata?: Record<string, any>;
  tokensUsed?: number;
  durationMs?: number;
}

export class AuditLog {
  private db: Database.Database;
  private ready = false;

  constructor(dbPath?: string) {
    const dir = dbPath || process.env.AUDIT_LOG_PATH || "/home/openhands/erp-core/erp-core/data";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, "audit-log.db"));
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agentId TEXT NOT NULL,
        taskId TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('started','success','failed','retry')),
        message TEXT NOT NULL,
        metadata TEXT,
        tokensUsed INTEGER DEFAULT 0,
        durationMs INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_audit_task ON audit_log(taskId);
      CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agentId);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    `);
    this.ready = true;
  }

  /** บันทึก audit entry */
  log(entry: Omit<AuditEntry, "id" | "timestamp">): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (timestamp, agentId, taskId, action, status, message, metadata, tokensUsed, durationMs)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.agentId,
      entry.taskId || null,
      entry.action,
      entry.status,
      entry.message,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.tokensUsed || 0,
      entry.durationMs || 0
    );
    return Number(result.lastInsertRowid);
  }

  /** ดึง logs ล่าสุด */
  getRecent(limit = 50, offset = 0): AuditEntry[] {
    const rows = this.db.prepare(
      "SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?"
    ).all(limit, offset) as any[];
    return rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  /** ดึง logs ตาม taskId */
  getByTask(taskId: string): AuditEntry[] {
    const rows = this.db.prepare(
      "SELECT * FROM audit_log WHERE taskId = ? ORDER BY id ASC"
    ).all(taskId) as any[];
    return rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  /** สถิติ */
  getStats(): { totalLogs: number; successRate: number; totalTokens: number } {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalLogs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        COALESCE(SUM(tokensUsed), 0) as totalTokens
      FROM audit_log
    `).get() as any;
    return {
      totalLogs: stats.totalLogs,
      successRate: stats.totalLogs > 0 ? (stats.successCount / stats.totalLogs) * 100 : 0,
      totalTokens: stats.totalTokens,
    };
  }

  close() {
    this.db.close();
  }
}
