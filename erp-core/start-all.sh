#!/bin/bash
# ============================================================
# Start all ERP Core services
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting Knowledge Base ==="
cd "$SCRIPT_DIR/packages/knowledge-base"
mkdir -p data
nohup node dist/index.js > /tmp/kb.log 2>&1 &
echo "KB PID: $!"

echo "=== Starting AI Orchestrator ==="
cd "$SCRIPT_DIR/packages/ai-orchestrator"
nohup node dist/index.js > /tmp/orchestrator.log 2>&1 &
echo "Orchestrator PID: $!"

echo "=== Starting Telegram Bot ==="
cd "$SCRIPT_DIR/packages/telegram-bot"
if [ -f .env ]; then
    nohup node dist/index.js > /tmp/telegram-bot.log 2>&1 &
    echo "Telegram PID: $!"
else
    echo "SKIP: .env not found (need TELEGRAM_BOT_TOKEN)"
fi

echo "=== Done ==="
echo "Logs: /tmp/{kb,orchestrator,telegram-bot}.log"
