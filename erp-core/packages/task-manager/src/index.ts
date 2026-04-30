// ============================================================
// Task Manager - Express Server
// ============================================================

import express from 'express';
import cors from 'cors';
import { getDatabase } from './database.js';
import { handleToolCall, getToolDefinitions } from './mcp.js';

const PORT = parseInt(process.env.PORT || '8081', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'task-manager', timestamp: Date.now() });
});

// Tool definitions (for MCP discovery)
app.get('/api/tools', (_req, res) => {
  res.json({ tools: getToolDefinitions() });
});

// MCP-compatible tool execution endpoint
app.post('/api/mcp', (req, res) => {
  try {
    const { tool: toolName, args } = req.body;
    if (!toolName) {
      return res.status(400).json({ error: 'Missing tool name' });
    }
    const result = handleToolCall(toolName, args || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Also accept /mcp (for compatibility with ERP Core proxy)
app.post('/mcp', (req, res) => {
  try {
    const { tool: toolName, args } = req.body;
    if (!toolName) {
      return res.status(400).json({ error: 'Missing tool name' });
    }
    const result = handleToolCall(toolName, args || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST API for projects
app.get('/api/projects', (req, res) => {
  try {
    const db = getDatabase();
    const { tenant_id, status, limit = 50, offset = 0 } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });
    let sql = 'SELECT * FROM projects WHERE tenant_id = ?';
    const params: any[] = [tenant_id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    res.json(db.prepare(sql).all(...params));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const result = handleToolCall('create_project', req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const result = handleToolCall('get_project', { tenantId: req.query.tenant_id, projectId: req.params.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/projects/:id', (req, res) => {
  try {
    const result = handleToolCall('update_project', { tenantId: req.body.tenant_id, projectId: req.params.id, ...req.body });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const result = handleToolCall('delete_project', { tenantId: req.query.tenant_id, projectId: req.params.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// REST API for tasks
app.get('/api/tasks', (req, res) => {
  try {
    const db = getDatabase();
    const { tenant_id, project_id, status, assignee, limit = 50, offset = 0 } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'Missing tenant_id' });
    let sql = 'SELECT * FROM tasks WHERE tenant_id = ?';
    const params: any[] = [tenant_id];
    if (project_id) { sql += ' AND project_id = ?'; params.push(project_id); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (assignee) { sql += ' AND assignee = ?'; params.push(assignee); }
    sql += ' ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    res.json(db.prepare(sql).all(...params));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    const result = handleToolCall('create_task', req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const result = handleToolCall('get_task', { tenantId: req.query.tenant_id, taskId: req.params.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', (req, res) => {
  try {
    const result = handleToolCall('update_task', { tenantId: req.body.tenant_id, taskId: req.params.id, ...req.body });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  try {
    const result = handleToolCall('delete_task', { tenantId: req.query.tenant_id, taskId: req.params.id });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize DB and start server
getDatabase();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[TaskManager] Server running on http://0.0.0.0:${PORT}`);
  console.log(`[TaskManager] Health: http://0.0.0.0:${PORT}/api/health`);
  console.log(`[TaskManager] MCP:    POST http://0.0.0.0:${PORT}/api/mcp`);
});
