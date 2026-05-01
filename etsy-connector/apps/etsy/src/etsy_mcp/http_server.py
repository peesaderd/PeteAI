"""HTTP/SSE transport server for etsy-mcp.

Runs the FastMCP server over SSE (Server-Sent Events) transport
instead of stdio, so it can be deployed as a web service behind
Docker and discovered by the ERP MCP Gateway.

Usage:
    python -m etsy_mcp.http_server [--port 3456] [--host 0.0.0.0]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    level = os.environ.get("ETSY_LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )


def create_app(server=None) -> Starlette:
    """Create the Starlette ASGI app wrapping the etsy-mcp FastMCP server.

    Args:
        server: Optional pre-configured FastMCP server. If None, loads
                the default server via runtime.get_server().

    Returns:
        A Starlette ASGI app with SSE transport for MCP.
    """
    from etsy_mcp.bootstrap import load_config
    from etsy_mcp.main import _install_permissioned_tool, _register_tools
    from etsy_mcp.runtime import get_server
    from mcp.server.sse import SseServerTransport

    # Load config first
    load_config()

    # Get or create the FastMCP server
    if server is None:
        server = get_server()
        _install_permissioned_tool(server)
        _register_tools()

    # Create SSE transport
    sse = SseServerTransport("/mcp/messages/")

    async def handle_sse(request: Request) -> None:
        """SSE endpoint: the client connects here to receive events."""
        async with sse.connect_sse(
            request.scope,
            request.receive,
            request._send,
        ) as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    async def handle_mcp_messages(request: Request) -> None:
        """Message endpoint: the client sends JSON-RPC messages here."""
        await sse.handle_post_message(request.scope, request.receive, request._send)

    async def handle_health(request: Request) -> JSONResponse:
        """Health check endpoint."""
        return JSONResponse({
            "status": "ok",
            "service": "etsy-connector",
            "version": "0.1.0",
        })

    async def handle_list_tools(request: Request) -> JSONResponse:
        """List all available tools (for debugging / registry)."""
        tools = []
        for t in server._tool_manager._tools.values():
            tools.append({
                "name": t.name,
                "description": t.description,
                "inputSchema": t.inputSchema,
            })
        return JSONResponse({"tools": tools, "count": len(tools)})

    # Build the app
    app = Starlette(
        routes=[
            Route("/health", handle_health),
            Route("/tools", handle_list_tools),
            Route("/mcp/sse", handle_sse),
            Route("/mcp/messages/{path:path}", handle_mcp_messages, methods=["POST"]),
        ],
        middleware=[
            Middleware(
                CORSMiddleware,
                allow_origins=["*"],
                allow_methods=["*"],
                allow_headers=["*"],
            ),
        ],
    )

    return app


def register_with_erp(registry_url: str, service_name: str, service_url: str) -> bool:
    """Register this service with the ERP Core Registry.

    Args:
        registry_url: Base URL of ERP Core (e.g. http://erp-core:54509)
        service_name: Name to register as (e.g. etsy-connector)
        service_url: URL this service is reachable at (e.g. http://etsy-connector:3456)

    Returns:
        True if registration succeeded.
    """
    import httpx

    payload = {
        "name": service_name,
        "description": "Etsy MCP Connector — 104 tools for Etsy API integration (listings, receipts, payments, shipping, reviews, taxonomy, users, buyer)",
        "url": service_url,
        "status": "live",
        "type": "connector",
        "version": "0.1.0",
        "dependencies": ["erp-core"],
        "tools": [],
    }

    try:
        resp = httpx.post(
            f"{registry_url}/api/registry/{service_name}",
            json=payload,
            timeout=10.0,
        )
        if resp.is_success:
            logger.info("Registered with ERP Core at %s as '%s'", registry_url, service_name)
            return True
        else:
            logger.warning(
                "Failed to register with ERP Core: HTTP %d %s",
                resp.status_code,
                resp.text,
            )
            return False
    except Exception as exc:
        logger.warning("Could not reach ERP Core at %s: %s", registry_url, exc)
        return False


def main() -> None:
    """CLI entry point for the HTTP server."""
    _configure_logging()

    parser = argparse.ArgumentParser(description="etsy-connector HTTP/SSE server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address")
    parser.add_argument("--port", type=int, default=3456, help="Bind port")
    parser.add_argument("--erp-core-url", default=None, help="ERP Core URL for registry registration")
    parser.add_argument("--service-name", default="etsy-connector", help="Name to register in ERP Core")
    args = parser.parse_args()

    # Create the ASGI app
    app = create_app()

    # Register with ERP Core if configured
    erp_url = args.erp_core_url or os.environ.get("ERP_CORE_URL", "")
    if erp_url:
        service_url = os.environ.get("ETSY_CONNECTOR_URL", f"http://{args.host}:{args.port}")
        register_with_erp(erp_url, args.service_name, service_url)

    # Start the server
    logger.info("Starting etsy-connector HTTP server on %s:%s", args.host, args.port)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level=os.environ.get("ETSY_LOG_LEVEL", "INFO").lower(),
    )


if __name__ == "__main__":
    main()
