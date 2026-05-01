#!/usr/bin/env python3
"""Add Resume API endpoint to index.ts."""
import sys

filepath = sys.argv[1]

with open(filepath, "r") as f:
    content = f.read()

# Add resume endpoint after loop/stop
old_stop = """  app.post("/api/agents/loop/stop", (_req, res) => {
    agentLoop.stop();
    res.json({ status: "stopped" });
  });"""

new_stop = """  app.post("/api/agents/loop/stop", (_req, res) => {
    agentLoop.stop();
    res.json({ status: "stopped" });
  });

  // ============================================================
  // Resume API — Resume a persisted agent conversation
  // ============================================================

  app.post("/api/agents/:agentId/resume", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { conversationId } = req.body;

      if (!conversationId) {
        return res.status(400).json({ error: "conversationId is required" });
      }

      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
      if (!validAgents.includes(agentId)) {
        return res.status(400).json({
          error: `Invalid agent. Must be one of: ${validAgents.join(", ")}`,
        });
      }

      const result = await agentLoop.resumeTask(agentId, conversationId);
      if (result.success) {
        res.json({
          status: "resumed",
          agent: agentId,
          conversationId,
          task: {
            id: result.task!.id,
            phase: result.task!.phase,
            iteration: result.task!.iteration,
          },
        });
      } else {
        res.status(404).json({ error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List persisted conversations for an agent
  app.get("/api/agents/:agentId/conversations", (req, res) => {
    try {
      const { agentId } = req.params;
      const validAgents = ["rd", "brainstorm", "production", "design", "marketing"];
      if (!validAgents.includes(agentId)) {
        return res.status(400).json({
          error: `Invalid agent. Must be one of: ${validAgents.join(", ")}`,
        });
      }
      const conversations = agentLoop.listPersistedConversations(agentId);
      res.json({ agent: agentId, conversations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all persisted conversations across all agents
  app.get("/api/conversations", (_req, res) => {
    try {
      const all = agentLoop.listPersistedConversations();
      res.json({ conversations: all });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });"""

content = content.replace(old_stop, new_stop)

with open(filepath, "w") as f:
    f.write(content)

print("Phase 4 done: Resume API endpoints added")
