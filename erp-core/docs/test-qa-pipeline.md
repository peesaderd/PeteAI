# ERP Core — ระบบทดสอบ (Test & QA Pipeline)

## ภาพรวม

ERP Core มีระบบทดสอบครอบคลุมหลายระดับ ตั้งแต่ Unit Tests ไปจนถึง Visual QA และ E2E Tests โดยใช้ **Vitest** เป็น Test Runner หลักสำหรับ Unit Tests และ **Playwright** สำหรับ E2E และ Visual Tests

---

## 1. Unit Tests (Vitest)

### 1.1 ai-orchestrator (4 test files, 20 tests)
| Test File | จำนวน Test | ครอบคลุม |
|-----------|-----------|----------|
| `src/llm.test.ts` | 4 | LLM message formatting, tool definitions |
| `src/etsy-api-client.test.ts` | 10 | Etsy OAuth, CRUD listings, error handling |
| `src/etsy-browser-workflow.test.ts` | 5 | Browser automation workflow, retry logic |
| `src/tool-router.test.ts` | 4 | Tool routing, KB search, error handling |

### 1.2 knowledge-base (1 test file, 5 tests)
| Test File | จำนวน Test | ครอบคลุม |
|-----------|-----------|----------|
| `src/index.test.ts` | 5 | Document validation, search, collection structure |

### 1.3 server (1 test file, 4 tests)
| Test File | จำนวน Test | ครอบคลุม |
|-----------|-----------|----------|
| `src/api/registry.test.ts` | 4 | Service registry, filtering, offline detection |

### 1.4 sync-siyuan (1 test file, 33 tests)
| Test File | จำนวน Test | ครอบคลุม |
|-----------|-----------|----------|
| `src/index.test.ts` | 33 | SiYuan API Client (8), KB API Client (10), Sync Engine (10), ReverseSync (4), createApp (1) |

### รวม Unit Tests: **62 tests** (7 test files)

---

## 2. E2E Tests (Playwright)

### 2.1 Smoke Tests
| Test File | จำนวน Test | ครอบคลุม |
|-----------|-----------|----------|
| `e2e/smoke.test.ts` | 1 | Health check, basic connectivity |

### 2.2 Staging Tests
- Config: `playwright.config.staging.ts`
- รันด้วย: `npm run test:e2e:staging`
- Base URL: `http://localhost:54510`

---

## 3. Visual QA (Playwright)

| Test File | ครอบคลุม |
|-----------|----------|
| `visual-qa/suites/theme.spec.ts` | Theme consistency, dark/light mode |
| `visual-qa/suites/layout.spec.ts` | Layout integrity, responsive design |
| `visual-qa/suites/accessibility.spec.ts` | Accessibility checks, ARIA labels |

- Config: `playwright.visual.config.ts`
- รันด้วย: `npm run test:visual`
- รายงาน: `npm run test:visual:report`

---

## 4. CI Pipeline (GitHub Actions)

### Workflow: `.github/workflows/test.yml`

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test          # Vitest unit tests
      - run: npm run test:e2e  # Playwright E2E tests
      - run: npx vitest run --config packages/sync-siyuan/vitest.config.ts
```

---

## 5. Test Commands

| Command | คำอธิบาย |
|---------|----------|
| `npm test` | รัน Unit Tests ทั้งหมดด้วย Vitest |
| `npm run test:watch` | รัน Vitest ใน watch mode |
| `npm run test:e2e` | รัน Playwright E2E tests |
| `npm run test:e2e:staging` | รัน E2E tests กับ staging environment |
| `npm run test:visual` | รัน Visual QA tests |
| `npm run test:visual:report` | สร้าง Visual QA report |
| `npm run test:visual:all` | รัน Visual QA + สร้าง report |
| `npm run test:all` | รัน Unit Tests + Visual QA ทั้งหมด |

---

## 6. GitHub Issue Templates

| Template | สำหรับ |
|----------|--------|
| `bug_report.md` | รายงานบั๊กทั่วไป |
| `test_failure.md` | รายงาน test failure จาก CI |
| `qa_checklist.md` | ตรวจสอบคุณภาพก่อน release |

---

## 7. สถิติล่าสุด (5 May 2026)

| ประเภท | จำนวน |
|--------|-------|
| Unit Test Files | 7 |
| Unit Tests | 67 (ผ่านทั้งหมด) |
| E2E Test Files | 1 |
| Visual QA Files | 3 |
| CI Workflows | 1 |

---

## 8. การเพิ่ม Tests สำหรับ Package ใหม่

1. สร้าง `vitest.config.ts` ใน package:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

2. เพิ่ม project ใน `vitest.workspace.ts`

3. สร้าง test file ที่ `src/*.test.ts`

4. รัน: `npx vitest run --config packages/<name>/vitest.config.ts`
