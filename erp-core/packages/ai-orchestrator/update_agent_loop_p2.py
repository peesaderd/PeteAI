#!/usr/bin/env python3
"""Update agent-loop.ts with persistence save/load and resume logic."""
import sys

filepath = sys.argv[1]

with open(filepath, "r") as f:
    content = f.read()

# 1. Update claimTask to generate conversationId and save initial state
old_claim = """      // Register active task
      const activeTask: ActiveTask = {
        id: task.id,
        agentName,
        sessionId: session.id,
        iteration: 0,
        phase: 0,
        taskData: task,
        startedAt: Date.now(),
        status: "running",
      };

      this.activeTasks.set(task.id, activeTask);
      console.log(
        `[AgentLoop] 🤖 ${agentName} claimed task "${task.title}" (${task.id})`
      );"""

new_claim = """      // Generate conversationId for persistence
      const conversationId = uuidv4();

      // Register active task
      const activeTask: ActiveTask = {
        id: task.id,
        agentName,
        sessionId: session.id,
        conversationId,
        iteration: 0,
        phase: 0,
        taskData: task,
        startedAt: Date.now(),
        status: "running",
      };

      this.activeTasks.set(task.id, activeTask);

      // Persist initial state to disk
      const agent = this.agents.get(agentName);
      this.persistence.saveState(agentName, {
        conversationId,
        agentName,
        taskId: task.id,
        taskTitle: task.title || "Untitled",
        status: "running",
        phase: 0,
        iteration: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Save initial system prompt as first event
      this.persistence.saveEvent(agentName, conversationId, {
        id: uuidv4(),
        seq: 0,
        role: "system",
        content: systemPrompt || "",
        timestamp: new Date().toISOString(),
      });

      console.log(
        `[AgentLoop] 🤖 ${agentName} claimed task "${task.title}" (${task.id}) conv=${conversationId.slice(0, 8)}`
      );"""

content = content.replace(old_claim, new_claim)

# 2. Update runAgentIteration to persist after each iteration
old_iteration = """      task.iteration++;

      if (task.iteration > agent.maxIterationsPerTask) {
        console.log(`[AgentLoop] ${task.agentName}: task ${task.id} hit max iterations`);
        task.status = "completed";
        return false;
      }"""

new_iteration = """      task.iteration++;

      if (task.iteration > agent.maxIterationsPerTask) {
        console.log(`[AgentLoop] ${task.agentName}: task ${task.id} hit max iterations`);
        task.status = "completed";
        // Persist final state
        this.persistence.saveState(task.agentName, {
          conversationId: task.conversationId,
          agentName: task.agentName,
          taskId: task.id,
          taskTitle: task.taskData?.title || "Untitled",
          status: "completed",
          phase: task.phase,
          iteration: task.iteration,
          startedAt: new Date(task.startedAt).toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return false;
      }

      // Persist state after each iteration
      this.persistence.saveState(task.agentName, {
        conversationId: task.conversationId,
        agentName: task.agentName,
        taskId: task.id,
        taskTitle: task.taskData?.title || "Untitled",
        status: "running",
        phase: task.phase,
        iteration: task.iteration,
        startedAt: new Date(task.startedAt).toISOString(),
        updatedAt: new Date().toISOString(),
      });"""

content = content.replace(old_iteration, new_iteration)

# 3. Update finalizeTask to persist completion state
old_finalize = """    private async finalizeTask(task: ActiveTask): Promise<void> {
      console.log(
        `[AgentLoop] ${task.agentName}: task ${task.id} finalized as ${task.status}`
      );

      // Store result in memory
      this.memory.setAgentState("""

new_finalize = """    private async finalizeTask(task: ActiveTask): Promise<void> {
      console.log(
        `[AgentLoop] ${task.agentName}: task ${task.id} finalized as ${task.status}`
      );

      // Persist final state to disk
      this.persistence.saveState(task.agentName, {
        conversationId: task.conversationId,
        agentName: task.agentName,
        taskId: task.id,
        taskTitle: task.taskData?.title || "Untitled",
        status: task.status,
        phase: task.phase,
        iteration: task.iteration,
        startedAt: new Date(task.startedAt).toISOString(),
        updatedAt: new Date().toISOString(),
        error: task.error,
      });

      // Store result in memory
      this.memory.setAgentState("""

content = content.replace(old_finalize, new_finalize)

# 4. Add resumeTask method before the buildToolDefs method
old_build_tool = """    // ─── Build LLM Tool Definitions ────────────────────────────

    private buildToolDefs(agentName: string): LLMToolDef[] {"""

new_build_tool = """    // ─── Resume Task from Persistence ─────────────────────────

    async resumeTask(
      agentName: string,
      conversationId: string
    ): Promise<{ success: boolean; task?: ActiveTask; error?: string }> {
      const state = this.persistence.loadState(agentName, conversationId);
      if (!state) {
        return { success: false, error: `No persisted state found for ${agentName}/${conversationId}` };
      }

      const agent = this.agents.get(agentName);
      if (!agent) {
        return { success: false, error: `Unknown agent: ${agentName}` };
      }

      // Check if task is already active
      for (const [, existing] of this.activeTasks) {
        if (existing.conversationId === conversationId) {
          return { success: false, error: `Task ${existing.id} is already active` };
        }
      }

      // Load persisted events
      const events = this.persistence.loadEvents(agentName, conversationId);

      // Create a new session in memory
      const session = this.memory.createSession(
        agentName,
        "erp-core",
        state.taskTitle
      );

      // Replay events into memory
      for (const event of events) {
        if (event.role === "system") {
          this.memory.addMessage(session.id, "system", event.content);
        } else if (event.role === "tool") {
          this.memory.addMessage(session.id, "tool", event.content, event.metadata);
        } else {
          this.memory.addMessage(session.id, event.role as any, event.content);
        }
      }

      // Create active task from persisted state
      const activeTask: ActiveTask = {
        id: state.taskId,
        agentName,
        sessionId: session.id,
        conversationId,
        iteration: state.iteration,
        phase: state.phase,
        taskData: { title: state.taskTitle },
        startedAt: new Date(state.startedAt).getTime(),
        status: "running",
      };

      this.activeTasks.set(state.taskId, activeTask);

      // Update persisted state
      this.persistence.saveState(agentName, {
        ...state,
        status: "running",
        updatedAt: new Date().toISOString(),
      });

      console.log(
        `[AgentLoop] 🔄 ${agentName} resumed task "${state.taskTitle}" (${state.taskId}) conv=${conversationId.slice(0, 8)} at phase=${state.phase} iter=${state.iteration}`
      );

      return { success: true, task: activeTask };
    }

    // ─── List Persisted Conversations ──────────────────────────

    listPersistedConversations(agentName?: string) {
      if (agentName) {
        return this.persistence.listConversations(agentName).map((cid) => ({
          conversationId: cid,
          state: this.persistence.loadState(agentName, cid),
        }));
      }
      return this.persistence.listAllConversations();
    }

    // ─── Build LLM Tool Definitions ────────────────────────────

    private buildToolDefs(agentName: string): LLMToolDef[] {"""

content = content.replace(old_build_tool, new_build_tool)

with open(filepath, "w") as f:
    f.write(content)

print("Phase 2 done: claimTask, runAgentIteration, finalizeTask, resumeTask added")
