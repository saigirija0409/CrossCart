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

# Resolve Python command across Windows and Unix platforms
PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
elif command -v py >/dev/null 2>&1; then
  PYTHON_CMD="py"
else
  echo "python (or python3) is required (https://www.python.org/)" >&2
  exit 1
fi

command -v npm >/dev/null 2>&1 || { echo "node/npm is required (https://nodejs.org)" >&2; exit 1; }

echo "==> python dependencies"
if [ ! -d .venv ]; then
  "$PYTHON_CMD" -m venv .venv
fi

# Detect virtual environment python path (.venv/Scripts on Windows, .venv/bin on Unix)
VENV_PY=""
if [ -f ".venv/Scripts/python.exe" ]; then
  VENV_PY=".venv/Scripts/python.exe"
elif [ -f ".venv/Scripts/python" ]; then
  VENV_PY=".venv/Scripts/python"
elif [ -f ".venv/bin/python" ]; then
  VENV_PY=".venv/bin/python"
else
  echo "Could not find python executable in .venv" >&2
  exit 1
fi

"$VENV_PY" -m pip install --quiet --upgrade pip
"$VENV_PY" -m pip install --quiet -r apps/api/requirements.txt

echo "==> node dependencies"
npm --prefix apps/web install --silent --no-fund --no-audit

# Clear occupied ports (lsof on Unix, netstat on Windows)
for port in "$API_PORT" "$WEB_PORT"; do
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" 2>/dev/null | xargs -r kill 2>/dev/null || true
  elif command -v netstat >/dev/null 2>&1; then
    pids=$(netstat -ano 2>/dev/null | grep ":$port " | awk '{print $5}' | sort -u || true)
    for pid in $pids; do
      if [ -n "$pid" ] && [ "$pid" != "0" ]; then
        taskkill //F //PID "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
      fi
    done
  fi
done

cleanup() { kill ${API_PID:-} ${WEB_PID:-} 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Determine log file location across OSes
LOG_DIR="${TMPDIR:-${TMP:-${TEMP:-/tmp}}}"
LOG_DIR="${LOG_DIR%/}"
[ -d "$LOG_DIR" ] || LOG_DIR="."

API_LOG="$LOG_DIR/crosscart-api.log"
WEB_LOG="$LOG_DIR/crosscart-web.log"

echo "==> starting api on :$API_PORT"
"$VENV_PY" -m uvicorn apps.api.app.main:app --port "$API_PORT" --app-dir . > "$API_LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    curl -sf "http://localhost:$API_PORT/api/health" >/dev/null 2>&1 && break
  else
    "$VENV_PY" -c "import urllib.request; urllib.request.urlopen('http://localhost:$API_PORT/api/health')" >/dev/null 2>&1 && break
  fi
  kill -0 "$API_PID" 2>/dev/null || { echo "api failed to start:"; tail -20 "$API_LOG"; exit 1; }
  sleep 1
done

if [ "$SEED" = "1" ]; then
  echo "==> seeding the demo wishlist"
  "$VENV_PY" scripts/demo_seed.py "http://localhost:$API_PORT"
fi

echo "==> starting web on :$WEB_PORT"
npm --prefix apps/web run dev -- --port "$WEB_PORT" --strictPort > "$WEB_LOG" 2>&1 &
WEB_PID=$!
sleep 3

cat <<INFO

  CrossCart is running.

    app     http://localhost:$WEB_PORT
    api     http://localhost:$API_PORT/docs
    logs    $API_LOG  $WEB_LOG

    demo    demo@wishlist.local  / Demo1234!
    admin   admin@wishlist.local / Admin1234!

  Load the Chrome extension (optional, for live store sync):
    chrome://extensions -> Developer mode -> Load unpacked -> $ROOT/apps/extension

  Ctrl-C stops both servers.

INFO

wait

