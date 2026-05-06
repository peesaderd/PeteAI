// ============================================================
// Rate Limiter — Per-agent rate limiting for tool calls
// ใช้ SQLite backend เพื่อ persist state ข้าม restart
// ============================================================

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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
    CREATE TABLE IF NOT EXISTS rate_limiter (
      agent_id TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (agent_id, window_start)
    );
  `);
}

export interface RateLimiterConfig {
  /** Max tool calls per agent per window */
  maxCallsPerWindow: number;
  /** Window size in milliseconds (default: 60000 = 1 min) */
  windowMs: number;
  /** Min delay between consecutive calls (default: 2000ms) */
  minDelayMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxCallsPerWindow: 30,
  windowMs: 60000,
  minDelayMs: 2000,
};

export class RateLimiter {
  private d: Database.Database;
  private config: RateLimiterConfig;
  /** In-memory tracking of last call time per agent (for minDelay) */
  private lastCallTime = new Map<string, number>();

  constructor(config?: Partial<RateLimiterConfig>) {
    this.d = getDb();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** ตรวจสอบว่า agent เรียก tool ได้หรือไม่ ถ้าไม่ได้ให้ throw error */
  check(agentId: string): void {
    const now = Date.now();

    // 1. Check min delay between calls
    const lastCall = this.lastCallTime.get(agentId) || 0;
    const elapsed = now - lastCall;
    if (elapsed < this.config.minDelayMs) {
      const waitMs = this.config.minDelayMs - elapsed;
      throw new Error(
        `Rate limit: too fast. Wait ${waitMs}ms before next call (agent: ${agentId})`
      );
    }

    // 2. Check window-based rate limit
    const windowStart = this.getWindowStart(now);
    const row = this.d
      .prepare(
        "SELECT call_count FROM rate_limiter WHERE agent_id = ? AND window_start = ?"
      )
      .get(agentId, windowStart) as any;

    const currentCount = row?.call_count || 0;
    if (currentCount >= this.config.maxCallsPerWindow) {
      const resetMs = windowStart + this.config.windowMs - now;
      throw new Error(
        `Rate limit: exceeded ${this.config.maxCallsPerWindow} calls per ${this.config.windowMs / 1000}s. Reset in ${Math.ceil(resetMs / 1000)}s (agent: ${agentId})`
      );
    }
  }

  /** นับว่า agent เรียก tool ไปแล้วกี่ครั้งใน window ปัจจุบัน */
  getUsage(agentId: string): { current: number; max: number; resetMs: number } {
    const now = Date.now();
    const windowStart = this.getWindowStart(now);
    const row = this.d
      .prepare(
        "SELECT call_count FROM rate_limiter WHERE agent_id = ? AND window_start = ?"
      )
      .get(agentId, windowStart) as any;

    return {
      current: row?.call_count || 0,
      max: this.config.maxCallsPerWindow,
      resetMs: windowStart + this.config.windowMs - now,
    };
  }

  /** Increment call count สำหรับ agent */
  increment(agentId: string): void {
    const now = Date.now();
    const windowStart = this.getWindowStart(now);

    this.d
      .prepare(
        `INSERT INTO rate_limiter (agent_id, window_start, call_count)
         VALUES (?, ?, 1)
         ON CONFLICT(agent_id, window_start) DO UPDATE SET call_count = call_count + 1`
      )
      .run(agentId, windowStart);

    this.lastCallTime.set(agentId, now);
  }

  /** ล้าง rate limit history เก่า (เรียกเป็นระยะ) */
  cleanup(): void {
    const cutoff = this.getWindowStart(Date.now()) - this.config.windowMs;
    this.d
      .prepare("DELETE FROM rate_limiter WHERE window_start < ?")
      .run(cutoff);
  }

  private getWindowStart(now: number): number {
    return Math.floor(now / this.config.windowMs) * this.config.windowMs;
  }
}
