#!/bin/bash
# Para todos os serviços do projeto: Caddy + sysinfo.
# Uso: ./stop.sh
echo "== stop =="

pkill -x caddy 2>/dev/null
pkill -f "[s]ysinfo.py" 2>/dev/null
sleep 1

pgrep -x caddy > /dev/null \
  && echo "❌ caddy ainda rodando" \
  || echo "✓ caddy parado"
pgrep -f "[s]ysinfo.py" > /dev/null \
  && echo "❌ sysinfo ainda rodando" \
  || echo "✓ sysinfo parado"
