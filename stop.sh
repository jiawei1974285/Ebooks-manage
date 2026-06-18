#!/usr/bin/env bash
# Stop processes started by ./start.sh
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/.logs"

for name in backend frontend; do
    pidfile="$LOG_DIR/$name.pid"
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        if kill -0 "$pid" >/dev/null 2>&1; then
            echo "[stop] killing $name (pid $pid)"
            # Kill process group to also stop child node/uvicorn workers
            kill "$pid" 2>/dev/null || true
            sleep 1
            kill -9 "$pid" 2>/dev/null || true
        fi
        rm -f "$pidfile"
    fi
done

# Fallback: free the ports
for port in 8000 5173; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
done

echo "[stop] done"
