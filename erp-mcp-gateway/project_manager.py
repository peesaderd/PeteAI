#!/usr/bin/env python3
"""
Project Manager Service
=======================
MCP service ที่ทำหน้าที่เป็น Project Manager:
  - รับ report จาก Sub Agents ทาง HTTP API
  - Cross-check ข้อมูลจาก Sub Agents ว่าตรงกันหรือไม่
  - ถ้าตรงกัน → อัปเดต Task Manager ผ่าน Gateway
  - ถ้าไม่ตรงกัน → แจ้งเตือน (pending review)
  - สร้าง Project/Task อัตโนมัติจาก OpenHands conversations

Usage:
  python3 project_manager.py              # stdio mode
  python3 project_manager.py --http       # HTTP mode
  python3 project_manager.py --port 8090  # custom port
"""

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx

# ─── Configuration ────────────────────────────────────────────────────

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://89.167.82.205:9090")
OPENHANDS_URL = os.environ.get("OPENHANDS_URL", "http://89.167.82.205:3000")
TASK_MANAGER_URL = os.environ.get("TASK_MANAGER_URL", "http://89.167.82.205:8081")
PM_PORT = int(os.environ.get("PM_PORT", "8090"))
PM_NAME = os.environ.get("PM_NAME", "project-manager")
DATA_DIR = Path(os.environ.get("PM_DATA_DIR", "/workspace/.erp-gateway"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_FILE = DATA_DIR / "pm-reports.json"
PROJECTS_FILE = DATA_DIR / "pm-projects.json"

# ─── Data Store ───────────────────────────────────────────────────────

class ReportStore:
    """เก็บ reports จาก sub agents และผลการ cross-check."""

    def __init__(self):
        self._reports: list[dict] = []
        self._projects: list[dict] = []
        self._load()

    def _load(self):
        for f, key in [(REPORTS_FILE, "_reports"), (PROJECTS_FILE, "_projects")]:
            if f.exists():
                try:
                    setattr(self, key, json.loads(f.read_text()))
                except (json.JSONDecodeError, FileNotFoundError):
                    pass

    def _save_reports(self):
        REPORTS_FILE.write_text(json.dumps(self._reports, indent=2, ensure_ascii=False))

    def _save_projects(self):
        PROJECTS_FILE.write_text(json.dumps(self._projects, indent=2, ensure_ascii=False))

    def add_report(self, agent: str, report_type: str, data: dict) -> dict:
        """บันทึกรายงานจาก sub agent."""
        report = {
            "id": str(uuid.uuid4())[:8],
            "agent": agent,
            "type": report_type,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "status": "pending",  # pending | matched | conflicted | applied
        }
        self._reports.append(report)
        self._save_reports()
        return report

    def get_pending_reports(self, report_type: str = None) -> list[dict]:
        """ดึง reports ที่ยังไม่ถูกตรวจสอบ."""
        results = [r for r in self._reports if r["status"] == "pending"]
        if report_type:
            results = [r for r in results if r["type"] == report_type]
        return results

    def mark_report(self, report_id: str, status: str):
        """อัปเดตสถานะ report."""
        for r in self._reports:
            if r["id"] == report_id:
                r["status"] = status
                r["updated_at"] = datetime.now().isoformat()
                break
        self._save_reports()

    def add_project(self, project: dict):
        """เพิ่ม project ใหม่."""
        project["id"] = project.get("id", str(uuid.uuid4())[:8])
        project["created_at"] = datetime.now().isoformat()
        project["updated_at"] = datetime.now().isoformat()
        project["status"] = project.get("status", "active")
        project["tasks"] = project.get("tasks", [])
        self._projects.append(project)
        self._save_projects()
        return project

    def update_project(self, project_id: str, updates: dict):
        """อัปเดต project."""
        for p in self._projects:
            if p["id"] == project_id:
                p.update(updates)
                p["updated_at"] = datetime.now().isoformat()
                self._save_projects()
                return p
        return None

    def get_projects(self, status: str = None) -> list[dict]:
        if status:
            return [p for p in self._projects if p["status"] == status]
        return list(self._projects)

    def get_recent_reports(self, limit: int = 20) -> list[dict]:
        return sorted(self._reports, key=lambda r: r["timestamp"], reverse=True)[:limit]

    def get_summary(self) -> dict:
        return {
            "total_reports": len(self._reports),
            "pending_reports": len([r for r in self._reports if r["status"] == "pending"]),
            "matched_reports": len([r for r in self._reports if r["status"] == "matched"]),
            "conflicted_reports": len([r for r in self._reports if r["status"] == "conflicted"]),
            "applied_reports": len([r for r in self._reports if r["status"] == "applied"]),
            "total_projects": len(self._projects),
            "active_projects": len([p for p in self._projects if p["status"] == "active"]),
        }


# ─── Gateway Client ───────────────────────────────────────────────────

class GatewayClient:
    """เรียก MCP tools ผ่าน Gateway API."""

    def __init__(self, gateway_url: str):
        self.gateway_url = gateway_url
        self._client = httpx.Client(timeout=10.0)

    def call_tool(self, tool_name: str, args: dict = None) -> dict:
        """เรียก tool ผ่าน Gateway /mcp endpoint."""
        try:
            resp = self._client.post(f"{self.gateway_url}/mcp", json={
                "tool": tool_name,
                "args": args or {},
            })
            if resp.status_code == 200:
                return resp.json()
            return {"status": "error", "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def create_project_in_task_manager(self, name: str, description: str = "") -> dict:
        """สร้าง project ใน Task Manager ผ่าน Gateway."""
        return self.call_tool("create_project", {
            "name": name,
            "description": description,
        })

    def create_task_in_task_manager(self, project_id: str, title: str, description: str = "") -> dict:
        """สร้าง task ใน Task Manager ผ่าน Gateway."""
        return self.call_tool("create_task", {
            "project_id": project_id,
            "title": title,
            "description": description,
        })

    def close(self):
        self._client.close()


# ─── OpenHands Client ─────────────────────────────────────────────────

class OpenHandsClient:
    """ดึง conversations จาก OpenHands API."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self._client = httpx.Client(timeout=10.0)
        self._known_conversations: set[str] = set()

    def get_conversations(self) -> list[dict]:
        """ดึงรายการ conversations ทั้งหมด."""
        try:
            resp = self._client.get(f"{self.base_url}/api/conversations")
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", []) if isinstance(data, dict) else data
                return results
        except Exception:
            pass
        return []

    def get_new_conversations(self) -> list[dict]:
        """ดึงเฉพาะ conversations ที่ยังไม่เคยเห็น."""
        all_convos = self.get_conversations()
        new_ones = [c for c in all_convos if c.get("conversation_id") not in self._known_conversations]
        for c in all_convos:
            self._known_conversations.add(c.get("conversation_id", ""))
        return new_ones

    def close(self):
        self._client.close()


# ─── Cross-check Engine ───────────────────────────────────────────────

class CrossCheckEngine:
    """ตรวจสอบ reports จาก sub agents ว่าตรงกันหรือไม่."""

    @staticmethod
    def check(store: ReportStore, report_type: str) -> Optional[dict]:
        """ตรวจสอบ pending reports ของประเภทที่กำหนด ถ้าตรงกัน → คืนค่า merged data."""
        pending = store.get_pending_reports(report_type)
        if len(pending) < 2:
            return None  # รอให้มีอย่างน้อย 2 agents ส่งมา

        # ตรวจสอบว่า reports ทั้งหมดตรงกันหรือไม่
        base_data = pending[0]["data"]
        all_match = True
        for r in pending[1:]:
            if r["data"] != base_data:
                all_match = False
                break

        if all_match:
            # Mark ทั้งหมดเป็น matched
            for r in pending:
                store.mark_report(r["id"], "matched")
            return {
                "status": "matched",
                "data": base_data,
                "reports": [r["id"] for r in pending],
                "agents": [r["agent"] for r in pending],
            }
        else:
            # Mark เป็น conflicted
            for r in pending:
                store.mark_report(r["id"], "conflicted")
            return {
                "status": "conflicted",
                "reports": [r["id"] for r in pending],
                "agents": [r["agent"] for r in pending],
                "details": [{"agent": r["agent"], "data": r["data"]} for r in pending],
            }


# ─── MCP Server (FastMCP) ────────────────────────────────────────────

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Project Manager")

# Global instances
_store: ReportStore = None
_gateway: GatewayClient = None
_openhands: OpenHandsClient = None
_checker: CrossCheckEngine = None


@mcp.tool(title="Receive Report")
def receive_report(agent: str, report_type: str, data: str) -> str:
    """รับรายงานจาก Sub Agent.

    Args:
        agent: ชื่อ agent ที่ส่งรายงาน (e.g. 'monitor-chat', 'system-monitor')
        report_type: ประเภทรายงาน (e.g. 'conversation', 'service-status', 'task-update')
        data: JSON string ของข้อมูลที่รายงาน
    """
    if not _store:
        return "Project Manager not initialized."

    try:
        data_dict = json.loads(data)
    except json.JSONDecodeError as e:
        return f"❌ Invalid JSON in data: {e}"

    report = _store.add_report(agent, report_type, data_dict)

    # ลอง cross-check ทันที
    result = _checker.check(_store, report_type)
    if result:
        if result["status"] == "matched":
            return (
                f"✅ Report {report['id']} received from '{agent}'.\n"
                f"🎯 Cross-check: MATCHED! ({', '.join(result['agents'])})\n"
                f"   Data: {json.dumps(result['data'], ensure_ascii=False)}"
            )
        else:
            return (
                f"⚠️ Report {report['id']} received from '{agent}'.\n"
                f"🔴 Cross-check: CONFLICTED!\n"
                f"   Agents: {', '.join(result['agents'])}\n"
                f"   รอการตรวจสอบจากคุณ"
            )

    return (
        f"📥 Report {report['id']} received from '{agent}'.\n"
        f"   Type: {report_type}\n"
        f"   รอ agent อื่นส่งรายงานเพื่อ cross-check..."
    )


@mcp.tool(title="Cross Check Now")
def cross_check_now(report_type: str) -> str:
    """ตรวจสอบ reports ที่รออยู่ทั้งหมดของประเภทที่กำหนด."""
    if not _store:
        return "Project Manager not initialized."

    result = _checker.check(_store, report_type)
    if not result:
        pending = _store.get_pending_reports(report_type)
        if not pending:
            return f"No pending reports for type '{report_type}'."
        return (
            f"⏳ Waiting for more reports...\n"
            f"   Pending: {len(pending)} report(s) from "
            f"{', '.join(r['agent'] for r in pending)}"
        )

    if result["status"] == "matched":
        return (
            f"✅ Cross-check MATCHED!\n"
            f"   Agents: {', '.join(result['agents'])}\n"
            f"   Data: {json.dumps(result['data'], ensure_ascii=False)}"
        )
    else:
        return (
            f"🔴 Cross-check CONFLICTED!\n"
            f"   Agents: {', '.join(result['agents'])}\n"
            f"   รายละเอียด:\n" +
            "\n".join(f"   - {d['agent']}: {json.dumps(d['data'], ensure_ascii=False)}"
                      for d in result["details"])
        )


@mcp.tool(title="Confirm Update")
def confirm_update(report_type: str) -> str:
    """ยืนยันการอัปเดตหลังจาก cross-check ผ่านแล้ว.

    Args:
        report_type: ประเภทรายงานที่ต้องการยืนยัน (e.g. 'conversation', 'service-status')
    """
    if not _store or not _gateway:
        return "Project Manager not initialized."

    # ดึง reports ที่ matched แล้ว
    matched = [r for r in _store._reports
               if r["type"] == report_type and r["status"] == "matched"]

    if not matched:
        return f"No matched reports found for type '{report_type}'. ต้อง cross-check ก่อน"

    # ใช้ข้อมูลจาก report ล่าสุด
    latest = matched[-1]
    data = latest["data"]
    results = []

    if report_type == "conversation":
        # สร้าง project จาก conversation
        title = data.get("title", data.get("conversation_id", "Untitled"))
        summary = data.get("summary", "")
        proj = _store.add_project({
            "name": title,
            "description": summary,
            "source": "openhands",
            "source_id": data.get("conversation_id", ""),
        })
        results.append(f"✅ Created project '{title}' (ID: {proj['id']})")

        # สร้างใน Task Manager ด้วย
        tm_result = _gateway.create_project_in_task_manager(title, summary)
        results.append(f"   Task Manager: {json.dumps(tm_result, ensure_ascii=False)}")

    elif report_type == "service-status":
        # อัปเดตสถานะ service
        service_name = data.get("service", "unknown")
        status = data.get("status", "unknown")
        results.append(f"ℹ️ Service '{service_name}' status: {status}")

    # Mark เป็น applied
    for r in matched:
        _store.mark_report(r["id"], "applied")

    return "\n".join(results)


@mcp.tool(title="Get Status")
def get_status() -> str:
    """ดูสถานะปัจจุบันของ Project Manager."""
    if not _store:
        return "Project Manager not initialized."

    summary = _store.get_summary()
    lines = [
        "# 📊 Project Manager Status\n",
        f"**Reports:** {summary['total_reports']} total",
        f"  - ⏳ Pending: {summary['pending_reports']}",
        f"  - ✅ Matched: {summary['matched_reports']}",
        f"  - 🔴 Conflicted: {summary['conflicted_reports']}",
        f"  - ✅ Applied: {summary['applied_reports']}",
        f"\n**Projects:** {summary['total_projects']} total",
        f"  - Active: {summary['active_projects']}",
    ]

    # แสดง projects
    for p in _store.get_projects():
        status_icon = "🟢" if p["status"] == "active" else "🔴"
        lines.append(f"\n{status_icon} **{p.get('name', '?')}** ({p['id']})")
        lines.append(f"   Tasks: {len(p.get('tasks', []))}")
        lines.append(f"   Source: {p.get('source', 'manual')}")

    return "\n".join(lines)


@mcp.tool(title="List Recent Reports")
def list_recent_reports(limit: int = 10) -> str:
    """ดูรายงานล่าสุดจาก Sub Agents.

    Args:
        limit: จำนวนรายการที่ต้องการดู (default: 10)
    """
    if not _store:
        return "Project Manager not initialized."

    reports = _store.get_recent_reports(limit)
    if not reports:
        return "No reports yet."

    lines = ["# 📋 Recent Reports\n"]
    for r in reports:
        status_icon = {
            "pending": "⏳",
            "matched": "✅",
            "conflicted": "🔴",
            "applied": "✅",
        }.get(r["status"], "❓")
        lines.append(
            f"{status_icon} **{r['agent']}** | {r['type']} | {r['id']}\n"
            f"   Data: {json.dumps(r['data'], ensure_ascii=False)[:100]}\n"
            f"   Time: {r['timestamp']}\n"
        )

    return "\n".join(lines)


# ─── REST API (FastAPI) ──────────────────────────────────────────────

def create_rest_app(store: ReportStore, gateway: GatewayClient,
                    openhands: OpenHandsClient, checker: CrossCheckEngine):
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    app = FastAPI(title="Project Manager", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class ReportRequest(BaseModel):
        agent: str
        type: str
        data: dict

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": PM_NAME,
            "summary": store.get_summary(),
            "timestamp": datetime.now().isoformat(),
        }

    @app.post("/api/reports")
    def submit_report(req: ReportRequest):
        """Sub Agent ส่งรายงานมา."""
        report = store.add_report(req.agent, req.type, req.data)
        result = checker.check(store, req.type)
        return {
            "status": "ok",
            "report": report,
            "cross_check": result,
        }

    @app.get("/api/reports")
    def get_reports(status: str = None, type: str = None, limit: int = 20):
        """ดึงรายงานทั้งหมด."""
        reports = store.get_recent_reports(limit)
        if status:
            reports = [r for r in reports if r["status"] == status]
        if type:
            reports = [r for r in reports if r["type"] == type]
        return {"reports": reports, "total": len(reports)}

    @app.get("/api/projects")
    def get_projects(status: str = None):
        """ดึง projects ทั้งหมด."""
        return {"projects": store.get_projects(status)}

    @app.post("/api/projects")
    def create_project(name: str, description: str = ""):
        """สร้าง project ใหม่."""
        proj = store.add_project({"name": name, "description": description})
        # สร้างใน Task Manager ด้วย
        tm_result = gateway.create_project_in_task_manager(name, description)
        return {"status": "ok", "project": proj, "task_manager": tm_result}

    @app.get("/api/summary")
    def get_summary():
        return store.get_summary()

    @app.post("/api/cross-check")
    def run_cross_check(report_type: str):
        """สั่ง cross-check ด้วยตนเอง."""
        result = checker.check(store, report_type)
        return {"status": "ok", "result": result or {"status": "waiting"}}

    @app.post("/api/confirm")
    def confirm(report_type: str):
        """ยืนยันและอัปเดตหลังจาก cross-check ผ่าน."""
        matched = [r for r in store._reports
                   if r["type"] == report_type and r["status"] == "matched"]
        if not matched:
            raise HTTPException(400, f"No matched reports for type '{report_type}'")

        latest = matched[-1]
        data = latest["data"]
        actions = []

        if report_type == "conversation":
            title = data.get("title", data.get("conversation_id", "Untitled"))
            summary = data.get("summary", "")
            proj = store.add_project({
                "name": title,
                "description": summary,
                "source": "openhands",
                "source_id": data.get("conversation_id", ""),
            })
            tm_result = gateway.create_project_in_task_manager(title, summary)
            actions.append({"action": "create_project", "project": proj, "task_manager": tm_result})

        for r in matched:
            store.mark_report(r["id"], "applied")

        return {"status": "ok", "actions": actions}

    return app


# ─── Sub Agent: Monitor Chat ─────────────────────────────────────────

class MonitorChatAgent:
    """Sub Agent A: คอยดู OpenHands conversations และรายงานไปหา Project Manager."""

    def __init__(self, pm_url: str, openhands_url: str):
        self.pm_url = pm_url
        self.openhands = OpenHandsClient(openhands_url)
        self._client = httpx.Client(timeout=10.0)
        self._interval = 30  # ตรวจสอบทุก 30 วินาที

    def report_to_pm(self, report_type: str, data: dict) -> dict:
        """ส่งรายงานไปหา Project Manager."""
        try:
            resp = self._client.post(f"{self.pm_url}/api/reports", json={
                "agent": "monitor-chat",
                "type": report_type,
                "data": data,
            })
            if resp.status_code == 200:
                return resp.json()
            return {"status": "error", "error": resp.text[:200]}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def run_once(self) -> list[dict]:
        """ตรวจสอบ conversations ใหม่และรายงาน."""
        results = []
        new_convos = self.openhands.get_new_conversations()
        for convo in new_convos:
            data = {
                "conversation_id": convo.get("conversation_id", ""),
                "title": convo.get("title", "Untitled"),
                "status": convo.get("status", "unknown"),
                "created_at": convo.get("created_at", ""),
                "summary": f"Conversation: {convo.get('title', 'Untitled')}",
            }
            result = self.report_to_pm("conversation", data)
            results.append({"conversation": convo.get("conversation_id", ""), "result": result})
        return results

    def run_forever(self):
        """รันแบบ loop ไม่หยุด."""
        print(f"[MonitorChat] เริ่มติดตาม OpenHands conversations ที่ {self.openhands.base_url}")
        print(f"[MonitorChat] รายงานไปที่ {self.pm_url}")
        while True:
            try:
                results = self.run_once()
                for r in results:
                    print(f"[MonitorChat] พบ conversation ใหม่: {r['conversation']}")
                    print(f"   Result: {json.dumps(r['result'], ensure_ascii=False)}")
            except Exception as e:
                print(f"[MonitorChat] Error: {e}")
            time.sleep(self._interval)

    def close(self):
        self.openhands.close()
        self._client.close()


# ─── Sub Agent: System Monitor ───────────────────────────────────────

class SystemMonitorAgent:
    """Sub Agent B: ตรวจสอบสถานะ services และรายงานไปหา Project Manager."""

    def __init__(self, pm_url: str):
        self.pm_url = pm_url
        self._client = httpx.Client(timeout=10.0)
        self._interval = 60  # ตรวจสอบทุก 60 วินาที
        self._last_status = {}

    def check_service(self, name: str, url: str) -> dict:
        """ตรวจสอบ health ของ service."""
        try:
            resp = self._client.get(f"{url}/health", timeout=5.0)
            if resp.status_code == 200:
                return {"status": "live", "response": resp.json()}
            return {"status": "error", "http_code": resp.status_code}
        except Exception as e:
            return {"status": "offline", "error": str(e)}

    def report_to_pm(self, report_type: str, data: dict) -> dict:
        """ส่งรายงานไปหา Project Manager."""
        try:
            resp = self._client.post(f"{self.pm_url}/api/reports", json={
                "agent": "system-monitor",
                "type": report_type,
                "data": data,
            })
            if resp.status_code == 200:
                return resp.json()
            return {"status": "error", "error": resp.text[:200]}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def run_once(self) -> list[dict]:
        """ตรวจสอบ services ทั้งหมดและรายงาน."""
        results = []
        services = {
            "gateway": GATEWAY_URL,
            "task-manager": TASK_MANAGER_URL,
            "openhands": OPENHANDS_URL,
        }

        for name, url in services.items():
            status = self.check_service(name, url)
            old_status = self._last_status.get(name)
            if status["status"] != old_status:
                data = {
                    "service": name,
                    "url": url,
                    "status": status["status"],
                    "detail": status.get("response", status.get("error", "")),
                    "previous_status": old_status,
                }
                result = self.report_to_pm("service-status", data)
                results.append({"service": name, "status": status["status"], "result": result})
                self._last_status[name] = status["status"]

        return results

    def run_forever(self):
        """รันแบบ loop ไม่หยุด."""
        print(f"[SystemMonitor] เริ่มติดตาม services")
        print(f"[SystemMonitor] รายงานไปที่ {self.pm_url}")
        while True:
            try:
                results = self.run_once()
                for r in results:
                    print(f"[SystemMonitor] {r['service']}: {r['status']}")
            except Exception as e:
                print(f"[SystemMonitor] Error: {e}")
            time.sleep(self._interval)

    def close(self):
        self._client.close()


# ─── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Project Manager Service")
    parser.add_argument("--http", action="store_true", help="Run in HTTP mode")
    parser.add_argument("--port", type=int, default=PM_PORT, help="HTTP port")
    parser.add_argument("--sub-agent", choices=["monitor-chat", "system-monitor"],
                        help="รันเป็น Sub Agent แทน Project Manager")
    parser.add_argument("--pm-url", default=f"http://localhost:{PM_PORT}",
                        help="Project Manager URL (สำหรับ sub agent mode)")
    args = parser.parse_args()

    global _store, _gateway, _openhands, _checker

    # ─── Sub Agent Mode ──────────────────────────────────────────────
    if args.sub_agent == "monitor-chat":
        agent = MonitorChatAgent(args.pm_url, OPENHANDS_URL)
        try:
            agent.run_forever()
        except KeyboardInterrupt:
            print("\n[MonitorChat] หยุดทำงาน")
        finally:
            agent.close()
        return

    if args.sub_agent == "system-monitor":
        agent = SystemMonitorAgent(args.pm_url)
        try:
            agent.run_forever()
        except KeyboardInterrupt:
            print("\n[SystemMonitor] หยุดทำงาน")
        finally:
            agent.close()
        return

    # ─── Project Manager Mode ────────────────────────────────────────
    _store = ReportStore()
    _gateway = GatewayClient(GATEWAY_URL)
    _openhands = OpenHandsClient(OPENHANDS_URL)
    _checker = CrossCheckEngine()

    print(f"[ProjectManager] เริ่มทำงานที่ port {args.port}")
    print(f"[ProjectManager] Gateway: {GATEWAY_URL}")
    print(f"[ProjectManager] OpenHands: {OPENHANDS_URL}")
    print(f"[ProjectManager] Task Manager: {TASK_MANAGER_URL}")

    if args.http:
        import uvicorn
        app = create_rest_app(_store, _gateway, _openhands, _checker)
        print(f"[ProjectManager] REST API: http://0.0.0.0:{args.port}")
        uvicorn.run(app, host="0.0.0.0", port=args.port)
    else:
        # stdio mode
        print("[ProjectManager] Running in stdio mode", file=sys.stderr)
        mcp.run()


if __name__ == "__main__":
    main()
