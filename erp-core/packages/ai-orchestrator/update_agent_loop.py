#!/usr/bin/env python3
"""Update agent-loop.ts with persistence integration."""
import sys

filepath = sys.argv[1]

with open(filepath, "r") as f:
    content = f.read()

# 1. Add import for PersistenceManager
old_import = 'import { LLMClient, LLMMessage, LLMToolDef } from "./llm.js";'
new_import = 'import { LLMClient, LLMMessage, LLMToolDef } from "./llm.js";\nimport { PersistenceManager, type PersistedState, type PersistedEvent } from "./persistence.js";\nimport { v4 as uuidv4 } from "uuid";'
content = content.replace(old_import, new_import)

# 2. Add persistenceDir to AgentConfig
old_config = """interface AgentConfig {
    name: string;
    role: string;
    systemPrompt: string;
    maxConcurrentTasks: number;
    maxIterationsPerTask: number;
  }"""
new_config = """interface AgentConfig {
    name: string;
    role: string;
    systemPrompt: string;
    maxConcurrentTasks: number;
    maxIterationsPerTask: number;
    persistenceDir: string;
  }"""
content = content.replace(old_config, new_config)

# 3. Add conversationId to ActiveTask
old_task = """interface ActiveTask {
    id: string;
    agentName: string;
    sessionId: string;
    iteration: number;
    phase: number;
    taskData: any;
    startedAt: number;
    status: "running" | "completed" | "failed" | "pending_approval";
    error?: string;
  }"""
new_task = """interface ActiveTask {
    id: string;
    agentName: string;
    sessionId: string;
    conversationId: string;
    iteration: number;
    phase: number;
    taskData: any;
    startedAt: number;
    status: "running" | "completed" | "failed" | "pending_approval";
    error?: string;
  }"""
content = content.replace(old_task, new_task)

# 4. Add persistenceDir to each agent definition
replacements = [
    ('maxIterationsPerTask: 15,\n    },\n    {\n      name: "brainstorm"', 'maxIterationsPerTask: 15,\n      persistenceDir: "./.conversations/rd",\n    },\n    {\n      name: "brainstorm"'),
    ('maxIterationsPerTask: 15,\n    },\n    {\n      name: "production"', 'maxIterationsPerTask: 15,\n      persistenceDir: "./.conversations/brainstorm",\n    },\n    {\n      name: "production"'),
    ('maxIterationsPerTask: 20,\n    },\n    {\n      name: "design"', 'maxIterationsPerTask: 20,\n      persistenceDir: "./.conversations/production",\n    },\n    {\n      name: "design"'),
    ('maxIterationsPerTask: 15,\n    },\n    {\n      name: "marketing"', 'maxIterationsPerTask: 15,\n      persistenceDir: "./.conversations/design",\n    },\n    {\n      name: "marketing"'),
    ('maxIterationsPerTask: 15,\n    },\n  ];', 'maxIterationsPerTask: 15,\n      persistenceDir: "./.conversations/marketing",\n    },\n  ];'),
]
for old, new in replacements:
    content = content.replace(old, new)

# 5. Add persistence manager to AgentLoop class
old_class = """export class AgentLoop {
    private agents: Map<string, AgentConfig> = new Map();
    private activeTasks: Map<string, ActiveTask> = new Map();
    private toolRouter: ToolRouter;
    private memory: MemoryStore;
    private llm: LLMClient;
    private pollInterval: number;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private tickCount = 0;"""
new_class = """export class AgentLoop {
    private agents: Map<string, AgentConfig> = new Map();
    private activeTasks: Map<string, ActiveTask> = new Map();
    private toolRouter: ToolRouter;
    private memory: MemoryStore;
    private llm: LLMClient;
    private persistence: PersistenceManager;
    private pollInterval: number;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private tickCount = 0;"""
content = content.replace(old_class, new_class)

# 6. Update constructor
old_ctor = """constructor(
      toolRouter: ToolRouter,
      memory: MemoryStore,
      llm: LLMClient,
      pollIntervalMs = 15000
    ) {
      this.toolRouter = toolRouter;
      this.memory = memory;
      this.llm = llm;
      this.pollInterval = pollIntervalMs;"""
new_ctor = """constructor(
      toolRouter: ToolRouter,
      memory: MemoryStore,
      llm: LLMClient,
      persistence?: PersistenceManager,
      pollIntervalMs = 15000
    ) {
      this.toolRouter = toolRouter;
      this.memory = memory;
      this.llm = llm;
      this.persistence = persistence || new PersistenceManager("./.conversations");
      this.pollInterval = pollIntervalMs;"""
content = content.replace(old_ctor, new_ctor)

with open(filepath, "w") as f:
    f.write(content)

print("Phase 1 done: imports, types, agent configs, constructor updated")
