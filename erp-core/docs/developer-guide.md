# Developer Guide

## Environment Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- npm 9+

### Local Development

```bash
# ติดตั้ง dependencies ทั้งหมด
npm install

# รัน ERP Core server (API + MCP)
npm run dev -w packages/server

# รัน Web Dashboard (Vite dev server)
npm run dev -w packages/web

# รัน Knowledge Base
npm run dev -w packages/knowledge-base
```

Web Dashboard dev server จะรันที่ `http://localhost:3200` พร้อม proxy `/api` และ `/mcp` ไปที่ `localhost:3000`

### Docker Development

```bash
# Build + รันทั้งหมด
docker compose up -d --build

# ดู logs
docker compose logs -f

# รันเฉพาะ service ที่ต้องการ
docker compose up -d erp-core
```

---

## Project Structure

```
erp-core/
├── packages/
│   ├── server/          # ERP Core API + MCP Server
│   ├── web/             # React Dashboard (Vite)
│   ├── knowledge-base/  # Knowledge Base API
│   ├── connectors/      # Marketplace connectors (Etsy, etc.)
│   ├── ai-orchestrator/ # AI Agent Orchestrator
│   └── infra/           # Docker Compose, Caddy config
├── docs/                # Documentation
├── data/                # Database files (gitignored)
├── docker-compose.yml   # Main Docker Compose
└── package.json         # Monorepo root
```

---

## Coding Standards

### TypeScript
- ใช้ strict mode เสมอ
- กำหนด type ให้ทุก function parameter และ return value
- หลีกเลี่ยง `any` — ใช้ `unknown` แทนถ้าจำเป็น

### React Components
- ใช้ Functional Component + Hooks เท่านั้น (ไม่มี Class Component)
- แยก Logic ออกจาก UI — custom hooks ใน `src/lib/`
- Props ต้องมี interface/type definition

### Naming Conventions
| Type | Convention | Example |
|------|-----------|---------|
| Files | camelCase | `useAuth.ts`, `dashboard.tsx` |
| Components | PascalCase | `Dashboard.tsx`, `StatCard.tsx` |
| Functions | camelCase | `fetchProducts()`, `handleSubmit()` |
| Types/Interfaces | PascalCase | `Product`, `OrderStatus` |
| CSS classes | kebab-case | `stat-card`, `btn-primary` |

### State Management
- ใช้ React state (`useState`, `useReducer`) สำหรับ local state
- ใช้ Context สำหรับ shared state (theme, auth)
- หลีกเลี่ยง external state management library ถ้าไม่จำเป็น

---

## Git Workflow

### Branch Strategy
```
main              # Production-ready code
├── develop       # Integration branch
├── feature/xxx   # ฟีเจอร์ใหม่
├── fix/xxx       # แก้บัค
└── theme/xxx     # Theme/Frontend changes
```

### Rules
1. **ห้าม commit เข้า \`main\` โดยตรง** — ต้องผ่าน Pull Request เท่านั้น
2. **ทุก PR ต้องมี reviewer อย่างน้อย 1 คน**
3. **Branch name ต้องมี prefix** — \`feature/\`, \`fix/\`, \`theme/\`
4. **Commit message ใช้ภาษาไทยหรืออังกฤษก็ได้** แต่ต้องสื่อความหมาย

### Before Push Checklist
```bash
# 1. Build ผ่าน
npm run build

# 2. ตรวจสอบ syntax
node --check dist/assets/*.js

# 3. ตรวจสอบว่าไม่มี console.log ตกค้าง
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" || true
```

---

## Docker Container Guide

### Web Dashboard Container
- **Image**: สร้างจาก \`Dockerfile.web\`
- **Port**: 80 (internal) → map ไป port 53020
- **Static files**: \`/usr/share/nginx/html\` (จาก \`packages/web/dist/\`)
- **nginx config**: \`packages/web/nginx.conf\` — SPA fallback (\`try_files $uri $uri/ /index.html\`)

### การ rebuild และ redeploy
```bash
# กรณีแก้ไข frontend code เท่านั้น
docker compose up -d --build erp-web-dashboard

# กรณี rebuild ทั้งหมด
docker compose up -d --build
```

---

## Port Mapping

| Port | Service | Description |
|------|---------|-------------|
| 54509 | nginx proxy | Entry point — proxy ไป dashboard + API |
| 54510 | erp-core | API Gateway + MCP Server |
| 53020 | erp-web-dashboard | React Dashboard (nginx container) |
| 54511 | siyuan | NoteForge (SiYuan) |
| 54512 | knowledge-base | Knowledge Base API |
| 54513 | sync-siyuan | SiYuan → KB sync |
| 54516 | ai-orchestrator | AI Agent Orchestrator |
| 55165 | nginx proxy (unified) | Unified UI entry point |
| 5678 | n8n | Workflow automation |
| 8082 | task-manager | Task Manager API |
