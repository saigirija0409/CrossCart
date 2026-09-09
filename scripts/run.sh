#!/usr/bin/env bash
# One-command bootstrap: install everything, start both servers, seed a demo
# wishlist on a first run, and leave the app on screen ready to present.
#
#   ./scripts/run.sh            install if needed, then run
#   ./scripts/run.sh --seed     also (re)seed the demo wishlist on an existing db
#   ./scripts/run.sh --fresh    delete the local db and start from scratch
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT=8000
WEB_PORT=5173
SEED=0

for arg in "$@"; do
  case "$arg" in
    --seed)  SEED=1 ;;
    --fresh) rm -f data/app.db; SEED=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# A missing database means the backend is about to seed itself, so the demo
# wishlist should be seeded too — otherwise the first screen is empty.
[ -f data/app.db ] || SEED=1

command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }
command -v npm     >/dev/null || { echo "node/npm is required (https://nodejs.org)"; exit 1; }

echo "==> python dependencies"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/python -m pip install --quiet --upgrade pip
./.venv/bin/python -m pip install --quiet -r apps/api/requirements.txt

echo "==> node dependencies"
npm --prefix apps/web install --silent --no-fund --no-audit

# Anything still holding the ports would make the URLs below point at the
# wrong process, so clear them first.
for port in "$API_PORT" "$WEB_PORT"; do
  lsof -ti tcp:"$port" 2>/dev/null | xargs -r kill 2>/dev/null || true
done

cleanup() { kill ${API_PID:-} ${WEB_PID:-} 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> starting api on :$API_PORT"
./.venv/bin/python -m uvicorn apps.api.app.main:app --port "$API_PORT" --app-dir . >/tmp/crosscart-api.log 2>&1 &
API_PID=$!

for _ in $(seq 1 60); do
  curl -sf "http://localhost:$API_PORT/api/health" >/dev/null && break
  kill -0 "$API_PID" 2>/dev/null || { echo "api failed to start:"; tail -20 /tmp/crosscart-api.log; exit 1; }
  sleep 1
done

if [ "$SEED" = "1" ]; then
  echo "==> seeding the demo wishlist"
  ./.venv/bin/python scripts/demo_seed.py "http://localhost:$API_PORT"
fi

echo "==> starting web on :$WEB_PORT"
npm --prefix apps/web run dev -- --port "$WEB_PORT" --strictPort >/tmp/crosscart-web.log 2>&1 &
WEB_PID=$!
sleep 3

cat <<INFO

  CrossCart is running.

    app     http://localhost:$WEB_PORT
    api     http://localhost:$API_PORT/docs
    logs    /tmp/crosscart-api.log  /tmp/crosscart-web.log

    demo    demo@wishlist.local  / Demo1234!
    admin   admin@wishlist.local / Admin1234!

  Load the Chrome extension (optional, for live store sync):
    chrome://extensions -> Developer mode -> Load unpacked -> $ROOT/apps/extension

  Ctrl-C stops both servers.

INFO

wait
