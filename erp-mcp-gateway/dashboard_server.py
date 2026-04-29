#!/usr/bin/env python3
"""
Dashboard Server - Standalone FastAPI server for ERP Gateway Dashboard.
Serves static files and provides aggregated API endpoints.
"""
import json
import os
from datetime import datetime
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

PORT = int(os.environ.get("DASHBOARD_PORT", "57191"))
GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://89.167.82.205:9090")
OPENHANDS_URL = os.environ.get("OPENHANDS_URL", "http://89.167.82.205:3000")
PM_URL = os.environ.get("PM_URL", "http://89.167.82.205:8090")

app = FastAPI(title="ERP Dashboard Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve dashboard static files
dashboard_dir = Path(__file__).parent / "dashboard"
dashboard_dir.mkdir(exist_ok=True)

# Mount static files at /dashboard
if dashboard_dir.exists():
    app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")


@app.get("/")
def root():
    return RedirectResponse(url="/dashboard/index.html")


@app.get("/health")
def health():
    return {"status": "ok", "service": "dashboard-server", "time": datetime.now().isoformat()}


# ─── MCP Tool Call via Gateway ──────────────────────────────────────────

class MCPCallRequest(BaseModel):
    tool: str
    args: dict = {}


@app.post("/api/mcp/call")
async def call_mcp_tool(req: MCPCallRequest):
    """Call an MCP tool through the Gateway."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                f"{GATEWAY_URL}/mcp",
                json={"tool": req.tool, "args": req.args},
            )
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
        except httpx.ConnectError:
            raise HTTPException(status_code=502, detail=f"Cannot connect to Gateway at {GATEWAY_URL}")


# ─── Aggregated Dashboard Data ──────────────────────────────────────────

@app.get("/api/dashboard")
async def get_dashboard():
    """Aggregated dashboard data from all sources."""
    results = {
        "gateway": {"status": "unknown"},
        "services": [],
        "tools": [],
        "projects": [],
        "activity": [],
        "conversations": [],
        "summary": {},
        "errors": [],
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1. Gateway Registry
        try:
            resp = await client.get(f"{GATEWAY_URL}/api/registry")
            if resp.status_code == 200:
                registry = resp.json()
                svcs = []
                for name, info in registry.items():
                    svcs.append({
                        "name": name,
                        "status": info.get("status", "unknown"),
                        "type": info.get("type", "tool"),
                        "url": info.get("url", ""),
                        "tools": info.get("tools", []),
                    })
                results["services"] = svcs
                results["gateway"] = {
                    "status": "ok",
                    "services_count": len(svcs),
                    "tools_count": sum(len(s.get("tools", [])) for s in svcs),
                }
        except Exception as e:
            results["errors"].append(f"Gateway registry: {e}")

        # 2. Gateway Tools
        try:
            resp = await client.get(f"{GATEWAY_URL}/api/tools")
            if resp.status_code == 200:
                results["tools"] = resp.json()
        except Exception as e:
            results["errors"].append(f"Gateway tools: {e}")

        # 3. Task Manager - Projects via MCP
        try:
            resp = await client.post(
                f"{GATEWAY_URL}/mcp",
                json={"tool": "list_projects", "args": {}},
            )
            if resp.status_code == 200:
                data = resp.json()
                results["projects"] = _parse_mcp_table(data.get("result", ""), "project")
        except Exception as e:
            results["errors"].append(f"Projects: {e}")

        # 4. Task Manager - Activity Log via MCP
        try:
            resp = await client.post(
                f"{GATEWAY_URL}/mcp",
                json={"tool": "get_activity_log", "args": {}},
            )
            if resp.status_code == 200:
                data = resp.json()
                results["activity"] = _parse_activity_log(data.get("result", ""))
        except Exception as e:
            results["errors"].append(f"Activity: {e}")

        # 5. Task Manager - Summary via MCP
        try:
            resp = await client.post(
                f"{GATEWAY_URL}/mcp",
                json={"tool": "get_summary", "args": {}},
            )
            if resp.status_code == 200:
                data = resp.json()
                results["summary"] = _parse_summary(data.get("result", ""))
        except Exception as e:
            results["errors"].append(f"Summary: {e}")

        # 6. OpenHands Conversations
        try:
            resp = await client.get(f"{OPENHANDS_URL}/api/conversations?limit=50")
            if resp.status_code == 200:
                data = resp.json()
                convs = data.get("results", data if isinstance(data, list) else [])
                results["conversations"] = [
                    {
                        "id": c.get("conversation_id", ""),
                        "title": c.get("title", "Untitled"),
                        "status": c.get("status", "unknown"),
                        "created_at": c.get("created_at", ""),
                        "last_updated": c.get("last_updated_at", ""),
                    }
                    for c in convs
                ]
        except Exception as e:
            results["errors"].append(f"Conversations: {e}")

        # 7. Project Manager data
        try:
            resp = await client.get(f"{PM_URL}/health")
            if resp.status_code == 200:
                pm_health = resp.json()
                # Get reports
                resp2 = await client.get(f"{PM_URL}/api/reports?limit=20")
                reports = []
                if resp2.status_code == 200:
                    reports = resp2.json().get("reports", [])
                # Get projects
                resp3 = await client.get(f"{PM_URL}/api/projects")
                projects = []
                if resp3.status_code == 200:
                    projects = resp3.json().get("projects", [])
                # Get summary
                resp4 = await client.get(f"{PM_URL}/api/summary")
                summary = {}
                if resp4.status_code == 200:
                    summary = resp4.json()

                results["project_manager"] = {
                    "status": pm_health.get("status", "ok"),
                    "summary": summary,
                    "reports": reports,
                    "projects": projects,
                    "monitor_chat_status": "running" if pm_health.get("status") == "ok" else "idle",
                    "system_monitor_status": "running" if pm_health.get("status") == "ok" else "idle",
                }
        except Exception as e:
            results["project_manager"] = {
                "status": "offline",
                "summary": {"total_reports": 0, "pending_reports": 0, "matched_reports": 0, "conflicted_reports": 0},
                "reports": [],
                "projects": [],
                "monitor_chat_status": "offline",
                "system_monitor_status": "offline",
            }
            results["errors"].append(f"Project Manager: {e}")

    return results


# ─── Search API ─────────────────────────────────────────────────────────

@app.get("/api/search")
async def search(q: str = Query("", min_length=1)):
    """Search across all data sources."""
    if not q:
        return {"results": []}

    results = {"query": q, "results": []}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Search conversations
        try:
            resp = await client.get(f"{OPENHANDS_URL}/api/conversations?limit=100")
            if resp.status_code == 200:
                data = resp.json()
                convs = data.get("results", data if isinstance(data, list) else [])
                for c in convs:
                    title = c.get("title", "")
                    cid = c.get("conversation_id", "")
                    if q.lower() in title.lower() or q.lower() in cid.lower():
                        results["results"].append({
                            "type": "conversation",
                            "title": title,
                            "id": cid,
                            "status": c.get("status", ""),
                            "created_at": c.get("created_at", ""),
                        })
        except Exception:
            pass

        # Search services
        try:
            resp = await client.get(f"{GATEWAY_URL}/api/registry")
            if resp.status_code == 200:
                registry = resp.json()
                for name, info in registry.items():
                    if q.lower() in name.lower():
                        results["results"].append({
                            "type": "service",
                            "title": name,
                            "subtitle": f"{info.get('type', 'tool')} · {info.get('status', 'unknown')}",
                            "status": info.get("status", ""),
                        })
        except Exception:
            pass

        # Search tools
        try:
            resp = await client.get(f"{GATEWAY_URL}/api/tools")
            if resp.status_code == 200:
                tools = resp.json()
                for t in tools:
                    tname = t.get("name", "")
                    if q.lower() in tname.lower():
                        results["results"].append({
                            "type": "tool",
                            "title": tname,
                            "subtitle": f"Service: {t.get('service', '?')}",
                        })
        except Exception:
            pass

    return results


# ─── Helper Parsers ─────────────────────────────────────────────────────

def _parse_mcp_table(text: str, item_type: str) -> list:
    """Parse markdown table output from MCP tools into structured data."""
    items = []
    if not text:
        return items

    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("|") or line.startswith("-") or line.startswith("#"):
            continue
        if "**" in line and ":" in line:
            parts = line.split(":", 1)
            name = parts[0].replace("*", "").strip()
            rest = parts[1].strip() if len(parts) > 1 else ""
            status = "active"
            if "(active)" in rest:
                status = "active"
            elif "(inactive)" in rest:
                status = "inactive"
            elif "(completed)" in rest:
                status = "completed"
            description = rest.replace("(active)", "").replace("(inactive)", "").replace("(completed)", "").strip()
            items.append({
                "name": name,
                "description": description,
                "status": status,
                "type": item_type,
            })
    return items


def _parse_activity_log(text: str) -> list:
    """Parse activity log markdown into structured data."""
    entries = []
    if not text:
        return entries

    for line in text.strip().split("\n"):
        line = line.strip()
        if line.startswith("[") and "]" in line:
            bracket_end = line.index("]")
            timestamp_str = line[1:bracket_end]
            message = line[bracket_end + 1:].strip()
            try:
                ts = datetime.fromisoformat(timestamp_str)
            except (ValueError, TypeError):
                ts = None
            entries.append({
                "timestamp": timestamp_str,
                "message": message,
                "datetime": ts.isoformat() if ts else timestamp_str,
            })
    return entries


def _parse_summary(text: str) -> dict:
    """Parse summary markdown into structured data."""
    summary = {
        "projects_count": 0,
        "tasks_count": 0,
        "pending": 0,
        "completed": 0,
    }
    if not text:
        return summary

    for line in text.strip().split("\n"):
        line = line.strip()
        if "Pending:" in line:
            try:
                summary["pending"] = int(line.split(":")[-1].strip())
            except (ValueError, IndexError):
                pass
        if "Completed:" in line:
            try:
                summary["completed"] = int(line.split(":")[-1].strip())
            except (ValueError, IndexError):
                pass

    return summary


if __name__ == "__main__":
    print(f"[Dashboard] Server running on http://0.0.0.0:{PORT}")
    print(f"[Dashboard] Dashboard: http://0.0.0.0:{PORT}/dashboard/index.html")
    print(f"[Dashboard] API: http://0.0.0.0:{PORT}/api/dashboard")
    print(f"[Dashboard] Search: http://0.0.0.0:{PORT}/api/search?q=...")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
