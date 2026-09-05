#!/bin/bash
# Sobe todos os serviços do projeto: sysinfo (porta 8890) + Caddy (porta 8888).
# Uso: ./start.sh
BASE="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BASE/logs"

echo "== start =="

echo "-- sysinfo..."
pkill -f "[s]ysinfo.py" 2>/dev/null
sleep 1
setsid nohup python3 "$BASE/dashboard/sysinfo.py" > "$LOG_DIR/sysinfo.log" 2>&1 < /dev/null &
sleep 1
ss -tln 2>/dev/null | grep -q ':8890' \
  && echo "✓ sysinfo na porta 8890" \
  || echo "❌ sysinfo não subiu (ver $LOG_DIR/sysinfo.log)"

echo "-- manager (127.0.0.1:8891, não exposto)..."
pkill -f "[m]anager.py" 2>/dev/null
sleep 1
setsid nohup python3 "$BASE/manager/manager.py" > "$LOG_DIR/manager.log" 2>&1 < /dev/null &
sleep 1
ss -tln 2>/dev/null | grep -q ':8891' \
  && echo "✓ manager em http://127.0.0.1:8891" \
  || echo "❌ manager não subiu (ver $LOG_DIR/manager.log)"

echo "-- filebrowser (file manager em 127.0.0.1:8083)..."
pkill -f "[f]ilebrowser" 2>/dev/null
sleep 1
setsid nohup bash /home/lumiko/filebrowser/run.sh > "$LOG_DIR/filebrowser.log" 2>&1 < /dev/null &
sleep 2
ss -tln 2>/dev/null | grep -q ':8083' \
  && echo "✓ filebrowser na porta 8083 (rota /files)" \
  || { echo "❌ filebrowser não subiu (ver $LOG_DIR/filebrowser.log)"; tail -5 "$LOG_DIR/filebrowser.log"; }

echo "-- caddy..."
pkill -x caddy 2>/dev/null
sleep 1
setsid nohup caddy run --config "$BASE/Caddyfile" --adapter caddyfile > "$LOG_DIR/caddy.log" 2>&1 < /dev/null &
sleep 2
pgrep -x caddy > /dev/null \
  && echo "✓ caddy na porta 8888" \
  || { echo "❌ caddy não subiu"; tail -5 "$LOG_DIR/caddy.log"; }

echo ""
echo "Dashboard: http://100.107.93.53:8888 (local: http://localhost:8888)"
echo "Logs: $LOG_DIR/"
