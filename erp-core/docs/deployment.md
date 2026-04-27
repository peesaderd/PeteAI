# Deployment Guide

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start ERP Core server
npm run dev -w packages/server

# Start Knowledge Base server (separate terminal)
npm run dev -w packages/knowledge-base

# Start Web Dashboard (separate terminal)
npm run dev -w packages/web
```

## Docker Deployment

```bash
cd packages/infra
docker-compose up -d
```

This starts:
- ERP Core on port 3000
- Knowledge Base on port 3100
- Caddy reverse proxy on ports 80/443

## Production Setup

### Environment Variables

**ERP Core Server:**
- `PORT` - Server port (default: 3000)
- `MODE` - `http`, `stdio`, or `both`
- `ERP_DB_PATH` - Database file path
- `JWT_SECRET` - JWT signing secret

**Knowledge Base:**
- `PORT` - Server port (default: 3100)
- `MODE` - `http`, `stdio`, or `both`
- `KB_DB_PATH` - Database file path
- `KB_DATA_DIR` - File storage directory

### Caddy (HTTPS)

Edit `packages/infra/Caddyfile` with your domain, then:
```bash
docker-compose up -d caddy
```

## AI Agent Integration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "erp-core": {
      "command": "node",
      "args": ["/path/to/erp-core/packages/server/dist/index.js"],
      "env": {
        "MODE": "stdio",
        "ERP_DB_PATH": "/path/to/data/erp-core.db",
        "JWT_SECRET": "your-secret"
      }
    },
    "knowledge-base": {
      "command": "node",
      "args": ["/path/to/erp-core/packages/knowledge-base/dist/index.js"],
      "env": {
        "MODE": "stdio",
        "KB_DB_PATH": "/path/to/data/knowledge-base.db"
      }
    },
    "etsy-connector": {
      "command": "node",
      "args": ["/path/to/erp-core/packages/connectors/etsy/dist/index.js"]
    }
  }
}
```

### Any MCP-compatible AI

Connect via HTTP:
```
POST http://your-server:3000/mcp
Content-Type: application/json

{
  "tool": "list_products",
  "args": { "tenantId": "demo", "limit": 10 }
}
```
