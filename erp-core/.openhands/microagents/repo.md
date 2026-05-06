# PeteAI — ERP Core + Etsy Connector Knowledge Base

## Project Overview

Monorepo ระบบ ERP + Marketplace Connectors + AI Agent Orchestrator
- **ERP Core** (`/workspace/erp-core`) — TypeScript monorepo (npm workspaces)
- **Etsy Connector** (`/workspace/etsy-connector`) — Python MCP server (uv workspace)

---

## 1. Project Structure

### ERP Core (`/workspace/erp-core`)

```
erp-core/
├── packages/
│   ├── server/              # ERP Core API + MCP Server (Express)
│   │   ├── src/api/         # REST API routes
│   │   ├── src/mcp/         # MCP protocol server
│   │   ├── src/db/          # SQLite database (better-sqlite3)
│   │   ├── src/auth/        # JWT + bcrypt + RBAC
│   │   └── src/...          # analytics, billing, channels, notifications, etc.
│   ├── web/                 # React Dashboard (Vite + Tailwind)
│   ├── knowledge-base/      # Knowledge Base API (Markdown docs, wiki links)
│   ├── ai-orchestrator/     # AI Agent Orchestrator (Express, port 54516)
│   │   ├── src/index.ts     # Express server entry point
│   │   ├── src/agent-loop.ts        # Agent Loop v1 (legacy)
│   │   ├── src/agent-loop-v2.ts     # Agent Loop v2 (current, task-based)
│   │   ├── src/llm.ts               # LLM Client v1 (legacy)
│   │   ├── src/llm-gateway.ts       # LLM Gateway (unified, DeepSeek default)
│   │   ├── src/task-queue.ts        # SQLite-based task queue
│   │   ├── src/tool-router.ts       # Tool routing (MCP + local tools)
│   │   ├── src/browser-use.ts       # Playwright browser automation
│   │   ├── src/browser-watchdog.ts  # Smart Sleep for browser
│   │   ├── src/vision-analysis.ts   # Vision Analysis (GPT-4V, Claude, Gemini 2.5 Flash)
│   │   ├── src/etsy-api-client.ts   # Etsy Open API v3 client (OAuth + PKCE)
│   │   ├── src/etsy-browser-workflow.ts  # Etsy browser-based listing
│   │   ├── src/etsy-api-client.test.ts   # Unit tests for Etsy API client
│   │   ├── src/etsy-browser-workflow.test.ts  # Unit tests for Etsy browser workflow
│   │   ├── src/etsy-sandbox-test.ts  # E2E sandbox test script
│   │   ├── src/visual-test.ts        # Visual test for Etsy product images
│   │   ├── src/memory.ts            # Agent state memory store
│   │   ├── src/chat-store.ts        # Chat session store
│   │   ├── src/scheduler.ts         # Job scheduler
│   │   ├── src/webhooks.ts          # Webhook handler
│   │   ├── src/workflow.ts          # Multi-agent workflow engine
│   │   ├── src/rate-limiter.ts      # Rate limiter
│   │   ├── src/redis-queue.ts       # Redis task queue (optional)
│   │   ├── src/revive-chat.ts       # OpenHands chat revive
│   │   ├── src/supervisor.ts        # Agent supervisor
│   │   └── src/persistence.ts       # State persistence
│   ├── connectors/etsy/     # Etsy connector package (placeholder)
│   ├── heartbeat/           # Heartbeat service
│   ├── infra/               # Docker Compose, Caddy config
│   ├── sync-siyuan/         # SiYuan note sync
│   ├── telegram-bot/        # Telegram bot
│   ├── system-agent/        # System agent
│   ├── task-manager/        # Task manager (MCP)
│   ├── agency-team/         # Agency team
│   └── ai-docs-updater/     # AI docs updater
├── docs/                    # Documentation
├── e2e/                     # E2E tests (Playwright)
├── visual-qa/               # Visual QA tests
├── monitoring/              # Prometheus + Grafana config
├── docker-compose.yml       # Main Docker Compose
├── vitest.workspace.ts      # Vitest workspace config
└── package.json             # Monorepo root
```

### Etsy Connector (`/workspace/etsy-connector`)

```
etsy-connector/
├── apps/etsy/               # Etsy MCP server (90 tools)
│   └── src/etsy_mcp/
│       ├── main.py          # FastMCP server bootstrap
│       ├── runtime.py       # Singleton factories
│       ├── bootstrap.py     # Config/auth/client wiring
│       ├── categories.py    # Tool category map
│       ├── schemas.py       # JSON schemas
│       ├── managers/        # Domain logic (listing, shop, image, etc.)
│       ├── tools/           # Tool wrappers (one file per category)
│       ├── models/          # Pydantic models
│       └── cli/             # Auth CLI
├── packages/
│   ├── etsy-core/           # Low-level Etsy API (no MCP dependency)
│   │   └── src/etsy_core/   # client, auth, pkce, retry, rate_limiter, redaction
│   └── etsy-mcp-shared/     # Shared MCP patterns
│       └── src/etsy_mcp_shared/  # config, permissions, confirmation, policy_gate
├── docs/                    # Architecture, OAuth, Error Handling, etc.
├── Makefile                 # sync, test, lint, format commands
├── AGENTS.md                # Project rules (Pure Primitive Rule)
└── pyproject.toml           # uv workspace root
```

---

## 2. Server Setup & Infrastructure

### Ports

| Service | Port | Description |
|---------|------|-------------|
| ERP Core API | 54510 | Express + MCP |
| AI Orchestrator | 54516 | Agent Loop + Chat API |
| Knowledge Base | 54512 | Markdown doc store |
| Web Dashboard (dev) | 3200 | Vite dev server |
| Redis | 6379 | Optional queue |
| Task Manager | 8081 | MCP-based task manager |

### Docker

```bash
cd /workspace/erp-core
docker compose up -d --build    # Build + run all
docker compose logs -f          # Follow logs
docker compose up -d erp-core   # Run single service
```

### Environment Variables

Key env vars (see `packages/ai-orchestrator/.env.example`):

```
# LLM (DeepSeek default)
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com/v1

# Vision
GEMINI_API_KEY=AIza...         # Gemini 2.5 Flash
# OPENAI_API_KEY=sk-...        # GPT-4V fallback
# ANTHROPIC_API_KEY=sk-ant-... # Claude fallback

# Orchestrator
ORCHESTRATOR_PORT=54516
ERP_TENANT_ID=8347c7ab-e4e0-4cc9-ac8d-2683718602b3

# Etsy
ETSY_CLIENT_ID=
ETSY_CLIENT_SECRET=
ETSY_REDIRECT_URI=
ETSY_EMAIL=                    # For browser login
ETSY_PASSWORD=                 # For browser login
ETSY_API_KEY=                  # Etsy API key
ETSY_API_SECRET=               # Etsy shared secret
ETSY_SHOP_ID=                  # Shop ID
```

### API Keys Available

- **DeepSeek**: `sk-b5d010076fc14d19b3e89d12e470e3de`
- **Gemini**: `AIzaSyBKaKB3xhxaxdQWDe_kfNxNEDeAZP485sg`
- **GitHub**: ใช้ GITHUB_TOKEN env var

---

## 3. Business Logic & Workflows

### AI Agent Loop v2

The core autonomous agent system. Architecture:

```
User Input → Task Queue (SQLite) → Agent Loop v2 → LLM Gateway → Tool Router
                                                      ↓
                                              BrowserUse / Etsy API / etc.
```

**Key classes:**
- `AgentLoopV2` — Task-based autonomous agent with start/stop/pause/resume
- `LLMGateway` — Unified LLM (DeepSeek default, OpenAI-compatible)
- `TaskQueue` — SQLite-backed persistent queue
- `ToolRouter` — Routes tool calls to MCP or local tools
- `BrowserUse` — Playwright browser automation with Smart Sleep

**Agent Loop v2 features:**

### Agent Loop v2 — State Machine

```
IDLE ----> PROCESSING ----> WAITING_TOOL ----> PROCESSING ----> COMPLETED
  ^            |                                              |
  |            v                                              |
  +--------- TIMEOUT/FAILED <---------------------------------+
```

| State | คำอธิบาย |
|-------|---------|
| IDLE | รอ task ถัดไป |
| PROCESSING | กำลังประมวลผล (LLM call) |
| WAITING_TOOL | รอ tool call result |
| COMPLETED | task สำเร็จ |
| FAILED | task ล้มเหลว (retry 3 ครั้งแล้ว) |

**Task lifecycle:**
1. Task ถูกเพิ่มเข้า queue (priority 1-5)
2. Agent Loop v2 ดึง task ที่มี priority สูงสุด
3. ส่ง prompt ไปยัง LLM Gateway
4. ถ้า LLM เรียก tool -> WAITING_TOOL -> รอ result -> ส่งกลับ LLM
5. ถ้า task สำเร็จ -> COMPLETED, ถ้า error -> retry (max 3)
6. Event callbacks: onStart, onComplete, onFailed, onStatusChange

### Agent Loop v2 — Critical Implementation Details

1. **Event-driven**: ไม่มี setInterval polling — ใช้ event emitter ตลอด lifecycle
2. **SQLite queue**: Persistent task queue — ไม่เสีย task เมื่อ container restart
3. **Singleton browser**: BrowserUse เป็น singleton — อย่าสร้าง instance ใหม่
4. **Smart Sleep**: Browser watchdog จะ sleep browser หลังจาก idle 3 นาที — ต้อง wake ก่อนใช้งาน
5. **Error handling**: ทุก tool call มี try/catch — error จะถูกส่งกลับไปให้ LLM จัดการ


- Task queue with priority (1-5)
- Automatic retry with exponential backoff (max 3 retries)
- Task timeout (5 min default)
- Event callbacks (onTaskStart, onTaskComplete, onTaskFailed, onStatusChange)
- Rate limiting
- Vision analysis integration
- Etsy browser workflow integration

### Etsy Integration

Two approaches:

1. **EtsyApiClient** (`etsy-api-client.ts`) — Direct Etsy Open API v3
   - OAuth 2.0 + PKCE flow
   - CRUD for listings, images, shops
   - Token refresh with rotation
   - Rate limiting

2. **EtsyBrowserWorkflow** (`etsy-browser-workflow.ts`) — Browser-based
   - Login Etsy via Playwright
   - Create listings via browser UI
   - Upload images
   - Publish listings
   - Retry + fallback when UI changes

### Vision Analysis

`VisionAnalysis` class supports:
- **GPT-4V** (OpenAI) — `gpt-4o` model
- **Claude 3.5 Sonnet** (Anthropic) — `claude-3-5-sonnet-20241022`
- **Gemini 2.5 Flash** (Google) — `gemini-2.5-flash` ✅ ใช้งานได้
- **Ollama** (local) — `llava` model (fallback)

Returns structured analysis: composition, color, lighting, style, suggestions.

### Etsy Visual Test

`visual-test.ts` — สร้างรูปตัวอย่าง → วิเคราะห์ด้วย Gemini → ตรวจสอบ Etsy compliance
- 5 requirements: background, subject_clear, lighting, framing, color_vibrant
- สร้างรูป good/bad ด้วย Python Pillow

---

## 4. Common Commands

### ERP Core (TypeScript)

```bash
cd /workspace/erp-core

# Install dependencies
npm install

# Run tests
npm test                          # All vitest tests
npx vitest run                    # Same as above
npx vitest run packages/ai-orchestrator/src/etsy-api-client.test.ts  # Single file

# Run dev servers
npm run dev -w packages/server           # ERP Core API (port 3000)
npm run dev -w packages/ai-orchestrator  # AI Orchestrator (port 54516)
npm run dev -w packages/web              # Web Dashboard (port 3200)
npm run dev -w packages/knowledge-base   # Knowledge Base (port 3100)

# Build
npm run build

# Run Etsy sandbox test
cd packages/ai-orchestrator
TEST_MODE=dry-run npx tsx src/etsy-sandbox-test.ts    # Dry run (default)
TEST_MODE=api-test npx tsx src/etsy-sandbox-test.ts   # API test
TEST_MODE=browser-test npx tsx src/etsy-sandbox-test.ts  # Browser test

# Run visual test
npx tsx src/visual-test.ts

# Run specific test file
npx vitest run src/etsy-api-client.test.ts
```

### Etsy Connector (Python)

```bash
cd /workspace/etsy-connector

# Sync workspace
uv sync --all-packages

# Run tests
make test-unit                   # Unit tests only
make test                        # All tests
make core-test                   # etsy-core tests only
make shared-test                 # etsy-mcp-shared tests only
make app-test                    # apps/etsy tests only

# Lint & format
make lint
make format

# Run Etsy MCP server
uv run etsy-mcp                  # Start MCP server (stdio)
uv run etsy-mcp --transport http # Start HTTP server

# Auth CLI
uv run etsy-mcp auth login       # OAuth login
uv run etsy-mcp auth status      # Check auth status
```

---

## 5. Git Workflow

### Branches

| Branch | Description |
|--------|-------------|
| `master` / `main` | Production |
| `erp-core` | ERP Core development |
| `etsy-workflow` | Etsy integration | merged -> erp-core |
| `agent-loop-improve` | Agent Loop improvements |
| `architecture-v2` | Architecture v2 |
| `erp-mcp-gateway` | MCP gateway |

### Current State

- **Active branch**: `erp-core`
- **Latest commit**: `0e6139f` — "chore: add .openhands/microagents/repo.md with full project knowledge"
- **Remote**: `origin` → `https://github.com/peesaderd/PeteAI.git`
- **Git user**: openhands / openhands@all-hands.dev
- **Working tree**: clean
- **AGENTS.md**: Project rules for AI agents (auto-loaded by OpenHands)
- **HANDOFF.md**: Current status and next steps for handoff

### Common Git Commands

```bash
git status
git log --oneline -5
git branch -a
git push origin <branch>
git checkout <branch>
git merge <branch>
```

---

## 6. Known Issues & Fixes

### Vision Analysis

| Issue | Cause | Fix |
|-------|-------|-----|
| DeepSeek vision error | DeepSeek ไม่รองรับ `image_url` | ใช้ Gemini หรือ provider อื่น |
| Gemini 2.0 Flash 404 | Model ถูก deprecate สำหรับ user ใหม่ | เปลี่ยนเป็น `gemini-2.5-flash` |
| Ollama not available | ไม่มี Ollama ใน environment | ใช้ Gemini API แทน |

### Agent Loop

| Issue | Cause | Fix |
|-------|-------|-----|
| Agent Loop zombie | setInterval polling ไม่หยุด | ใช้ event-driven + task queue |
| LLM timeout | API ไม่ตอบกลับภายใน 120s | ตรวจสอบ API key และ network |
| Browser not responding | Smart Sleep ปิด browser | Wake browser ก่อนใช้งาน |

### Etsy API

| Issue | Cause | Fix |
|-------|-------|-----|
| Token expired | OAuth token หมดอายุ | Auto-refresh with `ensureValidToken()` |
| Rate limit exceeded | API calls มากเกินไป | Rate limiter + exponential backoff |
| 401 Unauthorized | Invalid/expired token | Re-run OAuth flow |

### Etsy Connector (Python)

| Issue | Cause | Fix |
|-------|-------|-----|
| Pure Primitive Rule violation | Tool มี heuristic/logic | แก้ให้เป็น thin wrapper รอบ API endpoint |
| Test discovery failure | import mode ไม่ถูกต้อง | ใช้ `--import-mode=importlib` |

---

## 7. Architecture Decisions

### Key Principles

1. **Pure Primitive Rule** (Etsy Connector): Tools are thin wrappers around API endpoints, no hidden intelligence
2. **LLM Gateway**: Unified LLM access for all agents (Telegram, Web UI, Agent Loop)
3. **Task Queue over Redis**: SQLite-based queue (simpler, no external dependency)
4. **Smart Sleep**: Browser auto-sleeps after idle to save resources
5. **Multi-tenant**: All DB tables have `tenant_id`, queries scoped by tenant

### Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js 20+, Express, TypeScript |
| Database | SQLite (better-sqlite3, WAL mode) |
| Frontend | React, Vite, Tailwind CSS |
| AI/LLM | DeepSeek, Gemini 2.5 Flash, GPT-4V, Claude |
| Browser | Playwright |
| Etsy (TS) | Etsy Open API v3 (direct HTTP) |
| Etsy (Python) | FastMCP, httpx, Pydantic |
| Auth | JWT + bcrypt + RBAC |
| Monitoring | Prometheus + Grafana |
| Container | Docker + Docker Compose |

---

## 8. Testing

### Test Structure

```
erp-core/
├── vitest.workspace.ts     # Workspace: ai-orchestrator, knowledge-base, server, e2e
├── packages/*/src/*.test.ts  # Unit tests alongside source
├── e2e/                    # Playwright E2E tests
└── visual-qa/              # Visual regression tests

etsy-connector/
├── packages/*/tests/       # Unit tests per package
└── apps/etsy/tests/        # Unit + integration tests
```

### CI/CD

GitHub Actions workflow at `.github/workflows/test.yml`:
- **unit-tests**: Vitest — runs on every push
- **e2e-tests**: Playwright — runs on every push
- **vision-tests**: Visual regression — runs when API key is set
- **notify-failure**: Auto-creates GitHub Issue on test failure

### Test Commands

```bash
# ERP Core
cd /workspace/erp-core
npm test                          # All vitest tests
npx vitest run --project ai-orchestrator  # Single project

# Etsy Connector
cd /workspace/etsy-connector
make test-unit                   # Fast unit tests
ETSY_INTEGRATION_TESTS=1 make test  # Include integration tests
```

---

## 9. Environment & Runtime

- **Python**: 3.13+ (etsy-connector)
- **Node**: 20+ (erp-core)
- **Package managers**: npm (erp-core), uv (etsy-connector)
- **Shell**: bash
- **Working directory**: `/workspace`
- **Date**: 2026-05-06

### Available API Keys
- DeepSeek: `sk-b5d010076fc14d19b3e89d12e470e3de`
- Gemini: `AIzaSyBKaKB3xhxaxdQWDe_kfNxNEDeAZP485sg`
- GitHub Token: ใช้ผ่าน GITHUB_TOKEN environment variable
