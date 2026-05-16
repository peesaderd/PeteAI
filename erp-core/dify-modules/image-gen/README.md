# Image Gen Module

สร้างภาพจากข้อความ (Text-to-Image) โดยใช้ Gemini 2.5 Flash Image ผ่าน Dify Workflow

## โครงสร้าง
- `workflow_dsl.json` — Dify Workflow DSL (exported from Dify App ID: 168a67f4-...)
- `ecosystem.config.js` — PM2 ecosystem config

## การใช้งาน
```bash
# Deploy ด้วย PM2
pm2 start ecosystem.config.js

# หรือรัน workflow โดยตรงผ่าน Dify API
curl -X POST http://localhost:54540/console/api/apps/168a67f4-.../workflows/draft/run \
  -H "Authorization: Token <token>" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "A beautiful landscape"}, "response_mode": "blocking"}'
```

## Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| prompt | string | ✅ | คำอธิบายภาพที่ต้องการสร้าง |
| model | string | ❌ | รุ่นโมเดล (default: gemini-2.5-flash-image) |
