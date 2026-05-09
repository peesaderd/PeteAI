# Handoff: ERP Core v0.3.0

> สรุปสถานะปัจจุบันสำหรับ AI Agent ที่จะทำงานต่อ
> อัปเดตล่าสุด: 2026-05-09

---

## สถานะปัจจุบัน

### ✅ เสร็จสมบูรณ์
- Agent Loop v2 — task-based autonomous agent with SQLite queue
- Etsy API Client v3 — OAuth + PKCE + auto-refresh
- Etsy Browser Workflow — Playwright-based listing creation
- Vision Analysis — Gemini 2.5 Flash (multi-provider support)
- Browser Smart Sleep — auto-sleep after 3 min idle
- Tests — 27 unit tests + 2 e2e tests ผ่านทั้งหมด
- GitHub Actions CI — test.yml workflow พร้อม
- .openhands/microagents/repo.md — project knowledge base (อัปเดตล่าสุด)
- AGENTS.md — project rules for AI agents
- **OpenHands Bridge** — REST API + Browser fallback สำหรับส่ง task ไป OpenHands
- **Single Instance Guard** — Lock file ป้องกันการรันซ้อน
- **Heartbeat + Health API** — ตรวจสอบ health ของ orchestrator
- **DeepSeek Reasoning Support** — รองรับ reasoningContent ใน LLM response
- **"Max 2000" Fix** — ตั้ง max_iterations=10000 ใน settings.json ของ OpenHands container

### ⏳ กำลังดำเนินการ / ค้างอยู่
- DeepSeek API Key ยังไม่ได้ set ใน GitHub Secrets
- PR #2 รอ review/merge ที่ https://github.com/peesaderd/PeteAI/pull/2
- DNS A record: openhands.m2igen.com -> 89.167.82.205 (ยังไม่ตั้ง)
- SSL certificate — ต้องรัน certbot สำหรับ openhands.m2igen.com
- NGINX systemd service failed (port conflicts)
- Server CPU/RAM สูงจาก OpenHands container
- Oracle Cloud Free Tier signup — credit card ผ่านแล้วแต่ signup ไม่ผ่าน (ต้องลองใหม่)
- SiYuan "Brain" search — API endpoint ยังหาไม่เจอ (/api/search คืน 404)

### 📌 สิ่งที่ต้องทำต่อ (ลำดับความสำคัญ)
1. Set DEEPSEEK_API_KEY ใน GitHub Secrets
2. Review และ merge PR #2
3. ตั้งค่า DNS + SSL สำหรับ openhands.m2igen.com
4. Reload NGINX ให้ HTTPS ทำงาน
5. จัดการ port conflicts ของ NGINX
6. Oracle Cloud VM — ลอง signup อีกครั้ง หรือใช้ provider อื่น (Hetzner, RackNerd, Contabo)
7. ติดตั้ง Docker + Ollama + local LLM บน VM ใหม่
8. Clone ข้อมูลจาก server ปัจจุบันไป VM ใหม่

---

## Git Branches

| Branch | คำอธิบาย | สถานะ |
|--------|---------|-------|
| unified-agent-v3 | **Active** — Unified agent + OpenHands Bridge | latest: 9e0ac49 |
| erp-core | ERP Core development | merged |
| etsy-workflow | Etsy integration | merged -> erp-core |
| master | Production | original root |
| agent-loop-improve | Agent Loop improvements | pushed |
| test-qa-pipeline | Test & QA pipeline | pushed |

---

## Architecture Overview

### Services
```
ERP Core API (54510) <-> AI Orchestrator (54516) <-> LLM Gateway
                              |
                    +---------+---------+
                    |         |         |
              Task Queue   Browser   Etsy API
              (SQLite)    (Playwright) (v3 OAuth)
                    |         |         |
              Vision Analysis  |   OpenHands Bridge
              (Gemini/GPT-4V)  |   (REST + Browser)
                         Etsy Browser Workflow
```

### Key Files
- packages/ai-orchestrator/src/agent-loop-v2.ts — Main agent loop
- packages/ai-orchestrator/src/task-queue.ts — Task queue
- packages/ai-orchestrator/src/llm-gateway.ts — LLM routing
- packages/ai-orchestrator/src/tool-router.ts — Tool dispatch
- packages/ai-orchestrator/src/browser-use.ts — Browser automation
- packages/ai-orchestrator/src/etsy-api-client.ts — Etsy API
- packages/ai-orchestrator/src/vision-analysis.ts — Vision
- packages/ai-orchestrator/src/openhands-bridge.ts — OpenHands Bridge
- packages/ai-orchestrator/src/index.ts — Entry + Single Instance Guard + Health API

---

## Environment

### API Keys
| Key | Value | ใช้สำหรับ |
|-----|-------|---------|
| DeepSeek | sk-b5d010076fc14d19b3e89d12e470e3de | LLM หลัก |
| Gemini | AIzaSyBKaKB3xhxaxdQWDe_kfNxNEDeAZP485sg | Vision Analysis |
| GitHub | GITHUB_TOKEN env var | Git operations |

### Ports
| Service | Port |
|---------|------|
| ERP Core API | 54510 |
| AI Orchestrator | 54516 |
| Knowledge Base | 54512 |
| Web Dashboard (dev) | 3200 |
| Task Manager | 8081 |
| SiYuan | 54511 |
| OpenHands UI | 3002 |

---

## Server Infrastructure

- **Main Host**: 89.167.82.205 (n8n-server)
- **Specs**: 8 vCPU, 15GB RAM, 150GB disk
- **OpenHands**: v0.50.0 (container, ghcr.io/all-hands-ai/openhands:0.50)
- **OpenHands UI**: http://178.105.75.67:3002
- **Sandbox Runtime**: 178.105.75.67 (action_execution_server)
- **SiYuan**: port 54511 (Docker container: erp-siyuan)
- **PM2**: ai-orchestrator (running on main host)

### OpenHands Config
- settings.json: \`max_iterations: 10000\` (fixed)
- Session data: \`/home/openhands/.openhands/sessions/\` (persistent bind mount)
- 4 conversations stored: 18acd5c5, 33feae7d, c3b0869b, d6c010a7

---

## Testing

\`\`\`bash
# Unit tests
npm test                          # 27 tests passed

# E2E tests
npm run test:e2e                  # 2 tests passed

# Single file
npx vitest run packages/ai-orchestrator/src/etsy-api-client.test.ts
\`\`\`

---

## หมายเหตุสำคัญ

- Agent Loop v2 ใช้ event-driven design — ไม่มี setInterval polling
- Browser Use มี Smart Sleep — ต้อง wake ก่อนใช้งานทุกครั้ง
- DeepSeek ไม่รองรับ image_url — ใช้ Gemini สำหรับ vision tasks
- Etsy OAuth token auto-refresh — ใช้ ensureValidToken() ก่อนเรียก API
- OpenHands Bridge ส่ง task ผ่าน REST API ก่อน ถ้าไม่ได้ใช้ browser fallback
- **"Max 2000" error** แก้โดยตั้ง max_iterations=10000 ใน settings.json — ไม่ต้อง restart container
- .openhands/microagents/repo.md ถูกโหลดอัตโนมัติโดย OpenHands
- AGENTS.md ถูกโหลดอัตโนมัติโดย OpenHands
- **Oracle Cloud signup** ลองใหม่หรือใช้ provider อื่น (Hetzner ถูกและดี)
