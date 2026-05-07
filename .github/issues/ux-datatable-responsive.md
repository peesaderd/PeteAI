---
name: "[UX] DataTable - ทุกหน้าไม่มี responsive column hiding บนมือถือ"
title: "[UX] DataTable - ทุกหน้าไม่มี responsive column hiding บนมือถือ"
labels: bug, ux, mobile
assignees: ''
---

## คำอธิบาย
ทุกหน้าที่ใช้ DataTable (Products, Orders, Customers, Inventory, Finance, Channels, FraudDetection, AIProviderSettings, LLMProviderSettings) แสดงทุกคอลัมน์บนมือถือ ทำให้ต้องเลื่อนแนวนอน

## ไฟล์ที่เกี่ยวข้อง
- `packages/web/src/components/ui.tsx` (DataTable component)
- `packages/web/src/pages/Products.tsx`
- `packages/web/src/pages/Orders.tsx`
- `packages/web/src/pages/Customers.tsx`
- `packages/web/src/pages/Inventory.tsx`
- `packages/web/src/pages/Finance.tsx`
- `packages/web/src/pages/Channels.tsx`
- `packages/web/src/pages/FraudDetection.tsx`
- `packages/web/src/pages/AIProviderSettings.tsx`
- `packages/web/src/pages/LLMProviderSettings.tsx`

## ปัญหา
- DataTable component ไม่มี prop สำหรับกำหนดคอลัมน์ที่แสดงบนมือถือ
- ทุกคอลัมน์แสดง `th` และ `td` โดยไม่มี `hidden` classes
- บางหน้าคอลัมน์เยอะถึง 6-7 คอลัมน์ (Orders, Inventory, FraudDetection)

## แนวทางแก้ไข
- เพิ่ม `responsive` prop ใน DataTable สำหรับกำหนด visible columns ต่อ breakpoint
- หรือเพิ่ม `hidden md:table-cell` ในคอลัมน์ที่ไม่จำเป็นบนมือถือ
- หรือสร้าง DataTableMobile component ที่แสดงเป็น card layout

## หน้าและคอลัมน์ที่ควรซ่อนบนมือถือ
| หน้า | คอลัมน์ที่ควรซ่อน |
|------|-------------------|
| Orders | Items, Total |
| Inventory | SKU, Cost, Warehouse |
| Products | SKU, Category |
| Customers | Phone, Orders |
| Finance | Description, Category |
| Channels | Type, Status |
| FraudDetection | IP Address, Device, Location |
| AIProviderSettings | Endpoint, Model |
| LLMProviderSettings | Endpoint, API Key, Type |

## สภาพแวดล้อม
- อุปกรณ์: Mobile (≤ 768px)
- Component: DataTable (ui.tsx)
