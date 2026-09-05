#!/bin/bash
# Sobe o gerenciador de serviços do Caddy (127.0.0.1:8891 — não exposto pelo Caddy).
# Uso: ./run.sh
BASE="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BASE/logs"

echo "-- manager..."
pkill -f "[m]anager.py" 2>/dev/null
sleep 1
setsid nohup python3 "$BASE/manager/manager.py" > "$LOG_DIR/manager.log" 2>&1 < /dev/null &
sleep 1
ss -tln 2>/dev/null | grep -q ':8891' \
  && echo "✓ manager em http://127.0.0.1:8891 (local)" \
  || { echo "❌ manager não subiu (ver $LOG_DIR/manager.log)"; tail -5 "$LOG_DIR/manager.log"; }