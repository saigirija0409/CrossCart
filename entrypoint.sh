#!/bin/sh
set -e

PORT="${PORT:-8000}"

echo "==> Starting CrossCart on port $PORT"

# Start uvicorn in the background
python -m uvicorn apps.api.app.main:app --host 0.0.0.0 --port "$PORT" --app-dir . &
SERVER_PID=$!

# Wait for server to pass healthcheck, then seed the demo wishlist
echo "==> Waiting for CrossCart API to be ready..."
for i in $(seq 1 45); do
    if curl -s "http://127.0.0.1:$PORT/api/health" > /dev/null 2>&1; then
        echo "==> API is ready. Seeding demo wishlist..."
        python scripts/demo_seed.py "http://127.0.0.1:$PORT" || true
        break
    fi
    sleep 1
done

# Wait for the main server process
wait "$SERVER_PID"
