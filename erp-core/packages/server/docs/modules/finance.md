# Finance Module

## Overview
จัดการบัญชี การเงิน และภาษี

## Features
- **Chart of Accounts** — ผังบัญชี
- **Journal Entry** — บันทึกรายการบัญชี
- **Accounts Receivable** — ลูกหนี้การค้า
- **Accounts Payable** — เจ้าหนี้การค้า
- **Tax Report** — รายงานภาษีซื้อ/ภาษีขาย
- **Financial Reports** — งบการเงิน (Balance Sheet, P&L)

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/finance/accounts | ผังบัญชี |
| POST | /api/finance/journal | บันทึกรายการบัญชี |
| GET | /api/finance/reports/pl | งบกำไรขาดทุน |
| GET | /api/finance/reports/balance-sheet | งบดุล |

## Tax Calculation
```typescript
// ภาษีซื้อ (Input VAT) — จากใบซื้อ
// ภาษีขาย (Output VAT) — จากใบขาย
function calculateVat(netAmount: number, type: 'input' | 'output') {
  const vat = netAmount * 0.07;
  return {
    net: netAmount,
    vat: vat,
    total: netAmount + vat,
    type
  };
}
```

## Related
- [Sale Module](sale.md) — ใบแจ้งหนี้
- [Purchase Module](purchase.md) — ใบซื้อ
