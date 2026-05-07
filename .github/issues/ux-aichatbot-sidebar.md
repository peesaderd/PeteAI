---
name: "[UX] AIChatbot - Sidebar ไม่มี responsive breakpoint บนมือถือ"
title: "[UX] AIChatbot - Sidebar ไม่มี responsive breakpoint บนมือถือ"
labels: bug, ux, mobile
assignees: ''
---

## คำอธิบาย
หน้า AIChatbot มี Sidebar (w-64) ที่แสดงตลอดเวลาโดยไม่มี responsive breakpoint ทำให้บนมือถือเนื้อหาหลักถูกบีบให้แคบลง

## ไฟล์ที่เกี่ยวข้อง
- `packages/web/src/pages/AIChatbot.tsx`

## ปัญหา
- Sidebar ใช้ class `w-64` โดยไม่มี `hidden md:flex` หรือ `lg:flex`
- ไม่มี hamburger menu toggle สำหรับมือถือ
- บนมือถือเนื้อหาหลัก (chat area) เหลือพื้นที่น้อยมาก

## แนวทางแก้ไข
- ซ่อน Sidebar บนมือถือ (`hidden md:flex`)
- เพิ่ม hamburger menu button สำหรับ toggle sidebar
- หรือใช้ Bottom Navigation แทน sidebar บนมือถือ

## สภาพแวดล้อม
- อุปกรณ์: Mobile (≤ 768px)
- หน้า: AI Chatbot
