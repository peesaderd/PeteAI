#!/bin/bash
# ERP Core - Start Script
# ใช้รันเซิร์ฟเวอร์หลังจาก container restart

cd "$(dirname "$0")/packages/server"

# ถ้า dist ไม่มี ให้ build ก่อน
if [ ! -d "dist" ]; then
  echo "Building server..."
  cd /app
  yarn build
  cd packages/server
fi

# รันเซิร์ฟเวอร์
PORT=${PORT:-54509}
echo "Starting ERP Core on port $PORT..."
node dist/index.js
