// ============================================================
// Agent Lifecycle Manager
// Handles sleep/wake for AI agents via orchestrator API.
// ============================================================

export interface AgentInfo {
  name: string;
  status: "running" | "sleeping" | "unknown";
  lastActive?: string;
  taskCount?: number;
}

export class AgentLifecycle {
  private orchestratorUrl: string;
  private agents: Map<string, AgentInfo> = new Map();

  constructor(orchestratorUrl: string) {
    this.orchestratorUrl = orchestratorUrl;
    // Default agents we manage
    const names = ["rd", "brainstorm", "production", "design", "marketing"];
    for (const name of names) {
      this.agents.set(name, { name, status: "unknown" });
    }
  }

  async listAgents(): Promise<AgentInfo[]> {
    // Try to get real status from orchestrator
    try {
      const res = await fetch(this.orchestratorUrl + "/api/agents", {
        headers: { "Accept": "application/json" },
        timeout: 5000,
      } as any);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const agent of data) {
            this.agents.set(agent.name, agent);
          }
        }
      }
    } catch {
      // Orchestrator might not have /api/agents yet
    }
    return Array.from(this.agents.values());
  }

  async sleepAgent(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(this.orchestratorUrl + "/api/agents/" + name + "/sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      } as any);
      if (res.ok) {
        const data = await res.json();
        this.agents.set(name, { name, status: "sleeping", lastActive: new Date().toISOString() });
        return { success: true, message: data.message || "Agent " + name + " put to sleep" };
      }
      const text = await res.text();
      return { success: false, message: "Failed: " + text };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async wakeAgent(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(this.orchestratorUrl + "/api/agents/" + name + "/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      } as any);
      if (res.ok) {
        const data = await res.json();
        this.agents.set(name, { name, status: "running", lastActive: new Date().toISOString() });
        return { success: true, message: data.message || "Agent " + name + " woken up" };
      }
      const text = await res.text();
      return { success: false, message: "Failed: " + text };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async sleepAllIdle(): Promise<{ slept: string[] }> {
    const slept: string[] = [];
    try {
      const agents = await this.listAgents();
      for (const agent of agents) {
        if (agent.status === "running" && (agent.taskCount || 0) === 0) {
          const result = await this.sleepAgent(agent.name);
          if (result.success) slept.push(agent.name);
        }
      }
    } catch { /* ignore */ }
    return { slept };
  }
}
