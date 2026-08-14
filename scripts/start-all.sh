#!/usr/bin/env bash
# Arranca todo HABILISALUD en el Mac mini después de cerrar Docker / reiniciar.
#
# Uso:
#   ./scripts/start-all.sh              # Postgres + Docker + túnel público
#   ./scripts/start-all.sh --no-tunnel  # Solo local (http://localhost:8080)
#   ./scripts/start-all.sh --build      # Reconstruye imágenes antes de levantar
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_TUNNEL=1
DO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-tunnel) WITH_TUNNEL=0 ;;
    --build) DO_BUILD=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Opción desconocida: $arg"
      echo "Usa --no-tunnel | --build | --help"
      exit 1
      ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
ok() { printf '    ✓ %s\n' "$*"; }
fail() { printf '    ✗ %s\n' "$*" >&2; exit 1; }

# ── 1. Docker Desktop ───────────────────────────────────────────────────────
log "Docker Desktop"
if ! docker info >/dev/null 2>&1; then
  echo "    Docker no responde. Abriendo Docker Desktop…"
  open -a Docker || fail "No se pudo abrir Docker Desktop. Ábrelo a mano."
  for i in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      ok "Docker listo (${i}s)"
      break
    fi
    sleep 2
    if [[ $i -eq 60 ]]; then
      fail "Docker Desktop no arrancó a tiempo. Ábrelo y vuelve a intentar."
    fi
  done
else
  ok "Docker ya estaba activo"
fi

# ── 2. PostgreSQL (host Mac, fuera de Docker) ───────────────────────────────
log "PostgreSQL en el Mac"
start_postgres() {
  if command -v brew >/dev/null 2>&1; then
    for formula in postgresql@18 postgresql@16 postgresql; do
      if brew list --versions "$formula" >/dev/null 2>&1; then
        echo "    Intentando brew services start $formula …"
        brew services start "$formula" >/dev/null 2>&1 || true
        return 0
      fi
    done
  fi
  # Fallback: pg_ctl si hay data dir típico
  for datadir in /opt/homebrew/var/postgresql@18 /opt/homebrew/var/postgresql@16 /opt/homebrew/var/postgres; do
    if [[ -d "$datadir" ]] && command -v pg_ctl >/dev/null 2>&1; then
      echo "    Intentando pg_ctl -D $datadir start …"
      pg_ctl -D "$datadir" -l "$datadir/server.log" start >/dev/null 2>&1 || true
      return 0
    fi
  done
  return 1
}

if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  ok "Postgres ya acepta conexiones en :5432"
else
  start_postgres || true
  for i in $(seq 1 40); do
    if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
      ok "Postgres listo (${i}s)"
      break
    fi
    sleep 1
    if [[ $i -eq 40 ]]; then
      fail "Postgres no responde en :5432. Arráncalo en pgAdmin o: brew services start postgresql@18"
    fi
  done
fi

# ── 3. Contenedores api + web ───────────────────────────────────────────────
log "Contenedores HABILISALUD (api + web)"
if [[ "$DO_BUILD" -eq 1 ]]; then
  docker compose up -d --build
else
  docker compose up -d
fi

echo "    Esperando healthcheck de api…"
for i in $(seq 1 60); do
  api_state="$(docker inspect -f '{{.State.Health.Status}}' habilisalud-api 2>/dev/null || echo starting)"
  if [[ "$api_state" == "healthy" ]]; then
    ok "api healthy (${i}s)"
    break
  fi
  if [[ "$api_state" == "unhealthy" && $i -gt 15 ]]; then
    echo "    api unhealthy — últimos logs:"
    docker compose logs --tail=30 api || true
    fail "La API no pasó el healthcheck. Revisa Postgres y: docker compose logs api"
  fi
  sleep 2
  if [[ $i -eq 60 ]]; then
    docker compose logs --tail=30 api || true
    fail "Timeout esperando api healthy"
  fi
done

for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:8080/login; then
    ok "Admin responde en http://localhost:8080/login"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    fail "web no responde en :8080. Revisa: docker compose logs web"
  fi
done

api_code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api || echo 000)"
if [[ "$api_code" != "000" && "$api_code" -lt 500 ]]; then
  ok "API vía Caddy: http://localhost:8080/api (HTTP $api_code)"
else
  echo "    ⚠ /api no responde bien (HTTP $api_code); revisa docker compose logs api"
fi

# ── 4. Túnel público (opcional) ─────────────────────────────────────────────
if [[ "$WITH_TUNNEL" -eq 0 ]]; then
  log "Listo (solo local)"
  echo ""
  echo "  Admin:        http://localhost:8080/login"
  echo "  Profesional:  http://localhost:8080/login?tipo=profesional"
  echo "  Superadmin:   http://localhost:8080/login?tipo=admin"
  echo ""
  echo "Sin túnel: la landing del hosting no alcanzará este Mac."
  echo "Para exponer: ./scripts/start-all.sh   (sin --no-tunnel)"
  exit 0
fi

log "Túnel Cloudflare (público)"
if ! command -v cloudflared >/dev/null 2>&1; then
  fail "Falta cloudflared. Instala: brew install cloudflare/cloudflare/cloudflared"
fi

# Mata túneles quick previos de este proyecto para no dejar huérfanos
pkill -f 'cloudflared tunnel --url http://localhost:8080' 2>/dev/null || true
# Si hay un tunnel nombrado corriendo con la config, lo reiniciamos limpio
pkill -f 'cloudflared tunnel run' 2>/dev/null || true
sleep 1

CF_CONFIG="${HOME}/.cloudflared/config.yml"
if [[ -f "$CF_CONFIG" ]]; then
  # Túnel FIJO (app.habilisalud.com) — la landing del hosting no se vuelve a subir
  HOST_LINE="$(awk '/^[[:space:]]*-?[[:space:]]*hostname:/{print $NF; exit}' "$CF_CONFIG" || true)"
  TUNNEL_ID="$(awk '/^tunnel:/{print $2; exit}' "$CF_CONFIG" || true)"
  echo "    Usando túnel con nombre (URL fija)"
  echo "    Config: $CF_CONFIG"
  [[ -n "$HOST_LINE" ]] && echo "    Host:   https://${HOST_LINE}"
  echo ""
  echo "=============================================="
  if [[ -n "$HOST_LINE" && "$HOST_LINE" != "hostname:" ]]; then
    echo " Admin público: https://${HOST_LINE}"
    echo " Profesional:   https://${HOST_LINE}/login?tipo=profesional"
    echo " Superadmin:    https://${HOST_LINE}/login?tipo=admin"
  else
    echo " Túnel nombrado activo → https://app.habilisalud.com"
  fi
  echo "=============================================="
  echo "La landing del hosting debe apuntar a esa URL fija (una sola subida)."
  echo ""
  if [[ -n "$TUNNEL_ID" && "$TUNNEL_ID" != /* ]]; then
    exec cloudflared tunnel --config "$CF_CONFIG" run "$TUNNEL_ID"
  else
    exec cloudflared tunnel --config "$CF_CONFIG" run
  fi
fi

echo "    No hay ~/.cloudflared/config.yml → quick tunnel (URL cambia cada vez)."
echo "    Para URL fija y no re-subir al cPanel:"
echo "      ./scripts/setup-named-tunnel.sh"
echo ""
exec "$ROOT/scripts/start-public-tunnel.sh"

