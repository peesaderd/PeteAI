---
name: erp-core
type: repo
agent: CodeActAgent
---

# ERP Core System Knowledge

## Project Structure
- `/workspace` — Main workspace (ERP Core + related projects)
- `/workspace/erp-core` — ERP Core monorepo (legacy path, some tools still reference it)
- `/workspace/src` — Main source code
- `/workspace/tests` — Test files
- `/workspace/petemarket` — PeteMarket module

## Tech Stack
- **Runtime**: Node.js
- **Testing**: Vitest + Playwright
- **Package Manager**: npm
- **Architecture**: Monorepo with multiple packages

## Server Infrastructure
- **Host**: 89.167.82.205 (n8n-server)
- **Specs**: 8 vCPU, 15GB RAM, 150GB disk
- **OS**: Ubuntu with Docker
- **Domain**: m2igen.com

### Services (Docker)
| Service | Port | Status |
|---------|------|--------|
| OpenHands (main) | 3002 (internal) / 3003 (nginx) | Active |
| SiYuan | 54511 | Active |
| n8n | 5678 | Active |

### OpenHands
- **Version**: 0.59.0
- **API**: http://localhost:3002/api
- **Web UI**: http://89.167.82.205:3003 (HTTP) / https://openhands.m2igen.com (HTTPS - pending DNS)
- **Session storage**: `/.openhands/sessions/` inside container
- **Runtime containers**: Named `openhands-runtime-{conversation_id}`
- **Micro-agents**: `/app/microagents/` inside container, `.openhands/microagents/repo.md` in workspace

### Active Conversations
- `49af220fe27449c3a410b72cad9558cf` — ERP MCP Server Dev (main context)
- `2e3a56a4997c44f190d0246045ceef3f` — ERP Core Test & QA Setup (this session)

## Common Commands
```bash
# Run tests
npm test

# Run e2e tests
npm run test:e2e

# Run specific test file
npx vitest run tests/path/to/test.ts

# Run tests with UI
npx vitest --ui
```

## Testing
- **Framework**: Vitest (unit/integration) + Playwright (e2e)
- **Config**: `vitest.config.js`, `playwright.config.js`
- **Test files location**: `/workspace/tests/`
- **Test reports**: `/workspace/test-results/`

## Git Configuration
- **GitHub**: https://github.com/peesaderd/erp-core
- **Default branch**: main
- **Git user**: openhands / openhands@all-hands.dev
- **PR workflow**: Create branch → commit → push → create PR via API

## SiYuan Knowledge Base
- **URL**: http://89.167.82.205:54511
- **API Token**: `w8qyx729d7pm5zqn`
- **Workspace**: `/siyuan/workspace` inside container
- **Sync service**: Node service at `/root/erp-core/erp-core/packages/sync-siyuan/dist/index.js`

## Known Issues & Resolutions
1. **Clipboard copy not working**: Browser blocks `navigator.clipboard` over HTTP. Fix: Use HTTPS.
2. **Runtime lag**: Main container CPU spikes (114% observed). Fix: Restart runtime container.
3. **agent_state.pkl corruption**: Baked-in references to deleted sessions. Fix: Delete corrupted session dir and restart main container.
4. **NGINX systemd service conflict**: Port 80/443 conflicts. Use `nginx -s reload` instead of systemctl.
