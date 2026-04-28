#!/usr/bin/env python3
"""
Task Manager Web UI
Simple dashboard to view projects, tasks, queue, and activity log.
Run: python3 webui.py [--port 8080]
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

DATA_DIR = Path(os.environ.get("TASK_MANAGER_DATA_DIR", "/workspace/.task-manager"))

app = FastAPI(title="Task Manager UI")


# ─── MCP HTTP Endpoint (for ERP MCP Gateway) ─────────────────────────

class ToolCallRequest(BaseModel):
    tool: str
    args: dict = {}


# Import tool functions from server.py
import importlib.util
_server_path = Path(__file__).parent / "server.py"
_spec = importlib.util.spec_from_file_location("task_manager_server", _server_path)
_tm_server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_tm_server)

# Map tool names to functions
TOOL_FUNCTIONS = {
    "create_project": _tm_server.create_project,
    "list_projects": _tm_server.list_projects,
    "update_project_status": _tm_server.update_project_status,
    "create_task": _tm_server.create_task,
    "update_task_status": _tm_server.update_task_status,
    "list_tasks": _tm_server.list_tasks,
    "get_task_details": _tm_server.get_task_details,
    "enqueue_task": _tm_server.enqueue_task,
    "start_next_task": _tm_server.start_next_task,
    "complete_current_task": _tm_server.complete_current_task,
    "show_queue_status": _tm_server.show_queue_status,
    "get_activity_log": _tm_server.get_activity_log,
    "get_summary": _tm_server.get_summary,
}


@app.post("/mcp")
async def handle_mcp(req: ToolCallRequest):
    """MCP endpoint for ERP MCP Gateway to route tool calls."""
    func = TOOL_FUNCTIONS.get(req.tool)
    if not func:
        return JSONResponse(
            status_code=404,
            content={"status": "error", "error": f"Unknown tool: {req.tool}"}
        )
    try:
        result = func(**req.args)
        return {"status": "ok", "result": result}
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "error": str(e)}
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "task-manager", "timestamp": datetime.now().isoformat()}


def _load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}
    return {}


def _get_data():
    projects = _load_json(DATA_DIR / "projects.json")
    tasks = _load_json(DATA_DIR / "tasks.json")
    queue = _load_json(DATA_DIR / "queue.json")
    log = _load_json(DATA_DIR / "log.json")
    return projects, tasks, queue, log


HTML_PAGE = """<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Task Manager Dashboard</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }}
  .container {{ max-width: 1200px; margin: 0 auto; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 8px; color: #f8fafc; }}
  .subtitle {{ color: #94a3b8; margin-bottom: 24px; font-size: 0.9rem; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }}
  .card {{ background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }}
  .card h2 {{ font-size: 1rem; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }}
  .stat {{ font-size: 2rem; font-weight: 700; color: #f8fafc; }}
  .stat-label {{ font-size: 0.85rem; color: #64748b; }}
  .badge {{ display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }}
  .badge-todo {{ background: #1e293b; color: #94a3b8; border: 1px solid #475569; }}
  .badge-in_progress {{ background: #1e3a5f; color: #60a5fa; border: 1px solid #2563eb; }}
  .badge-done {{ background: #14532d; color: #4ade80; border: 1px solid #16a34a; }}
  .badge-blocked {{ background: #451a03; color: #fb923c; border: 1px solid #ea580c; }}
  .badge-cancelled {{ background: #450a0a; color: #f87171; border: 1px solid #dc2626; }}
  .badge-active {{ background: #14532d; color: #4ade80; border: 1px solid #16a34a; }}
  .badge-paused {{ background: #451a03; color: #fb923c; border: 1px solid #ea580c; }}
  .badge-completed {{ background: #1e3a5f; color: #60a5fa; border: 1px solid #2563eb; }}
  .badge-archived {{ background: #1e293b; color: #64748b; border: 1px solid #475569; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }}
  th {{ color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }}
  tr:hover {{ background: #1e293b; }}
  .queue-current {{ background: #1e3a5f; border-radius: 8px; padding: 16px; margin-bottom: 12px; border: 1px solid #2563eb; }}
  .queue-current-label {{ color: #60a5fa; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }}
  .queue-current-title {{ font-size: 1.2rem; font-weight: 600; margin-top: 4px; }}
  .log-entry {{ padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 0.85rem; }}
  .log-time {{ color: #64748b; font-family: monospace; }}
  .empty {{ color: #64748b; font-style: italic; padding: 20px; text-align: center; }}
  .refresh {{ display: inline-block; margin-bottom: 16px; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.85rem; }}
  .refresh:hover {{ background: #1d4ed8; }}
  .priority-high {{ color: #f87171; }}
  .priority-medium {{ color: #fb923c; }}
  .priority-low {{ color: #94a3b8; }}
  .flex {{ display: flex; justify-content: space-between; align-items: center; }}
  .notes {{ color: #94a3b8; font-size: 0.8rem; margin-top: 2px; }}
  @media (max-width: 768px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="container">
  <div class="flex">
    <div>
      <h1>📋 Task Manager</h1>
      <div class="subtitle">Last updated: {timestamp}</div>
    </div>
    <button class="refresh" onclick="location.reload()">🔄 Refresh</button>
  </div>

  <!-- Stats -->
  <div class="grid">
    <div class="card">
      <h2>Projects</h2>
      <div class="stat">{project_count}</div>
      <div class="stat-label">Active: {active_projects}</div>
    </div>
    <div class="card">
      <h2>Tasks</h2>
      <div class="stat">{task_count}</div>
      <div class="stat-label">Done: {done_tasks} | Pending: {pending_tasks}</div>
    </div>
    <div class="card">
      <h2>Queue</h2>
      <div class="stat">{queue_pending}</div>
      <div class="stat-label">Pending | ✅ {queue_completed} completed</div>
    </div>
  </div>

  <!-- Current Task -->
  {current_task_html}

  <!-- Projects & Tasks -->
  <div class="grid" style="grid-template-columns: 1fr 2fr;">
    <div class="card">
      <h2>Projects</h2>
      {projects_html}
    </div>
    <div class="card">
      <h2>Tasks</h2>
      {tasks_html}
    </div>
  </div>

  <!-- Queue -->
  <div class="card" style="margin-top: 16px;">
    <h2>Queue</h2>
    {queue_html}
  </div>

  <!-- Activity Log -->
  <div class="card" style="margin-top: 16px;">
    <h2>Activity Log</h2>
    {log_html}
  </div>
</div>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def dashboard():
    projects_data, tasks_data, queue_data, log_data = _get_data()

    projects = projects_data.get("projects", {}) if isinstance(projects_data, dict) else {}
    tasks = tasks_data.get("tasks", {}) if isinstance(tasks_data, dict) else {}
    queue = queue_data if isinstance(queue_data, dict) else {}
    log_entries = log_data.get("entries", []) if isinstance(log_data, dict) else []

    # Stats
    project_count = len(projects)
    active_projects = sum(1 for p in projects.values() if p.get("status") == "active")
    task_count = len(tasks)
    done_tasks = sum(1 for t in tasks.values() if t.get("status") == "done")
    pending_tasks = sum(1 for t in tasks.values() if t.get("status") in ("todo", "in_progress"))
    queue_pending = len(queue.get("queue", []))
    queue_completed = len(queue.get("completed", []))

    # Current task
    current_id = queue.get("current")
    current_task_html = ""
    if current_id and current_id in tasks:
        t = tasks[current_id]
        current_task_html = f"""
        <div class="queue-current">
          <div class="queue-current-label">▶️ Current Task</div>
          <div class="queue-current-title">{t.get('title', current_id)}</div>
          <div style="color:#94a3b8;font-size:0.85rem;margin-top:4px;">
            {current_id} | Priority: <span class="priority-{t.get('priority', 'medium')}">{t.get('priority', 'medium')}</span>
            {f" | 📝 {t.get('notes', '')}" if t.get('notes') else ""}
          </div>
        </div>"""

    # Projects table
    if projects:
        rows = []
        for pid, p in sorted(projects.items()):
            status = p.get("status", "active")
            rows.append(f"<tr><td><strong>{pid}</strong></td><td>{p.get('name', '')}</td><td><span class='badge badge-{status}'>{status}</span></td></tr>")
        projects_html = f"<table><tr><th>ID</th><th>Name</th><th>Status</th></tr>{''.join(rows)}</table>"
    else:
        projects_html = '<div class="empty">No projects yet</div>'

    # Tasks table
    if tasks:
        rows = []
        for tid, t in sorted(tasks.items()):
            status = t.get("status", "todo")
            priority = t.get("priority", "medium")
            notes = t.get("notes", "")
            note_html = f'<div class="notes">📝 {notes}</div>' if notes else ""
            rows.append(f"<tr><td>{tid}</td><td>{t.get('title', '')}{note_html}</td><td><span class='badge badge-{status}'>{status}</span></td><td class='priority-{priority}'>{priority}</td></tr>")
        tasks_html = f"<table><tr><th>ID</th><th>Title</th><th>Status</th><th>Priority</th></tr>{''.join(rows)}</table>"
    else:
        tasks_html = '<div class="empty">No tasks yet</div>'

    # Queue
    q = queue.get("queue", [])
    completed = queue.get("completed", [])
    if q or completed:
        parts = []
        if q:
            parts.append("<div style='margin-bottom:8px;'><strong>⏳ Pending:</strong></div>")
            for i, tid in enumerate(q, 1):
                title = tasks.get(tid, {}).get("title", tid) if tid in tasks else tid
                parts.append(f"<div style='padding:4px 0;font-size:0.9rem;'>{i}. {title} ({tid})</div>")
        if completed:
            parts.append(f"<div style='margin-top:12px;margin-bottom:8px;'><strong>✅ Completed ({len(completed)}):</strong></div>")
            for c in completed[-5:]:
                tid = c.get("task_id", "")
                title = tasks.get(tid, {}).get("title", tid) if tid in tasks else tid
                ts = c.get("completed_at", "")[:19] if c.get("completed_at") else ""
                parts.append(f"<div style='padding:4px 0;font-size:0.85rem;color:#94a3b8;'>✅ {title} ({tid}) <span class='log-time'>{ts}</span></div>")
        queue_html = "".join(parts)
    else:
        queue_html = '<div class="empty">Queue is empty</div>'

    # Activity log
    if log_entries:
        entries = log_entries[-20:]
        entries.reverse()
        parts = []
        for e in entries:
            ts = e.get("timestamp", "")[:19]
            msg = e.get("message", "")
            parts.append(f'<div class="log-entry"><span class="log-time">[{ts}]</span> {msg}</div>')
        log_html = "".join(parts)
    else:
        log_html = '<div class="empty">No activity yet</div>'

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return HTML_PAGE.format(
        timestamp=timestamp,
        project_count=project_count,
        active_projects=active_projects,
        task_count=task_count,
        done_tasks=done_tasks,
        pending_tasks=pending_tasks,
        queue_pending=queue_pending,
        queue_completed=queue_completed,
        current_task_html=current_task_html,
        projects_html=projects_html,
        tasks_html=tasks_html,
        queue_html=queue_html,
        log_html=log_html,
    )


def main():
    port = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--port" else 8080
    print(f"🌐 Task Manager UI: http://0.0.0.0:{port}")
    print(f"📁 Data: {DATA_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")


if __name__ == "__main__":
    main()
