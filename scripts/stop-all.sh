#!/usr/bin/env bash
# Detiene túnel Cloudflare y contenedores HABILISALUD.
# Postgres del Mac se deja corriendo (otros programas pueden usarlo).
#
# Uso: ./scripts/stop-all.sh
#      ./scripts/stop-all.sh --postgres   # también para Postgres (brew)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STOP_PG=0
for arg in "$@"; do
  case "$arg" in
    --postgres) STOP_PG=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
  esac
done

echo "==> Deteniendo túnel Cloudflare…"
pkill -f 'cloudflared tunnel --url http://localhost:8080' 2>/dev/null || true

echo "==> Deteniendo contenedores…"
docker compose down

if [[ "$STOP_PG" -eq 1 ]]; then
  echo "==> Deteniendo Postgres…"
  for formula in postgresql@18 postgresql@16 postgresql; do
    brew services stop "$formula" >/dev/null 2>&1 || true
  done
fi

echo "Listo."
