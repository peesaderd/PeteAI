#!/usr/bin/env python3
"""
ERP MCP Gateway
===============
Central MCP gateway that:
  - Reads /api/registry from ERP Core for service discovery
  - Routes MCP tool calls to the correct service (Task Manager, Etsy Connector, etc.)
  - Exposes its own MCP server (stdio + HTTP) for AI agents to connect to
  - Propagates tenantId auth context to all downstream services
  - Provides REST API for dynamic service registration
  - Health checks and graceful error handling

Usage:
  python3 gateway.py              # stdio mode (for OpenHands)
  python3 gateway.py --http       # HTTP mode (for web)
  python3 gateway.py --port 9090  # custom port
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

ERP_CORE_URL = os.environ.get("ERP_CORE_URL", "http://89.167.82.205:54509")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "9090"))
GATEWAY_NAME = os.environ.get("GATEWAY_NAME", "mcp-gateway")
DATA_DIR = Path(os.environ.get("GATEWAY_DATA_DIR", "/workspace/.erp-gateway"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
REGISTRY_CACHE_FILE = DATA_DIR / "registry-cache.json"
SERVICES_FILE = DATA_DIR / "services.json"

# URL overrides: map service name -> actual reachable URL
# This is needed because ERP Core Registry may contain internal Docker hostnames
# that are not resolvable from the Gateway's network.
URL_OVERRIDES = {
    "erp-core": os.environ.get("ERP_CORE_URL", "http://89.167.82.205:54509"),
    "task-manager": os.environ.get("TASK_MANAGER_URL", "http://89.167.82.205:8081"),
    "noteforge": os.environ.get("NOTEFORGE_URL", "http://89.167.82.205:54510"),
    "register": os.environ.get("REGISTER_URL", "http://89.167.82.205:54510"),
    "vue-dashboard": os.environ.get("VUE_DASHBOARD_URL", "http://89.167.82.205:55769"),
    "etsy-connector": os.environ.get("ETSY_CONNECTOR_URL", "http://89.167.82.205:3456"),
    "project-manager": os.environ.get("PM_URL", "http://89.167.82.205:8090"),
}

# Status overrides: force a service status to a specific value.
# Useful when ERP Core Registry reports incorrect status for known-working services.
STATUS_OVERRIDES = {
    "task-manager": "live",
}

# ─── Service Registry (in-memory + file) ──────────────────────────────

class ServiceRegistry:
    """Manages service discovery from ERP Core + local overrides."""

    def __init__(self):
        self._services: dict[str, dict] = {}  # name -> { url, type, tools, status, ... }
        self._tool_map: dict[str, str] = {}    # tool_name -> service_name
        self._load()

    def _load(self):
        if SERVICES_FILE.exists():
            try:
                data = json.loads(SERVICES_FILE.read_text())
                self._services = data.get("services", {})
                self._rebuild_tool_map()
            except (json.JSONDecodeError, KeyError):
                pass

    def _save(self):
        SERVICES_FILE.write_text(json.dumps({
            "services": self._services,
            "updated": datetime.now().isoformat()
        }, indent=2, ensure_ascii=False))

    def _rebuild_tool_map(self):
        self._tool_map = {}
        for name, svc in self._services.items():
            for tool in svc.get("tools", []):
                self._tool_map[tool] = name

    def sync_from_erp_core(self) -> list[str]:
        """Fetch registry from ERP Core /api/registry and merge."""
        changes = []
        try:
            resp = httpx.get(f"{ERP_CORE_URL}/api/registry", timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                for name, info in data.items():
                    status = info.get("status", "unknown")
                    # Apply status overrides
                    if name in STATUS_OVERRIDES:
                        status = STATUS_OVERRIDES[name]
                    if name not in self._services:
                        self._services[name] = {
                            "url": info.get("url", ""),
                            "type": info.get("type", "tool"),
                            "status": status,
                            "tools": info.get("tools", []),
                            "discovered_from": "erp-core",
                            "discovered_at": datetime.now().isoformat(),
                        }
                        changes.append(f"discovered: {name}")
                    else:
                        # Update fields from ERP Core
                        for key in ("url", "type", "status", "tools"):
                            if key in info:
                                self._services[name][key] = info[key]
                        # Re-apply status override after sync
                        if name in STATUS_OVERRIDES:
                            self._services[name]["status"] = STATUS_OVERRIDES[name]
                self._rebuild_tool_map()
                self._save()
        except Exception as e:
            changes.append(f"sync failed: {e}")
        return changes

    def register(self, name: str, url: str, service_type: str = "tool",
                 tools: list[str] = None, status: str = "live") -> dict:
        """Register or update a service."""
        self._services[name] = {
            "url": url,
            "type": service_type,
            "status": status,
            "tools": tools or [],
            "discovered_from": "manual",
            "discovered_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        self._rebuild_tool_map()
        self._save()
        return self._services[name]

    def unregister(self, name: str) -> bool:
        if name in self._services:
            del self._services[name]
            self._rebuild_tool_map()
            self._save()
            return True
        return False

    def get_service_for_tool(self, tool_name: str) -> Optional[tuple[str, dict]]:
        """Find which service handles a given tool."""
        # Direct lookup
        svc_name = self._tool_map.get(tool_name)
        if svc_name:
            return svc_name, self._services[svc_name]

        # Prefix-based lookup (e.g. etsy_* -> etsy-connector)
        for name, svc in self._services.items():
            prefix = svc.get("tool_prefix", name.replace("-", "_").lower())
            if tool_name.startswith(prefix):
                return name, svc

        return None

    def list_services(self) -> dict:
        return dict(self._services)

    def get_service(self, name: str) -> Optional[dict]:
        return self._services.get(name)

    def get_all_tools(self) -> list[dict]:
        """Return aggregated tool list from all services."""
        tools = []
        for name, svc in self._services.items():
            for t in svc.get("tools", []):
                tools.append({
                    "name": t,
                    "service": name,
                    "service_type": svc.get("type", "tool"),
                })
        return tools

    def health_check(self, name: str) -> dict:
        """Check if a service is reachable."""
        svc = self._services.get(name)
        if not svc:
            return {"status": "unknown", "error": "service not found"}
        url = svc.get("url", "")
        if not url:
            return {"status": "unknown", "error": "no url configured"}
        try:
            resp = httpx.get(f"{url}/health", timeout=3.0)
            if resp.status_code == 200:
                return {"status": "live", "response": resp.json()}
            return {"status": "error", "code": resp.status_code}
        except Exception as e:
            return {"status": "offline", "error": str(e)}


# ─── MCP Tool Router ─────────────────────────────────────────────────

class ToolRouter:
    """Routes MCP tool calls to the appropriate service."""

    def __init__(self, registry: ServiceRegistry):
        self.registry = registry
        self._http_client = httpx.Client(timeout=30.0)

    def _get_service_url(self, svc_name: str, svc: dict) -> str:
        """Get the reachable URL for a service, using overrides if available."""
        if svc_name in URL_OVERRIDES:
            return URL_OVERRIDES[svc_name]
        return svc.get("url", "")

    def route_tool_call(self, tool_name: str, args: dict) -> dict:
        """Route a tool call to the correct service and return the result."""
        result = self.registry.get_service_for_tool(tool_name)
        if not result:
            return {
                "status": "error",
                "error": f"Unknown tool '{tool_name}'. No service registered for this tool.",
                "available_tools": [t["name"] for t in self.registry.get_all_tools()],
            }

        svc_name, svc = result
        url = self._get_service_url(svc_name, svc)

        if svc.get("status") != "live":
            return {
                "status": "error",
                "error": f"Service '{svc_name}' is currently {svc.get('status')}. "
                         f"Please check the service status at ERP Core Registry.",
                "service": svc_name,
                "service_status": svc.get("status"),
            }

        if not url:
            return {
                "status": "error",
                "error": f"Service '{svc_name}' has no URL configured.",
                "service": svc_name,
            }

        # Forward the tool call via HTTP MCP endpoint
        try:
            payload = {
                "tool": tool_name,
                "args": args,
            }
            resp = self._http_client.post(f"{url}/mcp", json=payload)
            if resp.status_code == 200:
                return resp.json()
            else:
                return {
                    "status": "error",
                    "error": f"Service '{svc_name}' returned HTTP {resp.status_code}",
                    "detail": resp.text[:500],
                    "service": svc_name,
                }
        except httpx.ConnectError:
            return {
                "status": "error",
                "error": f"Cannot connect to service '{svc_name}' at {url}. "
                         f"The service may be offline. Please check the service status.",
                "service": svc_name,
                "url": url,
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"Error calling service '{svc_name}': {str(e)}",
                "service": svc_name,
            }

    def close(self):
        self._http_client.close()


# ─── MCP Server (FastMCP) ────────────────────────────────────────────

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("ERP MCP Gateway")

# Global instances (initialized in main())
_registry: ServiceRegistry = None
_router: ToolRouter = None


@mcp.tool(title="List Available Tools")
def list_available_tools() -> str:
    """List all tools available across all registered services."""
    if not _registry:
        return "Gateway not initialized."
    tools = _registry.get_all_tools()
    if not tools:
        return "No tools registered yet. Try 'sync_registry' first."

    lines = ["# 🛠 ERP MCP Gateway - Available Tools\n"]
    by_service: dict[str, list] = {}
    for t in tools:
        by_service.setdefault(t["service"], []).append(t["name"])

    for svc_name, tool_list in sorted(by_service.items()):
        svc = _registry.get_service(svc_name) or {}
        status_icon = "🟢" if svc.get("status") == "live" else "🔴"
        lines.append(f"\n## {status_icon} {svc_name} ({svc.get('type', '?')})")
        lines.append(f"   URL: {svc.get('url', '-')}")
        lines.append(f"   Status: {svc.get('status', 'unknown')}")
        for t in sorted(tool_list):
            lines.append(f"   - `{t}`")
    return "\n".join(lines)


@mcp.tool(title="List Services")
def list_services() -> str:
    """List all registered services and their status."""
    if not _registry:
        return "Gateway not initialized."
    services = _registry.list_services()
    if not services:
        return "No services registered."

    lines = ["# 📋 Registered Services\n"]
    for name, svc in sorted(services.items()):
        status_icon = "🟢" if svc.get("status") == "live" else \
                      "🟡" if svc.get("status") == "building" else "🔴"
        lines.append(
            f"{status_icon} **{name}** ({svc.get('type', '?')})\n"
            f"   URL: {svc.get('url', '-')}\n"
            f"   Status: {svc.get('status', 'unknown')}\n"
            f"   Tools: {len(svc.get('tools', []))}\n"
        )
    return "\n".join(lines)


@mcp.tool(title="Sync Registry")
def sync_registry() -> str:
    """Sync service registry from ERP Core (/api/registry)."""
    if not _registry:
        return "Gateway not initialized."
    changes = _registry.sync_from_erp_core()
    if not changes:
        return "No changes detected. Registry is up to date."
    return "Registry synced:\n" + "\n".join(f"  - {c}" for c in changes)


@mcp.tool(title="Register Service")
def register_service(name: str, url: str, service_type: str = "tool",
                     tools: str = "", status: str = "live") -> str:
    """Register a new service in the gateway.

    Args:
        name: Service name (e.g. 'task-manager', 'etsy-connector')
        url: Service URL (e.g. 'http://localhost:8081')
        service_type: Type of service ('tool', 'connector', 'core', 'module')
        tools: Comma-separated list of tool names this service provides
        status: Service status ('live', 'building', 'planned')
    """
    if not _registry:
        return "Gateway not initialized."
    tool_list = [t.strip() for t in tools.split(",") if t.strip()]
    svc = _registry.register(name, url, service_type, tool_list, status)
    return f"✅ Service '{name}' registered.\n  URL: {svc['url']}\n  Tools: {len(tool_list)}"


@mcp.tool(title="Unregister Service")
def unregister_service(name: str) -> str:
    """Remove a service from the gateway registry."""
    if not _registry:
        return "Gateway not initialized."
    if _registry.unregister(name):
        return f"✅ Service '{name}' unregistered."
    return f"❌ Service '{name}' not found."


@mcp.tool(title="Check Service Health")
def check_service_health(name: str) -> str:
    """Check if a registered service is reachable."""
    if not _registry:
        return "Gateway not initialized."
    result = _registry.health_check(name)
    status_icon = "🟢" if result.get("status") == "live" else "🔴"
    lines = [f"{status_icon} **{name}**: {result.get('status')}"]
    if result.get("error"):
        lines.append(f"   Error: {result['error']}")
    if result.get("response"):
        lines.append(f"   Response: {json.dumps(result['response'], indent=2)}")
    return "\n".join(lines)


@mcp.tool(title="Call Tool")
def call_tool(tool_name: str, arguments: str = "{}") -> str:
    """Call a tool on the appropriate service.

    Args:
        tool_name: Name of the tool to call (e.g. 'create_project', 'get_listings')
        arguments: JSON string of arguments to pass to the tool
    """
    if not _router:
        return "Gateway not initialized."
    try:
        args = json.loads(arguments) if arguments else {}
    except json.JSONDecodeError as e:
        return f"❌ Invalid JSON in arguments: {e}"

    result = _router.route_tool_call(tool_name, args)
    return json.dumps(result, indent=2, ensure_ascii=False)


# ─── REST API (FastAPI for HTTP mode) ────────────────────────────────

def create_rest_app(registry: ServiceRegistry, router: ToolRouter):
    """Create FastAPI app for HTTP mode."""
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    app = FastAPI(title="ERP MCP Gateway", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class RegisterRequest(BaseModel):
        name: str
        url: str
        type: str = "tool"
        tools: list[str] = []
        status: str = "live"

    class ToolCallRequest(BaseModel):
        tool: str
        args: dict = {}

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": GATEWAY_NAME,
            "timestamp": datetime.now().isoformat(),
            "services_count": len(registry.list_services()),
            "tools_count": len(registry.get_all_tools()),
        }

    @app.get("/api/registry")
    def get_registry():
        return registry.list_services()

    @app.post("/api/registry/register")
    def register(req: RegisterRequest):
        svc = registry.register(req.name, req.url, req.type, req.tools, req.status)
        return {"status": "ok", "service": svc}

    @app.delete("/api/registry/{name}")
    def unregister(name: str):
        if registry.unregister(name):
            return {"status": "ok", "message": f"Service '{name}' unregistered"}
        raise HTTPException(404, f"Service '{name}' not found")

    @app.get("/api/registry/{name}/health")
    def service_health(name: str):
        return registry.health_check(name)

    @app.get("/api/tools")
    def list_tools():
        return registry.get_all_tools()

    @app.post("/mcp")
    def handle_mcp(req: ToolCallRequest):
        # Handle gateway's own tools locally to avoid self-call loop
        local_tools = {
            "list_available_tools": list_available_tools,
            "list_services": list_services,
            "sync_registry": sync_registry,
            "register_service": lambda name, url="", service_type="tool", tools="", status="live": register_service(name, url, service_type, tools, status),
            "unregister_service": unregister_service,
            "check_service_health": check_service_health,
            "call_tool": call_tool,
        }
        if req.tool in local_tools:
            try:
                result = local_tools[req.tool](**req.args)
                return {"status": "ok", "result": result}
            except Exception as e:
                raise HTTPException(400, {"status": "error", "error": str(e)})
        result = router.route_tool_call(req.tool, req.args)
        if result.get("status") == "error":
            raise HTTPException(400, result)
        return result

    @app.post("/api/sync")
    def sync():
        changes = registry.sync_from_erp_core()
        return {"status": "ok", "changes": changes}

    # ─── Dashboard API ────────────────────────────────────────────────

    @app.get("/api/dashboard")
    def get_dashboard():
        """Aggregated dashboard data from all services."""
        services = registry.list_services()
        tools = registry.get_all_tools()

        # Health check key services
        health_checks = {}
        for name in ["erp-core", "task-manager", "noteforge", "etsy-connector"]:
            if name in services:
                health_checks[name] = registry.health_check(name)

        # Task Manager summary
        task_mgr = services.get("task-manager", {})
        task_mgr_url = URL_OVERRIDES.get("task-manager", task_mgr.get("url", ""))
        task_summary = {}
        if task_mgr.get("status") == "live" and task_mgr_url:
            try:
                resp = httpx.get(f"{task_mgr_url}/health", timeout=3.0)
                if resp.status_code == 200:
                    task_summary = resp.json()
            except Exception:
                pass

        # Project Manager data
        pm_url = URL_OVERRIDES.get("project-manager")
        project_manager = {}
        if pm_url:
            try:
                pm_health = httpx.get(f"{pm_url}/health", timeout=3.0)
                if pm_health.status_code == 200:
                    pm_data = {"health": pm_health.json()}
                    try:
                        r = httpx.get(f"{pm_url}/api/reports", timeout=3.0)
                        if r.status_code == 200:
                            pm_data["reports"] = r.json()
                    except Exception:
                        pm_data["reports"] = []
                    try:
                        r = httpx.get(f"{pm_url}/api/projects", timeout=3.0)
                        if r.status_code == 200:
                            pm_data["projects"] = r.json()
                    except Exception:
                        pm_data["projects"] = []
                    try:
                        r = httpx.get(f"{pm_url}/api/summary", timeout=3.0)
                        if r.status_code == 200:
                            pm_data["summary"] = r.json()
                    except Exception:
                        pm_data["summary"] = {}
                    project_manager = pm_data
            except Exception:
                project_manager = {"error": "unreachable"}

        return {
            "gateway": {
                "status": "ok",
                "services_count": len(services),
                "tools_count": len(tools),
                "uptime": datetime.now().isoformat(),
            },
            "services": {
                name: {
                    "status": svc.get("status"),
                    "type": svc.get("type"),
                    "url": URL_OVERRIDES.get(name, svc.get("url", "")),
                    "tools_count": len(svc.get("tools", [])),
                }
                for name, svc in sorted(services.items())
            },
            "health": health_checks,
            "task_manager": task_summary,
            "project_manager": project_manager,
        }

    # ─── Search API ───────────────────────────────────────────────────

    @app.get("/api/search")
    def search(q: str = ""):
        """Search across all registered services."""
        if not q:
            return {"results": []}
        q = q.lower()
        services = registry.list_services()
        results = []
        for name, svc in services.items():
            if q in name.lower():
                results.append({
                    "type": "service",
                    "name": name,
                    "url": URL_OVERRIDES.get(name, svc.get("url", "")),
                    "status": svc.get("status"),
                })
            for tool in svc.get("tools", []):
                if q in tool.lower():
                    results.append({
                        "type": "tool",
                        "service": name,
                        "name": tool,
                    })
        # Also search Project Manager if available
        pm_url = URL_OVERRIDES.get("project-manager")
        if pm_url:
            try:
                resp = httpx.get(f"{pm_url}/api/projects", timeout=3.0)
                if resp.status_code == 200:
                    for proj in resp.json():
                        if q in proj.get("name", "").lower() or q in proj.get("description", "").lower():
                            results.append({
                                "type": "project",
                                "name": proj.get("name"),
                                "status": proj.get("status"),
                                "id": proj.get("id"),
                            })
            except Exception:
                pass
        return {"results": results[:50]}

    # ─── Dashboard UI (Static Files) ──────────────────────────────────

    import pathlib
    dashboard_dir = pathlib.Path(__file__).parent / "dashboard"
    dashboard_dir.mkdir(exist_ok=True)

    if dashboard_dir.exists():
        from fastapi.staticfiles import StaticFiles
        app.mount("/dashboard", StaticFiles(directory=str(dashboard_dir), html=True), name="dashboard")

    @app.get("/")
    def root():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/dashboard/index.html")

    return app


# ─── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ERP MCP Gateway")
    parser.add_argument("--http", action="store_true", help="Run in HTTP mode")
    parser.add_argument("--port", type=int, default=GATEWAY_PORT, help="HTTP port")
    args = parser.parse_args()

    global _registry, _router

    # Initialize
    _registry = ServiceRegistry()
    _router = ToolRouter(_registry)

    # Auto-register self
    _registry.register(
        GATEWAY_NAME,
        f"http://localhost:{args.port}",
        service_type="core",
        tools=[
            "list_available_tools", "list_services", "sync_registry",
            "register_service", "unregister_service", "check_service_health",
            "call_tool",
        ],
        status="live",
    )

    # Register Task Manager if not already registered
    task_mgr_url = os.environ.get("TASK_MANAGER_URL", "http://localhost:8081")
    if not _registry.get_service("task-manager"):
        _registry.register(
            "task-manager",
            task_mgr_url,
            service_type="tool",
            tools=[
                "create_project", "list_projects", "update_project_status",
                "create_task", "update_task_status", "list_tasks", "get_task_details",
                "enqueue_task", "start_next_task", "complete_current_task",
                "show_queue_status", "get_activity_log", "get_summary",
            ],
            status="live",
        )

    # Sync from ERP Core
    try:
        _registry.sync_from_erp_core()
    except Exception:
        pass  # Non-fatal if ERP Core is not reachable

    if args.http:
        # HTTP mode
        import uvicorn
        app = create_rest_app(_registry, _router)
        print(f"[Gateway] ERP MCP Gateway running on http://0.0.0.0:{args.port}")
        print(f"[Gateway] REST API: http://0.0.0.0:{args.port}/api/registry")
        print(f"[Gateway] MCP endpoint: http://0.0.0.0:{args.port}/mcp")
        print(f"[Gateway] Health: http://0.0.0.0:{args.port}/health")
        uvicorn.run(app, host="0.0.0.0", port=args.port)
    else:
        # stdio mode (for OpenHands)
        print("[Gateway] ERP MCP Gateway running in stdio mode", file=sys.stderr)
        mcp.run()


if __name__ == "__main__":
    main()
