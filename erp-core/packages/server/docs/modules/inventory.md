# Inventory Module

## Overview
จัดการสินค้าคงคลัง ตรวจนับสต็อก และควบคุมการเคลื่อนไหวของสินค้า

## Features
- **Stock Management** — ดูสถานะสินค้าคงคลังแบบ real-time
- **Warehouse** — รองรับหลายคลังสินค้า
- **Stock Movement** — บันทึกการเคลื่อนไหว (รับ-จ่าย-โอนย้าย)
- **Inventory Count** — ตรวจนับสต็อกประจำงวด
- **Low Stock Alert** — แจ้งเตือนเมื่อสินค้าใกล้หมด

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/inventory/items | รายการสินค้าทั้งหมด |
| POST | /api/inventory/items | เพิ่มสินค้าใหม่ |
| GET | /api/inventory/items/:id | ดูรายละเอียดสินค้า |
| PUT | /api/inventory/items/:id | อัปเดตสินค้า |
| GET | /api/inventory/movements | ประวัติการเคลื่อนไหว |
| POST | /api/inventory/count | บันทึกผลตรวจนับ |

## Related
- [Purchase Module](purchase.md) — รับสินค้าเข้า
- [Sale Module](sale.md) — ตัดสต็อกเมื่อขาย
