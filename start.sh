#!/usr/bin/env bash
# EbookHub one-click launcher (macOS / Linux / Git Bash)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://localhost:5173"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

echo
echo "======================================"
echo "   EbookHub  one-click launcher"
echo "======================================"

# --- dependency checks ---
command -v python3 >/dev/null 2>&1 || { echo "[error] python3 not found"; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "[error] node not found";    exit 1; }
command -v npm     >/dev/null 2>&1 || { echo "[error] npm not found";     exit 1; }

if [ ! -d "$FRONTEND/node_modules" ]; then
    echo "[frontend] installing node_modules ..."
    (cd "$FRONTEND" && npm install)
fi

if ! python3 -c "import uvicorn, fastapi" >/dev/null 2>&1; then
    echo "[backend] installing python deps ..."
    (cd "$BACKEND" && python3 -m pip install -r requirements.txt)
fi

# --- start processes ---
echo "[backend] starting uvicorn on 8000 ..."
(
    cd "$BACKEND"
    nohup python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload \
        >"$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$LOG_DIR/backend.pid"
)

echo "[backend] waiting for readiness ..."
for i in $(seq 1 60); do
    if curl -sf "$BACKEND_URL/docs" >/dev/null 2>&1; then break; fi
    sleep 1
done

echo "[frontend] starting vite on 5173 ..."
(
    cd "$FRONTEND"
    nohup npm run dev >"$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$LOG_DIR/frontend.pid"
)

echo "[frontend] waiting for readiness ..."
for i in $(seq 1 30); do
    if curl -sf "$FRONTEND_URL" >/dev/null 2>&1; then break; fi
    sleep 1
done

# open browser (best-effort, platform-dependent)
if command -v open    >/dev/null 2>&1; then open "$FRONTEND_URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$FRONTEND_URL" >/dev/null 2>&1 || true
elif command -v start   >/dev/null 2>&1; then start "$FRONTEND_URL"
fi

cat <<EOF

======================================
   Started:
     backend:  $BACKEND_URL    (log: $LOG_DIR/backend.log)
     frontend: $FRONTEND_URL   (log: $LOG_DIR/frontend.log)
   Stop with: ./stop.sh
======================================
EOF
