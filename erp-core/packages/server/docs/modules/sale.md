# Sale Module

## Overview
จัดการกระบวนการขาย ตั้งแต่สร้างใบเสนอราคา (Quotation) จนถึงออกใบแจ้งหนี้ (Invoice)

## Features
- **Quotation** — สร้างและส่งใบเสนอราคาให้ลูกค้า
- **Sales Order** — บันทึกคำสั่งซื้อจากลูกค้า
- **Invoice** — ออกใบแจ้งหนี้และติดตามสถานะการชำระเงิน
- **Discount** — กำหนดส่วนลดตามเงื่อนไข (ปริมาณ, โปรโมชั่น)
- **Tax Calculation** — คำนวณภาษี VAT 7% หรือภาษีหัก ณ ที่จ่าย

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/sales/orders | รายการคำสั่งซื้อทั้งหมด |
| POST | /api/sales/orders | สร้างคำสั่งซื้อใหม่ |
| GET | /api/sales/orders/:id | ดูรายละเอียดคำสั่งซื้อ |
| PUT | /api/sales/orders/:id | อัปเดตคำสั่งซื้อ |
| DELETE | /api/sales/orders/:id | ลบคำสั่งซื้อ |
| GET | /api/sales/invoices | รายการใบแจ้งหนี้ |
| POST | /api/sales/invoices | สร้างใบแจ้งหนี้ |

## Tax Calculation
```typescript
// ตัวอย่างการคำนวณภาษี
function calculateTax(amount: number, taxType: 'vat' | 'wht') {
  if (taxType === 'vat') {
    return amount * 0.07; // VAT 7%
  }
  return amount * 0.03; // Withholding Tax 3%
}
```

## Related
- [Customer Module](customer.md) — จัดการข้อมูลลูกค้า
- [Finance Module](finance.md) — การบันทึกบัญชี
