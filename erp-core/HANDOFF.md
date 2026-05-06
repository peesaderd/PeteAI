# Handoff: ERP Core v0.2.0

> สรุปสถานะปัจจุบันสำหรับ AI Agent ที่จะทำงานต่อ
> อัปเดตล่าสุด: 2026-05-06

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
- GitHub Issue Templates — bug_report, test_failure, qa_checklist
- .openhands/microagents/repo.md — project knowledge base (429 lines)
- AGENTS.md — project rules for AI agents (137 lines)

### ⏳ กำลังดำเนินการ / ค้างอยู่
- DeepSeek API Key ยังไม่ได้ set ใน GitHub Secrets
- PR #2 รอ review/merge ที่ https://github.com/peesaderd/PeteAI/pull/2
- DNS A record: openhands.m2igen.com -> 89.167.82.205 (ยังไม่ตั้ง)
- SSL certificate — ต้องรัน certbot สำหรับ openhands.m2igen.com
- NGINX systemd service failed (port conflicts)
- Server CPU/RAM สูงจาก OpenHands container

### 📌 สิ่งที่ต้องทำต่อ (ลำดับความสำคัญ)
1. Set DEEPSEEK_API_KEY ใน GitHub Secrets
2. Review และ merge PR #2
3. ตั้งค่า DNS + SSL สำหรับ openhands.m2igen.com
4. Reload NGINX ให้ HTTPS ทำงาน
5. จัดการ port conflicts ของ NGINX

---

## Git Branches

| Branch | คำอธิบาย | สถานะ |
|--------|---------|-------|
| erp-core | ERP Core development (active) | latest: 0e6139f |
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
                    |         |
              Vision Analysis  |
              (Gemini/GPT-4V)  |
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
| OpenHands API | 3002 |
| OpenHands UI | 52531 |

---

## Server Infrastructure

- Host: 89.167.82.205 (n8n-server)
- Specs: 8 vCPU, 15GB RAM, 150GB disk
- OpenHands: v0.59.0 (container)
- Runtimes: 49af (ERP MCP), 2e3a (Test & QA)
- SiYuan: port 54511

---

## Testing

```bash
# Unit tests
npm test                          # 27 tests passed

# E2E tests
npm run test:e2e                  # 2 tests passed

# Single file
npx vitest run packages/ai-orchestrator/src/etsy-api-client.test.ts
```

---

## หมายเหตุ

- Agent Loop v2 ใช้ event-driven design — ไม่มี setInterval polling
- Browser Use มี Smart Sleep — ต้อง wake ก่อนใช้งานทุกครั้ง
- DeepSeek ไม่รองรับ image_url — ใช้ Gemini สำหรับ vision tasks
- Etsy OAuth token auto-refresh — ใช้ ensureValidToken() ก่อนเรียก API
- .openhands/microagents/repo.md ถูกโหลดอัตโนมัติโดย OpenHands
- AGENTS.md ถูกโหลดอัตโนมัติโดย OpenHands
