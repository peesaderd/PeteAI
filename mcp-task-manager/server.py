#!/usr/bin/env python3
"""
Task Manager MCP Server
Persistent project, task, and queue management that survives OpenHands crashes.
Data stored in JSON files on disk.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Task Manager")

DATA_DIR = Path(os.environ.get("TASK_MANAGER_DATA_DIR", "/workspace/.task-manager"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
TASKS_FILE = DATA_DIR / "tasks.json"
PROJECTS_FILE = DATA_DIR / "projects.json"
QUEUE_FILE = DATA_DIR / "queue.json"
LOG_FILE = DATA_DIR / "log.json"


def _load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def _append_log(entry: str) -> None:
    log = _load_json(LOG_FILE)
    if not isinstance(log, dict):
        log = {"entries": []}
    if "entries" not in log:
        log["entries"] = []
    log["entries"].append({
        "timestamp": datetime.now().isoformat(),
        "message": entry
    })
    LOG_FILE.write_text(json.dumps(log, indent=2, ensure_ascii=False))


def _ensure_projects():
    data = _load_json(PROJECTS_FILE)
    if not isinstance(data, dict) or "projects" not in data:
        data = {"projects": {}}
        _save_json(PROJECTS_FILE, data)
    return data


def _ensure_tasks():
    data = _load_json(TASKS_FILE)
    if not isinstance(data, dict) or "tasks" not in data:
        data = {"tasks": {}}
        _save_json(TASKS_FILE, data)
    return data


def _ensure_queue():
    data = _load_json(QUEUE_FILE)
    if not isinstance(data, dict) or "queue" not in data:
        data = {"queue": [], "completed": [], "current": None}
        _save_json(QUEUE_FILE, data)
    return data


# ─── Project Tools ───────────────────────────────────────────────────

@mcp.tool(title="Create Project")
def create_project(project_id: str, name: str, description: str = "") -> str:
    """Create a new project. project_id must be unique (e.g. 'SCRUM', 'PROJ2')."""
    data = _ensure_projects()
    if project_id in data["projects"]:
        return f"❌ Project '{project_id}' already exists."
    data["projects"][project_id] = {
        "name": name,
        "description": description,
        "created": datetime.now().isoformat(),
        "status": "active",
        "updated": datetime.now().isoformat()
    }
    _save_json(PROJECTS_FILE, data)
    _append_log(f"Created project: {project_id} - {name}")
    return f"✅ Project '{project_id}' created."


@mcp.tool(title="List Projects")
def list_projects() -> str:
    """List all projects with their status."""
    data = _ensure_projects()
    if not data["projects"]:
        return "No projects yet."
    lines = ["## Projects\n"]
    for pid, p in data["projects"].items():
        lines.append(f"**{pid}**: {p['name']} ({p['status']})")
        if p.get("description"):
            lines.append(f"  → {p['description']}")
    return "\n".join(lines)


@mcp.tool(title="Update Project Status")
def update_project_status(project_id: str, status: str) -> str:
    """Update project status (active, paused, completed, archived)."""
    data = _ensure_projects()
    if project_id not in data["projects"]:
        return f"❌ Project '{project_id}' not found."
    data["projects"][project_id]["status"] = status
    data["projects"][project_id]["updated"] = datetime.now().isoformat()
    _save_json(PROJECTS_FILE, data)
    _append_log(f"Updated project '{project_id}' status to '{status}'")
    return f"✅ Project '{project_id}' → {status}"


# ─── Task Tools ──────────────────────────────────────────────────────

@mcp.tool(title="Create Task")
def create_task(task_id: str, title: str, project_id: str = "",
                description: str = "", priority: str = "medium") -> str:
    """Create a new task. task_id must be unique (e.g. 'TASK-001', 'AUTH-IMPL')."""
    data = _ensure_tasks()
    if task_id in data["tasks"]:
        return f"❌ Task '{task_id}' already exists."
    data["tasks"][task_id] = {
        "title": title,
        "project_id": project_id,
        "description": description,
        "priority": priority,
        "status": "todo",
        "created": datetime.now().isoformat(),
        "updated": datetime.now().isoformat(),
        "notes": ""
    }
    _save_json(TASKS_FILE, data)
    _append_log(f"Created task: {task_id} - {title}")
    return f"✅ Task '{task_id}' created."


@mcp.tool(title="Update Task Status")
def update_task_status(task_id: str, status: str, notes: str = "") -> str:
    """Update task status (todo, in_progress, done, blocked, cancelled)."""
    data = _ensure_tasks()
    if task_id not in data["tasks"]:
        return f"❌ Task '{task_id}' not found."
    data["tasks"][task_id]["status"] = status
    data["tasks"][task_id]["updated"] = datetime.now().isoformat()
    if notes:
        data["tasks"][task_id]["notes"] = notes
    _save_json(TASKS_FILE, data)
    _append_log(f"Updated task '{task_id}' → {status}")
    return f"✅ Task '{task_id}' → {status}"


@mcp.tool(title="List Tasks")
def list_tasks(project_id: str = "", status: str = "") -> str:
    """List tasks, optionally filtered by project_id and/or status."""
    data = _ensure_tasks()
    if not data["tasks"]:
        return "No tasks yet."
    lines = ["## Tasks\n"]
    for tid, t in sorted(data["tasks"].items()):
        if project_id and t.get("project_id") != project_id:
            continue
        if status and t.get("status") != status:
            continue
        lines.append(f"**{tid}**: {t['title']} [{t['status']}] (priority: {t['priority']})")
        if t.get("project_id"):
            lines.append(f"  → Project: {t['project_id']}")
        if t.get("notes"):
            lines.append(f"  📝 {t['notes']}")
    return "\n".join(lines) if len(lines) > 1 else "No matching tasks."


@mcp.tool(title="Get Task Details")
def get_task_details(task_id: str) -> str:
    """Get full details of a specific task."""
    data = _ensure_tasks()
    if task_id not in data["tasks"]:
        return f"❌ Task '{task_id}' not found."
    t = data["tasks"][task_id]
    return (
        f"**{task_id}**: {t['title']}\n"
        f"Status: {t['status']} | Priority: {t['priority']}\n"
        f"Project: {t.get('project_id', '-')}\n"
        f"Description: {t.get('description', '-')}\n"
        f"Notes: {t.get('notes', '-')}\n"
        f"Created: {t['created']}\n"
        f"Updated: {t['updated']}"
    )


# ─── Queue Tools ─────────────────────────────────────────────────────

@mcp.tool(title="Enqueue Task")
def enqueue_task(task_id: str) -> str:
    """Add a task to the work queue (FIFO)."""
    tasks = _ensure_tasks()
    if task_id not in tasks["tasks"]:
        return f"❌ Task '{task_id}' not found. Create it first."
    queue = _ensure_queue()
    if task_id in queue["queue"]:
        return f"⚠️ Task '{task_id}' already in queue."
    if queue.get("current") == task_id:
        return f"⚠️ Task '{task_id}' is currently in progress."
    queue["queue"].append(task_id)
    _save_json(QUEUE_FILE, queue)
    _append_log(f"Enqueued task: {task_id}")
    return f"✅ Task '{task_id}' added to queue (position {len(queue['queue'])})."


@mcp.tool(title="Start Next Task")
def start_next_task() -> str:
    """Dequeue the next task and mark it as in_progress."""
    queue = _ensure_queue()
    if not queue["queue"]:
        return "✅ Queue is empty. No tasks to start."
    if queue.get("current"):
        return f"⚠️ Task '{queue['current']}' is still in progress. Finish it first."
    next_task = queue["queue"].pop(0)
    queue["current"] = next_task
    _save_json(QUEUE_FILE, queue)
    update_task_status(next_task, "in_progress")
    _append_log(f"Started task: {next_task}")
    return f"▶️ Started task '{next_task}'."


@mcp.tool(title="Complete Current Task")
def complete_current_task(notes: str = "") -> str:
    """Mark the current task as done and move it to completed history."""
    queue = _ensure_queue()
    if not queue.get("current"):
        return "⚠️ No task is currently in progress."
    task_id = queue["current"]
    update_task_status(task_id, "done", notes)
    queue["completed"].append({
        "task_id": task_id,
        "completed_at": datetime.now().isoformat(),
        "notes": notes
    })
    queue["current"] = None
    _save_json(QUEUE_FILE, queue)
    _append_log(f"Completed task: {task_id}")
    return f"✅ Task '{task_id}' completed."


@mcp.tool(title="Show Queue Status")
def show_queue_status() -> str:
    """Show current queue state: what's running, pending, and completed."""
    queue = _ensure_queue()
    lines = ["## Queue Status\n"]
    if queue.get("current"):
        lines.append(f"**▶️ Current:** {queue['current']}\n")
    else:
        lines.append("**▶️ Current:** (none)\n")
    if queue["queue"]:
        lines.append(f"**⏳ Pending ({len(queue['queue'])}):**")
        for i, tid in enumerate(queue["queue"], 1):
            lines.append(f"  {i}. {tid}")
    else:
        lines.append("**⏳ Pending:** (empty)")
    if queue["completed"]:
        lines.append(f"\n**✅ Completed ({len(queue['completed'])}):**")
        for c in queue["completed"][-5:]:  # last 5
            lines.append(f"  ✅ {c['task_id']} ({c['completed_at'][:19]})")
    return "\n".join(lines)


# ─── Log Tools ───────────────────────────────────────────────────────

@mcp.tool(title="Get Activity Log")
def get_activity_log(limit: int = 20) -> str:
    """Show recent activity log entries."""
    log = _load_json(LOG_FILE)
    if not isinstance(log, dict) or "entries" not in log or not log["entries"]:
        return "No activity yet."
    entries = log["entries"][-limit:]
    lines = ["## Activity Log\n"]
    for e in entries:
        lines.append(f"[{e['timestamp'][:19]}] {e['message']}")
    return "\n".join(lines)


@mcp.tool(title="Get Summary")
def get_summary() -> str:
    """Get a full summary of all projects, tasks, and queue state."""
    projects = _ensure_projects()
    tasks = _ensure_tasks()
    queue = _ensure_queue()

    lines = ["# 📋 Task Manager Summary\n"]

    # Projects
    lines.append("## Projects")
    if projects["projects"]:
        for pid, p in projects["projects"].items():
            lines.append(f"  **{pid}**: {p['name']} ({p['status']})")
    else:
        lines.append("  (none)")
    lines.append("")

    # Tasks
    lines.append("## Tasks")
    if tasks["tasks"]:
        by_status = {"todo": [], "in_progress": [], "done": [], "blocked": [], "cancelled": []}
        for tid, t in tasks["tasks"].items():
            s = t.get("status", "todo")
            if s in by_status:
                by_status[s].append(tid)
            else:
                by_status["todo"].append(tid)
        for status, items in by_status.items():
            if items:
                lines.append(f"  **{status}** ({len(items)}): {', '.join(items)}")
    else:
        lines.append("  (none)")
    lines.append("")

    # Queue
    lines.append("## Queue")
    if queue.get("current"):
        lines.append(f"  ▶️ Current: {queue['current']}")
    lines.append(f"  ⏳ Pending: {len(queue['queue'])}")
    lines.append(f"  ✅ Completed: {len(queue['completed'])}")

    return "\n".join(lines)


def run_server():
    mcp.run()


if __name__ == "__main__":
    run_server()
