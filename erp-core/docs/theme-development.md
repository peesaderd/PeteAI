# Theme Development Guide

## สำหรับนักพัฒนา Theme โดยเฉพาะ

เอกสารนี้ครอบคลุมแนวทางการพัฒนา Theme/Frontend สำหรับ ERP Core โดยเฉพาะ
เพื่อป้องกันปัญหาที่พบมาแล้ว เช่น blank page, ReferenceError, nginx misconfiguration

---

## 1. Theme Structure

```
packages/web/src/
├── main.tsx              # Entry point — ห้ามแก้โดยไม่แจ้ง
├── App.tsx               # Root component — Routes + Sidebar
├── index.css             # Global styles (Tailwind)
├── pages/                # Page components
│   ├── Dashboard.tsx
│   ├── Products.tsx
│   ├── Orders.tsx
│   ├── Customers.tsx
│   ├── ProductionPlanning.tsx
│   ├── ChannelManagement.tsx
│   ├── KnowledgeBase.tsx
│   ├── NoteForge.tsx
│   └── Settings.tsx
├── lib/                  # Utilities, hooks, API clients
│   └── ...
└── noteforge/            # NoteForge integration components
    └── ...
```

### ไฟล์ที่ห้ามแก้โดยไม่ได้รับอนุญาต
| ไฟล์ | เหตุผล |
|------|--------|
| `main.tsx` | Entry point — ถ้าพังทั้ง app ไม่ทำงาน |
| `vite.config.ts` | Dev server + proxy config |
| `nginx.conf` | Container nginx config — SPA fallback |
| `tailwind.config.js` | Design system tokens |
| `postcss.config.js` | CSS processing pipeline |

---

## 2. Component Checklist

ทุก component ที่สร้าง **ต้องมี**:

### ✅ Required States
```tsx
function MyComponent() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>No data</div>;

  return <div>{/* Normal render */}</div>;
}
```

### ✅ Component Template
```tsx
import React, { useState, useEffect } from "react";

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}
```

---

## 3. CSS Guidelines

### DO
- ใช้ Tailwind utility classes เท่าที่มีใน `tailwind.config.js`
- ใช้ `index.css` สำหรับ global styles ที่จำเป็นจริงๆ
- ใช้ inline styles เฉพาะ dynamic values ที่คำนวณจาก JS

### DON"T
- ห้าม import external CSS files โดยไม่ได้รับอนุญาต
- ห้ามใช้ `!important` — ถ้าจำเป็นต้องใช้ แสดงว่า design system มีปัญหา
- ห้ามเพิ่ม custom CSS ใน `index.css` โดยไม่จำเป็น

### Tailwind Config ที่มีอยู่
```js
// tailwind.config.js — ดูของจริงในไฟล์
theme: {
  extend: {
    colors: { /* existing palette */ },
    // ห้ามเพิ่ม colors โดยไม่ได้รับอนุญาต
  }
}
```

---

## 4. JavaScript Pitfalls (สาเหตุที่พบบ่อย)

### 🔴 อันตรายที่สุด: ลืมเครื่องหมาย quotes
```tsx
// ❌ พัง! — ReferenceError: noteforge is not defined
const SYNC_KEY = noteforge-siyuan-sync;

// ✅ ถูกต้อง
const SYNC_KEY = "noteforge-siyuan-sync";
```

### 🔴 Import path ผิด
```tsx
// ❌ พัง! — Cannot find module
import { api } from "./lib/ap";

// ✅ ถูกต้อง
import { api } from "./lib/api";
```

### 🔴 ลืม export
```tsx
// ❌ พัง! — Component not found
function MyComponent() { ... }

// ✅ ถูกต้อง
export function MyComponent() { ... }
```

### 🔴 useState โดยไม่ import
```tsx
// ❌ พัง! — useState is not defined
const [data, setData] = useState(null);

// ✅ ถูกต้อง
import { useState } from "react";
const [data, setData] = useState(null);
```

---

## 5. Pre-commit Checklist

ก่อน push หรือ deploy ทุกครั้ง ให้ตรวจสอบ:

```bash
# [ ] Build ผ่าน (0 errors)
npm run build

# [ ] JS syntax ถูกต้อง
node --check dist/assets/*.js

# [ ] ไม่มี console.log ตกค้าง
grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" || true

# [ ] ไม่มี ReferenceError ที่อาจเกิดขึ้น
grep -rn "=[ ]*[a-z]" src/ --include="*.ts" --include="*.tsx" | grep -v [^]*' | grep -v [^]*" | head -20
# (ตรวจสอบบรรทัดที่อาจมี string โดยไม่ใส่ quotes)
```

### Visual Checklist (เปิด browser ดู)
```
[ ] หน้าเว็บโหลด — ไม่ blank (div#root มี content)
[ ] ไม่มี error ใน browser console (F12 → Console)
[ ] Network tab — JS files โหลดสำเร็จ (HTTP 200)
[ ] Responsive — หน้าตาไม่พังใน mobile view
```

---

## 6. Development Workflow

### ขั้นตอนที่ปลอดภัยที่สุด

```
1. สร้าง branch: theme/ชื่อฟีเจอร์
2. แก้ไข code ใน branch ของตัวเอง
3. รัน npm run build — ตรวจสอบว่าไม่มี error
4. ทดสอบเปิด dist/index.html ใน browser
5. commit + push
6. สร้าง Pull Request
7. รอ reviewer ตรวจสอบ
8. เมื่อ approved → merge
9. Deploy ไป production
```

### การทดสอบใน local (ไม่ต้อง deploy)
```bash
# 1. Build
npm run build

# 2. รัน preview server
npx vite preview --port 4173

# 3. เปิด http://localhost:4173 ดูว่าใช้งานได้
```

---

## 7. ถ้าเกิดปัญหาขึ้นมา

### Blank page — ขั้นตอนการ debug
1. เปิด browser console (F12) — ดู error message
2. ดู Network tab — ไฟล์ไหนโหลดไม่มา
3. ดู nginx error log: `tail -50 /var/log/nginx/erp-error.log`
4. ตรวจสอบ dist/index.html ว่า script src ถูกต้อง
5. ตรวจสอบ JS syntax: `node --check dist/assets/*.js`

### Rollback
```bash
# revert ไป commit ก่อนหน้า
git revert HEAD --no-edit
git push

# rebuild container
docker compose up -d --build erp-web-dashboard
```
