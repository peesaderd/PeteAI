// ============================================================
// Cleanup Manager
// Handles log rotation, session cleanup, Docker prune, etc.
// ============================================================

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export class CleanupManager {
  private orchestratorUrl: string;

  constructor(orchestratorUrl: string) {
    this.orchestratorUrl = orchestratorUrl;
  }

  async runAll(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    results.docker = await this.cleanDocker();
    results.sessions = await this.cleanSessions();
    results.logs = await this.cleanLogs();
    results.openhands = await this.cleanOpenHands();
    results.conversations = await this.cleanConversations();
    return results;
  }

  async runCategory(category: string): Promise<Record<string, any>> {
    switch (category) {
      case "docker": return { docker: await this.cleanDocker() };
      case "sessions": return { sessions: await this.cleanSessions() };
      case "logs": return { logs: await this.cleanLogs() };
      case "openhands": return { openhands: await this.cleanOpenHands() };
      case "conversations": return { conversations: await this.cleanConversations() };
      default: return { error: "Unknown category: " + category };
    }
  }

  // ── Docker Cleanup ─────────────────────────────────────────

  async cleanDocker(): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    try {
      // Remove stopped containers
      const rmOut = execSync("docker container prune -f 2>/dev/null || true", { timeout: 30000 }).toString().trim();
      result.removedContainers = rmOut;

      // Remove unused images
      const imgOut = execSync("docker image prune -af 2>/dev/null || true", { timeout: 60000 }).toString().trim();
      result.removedImages = imgOut;

      // Remove build cache
      const bcOut = execSync("docker builder prune -af 2>/dev/null || true", { timeout: 60000 }).toString().trim();
      result.removedBuildCache = bcOut;

      // Full system prune (volumes excluded for safety)
      const sysOut = execSync("docker system prune -f 2>/dev/null || true", { timeout: 60000 }).toString().trim();
      result.systemPrune = sysOut;

      result.success = true;
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
    }
    return result;
  }

  // ── Session Cleanup ────────────────────────────────────────

  async cleanSessions(): Promise<Record<string, any>> {
    const result: Record<string, any> = { deleted: 0 };
    try {
      // Call orchestrator to cleanup old sessions
      const res = await fetch(this.orchestratorUrl + "/api/cleanup-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: 3 }),
      });
      if (res.ok) {
        const data = await res.json();
        result.deleted = data.deleted || 0;
      }
    } catch {
      // Orchestrator might not have this endpoint yet
      result.note = "Orchestrator cleanup endpoint not available";
    }
    return result;
  }

  // ── Log Cleanup ────────────────────────────────────────────

  async cleanLogs(): Promise<Record<string, any>> {
    const result: Record<string, any> = { deleted: 0, freedBytes: 0 };
    try {
      // Clean Docker container logs (can grow huge)
      const logDirs = [
        "/var/lib/docker/containers",
        "/var/log",
        "/root/.openhands/logs",
      ];
      let totalFreed = 0;
      for (const dir of logDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".log"));
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        for (const file of files) {
          const fp = path.join(dir, file);
          try {
            const stat = fs.statSync(fp);
            if (stat.mtimeMs < cutoff) {
              totalFreed += stat.size;
              fs.unlinkSync(fp);
              result.deleted++;
            }
          } catch { /* skip */ }
        }
      }
      result.freedBytes = totalFreed;
      result.freedMb = Math.round(totalFreed / 1024 / 1024);
      result.success = true;
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
    }
    return result;
  }

  // ── OpenHands Cleanup ──────────────────────────────────────

  async cleanOpenHands(): Promise<Record<string, any>> {
    const result: Record<string, any> = { deleted: 0, freedBytes: 0 };
    try {
      const baseDir = "/root/.openhands";
      if (!fs.existsSync(baseDir)) return { note: "No OpenHands dir", deleted: 0 };

      // Clean sessions dir (old sessions)
      const sessionsDir = path.join(baseDir, "sessions");
      if (fs.existsSync(sessionsDir)) {
        const dirs = fs.readdirSync(sessionsDir);
        const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
        for (const d of dirs) {
          const dp = path.join(sessionsDir, d);
          try {
            const stat = fs.statSync(dp);
            if (stat.mtimeMs < cutoff) {
              const size = getDirSize(dp);
              fs.rmSync(dp, { recursive: true, force: true });
              result.deleted++;
              result.freedBytes += size;
            }
          } catch { /* skip */ }
        }
      }

      // Clean logs
      const logsDir = path.join(baseDir, "logs");
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir).filter(f => f.endsWith(".log"));
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        for (const f of files) {
          const fp = path.join(logsDir, f);
          try {
            const stat = fs.statSync(fp);
            if (stat.mtimeMs < cutoff) {
              result.freedBytes += stat.size;
              fs.unlinkSync(fp);
            }
          } catch { /* skip */ }
        }
      }

      result.freedMb = Math.round(result.freedBytes / 1024 / 1024);
      result.success = true;
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
    }
    return result;
  }

  // ── Conversation Cleanup ───────────────────────────────────

  async cleanConversations(): Promise<Record<string, any>> {
    const result: Record<string, any> = { deleted: 0, freedBytes: 0 };
    try {
      const convDir = "/root/erp-core/erp-core/packages/ai-orchestrator/.conversations";
      if (!fs.existsSync(convDir)) return { note: "No conversations dir", deleted: 0 };

      const agents = fs.readdirSync(convDir);
      const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
      for (const agent of agents) {
        const agentDir = path.join(convDir, agent);
        if (!fs.statSync(agentDir).isDirectory()) continue;
        const convs = fs.readdirSync(agentDir);
        for (const conv of convs) {
          const convPath = path.join(agentDir, conv);
          const stateFile = path.join(convPath, "base_state.json");
          try {
            if (fs.existsSync(stateFile)) {
              const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
              const updated = new Date(state.updatedAt || state.startedAt).getTime();
              if (updated < cutoff) {
                const size = getDirSize(convPath);
                fs.rmSync(convPath, { recursive: true, force: true });
                result.deleted++;
                result.freedBytes += size;
              }
            }
          } catch { /* skip */ }
        }
      }
      result.freedMb = Math.round(result.freedBytes / 1024 / 1024);
      result.success = true;
    } catch (err: any) {
      result.success = false;
      result.error = err.message;
    }
    return result;
  }
}

function getDirSize(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(fp);
      } else if (entry.isFile()) {
        total += fs.statSync(fp).size;
      }
    }
  } catch { /* ignore */ }
  return total;
}
