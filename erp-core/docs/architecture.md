# ERP Core Architecture

## Overview

ERP Core is a multi-tenant ERP system with marketplace connectors and a knowledge base.
It's designed as a monorepo with pluggable modules.

```
┌─────────────────────────────────────────────────────┐
│                    Web Dashboard                     │
│                   (React + Vite)                     │
├─────────────────────────────────────────────────────┤
│                  API Gateway / MCP                   │
│              (Express + MCP Protocol)                │
├──────────┬──────────┬──────────┬────────────────────┤
│ Products │  Orders  │   CRM    │   Knowledge Base   │
│  Sales   │Inventory │ Finance  │   (Obsidian Alt)   │
│ Production│Reports  │ Billing  │                    │
├──────────┴──────────┴──────────┴────────────────────┤
│              Multi-tenant + Auth                     │
│           (JWT + bcrypt + RBAC)                      │
├─────────────────────────────────────────────────────┤
│              SQLite Database (WAL)                   │
│         (One file per deployment)                    │
├─────────────────────────────────────────────────────┤
│           Connectors (Etsy, more TBD)                │
│              (OAuth 2.0 + PKCE)                      │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Multi-tenant
- All tables have `tenant_id` column
- Queries are scoped by tenant
- Each tenant has its own subscription plan

### MCP Protocol
- All business logic exposed as MCP tools
- AI agents can interact via stdio or HTTP
- Tools are grouped by domain

### Knowledge Base
- Markdown-based document storage
- Wiki links (`[[title]]`) create document relationships
- Full-text search
- Graph visualization of document connections

## Modules

1. **Products** - Product catalog, variants, inventory
2. **Sales/Orders** - Order management, fulfillment
3. **CRM** - Customer management
4. **Inventory** - Stock tracking, warehouse
5. **Finance** - Invoicing, payments
6. **Reports** - Sales analytics, dashboards
7. **Production** - Manufacturing, BOM
8. **Knowledge Base** - Documentation, wiki
9. **Billing** - Subscriptions, plans, usage limits
10. **Connectors** - Etsy, more marketplace integrations

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **Database**: SQLite with better-sqlite3 (WAL mode)
- **API Protocol**: MCP (Model Context Protocol) + REST
- **Auth**: JWT + bcrypt
- **Frontend**: React 18 + Vite + Recharts
- **Infrastructure**: Docker + Caddy
