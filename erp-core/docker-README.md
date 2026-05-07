# ERP Core + SiYuan — Docker Deployment

## Quick Start

```bash
# 1. Copy environment file and edit
cp .env.example .env

# 2. Start all services
docker compose up -d

# 3. Check status
docker compose ps

# 4. Follow logs
docker compose logs -f
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| SiYuan | 54511 | Knowledge base (笔记) |
| ERP Server | 3000 | Core API |
| Knowledge Base | 3100 | KB API |
| Sync SiYuan | 54513 | SiYuan ↔ KB sync |
| AI Orchestrator | 54516 | AI agent orchestration |
| Redis | 6379 | Cache / queue |

## Persistent Volumes

| Volume | Mount | Data |
|--------|-------|------|
| `erp-siyuan-data` | `/siyuan/workspace` | All SiYuan notes & config |
| `erp-server-data` | `/app/packages/server/data` | ERP database |
| `erp-kb-data` | `/app/packages/knowledge-base/data` | KB database |
| `erp-sync-data` | `/app/packages/sync-siyuan/data` | Sync state |
| `erp-redis-data` | `/data` | Redis cache |

Data persists across container restarts. To delete all data:
```bash
docker compose down -v
```

## Management

```bash
# Stop services (data preserved)
docker compose down

# Restart a specific service
docker compose restart erp-core

# View logs for a service
docker compose logs -f siyuan

# Rebuild after code changes
docker compose build erp-core
docker compose up -d
```
