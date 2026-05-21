# Customer Management Module

## Overview
จัดการข้อมูลลูกค้า และความสัมพันธ์กับลูกค้า (CRM)

## Features
- **Customer Profile** — ข้อมูลและประวัติลูกค้า
- **Contact Management** — จัดการผู้ติดต่อ
- **Sales History** — ประวัติการซื้อ
- **Credit Limit** — กำหนดวงเงินเชื่อ
- **Customer Group** — แบ่งกลุ่มลูกค้า

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/customers | รายการลูกค้า |
| POST | /api/customers | เพิ่มลูกค้าใหม่ |
| GET | /api/customers/:id | ดูรายละเอียด |
| PUT | /api/customers/:id | อัปเดตข้อมูล |
| GET | /api/customers/:id/history | ประวัติการซื้อ |

## Related
- [Sale Module](sale.md) — คำสั่งซื้อของลูกค้า
