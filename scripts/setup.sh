#!/bin/bash
# Instala o Caddyfile em /etc/caddy e sobe os serviços (via start.sh).
# Uso: ./setup.sh
BASE="$(cd "$(dirname "$0")/.." && pwd)"

echo "== setup =="

command -v caddy > /dev/null \
  || { echo "❌ caddy não instalado: sudo apt update && sudo apt install -y caddy"; exit 1; }
echo "✓ caddy encontrado"

echo "-- copiando Caddyfile para /etc/caddy/..."
sudo cp "$BASE/Caddyfile" /etc/caddy/Caddyfile \
  && echo "✓ Caddyfile instalado" \
  || { echo "❌ falha ao copiar"; exit 1; }

bash "$BASE/scripts/start.sh"
