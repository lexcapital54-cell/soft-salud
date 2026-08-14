#!/usr/bin/env bash
# Expone el admin+API (Docker en :8080) a Internet con Cloudflare quick tunnel.
# Uso: ./scripts/start-public-tunnel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${TMPDIR:-/tmp}/habilisalud-tunnel.log"
URL_FILE="$ROOT/scripts/.public-admin-url"

if ! curl -sf -o /dev/null http://127.0.0.1:8080/login; then
  echo "El stack Docker no responde en :8080. Arranca antes:"
  echo "  cd \"$ROOT\" && docker compose up -d"
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Instala cloudflared: brew install cloudflared"
  exit 1
fi

echo "Iniciando túnel público → http://localhost:8080 ..."
cloudflared tunnel --url http://localhost:8080 --no-autoupdate 2>&1 | tee "$LOG" | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ https://[a-zA-Z0-9.-]+\.trycloudflare\.com ]]; then
    url="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' <<<"$line" | head -1)"
    printf '%s\n' "$url" >"$URL_FILE"
    echo ""
    echo "=============================================="
    echo " Admin público: $url"
    echo " Profesional:   $url/login?tipo=profesional"
    echo " Superadmin:    $url/login?tipo=admin"
    echo "=============================================="
    echo "Para la landing del hosting:"
    echo "  VITE_ADMIN_URL=$url npm run build"
    echo "Luego sube dist/ a Latinoamérica Hosting."
  fi
done
