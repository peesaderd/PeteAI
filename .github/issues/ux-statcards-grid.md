---
name: "[UX] StatCards - ใช้ grid ไม่เหมาะสมกับจำนวน cards บนมือถือ"
title: "[UX] StatCards - ใช้ grid ไม่เหมาะสมกับจำนวน cards บนมือถือ"
labels: bug, ux, mobile
assignees: ''
---

## คำอธิบาย
Stat cards ในหลายหน้าใช้ `grid-cols-1 md:grid-cols-3` หรือ `md:grid-cols-4` ซึ่งแสดง cards เรียงแนวตั้งบนมือถือ แต่บางหน้ามี 4-6 cards ทำให้ต้องเลื่อนเยอะเกินไป

## ไฟล์ที่เกี่ยวข้อง
- `packages/web/src/pages/Dashboard.tsx`
- `packages/web/src/pages/Finance.tsx`
- `packages/web/src/pages/Inventory.tsx`
- `packages/web/src/pages/Orders.tsx`

## ปัญหา
- หน้าละ 4-6 stat cards แสดงเป็นแนวตั้งบนมือถือ
- ควรใช้ `grid-cols-2` บนมือถือสำหรับ 4+ cards
- Cards มีขนาดใหญ่เกินความจำเป็นบนมือถือ

## แนวทางแก้ไข
- ใช้ `grid-cols-2` บนมือถือสำหรับ 4+ cards
- ลด padding/font size ของ cards บนมือถือ
- หรือใช้ horizontal scroll สำหรับ stat cards

## สภาพแวดล้อม
- อุปกรณ์: Mobile (≤ 768px)
- Component: StatCards
