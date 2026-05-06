---
name: ❌ Test Failure
about: รายงานการทดสอบที่ล้มเหลวใน CI Pipeline
title: "[TEST] "
labels: bug, test
assignees: ''

---

## รายละเอียด Test Failure
<!-- ชื่อ test ที่ fail และรายละเอียด -->

**Test Name:**
**Test File:**
**Suite:**

## Error Message
```
วาง error message ที่นี่
```

## Stack Trace
```
วาง stack trace ที่นี่
```

## ขั้นตอนในการ Reproduce
```bash
# คำสั่งในการรัน test ที่ fail
npm test -- --run

# หรือรันเฉพาะ test ที่ fail
npx vitest run <path/to/test/file> --reporter=verbose
```

## สภาพแวดล้อมที่พบ
- **Run ID:** <!-- CI run ID -->
- **Branch:** <!-- branch name -->
- **Commit:** <!-- commit hash -->
- **Node Version:** <!-- e.g. 18.x, 20.x, 22.x -->

## Screenshots / Logs
<!-- แนบ screenshot หรือ log ถ้ามี -->

## หมายเหตุ
<!-- ข้อมูลเพิ่มเติม -->
