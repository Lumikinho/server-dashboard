#!/bin/bash
# Sobe o code-server (VSCode web) na porta 8080 para a rota /codeserver/.
# Uso: ./code-server.sh
BASE="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$BASE/logs"

echo "== code-server =="

pkill -f "[c]ode-server/out/node/entry" 2>/dev/null
sleep 1
setsid nohup code-server --bind-addr 0.0.0.0:8080 \
  --trusted-origins='*' \
  --abs-proxy-base-path=/codeserver \
  > "$LOG_DIR/code-server.log" 2>&1 < /dev/null &
disown
sleep 4

ss -tln 2>/dev/null | grep -q ':8080' \
  && echo "✓ code-server na porta 8080" \
  || { echo "❌ falha ao subir"; tail -20 "$LOG_DIR/code-server.log"; }
