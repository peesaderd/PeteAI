# ERP Core — Agent Rules

> สําหรับ AI Agent ที่ทํางานบน ERP Core Repository
> อ่านก่อนแก้ไขโค้ดทุกครั้ง

---

## 1. Agent Loop v2 Architecture

### Data Flow

```
User Input
     |
     v
TaskQueue (SQLite) ----> AgentLoopV2 ----> LLMGateway ----> ToolRouter
                                |                            |
                                |                     +------+------+
                                |                     v      v      v
                                |               Browser  Etsy   Vision
                                |               Use     API    Analysis
                                |
                    +-----------+-----------+
                    v           v           v
              onStart    onComplete    onFailed
              callback   callback      callback
```

### State Machine

```
IDLE ----> PROCESSING ----> WAITING_TOOL ----> PROCESSING ----> COMPLETED
  ^            |                                              |
  |            v                                              |
  +--------- TIMEOUT/FAILED <---------------------------------+
```

| State | คําอธิบาย |
|-------|---------|
| IDLE | รอ task ถัดไป |
| PROCESSING | กําลังประมวลผล (LLM call) |
| WAITING_TOOL | รอ tool call result |
| COMPLETED | task สําเร็จ |
| FAILED | task ล้มเหลว (retry 3 ครั้งแล้ว) |

### Key Files

| File | Path | หน้าที่ |
|------|------|--------|
| Agent Loop v2 | packages/ai-orchestrator/src/agent-loop-v2.ts | Main loop, state machine, task lifecycle |
| Task Queue | packages/ai-orchestrator/src/task-queue.ts | SQLite-backed persistent queue |
| LLM Gateway | packages/ai-orchestrator/src/llm-gateway.ts | Unified LLM access (DeepSeek default) |
| Tool Router | packages/ai-orchestrator/src/tool-router.ts | Routes tool calls to MCP or local tools |
| Browser Use | packages/ai-orchestrator/src/browser-use.ts | Playwright browser automation |
| Browser Watchdog | packages/ai-orchestrator/src/browser-watchdog.ts | Smart Sleep for browser |
| Vision Analysis | packages/ai-orchestrator/src/vision-analysis.ts | Multi-provider vision |
| Etsy API Client | packages/ai-orchestrator/src/etsy-api-client.ts | Etsy Open API v3 + OAuth |
| Etsy Browser Workflow | packages/ai-orchestrator/src/etsy-browser-workflow.ts | Browser-based Etsy listing |
| Supervisor | packages/ai-orchestrator/src/supervisor.ts | Multi-agent supervisor |
| Revive Chat | packages/ai-orchestrator/src/revive-chat.ts | OpenHands chat revive |

---

## 2. Critical Rules

### Agent Loop
- ห้ามแก้ไข agent-loop-v2.ts โดยไม่เข้าใจ state machine ก่อน
- Task queue ใช้ SQLite — ระวัง race condition เมื่อมีหลาย agents
- ทุก task มี timeout 5 นาที — ถ้าเกินจะ FAILED อัตโนมัติ
- Retry สูงสุด 3 ครั้ง — exponential backoff

### Browser Use
- Browser มี Smart Sleep — ต้อง wake (browserUse.wake()) ก่อนใช้งาน
- ใช้ browser instance เดียว (singleton) — อย่าสร้างใหม่
- Browser watchdog จะ sleep browser หลังจาก idle 3 นาที

### Etsy API
- OAuth token มี auto-refresh — ใช้ ensureValidToken() ก่อนเรียก API
- Rate limiter — อย่า bypass
- Etsy Browser Workflow ใช้สําหรับ fallback เมื่อ API ไม่พอ

### Vision Analysis
- DeepSeek ไม่รองรับ image_url — ใช้ Gemini 2.5 Flash แทน
- Vision analysis มี 5 requirements: background, subject_clear, lighting, framing, color_vibrant

### Testing
- Unit tests ใช้ Vitest — วาง *.test.ts ไว้ข้าง source file
- E2E tests ใช้ Playwright — อยู่ใน /e2e/
- ห้าม commit test ที่ตั้งใจให้ fail
- ถ้าเพิ่ม feature ใหม่ ต้องมี test ด้วย

### Git
- ห้าม push ตรงไปยัง master หรือ main
- Commit message ใช้ prefix: feat:, fix:, chore:, docs:, test:
- Branch naming: feature/xxx, fix/xxx, chore/xxx

---

## 3. Environment

### API Keys
| Key | ใช้สําหรับ |
|-----|---------|
| DeepSeek (sk-b5d0...) | LLM หลัก |
| Gemini (AIzaSyB...) | Vision Analysis |
| GITHUB_TOKEN env var | Git operations |

### Ports
| Service | Port |
|---------|------|
| ERP Core API | 54510 |
| AI Orchestrator | 54516 |
| Knowledge Base | 54512 |
| Web Dashboard (dev) | 3200 |
| Task Manager | 8081 |

---

## 4. Quick Commands

```bash
npm install
npm test
npx vitest run packages/ai-orchestrator/src/etsy-api-client.test.ts
npm run dev -w packages/ai-orchestrator
npm run dev -w packages/server
npm run build
```

---

## 5. Current State

- Active branch: erp-core
- Latest commit: 0e6139f
- Remote: origin -> https://github.com/peesaderd/PeteAI.git
- Working tree: clean
