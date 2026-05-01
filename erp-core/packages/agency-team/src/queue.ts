// ============================================================
// Task Queue - SQLite-based queue for inter-agent communication
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import type { AgentRole } from './registry.js';

const DB_PATH = process.env.AGENCY_DB_PATH || path.join(process.cwd(), 'data', 'agency-queue.db');

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'awaiting_approval' | 'approved' | 'rejected' | 'done' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  sourceRole: AgentRole | 'human';
  targetRole: AgentRole | 'human' | null;
  status: TaskStatus;
  priority: TaskPriority;
  inputData: string; // JSON
  outputData: string | null; // JSON
  projectId?: string;
  parentTaskId?: string;
  assignedAgentId?: string;
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

let db: Database.Database | null = null;

export function getQueueDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      source_role TEXT NOT NULL,
      target_role TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      input_data TEXT NOT NULL DEFAULT '{}',
      output_data TEXT,
      project_id TEXT,
      parent_task_id TEXT,
      assigned_agent_id TEXT,
      approved_by TEXT,
      rejection_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agency_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_agency_tasks_target ON tasks(target_role);
    CREATE INDEX IF NOT EXISTS idx_agency_tasks_tenant ON tasks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_agency_tasks_created ON tasks(created_at);
  `);
}

export class TaskQueue {
  private d: Database.Database;

  constructor() {
    this.d = getQueueDb();
  }

  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'outputData'> & { outputData?: any }): Task {
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);
    this.d.prepare(`
      INSERT INTO tasks (id, tenant_id, title, description, source_role, target_role, status, priority, input_data, project_id, parent_task_id, output_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, task.tenantId, task.title, task.description || '', task.sourceRole, task.targetRole || null, task.priority, typeof task.inputData === 'string' ? task.inputData : JSON.stringify(task.inputData), task.projectId || null, task.parentTaskId || null, task.outputData ? JSON.stringify(task.outputData) : null, now, now);
    return this.getTask(id)!;
  }

  getTask(id: string): Task | null {
    const row = this.d.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToTask(row);
  }

  listTasks(filter?: { status?: TaskStatus | TaskStatus[]; targetRole?: AgentRole; sourceRole?: AgentRole; tenantId?: string; limit?: number; offset?: number }): Task[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];
    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        sql += ` AND status IN (${filter.status.map(() => '?').join(',')})`;
        params.push(...filter.status);
      } else {
        sql += ' AND status = ?';
        params.push(filter.status);
      }
    }
    if (filter?.targetRole) { sql += ' AND target_role = ?'; params.push(filter.targetRole); }
    if (filter?.sourceRole) { sql += ' AND source_role = ?'; params.push(filter.sourceRole); }
    if (filter?.tenantId) { sql += ' AND tenant_id = ?'; params.push(filter.tenantId); }
    sql += ' ORDER BY created_at DESC';
    if (filter?.limit) sql += ` LIMIT ${filter.limit}`;
    if (filter?.offset) sql += ` OFFSET ${filter.offset}`;
    return (this.d.prepare(sql).all(...params) as any[]).map(r => this.rowToTask(r));
  }

  claimNextTask(agentRole: AgentRole, agentId: string): Task | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.d.prepare(`
      SELECT * FROM tasks
      WHERE (target_role = ? OR target_role IS NULL)
        AND status = 'pending'
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        created_at ASC
      LIMIT 1
    `).get(agentRole) as any;
    if (!row) return null;
    this.d.prepare('UPDATE tasks SET status = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?').run('in_progress', agentId, now, row.id);
    return this.getTask(row.id)!;
  }

  updateTaskStatus(id: string, status: TaskStatus, extra?: { outputData?: any; approvedBy?: string; rejectionReason?: string }): Task | null {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, now];
    if (extra?.outputData) { updates.push('output_data = ?'); params.push(JSON.stringify(extra.outputData)); }
    if (extra?.approvedBy) { updates.push('approved_by = ?'); params.push(extra.approvedBy); }
    if (extra?.rejectionReason) { updates.push('rejection_reason = ?'); params.push(extra.rejectionReason); }
    if (status === 'done' || status === 'failed') { updates.push('completed_at = ?'); params.push(now); }
    params.push(id);
    this.d.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getTask(id);
  }

  getPendingApproval(tenantId?: string): Task[] {
    return this.listTasks({ status: 'awaiting_approval', tenantId });
  }

  getStats(): { pending: number; inProgress: number; awaitingApproval: number; done: number; failed: number } {
    const rows = this.d.prepare(`
      SELECT status, COUNT(*) as count FROM tasks GROUP BY status
    `).all() as any[];
    const stats = { pending: 0, inProgress: 0, awaitingApproval: 0, done: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === 'pending') stats.pending = r.count;
      else if (r.status === 'in_progress') stats.inProgress = r.count;
      else if (r.status === 'awaiting_approval') stats.awaitingApproval = r.count;
      else if (r.status === 'done') stats.done = r.count;
      else if (r.status === 'failed') stats.failed = r.count;
    }
    return stats;
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      description: row.description,
      sourceRole: row.source_role,
      targetRole: row.target_role,
      status: row.status,
      priority: row.priority,
      inputData: row.input_data,
      outputData: row.output_data,
      projectId: row.project_id,
      parentTaskId: row.parent_task_id,
      assignedAgentId: row.assigned_agent_id,
      approvedBy: row.approved_by,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }
}
