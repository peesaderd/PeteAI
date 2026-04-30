// ============================================================
// Task Manager - MCP Tool Handlers
// ============================================================

import { getDatabase } from './database.js';
import { v4 as uuid } from 'uuid';

interface ToolResult {
  content: { type: string; text: string }[];
}

function ok(data: any): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function logActivity(tenantId: string, action: string, entityType: string, entityId: string | undefined | null, actor: string | undefined | null, details: any, projectId?: string | null, taskId?: string | null) {
  const db = getDatabase();
  db.prepare(`INSERT INTO activity_logs (id, tenant_id, project_id, task_id, action, entity_type, entity_id, actor, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    uuid(), tenantId, projectId ?? null, taskId ?? null, action, entityType, entityId ?? null, actor ?? null, JSON.stringify(details || {}), now()
  );
}

// ---- PROJECTS ----

export function handleListProjects(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, status, limit = 50, offset = 0 } = args;
  let sql = 'SELECT * FROM projects WHERE tenant_id = ?';
  const params: any[] = [tenantId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  return ok(rows);
}

export function handleCreateProject(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, name, description, priority = 'medium', startDate, dueDate } = args;
  const id = uuid();
  const t = now();
  db.prepare(`INSERT INTO projects (id, tenant_id, name, description, status, priority, start_date, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, 'planning', ?, ?, ?, ?, ?)`).run(
    id, tenantId, name, description ?? null, priority, startDate ?? null, dueDate ?? null, t, t
  );
  logActivity(tenantId, 'project.created', 'project', id, null, { name });
  return ok({ id, name });
}

export function handleGetProject(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId } = args;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, tenantId) as any;
  if (!project) return ok({ error: 'Project not found' });
  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC').all(projectId);
  return ok({ ...project, tasks });
}

export function handleUpdateProject(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId, name, description, status, priority, startDate, dueDate } = args;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, tenantId) as any;
  if (!existing) return ok({ error: 'Project not found' });

  const updates: string[] = [];
  const params: any[] = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (startDate !== undefined) { updates.push('start_date = ?'); params.push(startDate); }
  if (dueDate !== undefined) { updates.push('due_date = ?'); params.push(dueDate); }
  if (status === 'completed') { updates.push('completed_at = ?'); params.push(now()); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(now());
    params.push(projectId);
    params.push(tenantId);
    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
    logActivity(tenantId, 'project.updated', 'project', projectId, null, { changes: updates.map(u => u.split(' = ')[0]) });
  }
  return ok({ id: projectId, updated: true });
}

export function handleDeleteProject(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId } = args;
  db.prepare('DELETE FROM projects WHERE id = ? AND tenant_id = ?').run(projectId, tenantId);
  logActivity(tenantId, 'project.deleted', 'project', projectId, null, {});
  return ok({ success: true });
}

// ---- TASKS ----

export function handleListTasks(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId, status, assignee, priority, limit = 50, offset = 0 } = args;
  let sql = 'SELECT * FROM tasks WHERE tenant_id = ?';
  const params: any[] = [tenantId];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (assignee) { sql += ' AND assignee = ?'; params.push(assignee); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  sql += ' ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  return ok(rows);
}

export function handleCreateTask(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId, parentTaskId, title, description, priority = 'medium', assignee, estimatedHours, dueDate, sortOrder = 0 } = args;
  const id = uuid();
  const t = now();
  db.prepare(`INSERT INTO tasks (id, tenant_id, project_id, parent_task_id, title, description, status, priority, assignee, estimated_hours, due_date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)`).run(
    id, tenantId, projectId ?? null, parentTaskId ?? null, title, description ?? null, priority, assignee ?? null, estimatedHours ?? null, dueDate ?? null, sortOrder, t, t
  );
  logActivity(tenantId, 'task.created', 'task', id, assignee ?? null, { title, projectId }, projectId ?? null, id);
  return ok({ id, title });
}

export function handleGetTask(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId } = args;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, tenantId) as any;
  if (!task) return ok({ error: 'Task not found' });
  const comments = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  const deps = db.prepare('SELECT td.*, t.title as depends_on_title FROM task_dependencies td LEFT JOIN tasks t ON t.id = td.depends_on_task_id WHERE td.task_id = ?').all(taskId);
  return ok({ ...task, comments, dependencies: deps });
}

export function handleUpdateTask(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId, title, description, status, priority, assignee, estimatedHours, actualHours, dueDate, sortOrder } = args;
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, tenantId) as any;
  if (!existing) return ok({ error: 'Task not found' });

  const updates: string[] = [];
  const params: any[] = [];
  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (assignee !== undefined) { updates.push('assignee = ?'); params.push(assignee); }
  if (estimatedHours !== undefined) { updates.push('estimated_hours = ?'); params.push(estimatedHours); }
  if (actualHours !== undefined) { updates.push('actual_hours = ?'); params.push(actualHours); }
  if (dueDate !== undefined) { updates.push('due_date = ?'); params.push(dueDate); }
  if (sortOrder !== undefined) { updates.push('sort_order = ?'); params.push(sortOrder); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(now());
    params.push(taskId);
    params.push(tenantId);
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
    logActivity(tenantId, 'task.updated', 'task', taskId, assignee ?? existing.assignee ?? null, { changes: updates.map(u => u.split(' = ')[0]) }, existing.project_id ?? null, taskId);
  }
  return ok({ id: taskId, updated: true });
}

export function handleDeleteTask(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId } = args;
  const task = db.prepare('SELECT project_id FROM tasks WHERE id = ? AND tenant_id = ?').get(taskId, tenantId) as any;
  db.prepare('DELETE FROM tasks WHERE id = ? AND tenant_id = ?').run(taskId, tenantId);
  logActivity(tenantId, 'task.deleted', 'task', taskId, null, {}, task?.project_id ?? null, taskId);
  return ok({ success: true });
}

// ---- TASK COMMENTS ----

export function handleAddTaskComment(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId, author, content } = args;
  const id = uuid();
  const t = now();
  db.prepare('INSERT INTO task_comments (id, task_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, taskId, author, content, t);
  logActivity(tenantId, 'task.comment_added', 'task_comment', id, author, { taskId }, undefined, taskId);
  return ok({ id });
}

// ---- DEPENDENCIES ----

export function handleAddTaskDependency(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId, dependsOnTaskId } = args;
  const id = uuid();
  try {
    db.prepare('INSERT INTO task_dependencies (id, task_id, depends_on_task_id) VALUES (?, ?, ?)').run(id, taskId, dependsOnTaskId);
    logActivity(tenantId, 'task.dependency_added', 'task_dependency', id, null, { taskId, dependsOnTaskId });
    return ok({ success: true });
  } catch (e: any) {
    return ok({ error: e.message });
  }
}

export function handleRemoveTaskDependency(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, taskId, dependsOnTaskId } = args;
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?').run(taskId, dependsOnTaskId);
  return ok({ success: true });
}

// ---- ACTIVITY LOG ----

export function handleGetActivityLog(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId, taskId, limit = 50, offset = 0 } = args;
  let sql = 'SELECT * FROM activity_logs WHERE tenant_id = ?';
  const params: any[] = [tenantId];
  if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
  if (taskId) { sql += ' AND task_id = ?'; params.push(taskId); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  return ok(rows);
}

// ---- PROJECT TIMELINE ----

export function handleGetProjectTimeline(args: any): ToolResult {
  const db = getDatabase();
  const { tenantId, projectId } = args;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND tenant_id = ?').get(projectId, tenantId) as any;
  if (!project) return ok({ error: 'Project not found' });

  const tasks = db.prepare('SELECT id, title, status, priority, assignee, estimated_hours, actual_hours, due_date, sort_order, created_at, updated_at FROM tasks WHERE project_id = ? ORDER BY due_date ASC, sort_order ASC').all(projectId) as any[];

  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length;
  const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length;
  const todo = tasks.filter((t: any) => t.status === 'todo').length;
  const totalEstimated = tasks.reduce((sum: number, t: any) => sum + (t.estimated_hours || 0), 0);
  const totalActual = tasks.reduce((sum: number, t: any) => sum + (t.actual_hours || 0), 0);

  return ok({
    project: { id: project.id, name: project.name, status: project.status, priority: project.priority },
    summary: { total, completed, inProgress, todo, progress: total > 0 ? Math.round((completed / total) * 100) : 0 },
    hours: { estimated: totalEstimated, actual: totalActual },
    tasks,
  });
}

// ---- DISPATCHER ----

const HANDLERS: Record<string, (args: any) => ToolResult> = {
  list_projects: handleListProjects,
  create_project: handleCreateProject,
  get_project: handleGetProject,
  update_project: handleUpdateProject,
  delete_project: handleDeleteProject,
  list_tasks: handleListTasks,
  create_task: handleCreateTask,
  get_task: handleGetTask,
  update_task: handleUpdateTask,
  delete_task: handleDeleteTask,
  add_task_comment: handleAddTaskComment,
  add_task_dependency: handleAddTaskDependency,
  remove_task_dependency: handleRemoveTaskDependency,
  get_activity_log: handleGetActivityLog,
  get_project_timeline: handleGetProjectTimeline,
};

export function handleToolCall(name: string, args: any): ToolResult {
  const handler = HANDLERS[name];
  if (!handler) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2) }] };
  }
  return handler(args);
}

export function getToolDefinitions() {
  return [
    { name: 'list_projects', description: 'List all projects', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, status: { type: 'string' }, limit: { type: 'number' }, offset: { type: 'number' } }, required: ['tenantId'] } },
    { name: 'create_project', description: 'Create a new project', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, startDate: { type: 'number' }, dueDate: { type: 'number' } }, required: ['tenantId', 'name'] } },
    { name: 'get_project', description: 'Get project details with all tasks', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' } }, required: ['tenantId', 'projectId'] } },
    { name: 'update_project', description: 'Update a project', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, startDate: { type: 'number' }, dueDate: { type: 'number' } }, required: ['tenantId', 'projectId'] } },
    { name: 'delete_project', description: 'Delete a project and all its tasks', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' } }, required: ['tenantId', 'projectId'] } },
    { name: 'list_tasks', description: 'List tasks with optional filters', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' }, status: { type: 'string' }, assignee: { type: 'string' }, priority: { type: 'string' }, limit: { type: 'number' }, offset: { type: 'number' } }, required: ['tenantId'] } },
    { name: 'create_task', description: 'Create a new task', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' }, parentTaskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, assignee: { type: 'string' }, estimatedHours: { type: 'number' }, dueDate: { type: 'number' }, sortOrder: { type: 'number' } }, required: ['tenantId', 'title'] } },
    { name: 'get_task', description: 'Get task details with comments and dependencies', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' } }, required: ['tenantId', 'taskId'] } },
    { name: 'update_task', description: 'Update a task', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'cancelled'] }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, assignee: { type: 'string' }, estimatedHours: { type: 'number' }, actualHours: { type: 'number' }, dueDate: { type: 'number' }, sortOrder: { type: 'number' } }, required: ['tenantId', 'taskId'] } },
    { name: 'delete_task', description: 'Delete a task', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' } }, required: ['tenantId', 'taskId'] } },
    { name: 'add_task_comment', description: 'Add a comment to a task', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' }, author: { type: 'string' }, content: { type: 'string' } }, required: ['tenantId', 'taskId', 'author', 'content'] } },
    { name: 'add_task_dependency', description: 'Add a dependency between tasks', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' }, dependsOnTaskId: { type: 'string' } }, required: ['tenantId', 'taskId', 'dependsOnTaskId'] } },
    { name: 'remove_task_dependency', description: 'Remove a task dependency', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, taskId: { type: 'string' }, dependsOnTaskId: { type: 'string' } }, required: ['tenantId', 'taskId', 'dependsOnTaskId'] } },
    { name: 'get_activity_log', description: 'Get activity log for a project or task', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, limit: { type: 'number' }, offset: { type: 'number' } }, required: ['tenantId'] } },
    { name: 'get_project_timeline', description: 'Get project timeline with task progress summary', inputSchema: { type: 'object', properties: { tenantId: { type: 'string' }, projectId: { type: 'string' } }, required: ['tenantId', 'projectId'] } },
  ];
}
