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

### Responsive Design / UI/UX
- [ ] หน้าจอมือถือ (≤ 768px) แสดงผลถูกต้อง
- [ ] หน้าจอแท็บเล็ต (768px - 1024px) แสดงผลถูกต้อง
- [ ] หน้าจอเดสก์ท็อป (≥ 1024px) แสดงผลถูกต้อง
- [ ] ไม่มี Horizontal Scroll บนมือถือ
- [ ] ปุ่ม Actions (Edit/Delete) เข้าถึงได้บนมือถือ
- [ ] ตารางแสดงคอลัมน์สำคัญบนมือถือ (ซ่อนคอลัมน์ที่ไม่จำเป็น)
- [ ] Sidebar / Navigation ใช้งานได้บนมือถือ
- [ ] ฟอร์มกรอกข้อมูลใช้งานได้บนมือถือ

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
- [ ] Lighthouse Mobile Score ≥ 80
- [ ] Lighthouse Desktop Score ≥ 90

### หมายเหตุ
<!-- เพิ่มเติม -->
