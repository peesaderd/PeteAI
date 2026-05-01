// ============================================================
// Persistence Manager
// Mirrors OpenHands SDK Conversation Persistence pattern
// Saves agent state, conversation history, and events to disk
// ============================================================

import fs from "fs";
import path from "path";

export interface PersistedEvent {
  id: string;
  seq: number;
  role: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface PersistedState {
  conversationId: string;
  agentName: string;
  taskId: string;
  taskTitle: string;
  status: "running" | "completed" | "failed" | "pending_approval";
  phase: number;
  iteration: number;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export class PersistenceManager {
  private baseDir: string;

  constructor(baseDir: string = "./.conversations") {
    this.baseDir = baseDir;
  }

  getAgentDir(agentName: string): string {
    return path.join(this.baseDir, agentName);
  }

  getConversationDir(agentName: string, conversationId: string): string {
    return path.join(this.getAgentDir(agentName), conversationId);
  }

  getEventsDir(agentName: string, conversationId: string): string {
    return path.join(this.getConversationDir(agentName, conversationId), "events");
  }

  getStatePath(agentName: string, conversationId: string): string {
    return path.join(this.getConversationDir(agentName, conversationId), "base_state.json");
  }

  ensureDirs(agentName: string, conversationId: string): void {
    const dirs = [
      this.getAgentDir(agentName),
      this.getConversationDir(agentName, conversationId),
      this.getEventsDir(agentName, conversationId),
    ];
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  saveState(agentName: string, state: PersistedState): void {
    this.ensureDirs(agentName, state.conversationId);
    state.updatedAt = new Date().toISOString();
    const filePath = this.getStatePath(agentName, state.conversationId);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  }

  loadState(agentName: string, conversationId: string): PersistedState | null {
    const filePath = this.getStatePath(agentName, conversationId);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(raw) as PersistedState;
      }
    } catch (err) {
      console.error(`[Persistence] Failed to load state for ${agentName}/${conversationId}:`, err);
    }
    return null;
  }

  saveEvent(agentName: string, conversationId: string, event: PersistedEvent): void {
    this.ensureDirs(agentName, conversationId);
    const seqStr = String(event.seq).padStart(5, "0");
    const filePath = path.join(
      this.getEventsDir(agentName, conversationId),
      `event-${seqStr}-${event.id}.json`
    );
    fs.writeFileSync(filePath, JSON.stringify(event, null, 2), "utf-8");
  }

  loadEvents(agentName: string, conversationId: string): PersistedEvent[] {
    const eventsDir = this.getEventsDir(agentName, conversationId);
    try {
      if (!fs.existsSync(eventsDir)) return [];
      const files = fs.readdirSync(eventsDir)
        .filter((f) => f.startsWith("event-") && f.endsWith(".json"))
        .sort();
      const events: PersistedEvent[] = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(eventsDir, file), "utf-8");
          events.push(JSON.parse(raw) as PersistedEvent);
        } catch {
          // skip corrupt files
        }
      }
      return events;
    } catch {
      return [];
    }
  }

  listConversations(agentName: string): string[] {
    const agentDir = this.getAgentDir(agentName);
    try {
      if (!fs.existsSync(agentDir)) return [];
      return fs.readdirSync(agentDir).filter((name) => {
        const statePath = path.join(agentDir, name, "base_state.json");
        return fs.existsSync(statePath);
      });
    } catch {
      return [];
    }
  }

  listAllConversations(): Array<{ agentName: string; conversationId: string; state: PersistedState | null }> {
    const result: Array<{ agentName: string; conversationId: string; state: PersistedState | null }> = [];
    try {
      if (!fs.existsSync(this.baseDir)) return result;
      const agentDirs = fs.readdirSync(this.baseDir);
      for (const agentName of agentDirs) {
        const agentDir = path.join(this.baseDir, agentName);
        if (!fs.statSync(agentDir).isDirectory()) continue;
        const convDirs = fs.readdirSync(agentDir);
        for (const convId of convDirs) {
          const statePath = path.join(agentDir, convId, "base_state.json");
          if (fs.existsSync(statePath)) {
            try {
              const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as PersistedState;
              result.push({ agentName, conversationId: convId, state });
            } catch {
              result.push({ agentName, conversationId: convId, state: null });
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return result;
  }

  deleteConversation(agentName: string, conversationId: string): boolean {
    const convDir = this.getConversationDir(agentName, conversationId);
    try {
      if (fs.existsSync(convDir)) {
        fs.rmSync(convDir, { recursive: true, force: true });
        return true;
      }
    } catch (err) {
      console.error(`[Persistence] Failed to delete ${agentName}/${conversationId}:`, err);
    }
    return false;
  }
}
