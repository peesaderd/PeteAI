// ============================================================
// Agency Team - Express Server
// Serves API for agent registry, task queue, and dashboard
// ============================================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentRegistry, type AgentRole } from './registry.js';
import { TaskQueue } from './queue.js';
import { AgentWorker, type WorkerConfig } from './worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '54515', 10);
const AGENT_ROLE = process.env.AGENT_ROLE as AgentRole | undefined;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  const registry = new AgentRegistry();
  const queue = new TaskQueue();

  // Serve dashboard static files
  const webDist = path.resolve(__dirname, '../web');
  app.use(express.static(webDist));

  // ---- Agent Mode ----
  // If AGENT_ROLE is set, run as a background worker
  if (AGENT_ROLE) {
    const agent = registry.getByRole(AGENT_ROLE);
    if (!agent) {
      console.error(`Unknown agent role: ${AGENT_ROLE}`);
      process.exit(1);
    }

    const workerConfig: WorkerConfig = {
      role: AGENT_ROLE,
      agentId: agent.id,
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL || '5000', 10),
      erpApiUrl: process.env.ERP_API_URL || 'http://localhost:3000',
      openhandsApiKey: process.env.OPENHANDS_API_KEY,
    };

    const worker = new AgentWorker(workerConfig);
    worker.start();

    // Health endpoint for worker
    app.get('/health', (_req, res) => {
      const a = registry.getById(agent.id);
      res.json({
        status: 'ok',
        role: AGENT_ROLE,
        agent: a ? { id: a.id, name: a.name, status: a.status, lastHeartbeat: a.lastHeartbeat } : null,
        uptime: process.uptime(),
      });
    });

    console.log(`[Agency] Worker mode: ${AGENT_ROLE} on port ${PORT}`);
    app.listen(PORT, '0.0.0.0');
    return;
  }

  // ---- Server Mode ----
  // Full API server with dashboard

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'agency-team',
      agents: registry.getAll().map(a => ({ id: a.id, name: a.name, role: a.role, status: a.status })),
      stats: queue.getStats(),
      timestamp: Date.now(),
    });
  });

  // Agent Registry API
  app.get('/api/agents', (_req, res) => {
    res.json(registry.toJSON());
  });

  app.get('/api/agents/:id', (req, res) => {
    const agent = registry.getById(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json(agent);
  });

  app.post('/api/agents/:id/heartbeat', (req, res) => {
    registry.heartbeat(req.params.id);
    res.json({ ok: true });
  });

  // Task Queue API
  app.get('/api/tasks', (req, res) => {
    const { status, target_role, source_role, tenant_id, limit, offset } = req.query;
    const tasks = queue.listTasks({
      status: status as any,
      targetRole: target_role as AgentRole,
      sourceRole: source_role as AgentRole,
      tenantId: tenant_id as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(tasks);
  });

  app.post('/api/tasks', (req, res) => {
    try {
      const { tenantId, title, description, sourceRole, targetRole, priority, inputData, projectId, requireApproval, forwardTo } = req.body;
      if (!tenantId || !title || !sourceRole) {
        return res.status(400).json({ error: 'Missing required fields: tenantId, title, sourceRole' });
      }
      const task = queue.createTask({
        tenantId,
        title,
        description,
        sourceRole,
        targetRole: targetRole || null,
        priority: priority || 'medium',
        inputData: JSON.stringify({ ...(inputData || {}), requireApproval, forwardTo }),
        projectId,
      });
      res.status(201).json(task);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/tasks/:id', (req, res) => {
    const task = queue.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });

  // Human-in-the-Loop: Approve/Reject
  app.post('/api/tasks/:id/approve', (req, res) => {
    const { approvedBy } = req.body;
    const task = queue.updateTaskStatus(req.params.id, 'approved', {
      approvedBy: approvedBy || 'human',
      outputData: { approved: true },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });

  app.post('/api/tasks/:id/reject', (req, res) => {
    const { approvedBy, reason } = req.body;
    const task = queue.updateTaskStatus(req.params.id, 'rejected', {
      approvedBy: approvedBy || 'human',
      rejectionReason: reason || 'Rejected by human',
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  });

  // Pending approvals
  app.get('/api/approvals', (req, res) => {
    const { tenant_id } = req.query;
    const tasks = queue.getPendingApproval(tenant_id as string);
    res.json(tasks);
  });

  // Stats
  app.get('/api/stats', (_req, res) => {
    res.json(queue.getStats());
  });

  // Pipeline: Create a full 5-agent pipeline task
  app.post('/api/pipeline', (req, res) => {
    try {
      const { tenantId, title, description, brief, requireApproval = true } = req.body;
      if (!tenantId || !title) {
        return res.status(400).json({ error: 'Missing required fields: tenantId, title' });
      }

      // Create the first task (Brainstorm)
      const firstTask = queue.createTask({
        tenantId,
        title: `[Brainstorm] ${title}`,
        description: description || '',
        sourceRole: 'human',
        targetRole: 'brainstorm',
        priority: 'medium',
        inputData: JSON.stringify({ brief: brief || title, requireApproval, forwardTo: 'rd' }),
        projectId: req.body.projectId,
      });

      res.status(201).json({
        message: 'Pipeline started',
        pipeline: [
          { step: 1, role: 'brainstorm', taskId: firstTask.id },
        ],
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // SPA fallback
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return;
    res.sendFile(path.join(webDist, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Agency] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Agency] Agents: ${registry.getAll().map(a => a.name).join(', ')}`);
    console.log(`[Agency] API:    http://0.0.0.0:${PORT}/api/health`);
  });
}

main().catch(console.error);
