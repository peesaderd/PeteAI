
# Video Gen Module

สร้างวิดีโอสำหรับ TikTok จากภาพ + ข้อความ + เสียง โดยใช้ Pillow + FFmpeg + TTS

## โครงสร้าง
- `video_gen.py` — สคริปต์หลัก (CLI + Library)
- `ecosystem.config.js` — PM2 ecosystem config
- `workflow_dsl.json` — Dify Workflow DSL (จะสร้างหลังจากทดสอบ)

## การใช้งาน CLI
```bash
# เพิ่มข้อความทับภาพ
python3 video_gen.py text-overlay input.jpg "ข้อความ" -o output.jpg

# สร้างการ์ดรีวิวสินค้า
python3 video_gen.py review-card product.jpg "สินค้าเด็ด" --rating 5 --review "ของดี" --brand "erp_core"

# สร้างเสียงจากข้อความ
python3 video_gen.py tts "สวัสดีครับ" -o voice.mp3

# สร้างวิดีโอ TikTok เต็มรูปแบบ
python3 video_gen.py video input.jpg -t "ข้อความ" --tts "เสียงบรรยาย" --effect ken_burns --duration 5
```

## Features
- ✅ ข้อความภาษาไทย (Noto Sans Thai)
- ✅ Ken Burns effect (ซูมภาพช้าๆ)
- ✅ Pan effect (เลื่อนภาพ)
- ✅ TTS (gTTS / edge-tts)
- ✅ Product review card
- ✅ รองรับหลายข้อความในภาพเดียว
