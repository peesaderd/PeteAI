# Purchase Module

## Overview
จัดการกระบวนการจัดซื้อ ตั้งแต่สร้างใบขอซื้อ (Purchase Requisition) จนถึงรับสินค้า

## Features
- **Purchase Requisition** — ใบขอซื้อจากแผนกต่างๆ
- **Purchase Order** — สั่งซื้อสินค้าจาก supplier
- **Goods Receipt** — รับสินค้าเข้า warehouse
- **Supplier Management** — จัดการข้อมูลผู้ขาย

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/purchases/orders | รายการใบสั่งซื้อ |
| POST | /api/purchases/orders | สร้างใบสั่งซื้อ |
| GET | /api/purchases/orders/:id | ดูรายละเอียด |
| PUT | /api/purchases/orders/:id | อัปเดตใบสั่งซื้อ |

## Related
- [Inventory Module](inventory.md) — การรับสินค้าเข้า stock
- [Procurement Module](procurement.md) — วางแผนจัดซื้อ
