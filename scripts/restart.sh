#!/bin/bash
# ClawChat graceful restart script
# Usage: ./scripts/restart.sh

set -e

PORT=3003
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../packages/server"
LOG="/tmp/clawchat-server.log"

echo "🔄 Restarting ClawChat server..."

# Graceful stop (SIGTERM triggers graceful shutdown handler)
PID=$(lsof -i :$PORT -t 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "⏳ Sending SIGTERM to PID $PID..."
  kill -TERM $PID
  # Wait up to 10s for graceful exit
  for i in $(seq 1 10); do
    if ! kill -0 $PID 2>/dev/null; then
      echo "✅ Process exited after ${i}s"
      break
    fi
    sleep 1
  done
  # Force kill if still alive
  if kill -0 $PID 2>/dev/null; then
    echo "⚠️ Still alive after 10s, sending SIGKILL..."
    kill -9 $PID
    sleep 1
  fi
else
  echo "ℹ️ No process on port $PORT"
fi

# Start
echo "🚀 Starting server..."
cd "$SERVER_DIR"
nohup npm start > "$LOG" 2>&1 &
sleep 3

# Verify
if lsof -i :$PORT -t >/dev/null 2>&1; then
  echo "✅ ClawChat running on port $PORT (PID $(lsof -i :$PORT -t))"
  tail -3 "$LOG"
else
  echo "❌ Failed to start. Log:"
  tail -10 "$LOG"
  exit 1
fi
