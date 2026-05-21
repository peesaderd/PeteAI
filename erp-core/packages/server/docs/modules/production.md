# Production Module

## Overview
จัดการกระบวนการผลิต ตั้งแต่วางแผนการผลิตจนถึงสินค้าสำเร็จรูป

## Features
- **BOM (Bill of Materials)** — กำหนดส่วนประกอบของสินค้า
- **Production Order** — สร้างใบสั่งผลิต
- **Work In Progress** — ติดตามสถานะการผลิต
- **Cost Calculation** — คำนวณต้นทุนการผลิต

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/production/orders | รายการใบสั่งผลิต |
| POST | /api/production/orders | สร้างใบสั่งผลิต |
| GET | /api/production/bom | รายการ BOM |
| POST | /api/production/bom | สร้าง BOM |

## Related
- [Inventory Module](inventory.md) — วัตถุดิบและสินค้าสำเร็จรูป
