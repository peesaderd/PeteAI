# Human Resources Module

## Overview
จัดการข้อมูลพนักงาน เงินเดือน และเวลาทำงาน

## Features
- **Employee Management** — ข้อมูลพนักงาน
- **Attendance** — บันทึกเวลาเข้า-ออกงาน
- **Leave Management** — จัดการวันลา
- **Payroll** — คำนวณเงินเดือน
- **Overtime** — คำนวณค่าล่วงเวลา

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/hr/employees | รายการพนักงาน |
| POST | /api/hr/employees | เพิ่มพนักงานใหม่ |
| GET | /api/hr/attendance | บันทึกเวลา |
| POST | /api/hr/leave | ขอวันลา |
| GET | /api/hr/payroll | ข้อมูลเงินเดือน |
