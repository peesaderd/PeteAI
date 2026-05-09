// ============================================================
// Task Queue + SQLite
// Persistent task queue — แทน Redis
// ใช้ better-sqlite3 (มีอยู่แล้วใน project)
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ─── Types ───────────────────────────────────────────────────

export type TaskStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "pending_approval";
export type TaskType = "browser" | "api" | "file" | "llm" | "system" | "chat" | "tool";

export interface Task {
  approvalRequired?: boolean;
  approvalToken?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number; // 1 (สูง) - 5 (ต่ำ)
  title: string;
  description: string;
  input: Record<string, any>;
  output: Record<string, any> | null;
  error: string | null;
  sessionId: string | null;
  source: string; // "telegram" | "dashboard" | "chat_api" | "system"
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  type?: TaskType | TaskType[];
  source?: string;
  limit?: number;
  offset?: number;
}

// ─── Task Queue Class ────────────────────────────────────────

export class TaskQueue {
  private db: Database.Database;
  private path: string;

  constructor(dbPath?: string) {
    this.path = dbPath || process.env.TASK_QUEUE_DB_PATH || "/app/data/task-queue.db";

    // ตรวจสอบ directory
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
    console.log(`[TaskQueue] SQLite initialized at ${this.path}`);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('browser','api','file','llm','system','chat','tool')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done','failed','cancelled','pending_approval')),
        priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        input TEXT DEFAULT '{}',
        output TEXT,
        error TEXT,
        session_id TEXT,
        source TEXT DEFAULT 'system',
        approval_required INTEGER DEFAULT 0,
        approval_token TEXT,
        approved_by TEXT,
        approved_at TEXT,
        rejection_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
    `);
  }

  /** เพิ่ม task ใหม่ */
  push(task: Omit<Task, "status" | "createdAt" | "updatedAt" | "startedAt" | "completedAt" | "output" | "error">): Task {
    const id = task.id;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, type, status, priority, title, description, input, session_id, source, approval_required, approval_token, created_at, updated_at)
      VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      task.type,
      task.priority || 3,
      task.title,
      task.description || "",
      JSON.stringify(task.input || {}),
      task.sessionId || null,
      task.source || "system",
      task.approvalRequired ? 1 : 0,
      task.approvalToken || null,
      now,
      now,
    );

    const created = this.get(id)!;
    console.log(`[TaskQueue] Pushed: ${id} (${task.type}/${task.title.slice(0, 50)})`);
    return created;
  }

  /** ดึง task ที่คิวว่างอยู่ตัวแรก (FIFO ตาม priority) */
  pop(): Task | null {
    const row = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'queued'
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    `).get() as any;

    if (!row) return null;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE tasks SET status = 'running', started_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, row.id);

    return this.rowToTask(row);
  }

  /** อัปเดตสถานะ task */
  updateStatus(id: string, status: TaskStatus, meta?: {
    output?: Record<string, any>;
    error?: string;
    progress?: number;
    progressMessage?: string;
  }): Task | null {
    const now = new Date().toISOString();
    const sets: string[] = ["status = ?", "updated_at = ?"];
    const params: any[] = [status, now];

    if (status === "running") {
      sets.push("started_at = ?");
      params.push(now);
    }
    if (status === "done" || status === "failed" || status === "cancelled") {
      sets.push("completed_at = ?");
      params.push(now);
    }
    if (meta?.output) {
      sets.push("output = ?");
      params.push(JSON.stringify(meta.output));
    }
    if (meta?.error) {
      sets.push("error = ?");
      params.push(meta.error);
    }

    params.push(id);
    this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    const updated = this.get(id);
    if (updated) {
      console.log(`[TaskQueue] ${id} → ${status}${meta?.error ? `: ${meta.error.slice(0, 100)}` : ""}`);
    }
    return updated;
  }

  /** อัปเดต output (ไม่เปลี่ยน status) */
  updateOutput(id: string, output: Record<string, any>): Task | null {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE tasks SET output = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(output), now, id);
    return this.get(id);
  }

  /** ดึง task ตาม ID */
  get(id: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  /** ลิสต์ tasks พร้อม filter */
  list(filter?: TaskFilter): Task[] {
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params: any[] = [];

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        sql += ` AND status IN (${filter.status.map(() => "?").join(",")})`;
        params.push(...filter.status);
      } else {
        sql += " AND status = ?";
        params.push(filter.status);
      }
    }

    if (filter?.type) {
      if (Array.isArray(filter.type)) {
        sql += ` AND type IN (${filter.type.map(() => "?").join(",")})`;
        params.push(...filter.type);
      } else {
        sql += " AND type = ?";
        params.push(filter.type);
      }
    }

    if (filter?.source) {
      sql += " AND source = ?";
      params.push(filter.source);
    }

    sql += " ORDER BY priority ASC, created_at DESC";

    if (filter?.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }
    if (filter?.offset) {
      sql += " OFFSET ?";
      params.push(filter.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.rowToTask(r));
  }

  /** นับ tasks ตาม status */
  countByStatus(): Record<TaskStatus, number> {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all() as any[];

    const result: Record<string, number> = {
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result as Record<TaskStatus, number>;
  }

  /** ลบ tasks ที่เสร็จแล้วและเก่ากว่า N วัน */
  cleanOldTasks(daysOld = 7): number {
    const result = this.db.prepare(`
      DELETE FROM tasks
      WHERE status IN ('done', 'failed', 'cancelled')
      AND created_at < datetime('now', ?)
    `).run(`-${daysOld} days`);

    if (result.changes > 0) {
      console.log(`[TaskQueue] Cleaned ${result.changes} old tasks`);
    }
    return result.changes;
  }

  /** ยกเลิก task */
  cancel(id: string): Task | null {
    return this.updateStatus(id, "cancelled");
  }

  /** ดึง task ที่กำลัง run อยู่ */
  getRunning(): Task | null {
    const row = this.db.prepare(`
      SELECT * FROM tasks WHERE status = 'running' ORDER BY started_at ASC LIMIT 1
    `).get() as any;
    return row ? this.rowToTask(row) : null;
  }

  /** ดูว่า queue ว่างไหม */
  isEmpty(): boolean {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks WHERE status = 'queued'
    `).get() as any;
    return row.count === 0;
  }

  /** ดู queue length */
  length(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks WHERE status = 'queued'
    `).get() as any;
    return row.count;
  }

  /** ปิด DB connection */
  approveTask(id: string, approvedBy: string): Task | null {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE tasks SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ? AND (status = ? OR status = ?)"
    ).run("running", approvedBy, now, now, id, "pending_approval", "queued");
    if (result.changes === 0) return null;
    return this.get(id);
  }

  rejectTask(id: string, reason: string): Task | null {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE tasks SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ? AND (status = ? OR status = ?)"
    ).run("cancelled", reason, now, id, "pending_approval", "queued");
    if (result.changes === 0) return null;
    return this.get(id);
  }

  close(): void {
    this.db.close();
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      description: row.description || "",
      input: JSON.parse(row.input || "{}"),
      output: row.output ? JSON.parse(row.output) : null,
      error: row.error || null,
      sessionId: row.session_id || null,
      source: row.source || "system",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
    };
  }
}
