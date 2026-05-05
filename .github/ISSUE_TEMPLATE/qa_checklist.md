---
name: ✅ QA Checklist
about: ตรวจสอบคุณภาพก่อนปล่อย Release
title: "[QA] Release Checklist - v"
labels: qa
assignees: ''

---

## 📋 Release Checklist

### การทดสอบ
- [ ] Unit Tests ผ่านทั้งหมด
- [ ] E2E Tests ผ่านทั้งหมด
- [ ] Integration Tests ผ่านทั้งหมด
- [ ] Coverage ไม่ต่ำกว่า 80%

### ฟังก์ชันหลัก
- [ ] Account Management
  - [ ] สร้างบัญชีใหม่ได้
  - [ ] Debit / Credit ถูกต้อง
  - [ ] ดูยอดคงเหลือได้
- [ ] Journal Entry
  - [ ] บันทึกรายการบัญชีได้
  - [ ] ระบบตรวจสอบยอดเดบิต-เครดิต
  - [ ] Post รายการไปยังบัญชีได้
- [ ] Ledger
  - [ ] ดูงบทดลอง (Trial Balance) ได้
  - [ ] ระบบตรวจสอบความถูกต้อง
- [ ] Inventory
  - [ ] รับสินค้าเข้า
  - [ ] เบิกสินค้าออก
  - [ ] ตรวจสอบสต็อก
- [ ] Invoice
  - [ ] สร้างใบแจ้งหนี้
  - [ ] คำนวณภาษี
  - [ ] เปลี่ยนสถานะ (draft → sent → paid)

### ความปลอดภัย
- [ ] Input Validation
- [ ] Error Handling
- [ ] No sensitive data leak

### ประสิทธิภาพ
- [ ] Response time < 500ms
- [ ] Memory usage ปกติ

### หมายเหตุ
<!-- เพิ่มเติม -->
