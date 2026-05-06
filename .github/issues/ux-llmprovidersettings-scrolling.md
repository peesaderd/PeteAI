---
name: "[UX] LLMProviderSettings - Edit button requires horizontal scroll on mobile"
title: "[UX] LLMProviderSettings - ปุ่ม Edit ต้องเลื่อนแนวนอนบนมือถือ"
labels: bug, ux, mobile
assignees: ''
---

## คำอธิบาย
หน้า LLMProviderSettings มีตาราง 7 คอลัมน์ (Name, Type, Model, Endpoint, API Key, Default, Actions) ซึ่งแสดงทั้งหมดบนมือถือ ทำให้ปุ่ม Edit ที่อยู่ในคอลัมน์สุดท้ายต้องเลื่อนแนวนอนจึงจะเห็น

## ไฟล์ที่เกี่ยวข้อง
- `packages/web/src/pages/LLMProviderSettings.tsx`

## ปัญหา
- DataTable แสดงทุกคอลัมน์บนมือถือ (ไม่มี `hidden md:table-cell` หรือ `hidden lg:table-cell`)
- คอลัมน์ที่ไม่จำเป็นบนมือถือ: Endpoint, API Key, Type
- ปุ่ม Actions (Edit/Delete) ควรอยู่ใกล้กับชื่อ Provider

## แนวทางแก้ไข
- ซ่อนคอลัมน์ Endpoint, API Key, Type บนมือถือ (`hidden md:table-cell`)
- หรือเปลี่ยนเป็น Responsive Card Layout แทนตารางบนมือถือ

## สภาพแวดล้อม
- อุปกรณ์: Mobile (≤ 768px)
- หน้า: LLM Provider Settings
