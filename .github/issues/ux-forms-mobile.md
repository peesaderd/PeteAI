---
name: "[UX] Forms - ฟอร์มไม่เหมาะสมกับมือถือ (label-input layout)"
title: "[UX] Forms - ฟอร์มไม่เหมาะสมกับมือถือ (label-input layout)"
labels: bug, ux, mobile
assignees: ''
---

## คำอธิบาย
ฟอร์มในหลายหน้าใช้ layout แนวนอน (label + input ในบรรทัดเดียวกัน) ซึ่งกินพื้นที่และไม่เหมาะสมกับมือถือ

## ไฟล์ที่เกี่ยวข้อง
- `packages/web/src/pages/Products.tsx`
- `packages/web/src/pages/Orders.tsx`
- `packages/web/src/pages/Customers.tsx`
- `packages/web/src/pages/Inventory.tsx`
- `packages/web/src/pages/Finance.tsx`
- `packages/web/src/pages/Channels.tsx`
- `packages/web/src/pages/AIProviderSettings.tsx`
- `packages/web/src/pages/LLMProviderSettings.tsx`

## ปัญหา
- ฟอร์มใช้ `flex` หรือ `grid` ที่ไม่เปลี่ยนเป็นแนวตั้งบนมือถือ
- Label และ input อยู่ในบรรทัดเดียวกัน ทำให้ input แคบ
- Dropdown และ input fields มีขนาดเล็กเกินไปสำหรับ touch target (ควร ≥ 44px)

## แนวทางแก้ไข
- เปลี่ยนฟอร์มเป็นแนวตั้งบนมือถือ (`flex-col md:flex-row`)
- เพิ่ม touch target ขนาดอย่างน้อย 44px
- ใช้ full-width inputs บนมือถือ

## สภาพแวดล้อม
- อุปกรณ์: Mobile (≤ 768px)
- Component: Forms ทั่วไป
